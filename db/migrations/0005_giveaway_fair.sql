-- Provably-fair giveaway draws (sharkz-style verification). The server seed is
-- committed (its hash published) when a giveaway is created, so the operator
-- can't pick a seed after seeing entrants. At draw time the ordered entrant
-- list is hashed and the winner index is HMAC-SHA256(server_seed,
-- entries_hash:nonce) mod N — anyone can recompute it on /verify.

ALTER TABLE giveaways
  ADD COLUMN server_seed       CHAR(64) NULL AFTER min_messages,
  ADD COLUMN server_seed_hash  CHAR(64) NULL AFTER server_seed,
  ADD COLUMN subscribers_only  TINYINT(1) NOT NULL DEFAULT 0 AFTER min_messages;

ALTER TABLE giveaway_entries
  ADD COLUMN is_subscriber TINYINT(1) NOT NULL DEFAULT 0 AFTER message_count;

ALTER TABLE giveaway_winners
  ADD COLUMN nonce            INT      NULL AFTER prize,
  ADD COLUMN winner_index     INT      NULL AFTER nonce,
  ADD COLUMN entrant_count    INT      NULL AFTER winner_index,
  ADD COLUMN entries_hash     CHAR(64) NULL AFTER entrant_count,
  ADD COLUMN server_seed      CHAR(64) NULL AFTER entries_hash,
  ADD COLUMN server_seed_hash CHAR(64) NULL AFTER server_seed;
