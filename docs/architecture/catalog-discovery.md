# Catalogue discovery

## Discovery dimensions

Hathkriti treats category and gift occasion as separate concepts:

- Every product has one primary craft category.
- A product must have 1–5 gift occasions and can therefore be discovered in several gifting journeys without creating duplicate listings.
- Category and occasion names store English and Nepali display values. Stable slugs are used in public shop URLs.
- Only active categories and occasions are accepted during seller submission or exposed as public filters.

The initial category taxonomy is Gifts, Home décor, Jewelry & accessories, Traditional textiles, Lifestyle, Art & paintings, Pottery, Wood/bamboo craft, Personalized gifts, and Corporate gifting.

The initial occasion taxonomy is Birthday gifts, Wedding gifts, Dashain gifts, Tihar gifts, Mother's Day, Father's Day, Anniversary, Corporate gifts, Nepali gifts abroad, Housewarming, and Personalized gifts.

## Search and filters

The public `/shop` route supports a bounded text query plus repeated `category` and `occasion` parameters. Text search covers English and Nepali product names and descriptions, materials, producer, and approved seller trading name. Search terms escape SQL wildcard characters and all values remain prepared-statement bindings.

Multiple values are OR-matched inside one dimension and category/occasion dimensions are ANDed together. Unknown or inactive slugs are discarded before querying. Empty and zero-result states preserve a clear path back to the full collection.

## Product workflow

Sellers select a category and 1–5 occasions during initial submission and any requested revision. The server verifies every selection against active D1 records. Occasion assignments are normalized in `product_occasions`, are removed with the product, and are visible to Admin during product moderation.

## Phased customer architecture

The wider customer architecture will continue in small verified slices: category/discovery, artisan profiles, customer accounts and order lists, tracking, reviews, wishlist, help content, and finalized policy/legal pages. Footer links must only become active when their destination and approved content exist; company registrations or legal identifiers must never be invented.
