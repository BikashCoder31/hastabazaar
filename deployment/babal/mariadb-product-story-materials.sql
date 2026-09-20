-- Additive product-specific materials and origin story fields.
ALTER TABLE `products`
  ADD COLUMN `materials_json` LONGTEXT NOT NULL DEFAULT '[]',
  ADD COLUMN `origin_story` LONGTEXT NULL;
