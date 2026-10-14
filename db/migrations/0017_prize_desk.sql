-- Prize desk: USDC wallet payouts, Discord-verified winners, Discord ticket
-- claim buttons and prize notifications.

-- 'usdc' joins Stake / Rainbet; 'other' stays only for older claims.
ALTER TABLE prize_awards
  MODIFY COLUMN payout_method ENUM('stake','rainbet','usdc','other') NULL,
  ADD COLUMN payout_network     VARCHAR(16) NOT NULL DEFAULT '' AFTER payout_username,
  -- verified Discord winner (manual prizes added by Discord name): owns the prize like winner_kick_id
  ADD COLUMN winner_discord_id  VARCHAR(32) NULL AFTER winner_kick_id,
  -- the member added to the ticket (may press Claim / I received it in Discord)
  ADD COLUMN discord_user_id    VARCHAR(32) NULL AFTER discord_channel_id,
  ADD COLUMN discord_message_id VARCHAR(32) NULL AFTER discord_user_id,
  ADD INDEX idx_award_winner_discord (winner_discord_id);

-- One saved destination per method (each one saved / removed on its own);
-- payout_method is the preferred one.
ALTER TABLE user_accounts
  MODIFY COLUMN payout_method ENUM('stake','rainbet','usdc','other') NULL,
  ADD COLUMN stake_username   VARCHAR(64)  NOT NULL DEFAULT '',
  ADD COLUMN rainbet_username VARCHAR(64)  NOT NULL DEFAULT '',
  ADD COLUMN usdc_address     VARCHAR(64)  NOT NULL DEFAULT '',
  ADD COLUMN usdc_network     VARCHAR(16)  NOT NULL DEFAULT '',
  -- prize notifications newer than this are unread (NULL: never opened)
  ADD COLUMN notif_seen_at    TIMESTAMP    NULL;

UPDATE user_accounts SET stake_username = LEFT(payout_username, 64) WHERE payout_method = 'stake';
UPDATE user_accounts SET rainbet_username = LEFT(payout_username, 64) WHERE payout_method = 'rainbet';
UPDATE user_accounts SET payout_method = NULL WHERE payout_method = 'other';
-- existing accounts start with everything read
UPDATE user_accounts SET notif_seen_at = UTC_TIMESTAMP();
