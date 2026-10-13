-- Stake's own slot catalogue (via the sharkz.gg feed, used with permission)
-- becomes the slot source: names, providers, Stake art (mediumrare.imgix.net),
-- "Only on Stake" flag and Stake popularity rank. Rows from earlier sources
-- are kept but deactivated by the first successful sync.
ALTER TABLE slot_catalog
  MODIFY source ENUM('slotreport','manual','stake') NOT NULL DEFAULT 'slotreport',
  ADD COLUMN only_on_stake TINYINT(1) NOT NULL DEFAULT 0 AFTER on_stake,
  ADD COLUMN popularity INT NULL AFTER only_on_stake,
  ADD INDEX idx_slot_popular (active, image_status, popularity);
