ALTER TABLE `seller_profiles` ADD `application_reference` text;--> statement-breakpoint
ALTER TABLE `seller_profiles` ADD `business_description` text;--> statement-breakpoint
ALTER TABLE `seller_profiles` ADD `product_categories` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seller_profiles_application_reference_unique` ON `seller_profiles` (`application_reference`);