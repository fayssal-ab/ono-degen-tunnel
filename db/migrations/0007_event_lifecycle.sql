-- Admin lifecycle for races, tournaments, bonus hunts, guess-the-balance and
-- challenges, plus period-scoped manual imports. Incremental only: existing
-- rows keep their meaning, nothing is dropped except a superseded GB index.

-- Mutex rows locked with SELECT … FOR UPDATE so "only one active X" rules hold
-- under concurrent admin requests without assuming existing data is clean.
CREATE TABLE IF NOT EXISTS app_locks (
  name VARCHAR(64) PRIMARY KEY
) ENGINE=InnoDB;
INSERT IGNORE INTO app_locks (name) VALUES ('period'), ('hunt'), ('gb'), ('tournament'), ('race');

-- Last start/success/error of each cron job, shown on the admin dashboard.
CREATE TABLE IF NOT EXISTS job_runs (
  name            VARCHAR(64) PRIMARY KEY,
  last_started_at TIMESTAMP    NULL,
  last_success_at TIMESTAMP    NULL,
  last_error_at   TIMESTAMP    NULL,
  last_error      VARCHAR(191) NULL,
  detail          JSON         NULL
) ENGINE=InnoDB;

-- ── Races ──
-- finalizing: the window has ended but no sync has run past end_at yet, so a
-- fresher in-window sample could still arrive. closed = frozen.
ALTER TABLE races
  MODIFY status ENUM('upcoming','live','finalizing','closed') NOT NULL DEFAULT 'upcoming',
  ADD COLUMN baseline_at       TIMESTAMP NULL AFTER status,
  ADD COLUMN last_sample_at    TIMESTAMP NULL AFTER baseline_at,
  ADD COLUMN last_computed_at  TIMESTAMP NULL AFTER last_sample_at,
  ADD COLUMN pending_baseline  INT       NOT NULL DEFAULT 0 AFTER last_computed_at,
  ADD COLUMN finalized_at      TIMESTAMP NULL AFTER pending_baseline,
  ADD COLUMN finalize_note     VARCHAR(191) NOT NULL DEFAULT '' AFTER finalized_at;

-- ── Tournaments ──
ALTER TABLE tournament
  ADD COLUMN starts_at  TIMESTAMP NULL AFTER prize,
  ADD COLUMN started_at TIMESTAMP NULL AFTER starts_at;

-- ── Bonus hunt ──
-- opening_started_at is set by the first payout: from then on the bonus list
-- is locked and a linked GB round is closed in the same transaction.
ALTER TABLE bonus_hunt
  ADD COLUMN opening_started_at TIMESTAMP NULL AFTER created_at;
UPDATE bonus_hunt h SET opening_started_at = h.created_at
  WHERE opening_started_at IS NULL AND EXISTS (SELECT 1 FROM bonus_hunt_entries e WHERE e.hunt_id = h.id AND e.payout IS NOT NULL);

-- ── Guess the balance ──
ALTER TABLE gb_rounds
  MODIFY status ENUM('draft','open','closed','settled') NOT NULL DEFAULT 'draft',
  ADD COLUMN deadline_at TIMESTAMP NULL AFTER status;

-- identity_key = 'id:<kick user id>' when Kick provides one, else
-- 'name:<lowercased username>'. Latest guess per identity wins.
ALTER TABLE gb_guesses
  ADD COLUMN identity_key VARCHAR(100) NULL AFTER kick_username,
  ADD COLUMN guessed_at   DATETIME(3)  NULL AFTER amount;
UPDATE gb_guesses SET identity_key = CONCAT('name:', LOWER(kick_username)) WHERE identity_key IS NULL;
UPDATE gb_guesses SET guessed_at = created_at WHERE guessed_at IS NULL;
ALTER TABLE gb_guesses
  MODIFY identity_key VARCHAR(100) NOT NULL,
  MODIFY guessed_at DATETIME(3) NOT NULL,
  ADD UNIQUE KEY uq_gb_identity (round_id, identity_key),
  DROP INDEX uq_gb_guess,
  ADD INDEX idx_gb_round_time (round_id, guessed_at);

-- ── Challenges ──
-- Proof is received off-site (Discord etc.) and recorded by an admin. At most
-- one accepted claim per challenge, enforced by the unique generated column
-- (MySQL forbids CASCADE on a stored generated column's base column).
CREATE TABLE IF NOT EXISTS challenge_claims (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  challenge_id   INT           NOT NULL,
  claimant       VARCHAR(191)  NOT NULL,
  proof_url      VARCHAR(512)  NOT NULL DEFAULT '',
  proof_ref      VARCHAR(191)  NOT NULL DEFAULT '',
  bet            DECIMAL(20,8) NOT NULL,
  multiplier     DECIMAL(20,2) NOT NULL,
  played_at      TIMESTAMP     NOT NULL,
  status         ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  review_note    VARCHAR(255)  NOT NULL DEFAULT '',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at    TIMESTAMP     NULL,
  accepted_guard INT GENERATED ALWAYS AS (IF(status = 'accepted', challenge_id, NULL)) STORED,
  UNIQUE KEY uq_claim_accepted (accepted_guard),
  INDEX idx_claim_challenge (challenge_id, status),
  CONSTRAINT fk_claim_challenge FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ── Manual provider, scoped per period ──
-- manual_wagers had no period, so one upload fed whatever period was live.
-- New imports are stored per period; legacy rows are copied to the period
-- that was live at migration time (the one they were feeding) and the legacy
-- table is left in place untouched.
CREATE TABLE IF NOT EXISTS manual_imports (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  period_id   INT          NOT NULL,
  row_count   INT          NOT NULL,
  total       DECIMAL(24,8) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_import_period (period_id, created_at),
  CONSTRAINT fk_import_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS manual_period_wagers (
  period_id   INT           NOT NULL,
  casino_id   VARCHAR(191)  NOT NULL,
  username    VARCHAR(191)  NOT NULL,
  wagered     DECIMAL(20,8) NOT NULL DEFAULT 0,
  import_id   INT           NULL,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (period_id, casino_id),
  CONSTRAINT fk_mpw_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO manual_period_wagers (period_id, casino_id, username, wagered)
  SELECT p.id, m.casino_id, m.username, m.wagered
  FROM manual_wagers m JOIN (SELECT id FROM periods WHERE status = 'live' ORDER BY start_at ASC LIMIT 1) p;
