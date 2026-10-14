-- Giveaway winners must answer in Kick chat: the dashboard gives the drawn
-- winner 15 s to type something. Answered (or accepted by the admin) →
-- 'confirmed' and the prize is recorded (ticket + notification). Silent →
-- 'no_show': no prize, the admin rerolls. The row stays for the provably-fair
-- nonce chain. Winners drawn before this keep 'confirmed' (prize already recorded).
ALTER TABLE giveaway_winners
  ADD COLUMN response      ENUM('waiting','confirmed','no_show') NOT NULL DEFAULT 'confirmed',
  ADD COLUMN responded_at  TIMESTAMP    NULL,
  ADD COLUMN response_text VARCHAR(500) NOT NULL DEFAULT '';
