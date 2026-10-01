-- Additive product-specific materials and origin story fields.
ALTER TABLE `products`
  ADD COLUMN IF NOT EXISTS `materials_json` LONGTEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS `origin_story` LONGTEXT NULL;
