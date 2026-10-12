-- Stake availability for the slot catalogue. Stake has no public game API and
-- blocks automated access, so the admin marks which catalogue slots are on
-- Stake (pasted list, matched by name) and can add Stake-only slots that
-- slot.report doesn't list (source = 'manual', image fetched and checked).
ALTER TABLE slot_catalog
  ADD COLUMN on_stake TINYINT(1) NOT NULL DEFAULT 0 AFTER ambiguous,
  ADD COLUMN source ENUM('slotreport','manual') NOT NULL DEFAULT 'slotreport' AFTER on_stake,
  ADD INDEX idx_slot_stake (on_stake, active, image_status);
