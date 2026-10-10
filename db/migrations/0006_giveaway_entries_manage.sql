-- Entries management + stable verification for the giveaway dashboard.
-- `excluded` removes a chatter from the eligible pool (spammers etc.) before a
-- draw. `drawn_entrants` snapshots the exact ordered pool at the first draw so
-- /verify stays reproducible even if entries change afterwards.

ALTER TABLE giveaway_entries
  ADD COLUMN excluded TINYINT(1) NOT NULL DEFAULT 0 AFTER message_count;

ALTER TABLE giveaways
  ADD COLUMN drawn_entrants JSON NULL AFTER server_seed_hash;
