-- Admin → Users: banning. A banned account can't sign in, its sessions stop
-- resolving and it can't claim prizes.
ALTER TABLE user_accounts
  ADD COLUMN banned        TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN banned_reason VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN banned_at     TIMESTAMP    NULL,
  ADD INDEX idx_user_accounts_created (created_at);
