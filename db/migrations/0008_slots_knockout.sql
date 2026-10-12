-- Slot catalogue (slot.report) + 16-player chat knockout tournament.
-- Incremental only; the legacy 8-slot `tournament*` tables are left untouched.

INSERT IGNORE INTO app_locks (name) VALUES ('ko'), ('slots');

-- ── Slot catalogue ──
-- One row per slot.report entry, keyed by provider + slug (slugs alone are
-- not unique). slot.report answers HTTP 200 with a branded placeholder for
-- slots it has no art for, so every thumbnail is fetched and compared before
-- it is used: image_status 'real' → image_url is the verified thumbnail,
-- 'missing' → no image (the UI shows a name tile), 'unknown' → not checked yet.
-- ambiguous = the same slug is listed under several providers (the catalogue
-- itself contradicts the provider), so it is never auto-assigned.
CREATE TABLE IF NOT EXISTS slot_catalog (
  id               VARCHAR(191) PRIMARY KEY,
  slug             VARCHAR(191) NOT NULL,
  name             VARCHAR(191) NOT NULL,
  name_norm        VARCHAR(191) NOT NULL,
  provider         VARCHAR(120) NOT NULL,
  provider_slug    VARCHAR(120) NOT NULL,
  image_status     ENUM('unknown','real','missing') NOT NULL DEFAULT 'unknown',
  image_url        VARCHAR(512) NULL,
  image_checked_at TIMESTAMP NULL,
  ambiguous        TINYINT(1) NOT NULL DEFAULT 0,
  active           TINYINT(1) NOT NULL DEFAULT 1,
  synced_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_slot_pool (active, image_status, ambiguous),
  INDEX idx_slot_slug (slug),
  INDEX idx_slot_check (image_status, image_checked_at)
) ENGINE=InnoDB;

ALTER TABLE bonus_hunt_entries
  ADD COLUMN slot_id VARCHAR(191) NULL AFTER hunt_id;

-- ── Knockout tournament (16 players from Kick chat `!join`) ──
-- status: open = registration open; closed = registration closed, bracket in
-- progress; finished = champion crowned; cancelled = reset by the admin.
CREATE TABLE IF NOT EXISTS ko_tournaments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(120) NOT NULL DEFAULT '',
  prize          VARCHAR(120) NOT NULL DEFAULT '',
  status         ENUM('open','closed','finished','cancelled') NOT NULL DEFAULT 'closed',
  max_players    TINYINT NOT NULL DEFAULT 16,
  champion_id    BIGINT NULL,
  roll_seq       INT NOT NULL DEFAULT 0,
  focus_match_id BIGINT NULL,             -- battle shown on the overlay / dashboard
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opened_at      TIMESTAMP NULL,
  closed_at      TIMESTAMP NULL,
  finished_at    TIMESTAMP NULL,
  INDEX idx_ko_status (status)
) ENGINE=InnoDB;

-- One row per Kick account per tournament (UNIQUE): repeated !join only
-- rerolls the slot. Slot fields are a snapshot so a catalogue change can't
-- alter a locked bracket.
CREATE TABLE IF NOT EXISTS ko_participants (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  tournament_id  INT NOT NULL,
  kick_user_id   VARCHAR(64) NOT NULL,
  username       VARCHAR(191) NOT NULL,
  slot_id        VARCHAR(191) NOT NULL,
  slot_name      VARCHAR(191) NOT NULL,
  slot_provider  VARCHAR(120) NOT NULL,
  slot_image     VARCHAR(512) NOT NULL,
  state          ENUM('registered','in_knockout','eliminated','champion') NOT NULL DEFAULT 'registered',
  bracket_pos    TINYINT NULL,
  rerolls        INT NOT NULL DEFAULT 0,
  joined_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ko_player (tournament_id, kick_user_id),
  UNIQUE KEY uq_ko_pos (tournament_id, bracket_pos),
  INDEX idx_ko_state (tournament_id, state),
  CONSTRAINT fk_ko_part_t FOREIGN KEY (tournament_id) REFERENCES ko_tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15 matches created with the tournament: round 1 = round of 16 (8),
-- 2 = quarter-finals (4), 3 = semi-finals (2), 4 = grand final (1).
-- status: empty → rolled (roller picked two players, awaiting confirmation)
-- → ready → live → done; bye = one player advances unopposed; void = no
-- players will ever reach it (fewer than 16 registrations).
CREATE TABLE IF NOT EXISTS ko_matches (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  tournament_id  INT NOT NULL,
  round          TINYINT NOT NULL,
  match_index    TINYINT NOT NULL,
  p1_id          BIGINT NULL,
  p2_id          BIGINT NULL,
  status         ENUM('empty','rolled','ready','live','done','bye','void') NOT NULL DEFAULT 'empty',
  winner_id      BIGINT NULL,
  roll_seq       INT NULL,
  rolled_at      TIMESTAMP NULL,
  started_at     TIMESTAMP NULL,
  finished_at    TIMESTAMP NULL,
  UNIQUE KEY uq_ko_match (tournament_id, round, match_index),
  INDEX idx_ko_match_status (tournament_id, status),
  CONSTRAINT fk_ko_match_t FOREIGN KEY (tournament_id) REFERENCES ko_tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Chat message ids already processed for !join (browser socket and signed
-- webhook can both deliver the same message; a duplicate must not reroll).
CREATE TABLE IF NOT EXISTS ko_join_seen (
  message_id  VARCHAR(191) PRIMARY KEY,
  seen_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ko_seen_time (seen_at)
) ENGINE=InnoDB;
