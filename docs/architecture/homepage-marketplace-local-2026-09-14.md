# Homepage marketplace revision — local acceptance

Date: 2026-09-14  
Status: implemented and verified locally; not deployed

## Outcome

- Removed the hard-coded product fallback from the homepage. Static editorial hero photography remains branding only and no longer creates purchasable-looking products, prices or product links.
- Homepage product collections now use only products that are published, not deleted, owned by an approved seller whose user account is active, assigned to an active category, in stock and backed by an image.
- Newly published eligible products appear automatically in “Just added by our sellers”, ordered by published_at descending.
- Active, independently approved, in-window homepage promotions appear as current offers. Duplicate product assignments across simultaneous offers are de-duplicated.
- “Top products right now” ranks only order items whose item and parent order are both delivered, using deliveries from the preceding 90 days. Cancelled, returned and otherwise non-delivered purchases do not contribute.
- When no qualifying sales exist, the section is truthfully labelled “Featured by Hastabazaar” and uses only active approved homepage promotion products. When no eligible products exist, the page renders an honest empty state rather than sample inventory.
- Product cards show the real seller trading name, current price, validated compare-at discount and a truthful Offer/New/Popular/Featured label.
- Added an accessible horizontally sliding product row with explicit previous/next controls and native touch/trackpad scrolling.
- Reorganized the footer around Shop, Your account, Help & policies and Sell with us; added the public support address support@hastabazaar.com. Mobile link groups use two columns.

## Data and migration boundary

No schema migration is required. The revision reads existing products, product media, sellers, users, categories, promotions, promotion assignments, orders and order items. It does not rewrite orders, products, promotions or historical policy snapshots.

## Synthetic visual fixture

Four generated craft-product photographs and four existing local catalogue photographs were used only inside the isolated browser evidence directory. The generated subjects are a terracotta cup, bamboo basket, brass-and-red-bead earrings and indigo embroidered cushion. Prompts requested photorealistic vertical ecommerce product photography with a neutral studio background, handmade material texture, and no text, logos, people or watermark.

These images are not application source, production uploads, release fallback products or production database records. Each browser run creates a new synthetic MariaDB database, uses fake sellers/products/promotions/delivered orders, captures the page, then removes the database and application process.

## Verification

- Automated suite: 239 passed, 0 failed, skipped or cancelled.
- Focused repository/presentation tests validate eligibility, order ranking, promotion windows, de-duplication, truthful empty states and removal of hard-coded products.
- Non-incremental TypeScript: passed.
- Application and browser-verifier scoped lint: passed.
- Fresh isolated Babal build: passed using Node.js 22.23.1.
- Synthetic MariaDB/browser acceptance: passed at 390 × 844 and 1440 × 1000.
- Browser checks: no horizontal overflow, no page errors, no failed HTTP responses, visible product images loaded, top-products controls advanced the slider and 18 real product links rendered in each fixture viewport.
- Provider network was blocked and email delivery disabled.
- Synthetic application/database processes were stopped; loopback ports 43876 and 13316 were released.

## Visual evidence

- C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-browser-evidence/homepage-desktop-viewport.png
- C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-browser-evidence/homepage-desktop-full.png
- C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-browser-evidence/homepage-mobile-viewport.png
- C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-browser-evidence/homepage-mobile-full.png
- Browser evidence: C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-browser-evidence/homepage-browser.json
- Isolated build: C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-build-20260914

## Deployment status

The currently deployed production release remains unchanged. A new cumulative release ZIP, deployment backup and explicit owner deployment authorization are still required before this revision can be installed on Babal.Host.

