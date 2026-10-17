-- "Claim" on a challenge opens a private Discord ticket for that player
-- (🎯 CHALLENGE CLAIMS) where they post the replay. One per player per
-- challenge: pressing Claim again sends them to the same channel.
CREATE TABLE IF NOT EXISTS challenge_claim_tickets (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  challenge_id    INT          NOT NULL,
  discord_user_id VARCHAR(32)  NOT NULL,
  account_id      BIGINT       NULL,
  channel_id      VARCHAR(32)  NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_claim_ticket (challenge_id, discord_user_id),
  CONSTRAINT fk_claim_ticket_challenge FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
) ENGINE=InnoDB;
