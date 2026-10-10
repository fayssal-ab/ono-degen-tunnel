-- Accounts, sessions, points ledger, settings, audit, VIP, stream schedule.

-- Kick-authenticated users (OAuth login, prompt §5.9).
CREATE TABLE IF NOT EXISTS users (
  kick_user_id  VARCHAR(64) PRIMARY KEY,
  username      VARCHAR(191) NOT NULL,
  avatar        VARCHAR(512) NULL,
  streak_count  INT          NOT NULL DEFAULT 0,
  last_streak_at DATE        NULL,
  banned        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_username (username)
) ENGINE=InnoDB;

-- Signed httpOnly session cookie references a row here.
CREATE TABLE IF NOT EXISTS sessions (
  id            CHAR(64) PRIMARY KEY,          -- random token id (not the secret)
  kick_user_id  VARCHAR(64) NOT NULL,
  created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    TIMESTAMP   NOT NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (kick_user_id) REFERENCES users(kick_user_id) ON DELETE CASCADE,
  INDEX idx_sessions_expiry (expires_at)
) ENGINE=InnoDB;

-- A user linking their casino username for VIP/leaderboard attribution.
-- Admin-verified; the casino_username is never shown unmasked publicly.
CREATE TABLE IF NOT EXISTS casino_links (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  kick_user_id   VARCHAR(64)  NOT NULL,
  casino_username VARCHAR(191) NOT NULL,
  casino_id      VARCHAR(191) NULL,            -- filled on verification
  status         ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  note           VARCHAR(255) NOT NULL DEFAULT '',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at    TIMESTAMP    NULL,
  UNIQUE KEY uq_link_user (kick_user_id),
  CONSTRAINT fk_link_user FOREIGN KEY (kick_user_id) REFERENCES users(kick_user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Points balance is ALWAYS SUM(amount) over this ledger — never a mutable
-- column (prompt §5.9). Every row has a reason. Amounts can be negative.
CREATE TABLE IF NOT EXISTS points_ledger (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  kick_user_id  VARCHAR(64)  NOT NULL,
  amount        BIGINT       NOT NULL,         -- points are whole numbers
  reason        VARCHAR(64)  NOT NULL,         -- chat|streak|game|grant|redeem|refund|admin
  meta          JSON         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ledger_user (kick_user_id),
  CONSTRAINT fk_ledger_user FOREIGN KEY (kick_user_id) REFERENCES users(kick_user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- key/value JSON settings (casino name/code/url override, leaderboard on/off,
-- announcement banner, next stream time, …). Read by site_settings lib.
CREATE TABLE IF NOT EXISTS site_settings (
  `key`       VARCHAR(64) PRIMARY KEY,
  value       JSON        NOT NULL,
  updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Every admin mutation is recorded (prompt §7.8 / §5.15).
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor       VARCHAR(191) NOT NULL,           -- 'password' or kick_user_id
  action      VARCHAR(64)  NOT NULL,
  target      VARCHAR(191) NOT NULL DEFAULT '',
  detail      JSON         NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_time (created_at)
) ENGINE=InnoDB;

-- VIP ladder (prompt §5.8). threshold_wagered in DECIMAL. perks is free JSON.
CREATE TABLE IF NOT EXISTS vip_tiers (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(32)  NOT NULL UNIQUE,  -- bronze..tunnel-god
  name              VARCHAR(64)  NOT NULL,
  threshold_wagered DECIMAL(20,8) NOT NULL DEFAULT 0,
  perks             JSON         NOT NULL,
  position          INT          NOT NULL DEFAULT 0,
  INDEX idx_vip_pos (position)
) ENGINE=InnoDB;

-- Weekly stream schedule + latest-clips metadata (prompt §5.13).
CREATE TABLE IF NOT EXISTS stream_schedule (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  weekday     TINYINT      NOT NULL,            -- 0=Sun..6=Sat
  start_time  VARCHAR(5)   NOT NULL,            -- "HH:MM" local to timezone
  timezone    VARCHAR(64)  NOT NULL DEFAULT 'UTC',
  title       VARCHAR(120) NOT NULL DEFAULT '',
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  INDEX idx_stream_day (weekday)
) ENGINE=InnoDB;
