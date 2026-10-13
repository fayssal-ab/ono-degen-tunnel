-- Prize claims: the winner claims a prize from their account (where to send
-- it), the admin pays, the winner confirms receipt.
--   pending + claimed_at NULL → waiting for the winner's claim
--   pending + claimed_at      → claimed, waiting for payment
--   paid    + received_at     → winner confirmed receipt
-- Matching an account: winner_kick_id when known, otherwise the Kick username.
-- Leaderboard / race prizes use casino usernames and are not claimable.

ALTER TABLE prize_awards
  ADD COLUMN winner_kick_id    VARCHAR(64)  NULL AFTER winner,
  ADD COLUMN claim_account_id  BIGINT       NULL,
  ADD COLUMN payout_method     ENUM('stake','rainbet','other') NULL,
  ADD COLUMN payout_username   VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN claim_note        VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN claimed_at        TIMESTAMP    NULL,
  ADD COLUMN received_at       TIMESTAMP    NULL,
  ADD INDEX idx_award_winner (winner),
  ADD INDEX idx_award_winner_kick (winner_kick_id);

-- default payout destination, pre-fills the claim form
ALTER TABLE user_accounts
  ADD COLUMN payout_method   ENUM('stake','rainbet','other') NULL,
  ADD COLUMN payout_username VARCHAR(191) NOT NULL DEFAULT '';

-- backfill Kick ids where the source row has them
UPDATE prize_awards pa
  JOIN ko_participants p
    ON pa.source = 'tournament'
   AND p.tournament_id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(pa.source_ref, ':', 2), ':', -1) AS UNSIGNED)
   AND p.username = pa.winner
   SET pa.winner_kick_id = p.kick_user_id
 WHERE pa.winner_kick_id IS NULL;

UPDATE prize_awards pa
  JOIN giveaway_winners w
    ON pa.source = 'giveaway' AND w.id = CAST(SUBSTRING(pa.source_ref, 4) AS UNSIGNED)
  JOIN giveaway_entries e
    ON e.giveaway_id = w.giveaway_id AND e.kick_username = w.kick_username AND e.kick_user_id IS NOT NULL
   SET pa.winner_kick_id = e.kick_user_id
 WHERE pa.winner_kick_id IS NULL;

UPDATE prize_awards pa
  JOIN gb_guesses g
    ON pa.source = 'gb' AND g.round_id = CAST(SUBSTRING(pa.source_ref, 4) AS UNSIGNED) AND g.is_winner = 1 AND g.kick_user_id IS NOT NULL
   SET pa.winner_kick_id = g.kick_user_id
 WHERE pa.winner_kick_id IS NULL;
