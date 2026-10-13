-- Prize ledger + 3-place tournament podium.

-- Every prize won anywhere on the site. Created automatically as 'pending'
-- when a result is final (tournament podium, giveaway draw, race/leaderboard
-- close, GB settle, accepted challenge) or by the admin for anything else.
-- Only 'paid' rows (admin confirmed the winner received it) count toward the
-- public "Prizes awarded" total. (source, source_ref) makes creation idempotent.
CREATE TABLE IF NOT EXISTS prize_awards (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  source      ENUM('tournament','giveaway','race','leaderboard','gb','challenge','manual') NOT NULL,
  source_ref  VARCHAR(96)   NOT NULL,
  title       VARCHAR(191)  NOT NULL DEFAULT '',
  place       TINYINT       NULL,
  winner      VARCHAR(191)  NOT NULL,
  amount      DECIMAL(20,2) NULL,
  prize_label VARCHAR(120)  NOT NULL DEFAULT '',
  status      ENUM('pending','paid','void') NOT NULL DEFAULT 'pending',
  note        VARCHAR(255)  NOT NULL DEFAULT '',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at     TIMESTAMP     NULL,
  UNIQUE KEY uq_award_source (source, source_ref),
  INDEX idx_award_status (status, created_at)
) ENGINE=InnoDB;

-- Leaderboard prizes already frozen before this ledger existed were paid out
-- by hand at the time; record them as paid so the public total doesn't drop.
INSERT IGNORE INTO prize_awards (source, source_ref, title, place, winner, amount, prize_label, status, created_at, paid_at)
  SELECT 'leaderboard', CONCAT('period:', fr.period_id, ':', fr.casino_id), p.title, fr.`rank`, fr.username, fr.prize, '', 'paid', fr.frozen_at, fr.frozen_at
  FROM final_results fr JOIN periods p ON p.id = fr.period_id
  WHERE fr.prize > 0;

-- Podium: a 3rd-place match (round 4, match 1) between the semi-final losers.
ALTER TABLE ko_tournaments
  ADD COLUMN prize_1       DECIMAL(20,2) NULL AFTER prize,
  ADD COLUMN prize_2       DECIMAL(20,2) NULL AFTER prize_1,
  ADD COLUMN prize_3       DECIMAL(20,2) NULL AFTER prize_2,
  ADD COLUMN runner_up_id  BIGINT NULL AFTER champion_id,
  ADD COLUMN third_id      BIGINT NULL AFTER runner_up_id;

INSERT IGNORE INTO ko_matches (tournament_id, round, match_index)
  SELECT id, 4, 1 FROM ko_tournaments WHERE status IN ('open','closed');
