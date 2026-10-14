-- Discord prize tickets: each new prize opens a private channel named after
-- the winner (lib/discordTickets.ts).
--   discord_channel_id NULL → ticket still to open
--   ''                      → no ticket (prizes that existed before this feature)
-- discord_ticket_lock stops two requests opening the same ticket; a stale lock
-- (crashed request) is retried.
ALTER TABLE prize_awards
  ADD COLUMN discord_channel_id  VARCHAR(32) NULL,
  ADD COLUMN discord_ticket_lock TIMESTAMP   NULL,
  ADD INDEX idx_award_discord (discord_channel_id);

UPDATE prize_awards SET discord_channel_id = '';
