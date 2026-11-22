# Review fixes · 21 November 2026

Owner review started from `64f2158` on `admin-redesign`, with the checked preview at `http://localhost:3018`.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| V1 · Legal & procedures access | V1 helper | Done | `d684a2c` | Typecheck and lint passed. 11 focused tests passed. Checked Super Admin at 390/768/1024/1440 and restricted staff at 390/1440. |
| V2 · Taxonomy names and occasion images | V2 helper | Done | `01c823c` | Typecheck and lint passed. 26 focused checks passed, including a loopback decoder rerun. Four-width Chrome checks and both schema states in a disposable fixture. |
| V3 · Today on phones | V3 helper | Done | `b8b4468` | Typecheck and lint passed. 8 focused tests passed. Chrome at 390/768/1024/1440. |
| V4 · Phone tap targets | V4 helper | Done | `da96ae1` | Typecheck and lint passed. 64 focused tests passed. 81 phone route states and four-width checks on changed pages. |
| V5 · Seller payout day | V5 helper | Done | `3767223` | Typecheck and lint passed. 10 focused tests passed. Earnings and Payout run at 390/768/1024/1440. |
| V6 · Seller support entry point | V6 helper | Done | `4b46e4d` | Typecheck and lint passed. 44 focused tests passed. Chrome at 390/768/1024/1440 and disposable submissions at 390/1440. |
| V7 · Final check | Main agent | Done | This task commit | Typecheck, lint and browser walkthroughs passed. Full run recorded 5,768 passes, 38 skips and 5 initial failures. All five passed on rerun. |

## For the owner

The checked preview is the canonical project on `admin-redesign`. Browser tests that write data use disposable fixtures. Migration 0170 is owner-applied.

The read-only preflight confirmed the checked database has all 107 published forms and the required sign-in schema. The checked preview was already running on port 3018.

The checked local catalogue contains no category or occasion rows whose trimmed Nepali name equals the English name. This count came from a read-only query of the existing names.

Both legal pages opened directly from the checked Super Admin session. The production-mode disposable fixture used real authenticator verification. First-factor staff went to Security with the original return address. Restricted verified staff reached Staff access denied in one redirect at 390 and 1440 px.

Today at 390×844 places the first task title above 715 px and its Unassigned pill above 779 px. The bottom bar starts at 784 px. Every row displayed its owner pill. The keyboard filter and an existing task link worked. The fixture verified assignment writes and the You pill.

Seller Earnings and the admin Payout run both showed the same next run date, Wednesday 25 November, from the checked settings. The fixture also verified a different saved weekday and the cutoff boundary.

The 390 px Ask a question action was 351×44 px. The top and empty-state actions select Seller support in the existing form. A fictional seller question submitted at each of 390 and 1440 px reached Admin › Contact & feedback. The ordinary contact and feedback topics keep their usual initial selection.

The 390 px tap-target sweep covered 81 route states. The resized controls measured 44–48 px. The changed pages fit at 390, 768, 1024 and 1440 px.

- Seller Studio. Agreement acceptance, product options help, craft experience and shop contact and address controls.
- Admin operations. Company accounts, business settings, delivery rate overrides, commission explanation, seller review ownership, account recovery, seller public profile review and staff access checks for bank payments.
- Admin configuration. Program finance, marketplace rules, product classification, form guides, form preview and compatibility, and Team & roles actions across all five tabs.

The Catalog Add buttons and editor controls are covered by V2. Informational disclosures outside the primary flows retain compact styling, including recorded case history and published form question previews. Parked Rider settings were outside the active workspace sweep.

The Catalog editor and the public homepage, Categories and Gifts by occasion fit at all four widths. At 390 and 1440 px, adding and editing both kinds saved separate English and Nepali names. The storefront displayed the saved translation and hid it after it was cleared. With the optional tables present in the disposable fixture, occasion image upload, private preview, publication, replacement and removal passed. Retired image URLs returned 404. Without the tables, Catalog displayed one database-update note and saved names normally.

### Migration 0170 · Occasion images

Run these from the project root against an approved copy only. Set the existing review database variables to that copy. The MariaDB release manifest records the companion under owner-applied migrations.

- D1 `test -f "$HASTABAZAAR_REVIEW_D1" && sqlite3 -bail "$HASTABAZAAR_REVIEW_D1" < drizzle/0170_occasion_images.sql`
- MariaDB `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < deployment/babal/mariadb-occasion-images.sql`

### Final verification

The first final preflight flagged 0170 as required in the launcher's schema inventory. The launcher now accepts a database without the optional feature and checks the complete table and index definitions if present. A regression test covers absent, partial and complete storage in memory. The unmodified local database passed preflight again with 107 of 107 forms and the required sign-in schema. No migration was applied.

The full suite started at 21:53 Nepal time on 21 November. Generic fixture setup excludes owner-applied SQL 0164–0170. The relevant fixtures declare their optional schema independently.

The combined final Chrome pass reopened both legal pages, Today, Seller Earnings and Requests & help at 390, 768, 1024 and 1440 px. There was no horizontal overflow or browser exception. It confirmed the first task and its owner above the 390 px navigation and the Seller support selection after clicking Ask a question. The separate disposable walks confirmed restricted staff denial, actual taxonomy saves, occasion image publication and support receipt in Admin.

Two older Chrome tests searched for the retired Display name field. After updating them to use English name and checking the independent Nepali payload, both browser suites passed together in the 38-test rerun. Retry confirmation, configured answers and other staff form assertions kept their coverage. Fresh typecheck and lint also passed. The running full-suite log includes the original selector failures.

The homepage occasion source check also expected the old direct field read. It now checks that the homepage uses the shared Nepali label helper and only renders a label when one is present. All 13 homepage occasion and content checks passed on rerun.

One incident-recovery browser test inspected session storage as soon as the browser received the error response. It now waits for the response handler to clear the attempt, then checks the same recovery conditions. All 13 incident-recovery browser cases passed with that adjustment.

The responsive media check found a missing frame marker on the occasion photo card. The card now uses the same marker as category cards. All seven responsive media checks passed after the fix. The checked preview and the populated occasion image fixture passed again at 390, 768, 1024 and 1440 px. Typecheck and lint passed after the correction.

The full run finished at 23:33 Nepal time after 100 minutes. It covered 5,811 tests, with 5,768 passes, 38 skips and 5 initial failures. The combined rerun covered all five flagged checks and passed 62 of 62 tests. The final incident check also passed 13 of 13 after its timing adjustment. Typecheck and lint passed again. Generated test evidence was archived outside the checkout.

### Files changed

<details>
<summary>Review batch files</summary>

- `app/admin/commission/page.tsx`
- `app/admin/payouts/run/run-data.ts`
- `app/admin/workspace.css`
- `app/api/admin/catalog/category-media/[id]/route.ts`
- `app/api/admin/catalog/category-media/route.ts`
- `app/api/admin/catalog/occasion-media/[id]/route.ts`
- `app/api/admin/catalog/occasion-media/route.ts`
- `app/api/admin/catalog/route.ts`
- `app/api/categories/image/[id]/route.ts`
- `app/api/occasions/image/[id]/route.ts`
- `app/auth.ts`
- `app/contact-us/page.tsx`
- `app/page.tsx`
- `app/seller/finance/overview-data.ts`
- `app/seller/finance/payout-overview.tsx`
- `app/seller/requests/page.tsx`
- `components/admin/account-recovery-assistance.tsx`
- `components/admin/business-settings-manager.tsx`
- `components/admin/catalog-manager.tsx`
- `components/admin/category-image-editor.tsx`
- `components/admin/company-bank-accounts.tsx`
- `components/admin/delivery-rate-settings.tsx`
- `components/admin/form-catalog-editor.tsx`
- `components/admin/form-compatibility-controls.tsx`
- `components/admin/governance-console.tsx`
- `components/admin/live-managed-finance-controls.tsx`
- `components/admin/managed-settlement-controls.tsx`
- `components/admin/manual-payment-review.tsx`
- `components/admin/overview-today.tsx`
- `components/admin/overview-work-summaries.tsx`
- `components/admin/product-classification-form.tsx`
- `components/admin/public-profile-review.tsx`
- `components/admin/shared-review-queue.tsx`
- `components/admin/team-workspace.tsx`
- `components/catalog/taxonomy-directory.tsx`
- `components/forms/form-guide.tsx`
- `components/layout/customer-contact-form.tsx`
- `components/seller/profile-contact-locations.tsx`
- `components/seller/public-profile-fields.tsx`
- `components/seller/seller-agreement-acceptance.tsx`
- `components/seller/variant-editor.tsx`
- `components/seller/workspace-task-list.tsx`
- `deployment/babal/mariadb-occasion-images.sql`
- `deployment/babal/release-manifest.json`
- `docs/review-fixes-board.md`
- `drizzle/0170_occasion_images.sql`
- `lib/auth/staff.ts`
- `lib/catalog/category-media.ts`
- `lib/catalog/taxonomy-discovery.ts`
- `lib/catalog/taxonomy-image-routes.ts`
- `lib/catalog/taxonomy-image-storage.ts`
- `lib/catalog/taxonomy-names.ts`
- `lib/db/repositories/catalog-admin.ts`
- `lib/db/repositories/products.ts`
- `lib/legal-procedures/access.ts`
- `lib/operations/runtime-schema-readiness.mjs`
- `app/admin/payouts/run/run-calendar.ts` → `lib/payments/payout-run-calendar.ts`
- `scripts/generate-release-manifest.mjs`
- `tests/admin-overview-browser.test.ts`
- `tests/category-media-routes.test.ts`
- `tests/form-catalog-staff-context-retry.test.ts`
- `tests/form-catalog-staff-operations.test.ts`
- `tests/helpers/category-media-db.ts`
- `tests/homepage-occasion-carousel.test.ts`
- `tests/incident-recovery-browser.test.ts`
- `tests/legal-procedure-page-access.test.ts`
- `tests/occasion-discovery-images.test.ts`
- `tests/release-manifest-completeness.test.ts`
- `tests/runtime-schema-optional-batch.test.ts`
- `tests/seller-workspace-pages.test.ts`
- `tests/seller-written-help-browser.test.ts`

</details>

Review fixes complete — ready for your review

## Account polish

The refreshed 22 November account references were present. Work started from `a9080ec` on `admin-redesign`.

| Task | Status | Commit | Checks |
| --- | --- | --- | --- |
| A1 · Clear account sections | Done | `7d2aa29` | Typecheck and lint passed. 23 focused tests passed. Chrome checked 12 routes at 390, 768, 1024 and 1440 px. |
| A2 · Account switching | Done | `524244c` | Typecheck and lint passed. 17 focused tests passed. Buyer, Seller and Super Admin role checks passed at all four widths. |
| A3 · Final check | Done | This task commit | Typecheck, lint and all 48 affected tests passed. Final Chrome walkthroughs and visual comparisons completed. |

The account layout supplies the white panel and card styles. Chrome verified the warm border, soft shadow, filled active menu item, and absence of sideways scroll in 48 route and viewport checks. The Buyer account displayed the caught-up strip and empty parcel card. The phone account menu opened with Enter and reached Privacy. The phone footer cleared the tab bar.

The Seller testing account showed the trading name from its approved profile. The switch appeared inside the desktop panel and above the greeting on phones and tablets. The Seller Studio header or phone menu showed the same name next to the link back to the customer account. The Buyer had a Customer account label and no role switch. Back to Super Admin opened the admin workspace with the authorized account.

### Final checks and remaining differences

- Chrome walked the Buyer, Seller and Super Admin paths at 390, 768, 1024 and 1440 px. All 12 account sections fit across those widths. The mobile footer cleared the tab bar on every section, and the measured primary controls and role switches met the 44 px minimum.
- The populated disposable fixture verified the actual current parcel, seller question, My orders and bank payment surfaces at all four widths. The real Buyer verified the caught-up copy, empty parcel card and Browse the shop destination. Wallet's gift-card form loaded at both 390 and 1440 px.
- Phones and tablets keep a compact Customer account disclosure for the account links and sign out. The existing storefront header and footer appear in the checked preview.
- Names, order details, counts, saved products, balances and verification labels reflect the active test accounts. The reference includes sample sidebar badges, membership details, products and a filled order history. My orders shows positive counts when available and omits zero badges. Existing Wallet and Settings forms include their help, verification and recovery controls.

### Files changed in Account polish

- `app/account/layout.tsx`
- `app/account/orders/page.tsx`
- `app/account/page.tsx`
- `app/account/payments/[orderId]/page.tsx`
- `app/account/referrals/page.tsx`
- `app/globals.css`
- `app/seller/layout.tsx`
- `components/account/account-navigation.tsx`
- `components/account/account-sections.tsx`
- `components/account/order-list.tsx`
- `components/account/saved-product-grid.tsx`
- `components/commerce/customer-request-presentation.ts`
- `components/commerce/manual-payment-claim.tsx`
- `components/seller/seller-navigation.tsx`
- `components/storefront/customer-your-turn-card.tsx`
- `docs/review-fixes-board.md`
- `tests/account-role-navigation.test.ts`

Account polish complete — ready for your review

## Seller frame

The refreshed 22 November references were present. Work started from `8736c1d` on `admin-redesign`.

| Task | Status | Commit | Checks |
| --- | --- | --- | --- |
| S1 · The Seller Studio frame | Done | This task commit | Typecheck and lint passed. Focused tests passed. Chrome checked 17 route states at 390, 768, 1024 and 1440 px. |
| S2 · Getting started | Pending | | |
| S3 · Approve now, fix before the first payout | Pending | | |
| S4 · Final check | Pending | | |

S1 moved navigation into the full-height sidebar and compact toolbar. Existing sidebar destinations are accessible from the new menu, the notification bell, or links on the relevant page. Both account menus switched to Customer account and back in Chrome. At 390 px the phone menu controls measured at least 44 px, and content cleared the bottom tabs.

### For the owner

- The toolbar shows the existing refresh control. Seller Studio has no search field, so the area to the left of the desktop actions is empty.
