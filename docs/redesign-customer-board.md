# Hastabazaar customer experience redesign

Batch 4 starts from the completed Batch 3 report at `c1fe210` on `admin-redesign`. The checked preview is at `http://localhost:3018`.

| Task | Owner | Waits for | Status | Commit | Checks |
| --- | --- | --- | --- | --- | --- |
| C0 · Shared customer pieces | Main agent | Batch 3 | Done | `86aa6c8` | Typecheck, lint, shared status tests, focused regressions and 32 browser measurements passed. |
| C1 · Search and product page | customer_c1 | C0 | Done | `7e9ed12` | Typecheck, lint, 105 focused checks, four-width search and product capture, keyboard navigation, and native add to bag passed. The combined rerun passed 105/105. |
| C2 · Bag, checkout and order placed | customer_c2 | C0 | Done | `efab3ed` | Typecheck and lint, price-change and retry regressions, configured forms, both payment methods, and four-width Buyer and native placed-order checks passed. |
| C3 · Bank transfer page | customer_c3 | C0 | Done | `bdf00ed` | Scoped typecheck/lint and 24 focused tests passed. At 390, 768, 1024 and 1440 px all measured bank controls were 44–50 px with no overflow. Native claim, copy and verified payment passed in a disposable fixture. |
| C4 · My orders and parcel tracking | customer_c4 | C0 | Done | `a588fea` | Typecheck, lint, 24 focused tests and 24 browser views passed. The buyer’s answer, selected-parcel cancellation and private-safe signed-out tracking used native routes. |
| C5 · Help and request status | customer_c5 | C0 | Done | `2db20a5` | Typecheck, lint, focused ownership and refund tests, and 24 browser views passed across four widths. Native return and reply saved, including owner-only original photo download. |
| C6 · Account, settings, reviews and sign-in | customer_c6 | C0 | Done | `8b31013` | Typecheck, lint, 41 focused tests and 60 checked-preview views passed, plus native review/ownership and keyboard checks. |
| C7 · Responsive sweep and tests | customer_c7 | C1–C6 | Done | `a3b4b22`, `c36af8f` | Typecheck, lint, focused integration and legacy tests passed. 100 checks at four widths passed. The open shopping and search menus passed tap size and keyboard checks. |
| FINAL · Whole-project verification | Main agent | C0–C7 | Done | `71ed559` verified | Typecheck, lint, preflight and both browser journeys passed. Full suite ran 5,792 tests. All nine reported failures passed on the corrected tree. |

Customer experience complete — ready for your review

## For the owner

The approved references are in `docs/design-reference/customer/`. The implementation uses existing product photos and saved application values. The homepage shares the customer header and phone tabs. Its page content remains outside this redesign.

The checked local launcher sets `CHECKOUT_CONTACT_POLICY=email_only`. The Buyer fixture's Profile screen confirmed that email is verified before checkout and the mobile number is used for delivery. The local settings were preserved.

On tablets and phones, the account links open from an expandable Account menu. This keeps the desktop groups reachable on narrow screens. The phone tabs measure 64 px in the browser and reserve that much room after the footer. The live bag count, keyboard focus, separate local Buyer and Super Admin sessions, and checkout exclusion passed. The dashboard content in the C0 screenshots is still the original account overview. C6 owns that redesign.

The checked Buyer account had no bank payment link. The populated bank transfer screen and the claim through verified payment were tested in a disposable fixture, including clipboard and keyboard access. The existing optional claim note, PDF attachment and saved-evidence recovery are available alongside the photo option shown in the reference.

Checkout and order tracking share the parcel foundation committed as `0f6bbc4`. Scoped TypeScript and lint passed alongside 22 focused tests. A two-seller COD fixture confirmed that the amounts displayed for the unbooked parcels add up to the exact saved order total.

Search suggestions use the published catalogue and the device’s recent searches. The checked local listing was unavailable to purchase. The add-to-bag check used a published fictional listing with actual options and inventory in an isolated fixture. The current catalogue, photo selection and availability can differ from the design examples.

Get help stays on the existing order URL. Request status uses the existing account shell and names the saved issue where there is no separate title. All eligible native reasons and the damage/fault choice remain available. The approved-refund step collects bank details through the existing private verified-destination form after approval.

The full customer browser story passed with every purchase and account action performed once at 390 px and again at 1440 px, using two disposable fixtures. Each run captured 24 states and made 16 successful customer writes. It followed published search and product selection through price review, two-seller COD, a saved seller-date answer, a missed delivery and retry, a return with a requested photo and a paid refund, bank transfer with verified payment, a single-parcel cancellation with a reconciled balance, review submission, gift card redemption, daily check-in and saving a profile change. No horizontal overflow or browser script errors were reported. Fulfilment, staff decisions and money matching used native application functions in the disposable fixtures.

The standard checkout quote provides a delivery charge for the order. When the courier provides separate seller quotes, checkout shows those charges. Order confirmations use the actual saved seller cash allocation and the delivery window recorded on the order. Some discounts and exact options determine the cash split at placement. The Address step links to the existing support WhatsApp contact.

Order detail uses the recorded parcel status and delivery estimate. The buyer’s answer to the seller’s proposed date uses the existing audit records and keeps dispatch and promised dates under their existing rules. Cancellation retains its required reason, monetary preview and staff review after dispatch. Order documents, saved form answers and help remain available.

The account uses the shop’s existing header, footer and help controls. Private settings tabs and notifications keep their existing URLs and recovery. Account, wallet and help render real empty states when the Buyer has no related records. Reviews save through the existing verified-purchase form for each item. Google and email retain their existing sign-in and verification links.

The product and help pages use the existing versioned marketplace return policy. Checkout stores that policy with each order, and order confirmation and request help read the saved snapshot for that purchase.

### Design comparison

| Reference | Current implementation and differences |
| --- | --- |
| 01 · Journey | The journey is implemented across the existing routes. This board is a design reference and has no matching app page. |
| 02 · Search | Product, category and maker suggestions come from the published catalogue. Results and photos vary with the query. The phone header keeps its menu and search buttons. |
| 03 · Product | The photo gallery stacks above product information on phones. Exact option selection, Buy now, truthful stock and recorded delivery estimates are retained. |
| 04 · Bag | Real seller groups, saved items and confirmed prices replace the example items and amounts. The courier calculates delivery after the customer selects an address. |
| 05 · Sign-in and tracking | The existing sign-in guidance and recovery controls stay visible. The tracking form uses the original signed-out order proof. |
| 06 · Checkout | The address step includes the existing public support link, local address fields and verification recovery. The page describes the contact policy configured for the current environment. |
| 07 · Checkout payment | Each payment option follows the current cart’s capability. The existing terms, disclosure, form and payment-retry controls are retained. |
| 08 · Order placed | The screen uses recorded delivery windows and saved parcel cash. It links to the issued order statement or receipt and shows the phone-confirmation message only for orders held in that workflow. |
| 09 · Order placed by bank transfer | The screen uses the issued bank instructions and deadline, and links to the private bank transfer page. |
| 10 · Bank transfer | The claim retains its optional note, PDF support and evidence/retry controls. The timer uses the saved deadline. |
| 11 · My orders | Action cards and tab counts reflect current Buyer records. Earlier orders that lack complete parcel data retain their order details link. |
| 12 · Order detail | The side column includes existing order documents, payment details and help. The proposed date, courier link and delivery problem depend on recorded facts. |
| 13 · Cancel a parcel | The flow keeps the required reason, saved form guidance, actual remaining cash and the existing staff review for shipped parcels. |
| 14 · Get help | The help steps open within the current order page. A choice is preselected when the customer opens help from one item. |
| 15 · Get help reasons | The reason list includes all existing categories and distinguishes damage from a fault. A customer can add verified bank details after approval. |
| 16 · Request status | Private account navigation remains available. The title uses the recorded reason or complaint subject, and pickup information appears when recorded. |
| 17 · Reply requested | The layout displays the recorded message, reply form and any private evidence. It supports keyboard and phone use. |
| 18 · Help centre | Recent orders come from the current Buyer. Topics, FAQ, support and urgent concerns remain available when there are no recent orders. |
| 19 · Account | The narrow layout can expand the account navigation. The actual account and orders determine action cards, shortcut details and saved items. |
| 20 · Rate items | An eligible delivered order opens its actual review cards. Each item submits separately and retains its moderation and recovery controls. |
| 21 · Wallet | Shopping credit, rewards, referrals and refunds work at their existing URLs. Refunds has a fourth tab, which can wrap on narrow screens. |
| 22 · Settings | Existing profile forms, notifications, sign-in history and privacy actions are available under the selected tab. |
| 23 · Phone | The bottom bar reserves its own space and is hidden in checkout. Product actions sit above it. The site also retains its existing header and help controls. |

The full suite started in the background at 12:52 Nepal time on `c36af8f`. The earlier launch was cancelled when the last mobile menu accessibility adjustment was identified.

On `c36af8f`, the final typecheck and lint passed and the read-only launcher confirmed 107 of 107 forms were ready. The final phone and desktop journey runs again passed all 48 combined browser measurements and all 32 customer writes. The canonical preview also passed the separate 100-check responsive sweep, the two open-menu keyboard checks and the retained Settings bookmarks.

The full run flagged a source-text assertion that rejected a private calculation variable used to build the delivery estimate. Commit `fdd2aef` verifies the rendered Delivery step instead. It checks that the arrival appears and the internal timing and rate calculations stay hidden. All six focused checks, typecheck and lint passed. This commit updates tests only.

The full run also identified seven rendered form sites without form inventory IDs. Commit `6f7ab47` associates the shop forms with the existing catalog filter and identifies the help search, order search, case replies and bank claim as feature-managed controls. The existing routes, permissions, fields and native records handle those actions. No additional form publication is required. All 66 focused checks and typecheck and lint passed. The checked pages, private photo reply and bank claim passed at all four widths.


The image checks exposed 15 thumbnails without an image-fit marker and fixtures still using the previous shop and gallery layouts. Commit `8ba7be7` records the intended fit on those thumbnails and aligns image sizes with the current grids. All 59 focused media tests passed. The affected checked pages passed 32 measurements and the native journey passed another 96 across the four widths.

Commit `13cf7ec` updates the signed-out tracking allowlist test for the five public parcel fields and adapts the written seller guide tests to the help page’s asynchronous render. The 130 return and tracking checks and five seller guide checks passed. The buyer still needs both order number and checkout email, and the public parcel response carries no seller, item, cash or address details.

Commit `71ed559` replaces the old account-menu grid assertion with checks for the current wrapping menu and makes the staff sign-in fixture select the password input separately from Show password. All 14 related tests passed. In the checked preview, the account menu’s visible links wrapped and measured 44 px tall at all four widths.

### Final verification

The full suite finished at 14:29 Nepal time after 97 minutes. It reported 5,792 tests, 5,745 passes, 38 skips, nine failures and zero cancellations. The fixes above were verified in focused groups, and all nine original failures passed together in a final rerun on the corrected tree.

Final typecheck, lint and the canonical launcher preflight passed. The preflight found 107 of 107 forms ready. The checked preview was reused for the public and Buyer checks. The populated workflows ran in isolated fixtures. Batch 4 used the existing schema.

Browser evidence for the two purchase journeys and the 96-state responsive rerun is in `/private/tmp/hastabazaar-batch4-journey`. The full-suite log is `/private/tmp/hastabazaar-batch4-full-tests.log`. The nine-test rerun is `/private/tmp/hastabazaar-b4-all-failures-rerun.log`.

### Files changed (162)

- `app/account/account-overview-data.ts`
- `app/account/addresses/page.tsx`
- `app/account/layout.tsx`
- `app/account/notifications/page.tsx`
- `app/account/order-responses/[id]/keep/route.ts`
- `app/account/order-responses/[id]/page.tsx`
- `app/account/orders/page.tsx`
- `app/account/page.tsx`
- `app/account/payments/[orderId]/page.tsx`
- `app/account/payments/[orderId]/payment-page.css`
- `app/account/privacy/page.tsx`
- `app/account/profile/page.tsx`
- `app/account/referrals/page.tsx`
- `app/account/refunds/page.tsx`
- `app/account/reviews/[orderNumber]/page.tsx`
- `app/account/rewards/page.tsx`
- `app/account/security/page.tsx`
- `app/account/wallet/page.tsx`
- `app/account/wishlist/page.tsx`
- `app/api/account/wishlist/route.ts`
- `app/api/notifications/route.ts`
- `app/api/return-evidence/[id]/route.ts`
- `app/api/search/suggestions/route.ts`
- `app/cart/page.tsx`
- `app/checkout/page.tsx`
- `app/help/page.tsx`
- `app/login/code/page.tsx`
- `app/login/layout.tsx`
- `app/login/page.tsx`
- `app/orders/[orderNumber]/page.tsx`
- `app/orders/[orderNumber]/returns/[id]/reply/route.ts`
- `app/orders/[orderNumber]/returns/route.ts`
- `app/products/[slug]/page.tsx`
- `app/products/[slug]/product-page.module.css`
- `app/register/layout.tsx`
- `app/register/page.tsx`
- `app/shop/page.tsx`
- `app/track/page.tsx`
- `components/account/account-navigation.tsx`
- `components/account/account-sections.tsx`
- `components/account/add-saved-to-bag.tsx`
- `components/account/address-manager.tsx`
- `components/account/customer-auth-frame.tsx`
- `components/account/customer-auth-panels.tsx`
- `components/account/help-question-links.tsx`
- `components/account/notification-list.tsx`
- `components/account/order-list.tsx`
- `components/account/password-visibility.tsx`
- `components/account/review-form.tsx`
- `components/account/rewards-panel.tsx`
- `components/account/saved-product-grid.tsx`
- `components/account/wishlist-button.tsx`
- `components/auth/google-sign-in.tsx`
- `components/catalog/catalog-filters.tsx`
- `components/catalog/mobile-catalog-filters.tsx`
- `components/catalog/product-gallery.tsx`
- `components/catalog/product-offer-selection.tsx`
- `components/catalog/search-suggestion-field.tsx`
- `components/catalog/shop-sort.tsx`
- `components/catalog/storefront-product-detail.tsx`
- `components/commerce/add-to-cart.tsx`
- `components/commerce/aftercare-followup-summary.tsx`
- `components/commerce/cart-view.tsx`
- `components/commerce/checkout-form.tsx`
- `components/commerce/checkout-header.tsx`
- `components/commerce/checkout-steps.tsx`
- `components/commerce/customer-aftercare.tsx`
- `components/commerce/customer-help-flow.tsx`
- `components/commerce/customer-order-cancellation.tsx`
- `components/commerce/customer-order-placed.tsx`
- `components/commerce/customer-order-refresh.tsx`
- `components/commerce/customer-parcel-card.tsx`
- `components/commerce/customer-preparation-question.tsx`
- `components/commerce/customer-request-presentation.ts`
- `components/commerce/customer-request-reply.tsx`
- `components/commerce/customer-request-view.tsx`
- `components/commerce/manual-payment-claim.tsx`
- `components/commerce/offer-add-to-cart.tsx`
- `components/commerce/order-tracker.tsx`
- `components/commerce/product-delivery.tsx`
- `components/commerce/refund-destination-form.tsx`
- `components/commerce/return-physical-summary.tsx`
- `components/layout/mobile-navigation.tsx`
- `components/layout/mobile-product-search.tsx`
- `components/layout/rewards-shortcut.module.css`
- `components/layout/site-header.module.css`
- `components/layout/site-header.tsx`
- `components/storefront/customer-acting-chip.tsx`
- `components/storefront/customer-parcel-cash.tsx`
- `components/storefront/customer-parcel-progress.tsx`
- `components/storefront/customer-phone-tabs.module.css`
- `components/storefront/customer-phone-tabs.tsx`
- `components/storefront/customer-your-turn-card.tsx`
- `components/support/support-assistant.module.css`
- `docs/redesign-customer-board.md`
- `lib/catalog/search-suggestions.ts`
- `lib/checkout/parcel-cash-allocation.ts`
- `lib/checkout/parcel-display.ts`
- `lib/db/repositories/operations.ts`
- `lib/db/repositories/order-tracking.ts`
- `lib/db/repositories/products.ts`
- `lib/db/repositories/returns.ts`
- `lib/forms/customer-experience-contracts.ts`
- `lib/forms/registry.ts`
- `lib/media/responsive-media.ts`
- `lib/operations/notification-client-events.ts`
- `lib/operations/parcels.ts`
- `lib/orders/customer-delay-answer.ts`
- `lib/orders/customer-order-list.ts`
- `lib/orders/customer-parcel-state.ts`
- `lib/orders/customer-parcels.ts`
- `lib/returns/customer-aftercare-context.ts`
- `lib/returns/private-evidence-upload.ts`
- `tests/account-review-browser.test.ts`
- `tests/account-role-navigation.test.ts`
- `tests/cart-view-link-buttons.test.ts`
- `tests/checkout-address-experience.test.ts`
- `tests/checkout-config-recovery.test.ts`
- `tests/checkout-contact-scope-browser.test.ts`
- `tests/checkout-delivery-presentation.test.ts`
- `tests/checkout-form-config-activation.test.ts`
- `tests/checkout-parcel-display.test.ts`
- `tests/claim-release-authority-browser.test.ts`
- `tests/claim-release-recovery-browser.test.ts`
- `tests/customer-aftercare-redesign.test.ts`
- `tests/customer-care-scope-browser.test.ts`
- `tests/customer-order-experience.test.ts`
- `tests/customer-return-current-progress.test.ts`
- `tests/customer-search.test.ts`
- `tests/customer-shared-ui.test.ts`
- `tests/fee-waiver-page.test.ts`
- `tests/finance-lifecycle-quality-browser.test.ts`
- `tests/financial-notification-destinations-render.test.ts`
- `tests/form-catalog-account.test.ts`
- `tests/form-catalog-commerce-success.test.ts`
- `tests/form-catalog-commerce.test.ts`
- `tests/form-catalog-query-presentation.test.ts`
- `tests/form-catalog-query.test.ts`
- `tests/form-catalog-rendered-polish.test.ts`
- `tests/frontend-recovery-controls.test.ts`
- `tests/helpers/checkout-step-navigation.ts`
- `tests/helpers/written-guidance-runtime.ts`
- `tests/incentive-customer-auth.test.ts`
- `tests/loyalty-ui.test.ts`
- `tests/manual-payment-browser.test.ts`
- `tests/notification-actor-intent.test.ts`
- `tests/offer-cart-browser.test.ts`
- `tests/product-date-calendar.test.ts`
- `tests/promo-ui.test.ts`
- `tests/public-checkout-browser.test.ts`
- `tests/receipt-return-bank-satisfaction-browser.test.ts`
- `tests/responsive-media-geometry.test.ts`
- `tests/responsive-media-sizes.test.ts`
- `tests/return-evidence-download.test.ts`
- `tests/returns-complaints.test.ts`
- `tests/seller-guidance-links.test.ts`
- `tests/seller-written-help-browser.test.ts`
- `tests/site-header-auth.test.ts`
- `tests/site-responsive-layout.test.ts`
- `tests/staff-sign-in-expiry.test.ts`
- `tests/tracking-page-preload.test.ts`
- `tests/wishlist-save-for-later.test.ts`

## Batch 4b

| Task | Owner | Waits for | Status | Commit | Checks |
| --- | --- | --- | --- | --- | --- |
| H1 · Restore the storefront header | Main agent | Batch 4 | Done | `28bd9da` | Typecheck, lint, 14 focused tests, 13 viewport checks, mobile menu and tracking paths passed. |
| H2 · Homepage | Homepage helper | H1 | In progress | | |
| H3 · Categories, occasions and makers | Discovery helper | H1 | Done | This task commit | Typecheck, lint, 19 focused checks, 12 checked-preview and 12 populated fixture measurements passed. |
| H4 · Final check | Main agent | H1–H3 | Queued | | |

### For the owner

Batch 4b uses the updated customer references and the storefront header from `c1fe210`.

The checked launcher passed with 107/107 forms. Header checks used the checked preview and separate guest and Buyer contexts. At 390, 768, 1024 and 1440 px the header fit with zero sideways scroll. The desktop menu and the mobile sheet follow the original link order. Desktop Sell with us measures 34 px, and the invitation row and sheet links measure at least 44 px on phones. The search suggestions keep keyboard focus. The original tablet search uses its icon button where the tablet picture shows a text button. Tracking is reachable through You → My orders for buyers, and You → sign-in tracking for guests.

The local launcher uses `CHECKOUT_CONTACT_POLICY=email_only`. Buyer checkout continues to use verified email and accepts a delivery phone number. Local settings were preserved.

#### Owner-applied discovery schema

Migration 0169 adds optional occasion group names, display order and season dates. Before it is applied, the page shows one occasion grid and omits category counts and the seasonal feature. Once it is applied, counts come from published listings. Groups and the in-season feature appear when the corresponding occasion metadata is recorded.

Apply only to an approved copy through the same review process as Batch 3.

- D1 `test -f "$HASTABAZAAR_REVIEW_D1" && sqlite3 -bail "$HASTABAZAAR_REVIEW_D1" < drizzle/0169_occasion_discovery.sql`
- MariaDB `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < deployment/babal/mariadb-occasion-discovery.sql`

An early focused test used the Batch 3 exclusion list and loaded 0169 while initializing its disposable in-memory fixture. Its missing-schema assertion caught the mistake. The corrected fixture excludes 0169 from historical setup and declares the applied shape independently. Both states passed with the corrected guard. The checked preview and retained databases kept their original schema.

The long-running preview returned a worker runner error. The checked launcher restarted using the same local data and passed the 107-form check. Home, local sign-in, Categories and Gifts by occasion then returned HTTP 200.

The checked catalogue contains one active category and occasion, both named Others, and one catalogue-derived budget cap. Its maker profile has no reviewed workshop media. A populated fixture verified published category counts, occasion groups and season windows, approved maker details, photos and captions, catalogue links, a missing maker’s 404, and native inline MP4 playback at 390 and 1440 px. Workshop video starts muted and offers the original file link. The existing profile workflow accepts up to two attachments and has no timed subtitle track.
