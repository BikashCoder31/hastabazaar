# Catalogue discovery

## Discovery dimensions

Hastabazaar treats category and gift occasion as separate concepts:

- Every product has one primary craft category.
- A product must have 1–5 gift occasions and can therefore be discovered in several gifting journeys without creating duplicate listings.
- Category and occasion names store English and Nepali display values. Stable slugs are used in public shop URLs.
- Only active categories and occasions are accepted during seller submission or exposed as public filters.

The initial category taxonomy is Gifts, Home decor, Jewelry & accessories, Traditional textiles, Lifestyle, Art & paintings, Pottery, Wood/bamboo craft, Personalized gifts, and Corporate gifting.

The initial occasion taxonomy is Birthday gifts, Wedding gifts, Dashain gifts, Tihar gifts, Mother's Day, Father's Day, Anniversary, Corporate gifts, Nepali gifts abroad, Housewarming, and Personalized gifts.

## Search and filters

The public `/shop` route supports a bounded text query plus repeated `category` and `occasion` parameters. Text search covers English and Nepali product names and descriptions, materials, producer, and approved seller trading name. Search terms escape SQL wildcard characters and all values remain prepared-statement bindings.

Multiple values are OR-matched inside one dimension and category/occasion dimensions are ANDed together. Unknown or inactive slugs are discarded before querying. Empty and zero-result states preserve a clear path back to the full collection.

## Storefront navigation and presentation

The homepage puts discovery first: a searchable shared header, craft category tiles, promoted products (or clearly labelled collection inspiration), gift occasions, maker context, marketplace standards, and a customer-service shortcut section. The blue-and-gold visual theme is shared with the shop and existing role interfaces through the global colour tokens. The interface remains English-only.

Homepage categories and occasions use the same active database records as the shop filters, preserving Admin-controlled names, ordering, and visibility. Editorial catalogue images are inspiration, not purchasable listings: their cards lead to related shop categories without advertising archived prices. Active promotions lead to their published product detail pages.

The header exposes a GET search to `/shop?q=...`, main-section links, account, wishlist, cart, and orders. Mobile navigation uses the existing accessible sheet primitive, closes on link selection, and includes customer and seller destinations. Mobile catalogue filters also use a sheet so the first products are accessible without scrolling past the entire taxonomy; desktop and mobile form controls have distinct IDs and preserve the existing filter/sort parameters.

Homepage shortcuts cover account details, orders, wishlist, addresses, notifications, guest tracking guidance, returns/refunds, complaints, seller application, and the seller dashboard. Footer groups provide the same destinations plus staff sign-in; local role testing is linked only in development. All protected routes retain their existing server-side authorization. Sign-in links remain top-level navigations. No public legal links are fabricated and the gifting collection for Nepalis abroad does not imply international delivery.

No schema, permissions, payment behavior, or external integrations change with this presentation update.

## Product workflow

Sellers select a category and 1–5 occasions during initial submission and any requested revision. The server verifies every selection against active D1 records. Occasion assignments are normalized in `product_occasions`, are removed with the product, and are visible to Admin during product moderation.

## Phased customer architecture

The wider customer architecture will continue in small verified slices: category/discovery, artisan profiles, customer accounts and order lists, tracking, reviews, wishlist, help content, and finalized policy/legal pages. Footer links must only become active when their destination and approved content exist; company registrations or legal identifiers must never be invented.
