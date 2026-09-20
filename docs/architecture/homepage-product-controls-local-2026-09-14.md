# Super Admin homepage product controls — local acceptance

Date: 2026-09-14  
Status: implemented and verified locally; not deployed

## Outcome

- Added a dedicated Super Admin page at `/admin/homepage` for all published, non-deleted products.
- Super Admin can search by product, SKU or seller and filter all, homepage-eligible or hidden products.
- Each product can be hidden from or restored to homepage merchandising without changing its published status, stock, seller ownership, shop presence or public product URL.
- The control applies consistently to active Offers, Latest Products and Top Products. A hidden product does not count toward an active offer's customer-facing eligible-product total.
- The same control is available on the protected product moderation detail page for Super Admin. Regular Admin does not receive the navigation entry, page access or mutation authority.
- Every state-changing decision requires an 8–500 character reason. The latest reason is visible to Super Admin and the complete action is retained in the staff audit log.

## Authorization and concurrency

- The protected API resolves the authenticated staff identity on every request and requires the non-delegable Super Admin permission boundary.
- The repository independently verifies that the actor is an active Super Admin both before and inside the mutation condition. A claimed role from the client is never accepted.
- Each product control has an optimistic version. A stale screen receives a conflict and cannot overwrite a newer decision.
- A client-generated request identifier makes a same-action retry idempotent. Rejected, stale and repeated requests do not create duplicate audit history.
- Product publication remains independent. The browser test verifies the product is still `published` after hiding it and that it remains eligible for the public shop catalogue.

## Data and migration boundary

- Additive migration `0040_homepage_product_controls` creates one independent control row per product, with hidden state, decision reason, version, actor, request identifier and timestamps.
- Babal MariaDB migration: `deployment/babal/mariadb-homepage-product-controls.sql`.
- The cumulative release manifest now has 93 required tables, 38 triggers and 22 ordered migrations. The new migration is additive maintenance; the empty-database-only base schema must never be run over existing data.
- No existing products, orders, promotions, uploads, authentication records or historical policy snapshots are rewritten.

## Verification

- Focused repository/migration tests cover Super Admin-only authorization, hide/restore, unchanged publication, all three homepage collections, offer counts, idempotency, stale-version rejection and audit records.
- The fresh cumulative automated suite passed 241/241 tests with no failures, skips or cancellations.
- SQLite migration 0040 was applied twice to a fresh synthetic database to verify safe reapplication and exact columns.
- MariaDB migration 0040 was applied through the ordered cumulative manifest to a unique synthetic database on loopback port 13316.
- Fresh isolated Babal build completed from `homepage-controls-build-20260914` using Node.js 22.23.1.
- Playwright verified 1440 × 1000 and 390 × 844 views with provider network blocked, fake sellers/products/promotions/orders, no failed HTTP responses, no page errors, no console errors, no framework overlay and no horizontal overflow.
- The interaction path hid one product, verified that it stayed published and remained in the public shop, verified its complete removal from the customer homepage, restored it and verified that homepage eligibility returned.
- Synthetic application and database processes were stopped; ports 43876 and 13316 were released.

## Separate finding

- During isolated browser diagnostics, a filtered public catalogue request (`/shop?q=...`) reached the application's generic error boundary, while the unfiltered `/shop` catalogue used for the publication-preservation assertion passed. This separate search-path defect was not changed or attributed to the homepage control and should be tracked before the next deployment.

## Visual evidence

- `C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-controls-browser-evidence-accepted-v2/homepage-controls-desktop-initial.png`
- `C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-controls-browser-evidence-accepted-v2/homepage-controls-desktop-confirmation.png`
- `C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-controls-browser-evidence-accepted-v2/homepage-controls-desktop-hidden.png`
- `C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-controls-browser-evidence-accepted-v2/homepage-controls-mobile.png`
- Browser evidence: `C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-controls-browser-evidence-accepted-v2/homepage-browser.json`

## Deployment status

Production remains unchanged. Migration 0040 must be included in a new cumulative release and applied only after a fresh production backup and preflight inspection. Deployment still requires separate explicit owner authorization.
