-- Races, challenges, points store, and provably-fair case/wheel logs.

-- ── Races (prompt §5.3): short races computed from wager-snapshot diffs ──
CREATE TABLE IF NOT EXISTS races (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(120)  NOT NULL DEFAULT '',
  kind               ENUM('24h','7d') NOT NULL DEFAULT '24h',
  period_id          INT           NULL,          -- which period's wager data
  start_at           TIMESTAMP     NOT NULL,
  end_at             TIMESTAMP     NOT NULL,
  prize_pool         DECIMAL(20,8) NOT NULL DEFAULT 0,
  prize_distribution JSON          NOT NULL,
  status             ENUM('upcoming','live','closed') NOT NULL DEFAULT 'upcoming',
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_races_status (status),
  CONSTRAINT fk_race_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS race_entries (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  race_id     INT           NOT NULL,
  casino_id   VARCHAR(191)  NOT NULL,
  username    VARCHAR(191)  NOT NULL,
  wagered     DECIMAL(20,8) NOT NULL DEFAULT 0,    -- diff over the race window
  `rank`      INT           NULL,
  prize       DECIMAL(20,8) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_race_entry (race_id, casino_id),
  INDEX idx_race_rank (race_id, `rank`),
  CONSTRAINT fk_race_entry FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Challenges (prompt §5.5): "first to Nx on <slot> wins $X" ──
CREATE TABLE IF NOT EXISTS challenges (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  slot_name           VARCHAR(191)  NOT NULL,
  provider            VARCHAR(120)  NOT NULL DEFAULT '',
  image_url           VARCHAR(512)  NULL,
  required_multiplier DECIMAL(20,2) NOT NULL,
  min_bet             DECIMAL(20,8) NOT NULL DEFAULT 0,
  prize               VARCHAR(120)  NOT NULL DEFAULT '',
  status              ENUM('open','claimed','expired') NOT NULL DEFAULT 'open',
  claimed_by          VARCHAR(191)  NULL,          -- casino/kick username, masked on display
  claimed_at          TIMESTAMP     NULL,
  expires_at          TIMESTAMP     NULL,
  position            INT           NOT NULL DEFAULT 0,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_challenge_status (status, position)
) ENGINE=InnoDB;

-- ── Points store (prompt §5.9) ──
CREATE TABLE IF NOT EXISTS store_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(512) NOT NULL DEFAULT '',
  image_url   VARCHAR(512) NULL,
  cost_points BIGINT       NOT NULL,
  kind        ENUM('casino_bonus','discord_role','merch','giveaway_entry') NOT NULL DEFAULT 'merch',
  stock       INT          NULL,                   -- null = unlimited
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  position    INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_store_active (active, position)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS redemptions (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  kick_user_id  VARCHAR(64)  NOT NULL,
  item_id       INT          NOT NULL,
  cost_points   BIGINT       NOT NULL,             -- snapshot of cost at redeem time
  status        ENUM('pending','fulfilled','rejected') NOT NULL DEFAULT 'pending',
  note          VARCHAR(512) NOT NULL DEFAULT '',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   TIMESTAMP    NULL,
  INDEX idx_redemption_status (status),
  INDEX idx_redemption_user (kick_user_id),
  CONSTRAINT fk_redemption_user FOREIGN KEY (kick_user_id) REFERENCES users(kick_user_id) ON DELETE CASCADE,
  CONSTRAINT fk_redemption_item FOREIGN KEY (item_id) REFERENCES store_items(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ── Provably-fair daily case & wheel (prompt §5.9) ──
-- commit/reveal: server_seed_hash shown before, server_seed revealed after,
-- client_seed + nonce per user. Verify on /fair. Outcome decided server-side.
CREATE TABLE IF NOT EXISTS case_openings (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  kick_user_id     VARCHAR(64)  NOT NULL,
  server_seed_hash CHAR(64)     NOT NULL,
  server_seed      CHAR(64)     NOT NULL,          -- stored; already "revealed"
  client_seed      VARCHAR(128) NOT NULL,
  nonce            INT          NOT NULL,
  result_index     INT          NOT NULL,
  result_points    BIGINT       NOT NULL,
  result_label     VARCHAR(120) NOT NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_case_user_time (kick_user_id, created_at),
  CONSTRAINT fk_case_user FOREIGN KEY (kick_user_id) REFERENCES users(kick_user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wheel_spins (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  kick_user_id     VARCHAR(64)  NOT NULL,
  server_seed_hash CHAR(64)     NOT NULL,
  server_seed      CHAR(64)     NOT NULL,
  client_seed      VARCHAR(128) NOT NULL,
  nonce            INT          NOT NULL,
  result_index     INT          NOT NULL,
  result_points    BIGINT       NOT NULL,
  result_label     VARCHAR(120) NOT NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wheel_user_time (kick_user_id, created_at),
  CONSTRAINT fk_wheel_user FOREIGN KEY (kick_user_id) REFERENCES users(kick_user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Manual provider upload target (prompt §6).
CREATE TABLE IF NOT EXISTS manual_wagers (
  casino_id   VARCHAR(191) PRIMARY KEY,
  username    VARCHAR(191)  NOT NULL,
  wagered     DECIMAL(20,8) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
