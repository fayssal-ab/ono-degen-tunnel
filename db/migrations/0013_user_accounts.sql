-- Viewer accounts: sign in with Kick or Discord, then link the other one.
-- One account holds at most one identity per provider, and an identity
-- belongs to exactly one account. (The older Kick-only `users`/`sessions`
-- tables from 0002 are unused and left alone.)

CREATE TABLE IF NOT EXISTS user_accounts (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  display_name   VARCHAR(191) NOT NULL,
  avatar         VARCHAR(512) NOT NULL DEFAULT '',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  TIMESTAMP    NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_identities (
  provider          ENUM('kick','discord') NOT NULL,
  provider_user_id  VARCHAR(64)  NOT NULL,
  account_id        BIGINT       NOT NULL,
  username          VARCHAR(191) NOT NULL,
  avatar            VARCHAR(512) NOT NULL DEFAULT '',
  linked_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, provider_user_id),
  UNIQUE KEY uq_identity_account (account_id, provider),
  CONSTRAINT fk_identity_account FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- The cookie holds a random token; only its SHA-256 is stored.
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash  CHAR(64)  PRIMARY KEY,
  account_id  BIGINT    NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,
  INDEX idx_user_sessions_account (account_id),
  INDEX idx_user_sessions_expiry (expires_at),
  CONSTRAINT fk_user_session_account FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
