-- Stream games: bonus hunt, tournaments (8-slot bracket), guess-the-balance,
-- giveaways. Logic ported from JBALLIN; schemas generalised.

-- ── Bonus hunt (prompt §5.6) ──
CREATE TABLE IF NOT EXISTS bonus_hunt (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(120)  NOT NULL DEFAULT '',
  start_balance DECIMAL(20,8) NOT NULL DEFAULT 0,
  status        ENUM('active','finished','archived') NOT NULL DEFAULT 'active',
  image_url     VARCHAR(512)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   TIMESTAMP     NULL,
  INDEX idx_hunt_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bonus_hunt_entries (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  hunt_id     INT           NOT NULL,
  slot_name   VARCHAR(191)  NOT NULL,
  provider    VARCHAR(120)  NOT NULL DEFAULT '',
  bet         DECIMAL(20,8) NOT NULL DEFAULT 0,
  payout      DECIMAL(20,8) NULL,                 -- null until the bonus is opened
  image_url   VARCHAR(512)  NULL,
  position    INT           NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hunt_entries (hunt_id, position),
  CONSTRAINT fk_hunt FOREIGN KEY (hunt_id) REFERENCES bonus_hunt(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Tournaments: single-elim 8-slot slot battle (prompt §5.4) ──
CREATE TABLE IF NOT EXISTS tournament (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(120)  NOT NULL DEFAULT '',
  status      ENUM('upcoming','live','finished') NOT NULL DEFAULT 'upcoming',
  prize       VARCHAR(120)  NOT NULL DEFAULT '',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP     NULL,
  INDEX idx_tournament_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tournament_slots (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT          NOT NULL,
  seed          INT          NOT NULL,            -- 1..8
  slot_name     VARCHAR(191) NOT NULL,
  provider      VARCHAR(120) NOT NULL DEFAULT '',
  image_url     VARCHAR(512) NULL,
  UNIQUE KEY uq_tslot (tournament_id, seed),
  CONSTRAINT fk_tslot FOREIGN KEY (tournament_id) REFERENCES tournament(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tournament_matches (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT           NOT NULL,
  round         TINYINT       NOT NULL,           -- 1=quarter 2=semi 3=final
  match_index   TINYINT       NOT NULL,
  seed_a        INT           NULL,
  seed_b        INT           NULL,
  score_a       DECIMAL(20,8) NULL,               -- win multiplier
  score_b       DECIMAL(20,8) NULL,
  winner_seed   INT           NULL,
  UNIQUE KEY uq_tmatch (tournament_id, round, match_index),
  CONSTRAINT fk_tmatch FOREIGN KEY (tournament_id) REFERENCES tournament(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Guess the balance (prompt §5.7): !gb <amount> from Kick chat ──
CREATE TABLE IF NOT EXISTS gb_rounds (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  hunt_id        INT           NULL,              -- optional link to a bonus hunt
  title          VARCHAR(120)  NOT NULL DEFAULT '',
  prize          VARCHAR(120)  NOT NULL DEFAULT '',
  status         ENUM('open','closed','settled') NOT NULL DEFAULT 'open',
  actual_balance DECIMAL(20,8) NULL,              -- set on settle
  opened_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at      TIMESTAMP     NULL,
  settled_at     TIMESTAMP     NULL,
  INDEX idx_gb_status (status),
  CONSTRAINT fk_gb_hunt FOREIGN KEY (hunt_id) REFERENCES bonus_hunt(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gb_guesses (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_id      INT           NOT NULL,
  kick_user_id  VARCHAR(64)   NULL,
  kick_username VARCHAR(191)  NOT NULL,
  amount        DECIMAL(20,8) NOT NULL,
  is_winner     TINYINT(1)    NOT NULL DEFAULT 0,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gb_guess (round_id, kick_username),  -- one guess per chatter
  INDEX idx_gb_round (round_id),
  CONSTRAINT fk_gb_round FOREIGN KEY (round_id) REFERENCES gb_rounds(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Giveaways + Winner Picker (prompt §5.10) ──
CREATE TABLE IF NOT EXISTS giveaways (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(120) NOT NULL DEFAULT '',
  type            ENUM('manual','keyword') NOT NULL DEFAULT 'keyword',
  keyword         VARCHAR(64)  NULL,              -- for keyword entry
  entry_condition VARCHAR(255) NOT NULL DEFAULT '',
  prize           VARCHAR(120) NOT NULL DEFAULT '',
  min_messages    INT          NOT NULL DEFAULT 1,  -- active-chatter threshold
  status          ENUM('open','drawn','closed') NOT NULL DEFAULT 'open',
  ends_at         TIMESTAMP    NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  drawn_at        TIMESTAMP    NULL,
  INDEX idx_giveaway_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  giveaway_id   INT          NOT NULL,
  kick_user_id  VARCHAR(64)  NULL,
  kick_username VARCHAR(191) NOT NULL,
  avatar        VARCHAR(512) NULL,
  message_count INT          NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_giveaway_entry (giveaway_id, kick_username),
  INDEX idx_giveaway_entries (giveaway_id),
  CONSTRAINT fk_ge_giveaway FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS giveaway_winners (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  giveaway_id   INT          NOT NULL,
  kick_username VARCHAR(191) NOT NULL,
  avatar        VARCHAR(512) NULL,
  prize         VARCHAR(120) NOT NULL DEFAULT '',
  drawn_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_giveaway_winners (giveaway_id),
  CONSTRAINT fk_gw_giveaway FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Kick webhook message de-dupe (prompt §7.9): remember processed message ids.
CREATE TABLE IF NOT EXISTS kick_webhook_seen (
  message_id  VARCHAR(191) PRIMARY KEY,
  seen_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_webhook_seen_time (seen_at)
) ENGINE=InnoDB;

-- Simple DB-backed rate limiter (prompt §7.8), used when Upstash isn't set.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket      VARCHAR(191) PRIMARY KEY,
  tokens      INT       NOT NULL,
  reset_at    TIMESTAMP NOT NULL
) ENGINE=InnoDB;
