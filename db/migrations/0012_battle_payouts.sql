-- Knockout battles decided by bonus result: what each player's bonus cost
-- (buy) and paid. Multiplier = payout / cost; the higher multiplier wins.
ALTER TABLE ko_matches
  ADD COLUMN p1_cost   DECIMAL(20,2) NULL AFTER p2_id,
  ADD COLUMN p1_payout DECIMAL(20,2) NULL AFTER p1_cost,
  ADD COLUMN p2_cost   DECIMAL(20,2) NULL AFTER p1_payout,
  ADD COLUMN p2_payout DECIMAL(20,2) NULL AFTER p2_cost;
