-- Core leaderboard schema (ported + generalised from JBALLIN 0001/0002).
-- Money is DECIMAL(20,8) everywhere (golden rule 7). `rank` is backticked
-- (reserved word). casino_id is the stable key; username is refreshed each
-- sync (it can change). Ranking is computed in SQL (window functions) from
-- lib/periods.ts — no stored procedures, so the migrate runner stays simple.

CREATE TABLE IF NOT EXISTS periods (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  title              VARCHAR(120)   NOT NULL DEFAULT '',
  kind               ENUM('monthly','weekly','custom') NOT NULL DEFAULT 'monthly',
  start_at           DATE           NOT NULL,
  end_at             DATE           NOT NULL,              -- inclusive
  timezone           VARCHAR(64)    NOT NULL DEFAULT 'UTC',
  prize_pool         DECIMAL(20,8)  NOT NULL DEFAULT 0,
  prize_distribution JSON           NOT NULL,              -- [{rank,percentage}]
  status             ENUM('upcoming','live','closed') NOT NULL DEFAULT 'upcoming',
  created_at         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_periods_status (status),
  INDEX idx_periods_dates (start_at, end_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS live_entries (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  period_id     INT            NOT NULL,
  casino_id     VARCHAR(191)   NOT NULL,
  username      VARCHAR(191)   NOT NULL,
  wagered       DECIMAL(20,8)  NOT NULL DEFAULT 0,
  `rank`        INT            NULL,
  updated_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_live_period_casino (period_id, casino_id),
  INDEX idx_live_period_rank (period_id, `rank`),
  CONSTRAINT fk_live_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Write once, never update (golden rule 5). Triggers below enforce it.
CREATE TABLE IF NOT EXISTS final_results (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  period_id     INT            NOT NULL,
  casino_id     VARCHAR(191)   NOT NULL,
  username      VARCHAR(191)   NOT NULL,
  wagered       DECIMAL(20,8)  NOT NULL DEFAULT 0,
  `rank`        INT            NOT NULL,
  prize         DECIMAL(20,8)  NOT NULL DEFAULT 0,
  frozen_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_final_period_casino (period_id, casino_id),
  INDEX idx_final_period_rank (period_id, `rank`),
  CONSTRAINT fk_final_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sync_log (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  period_id        INT          NULL,
  provider         VARCHAR(32)  NOT NULL DEFAULT 'demo',
  cache_updated_at VARCHAR(40)  NULL,
  status           ENUM('success','failure') NOT NULL,
  error_code       VARCHAR(64)  NULL,
  row_count        INT          NOT NULL DEFAULT 0,
  fetched_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sync_period_time (period_id, fetched_at)
) ENGINE=InnoDB;

-- Streamer's own / disqualified casino accounts, filtered before ranking.
CREATE TABLE IF NOT EXISTS blacklist (
  casino_id   VARCHAR(191) PRIMARY KEY,
  reason      VARCHAR(255) NOT NULL DEFAULT '',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Per-sync snapshots: power the ▲▼ rank-change arrows and the race diffs.
CREATE TABLE IF NOT EXISTS rank_snapshots (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  period_id    INT            NOT NULL,
  casino_id    VARCHAR(191)   NOT NULL,
  wagered      DECIMAL(20,8)  NOT NULL DEFAULT 0,
  `rank`       INT            NOT NULL,
  snapshot_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_snap_period_time (period_id, snapshot_at),
  INDEX idx_snap_period_casino_time (period_id, casino_id, snapshot_at),
  CONSTRAINT fk_snap_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- final_results immutability (golden rule 5): single-statement SIGNAL triggers
-- so no DELIMITER gymnastics are needed in the runner.
DROP TRIGGER IF EXISTS final_results_no_update;
CREATE TRIGGER final_results_no_update BEFORE UPDATE ON final_results FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'final_results is immutable (golden rule 5)';

DROP TRIGGER IF EXISTS final_results_no_delete;
CREATE TRIGGER final_results_no_delete BEFORE DELETE ON final_results FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'final_results is immutable (golden rule 5)';
