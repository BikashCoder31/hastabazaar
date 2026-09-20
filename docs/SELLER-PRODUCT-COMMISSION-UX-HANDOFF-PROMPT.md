# New-chat prompt: Seller product management, commission, and website UX

> **Production hotfix recorded 20 September 2026:** the deployed checkout initially failed with HTTP 500 because MariaDB treats the unqualified `key` in `SELECT value FROM marketplace_settings WHERE key = ?` as reserved SQL syntax. The active compiled file was manually changed to use `WHERE marketplace_settings.key = ?`, and checkout then worked. The permanent source correction is in `lib/db/repositories/marketplace-settings.ts`, with a regression assertion in `tests/marketplace-commission.test.ts`. Any future release must retain this correction or it will reintroduce the checkout failure. See `docs/production-hotfix-2026-09-20-marketplace-settings-key.md`.

Work in `C:\Users\abinash\Desktop\Hatskala` and continue from the current working tree. It contains extensive user-owned changes, so do not reset, discard, or rewrite unrelated files. Do not deploy or enable genuine public orders unless I explicitly authorize that in this chat. Permanent legal and policy documents are still pending.

The seller-dashboard, product-management, commission, feedback/contact, and footer enhancement has been implemented locally. Start by inspecting the current code and `git status`; do not recreate completed work. Key implementation areas are:

- `components/seller/product-submission-form.tsx`
- `app/api/seller/products/route.ts`
- `app/api/seller/products/[id]/route.ts`
- `lib/products/submission.ts`
- `lib/db/repositories/products.ts`
- `app/seller/page.tsx`
- `app/seller/products/page.tsx`
- `app/seller/products/[id]/edit/page.tsx`
- `lib/db/repositories/marketplace-settings.ts`
- `app/admin/commission/page.tsx`
- `app/api/admin/commission/route.ts`
- `lib/db/repositories/orders.ts`
- `app/feedback/page.tsx`
- `app/contact-us/page.tsx`
- `components/layout/site-footer.tsx`
- migrations `drizzle/0041_marketplace_settings.sql` and `drizzle/0042_product_variations.sql`

Implemented behavior includes: a four-image minimum with unlimited additional image slots; image preview/replace/remove; optional video preview/replace/remove; published/rejected/draft editing and resubmission paths; seller product counts, clickable filters, search, statuses, rejection reasons, dates, alerts, and out-of-stock indicators; editable original price, discount percentage, selling price, stock, description, images, video, size, colour, variations, and specifications; a database-backed commission setting defaulting to 9%; checkout snapshots of the applied commission; preserved historical order item prices and commission; dedicated `/feedback` and `/contact-us` pages; and a compact footer without the embedded feedback form.

The last completed verification was:

- `npx tsc --noEmit` — passed
- feature-focused `oxlint` — passed
- `npm test` — 246 tests passed after the final pricing/status polish
- `npm run build` — passed

Your first task is to run the full regression suite again, then perform a careful browser smoke test of the seller and Super Admin experiences using existing local/test accounts. Specifically verify dynamic image addition beyond five images, four-image enforcement after removals, image/video replacement and deletion, published product editing, rejected-product reason and resubmission, dashboard card filters/search, pricing recalculation, the 9% commission setting and seller display, feedback/contact forms, and the footer. Do not submit, publish, reject, delete, archive, place an order, apply production migrations, or deploy during browser QA without my explicit authorization.

If everything passes, report the exact results and the safe deployment sequence. The production sequence must apply migrations 0041 and 0042 before starting code that queries the new columns/table. Preserve all historical `order_items.unit_price_paisa`, `commission_bps`, and `commission_paisa` snapshots; never recalculate old orders after a commission or product-price change.
