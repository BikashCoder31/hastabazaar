# Hastabazaar redesign batch board

Branch `admin-redesign`. The checked preview is at `http://localhost:3018`. Reference designs are under `docs/design-reference/admin` and `docs/design-reference/seller`.

## Wave 0

| Task | Owner | Status |
| --- | --- | --- |
| 0.1 Local Super Admin sign-in | Main agent | `8615cb6`. Implemented and verified in the checked preview at 390, 768, 1024 and 1440 px. Typecheck, lint and 16 focused checks passed. Full suite running. |
| 0.2 Own delivery off, couriers on | Main agent | `b574059`. Checked the parked settings at 390, 768, 1024 and 1440 px and Today at 390 and 1440 px. Typecheck, lint and 22 focused checks passed, with one fixture-dependent skip. Full suite pending. |
| 0.3 Phone and tablet shells | Main agent | `cf84e71`. Checked both workspaces at 390, 768, 1024 and 1440 px. Both menus restore focus on Escape. The phone help sheet fits edge to edge. Typecheck, lint and 49 focused checks passed. Full suite pending. |
| 0.4 Shared UI pieces | Main agent | `cb22b05`. Typecheck, lint and static component render checks passed. The admin preview fit at all four widths. Full suite pending. |

### Local preview sign-in

1. Use `http://localhost:3018/local-testing` on the canonical checkout's checked preview.
2. For admin pages, choose **Open Super Admin interface**. Confirm that the URL is `/admin` and the amber local-only 2-step notice is visible. This selects the existing Super Admin fixture. Its presence was checked read-only before signing in.
3. For Seller Studio, return to the fixture selector and choose **Open Seller interface**. Role selection is stored in the browser, so keep admin and seller checks in separate browser contexts when checking both together.
4. The flag is set in git-ignored `.env.development.local`. It is allowed only for the existing Super Admin fixture on loopback in local staging, and only when explicitly set to `1`. Remove that line before any deploy.

### Shared UI for task owners

- `WhoseTurn` from `components/ui/whose-turn.tsx` accepts `status` of `your-turn`, `with-hastabazaar`, `late` or `done`. Use the optional `label` for real status details.
- `StepLine` from `components/ui/step-line.tsx` accepts ordered `steps` of `{ id, label, state, detail? }`. State is `complete`, `current` or `upcoming`. It stacks below 768 px.
- `NextStepBox` from `components/ui/next-step-box.tsx` accepts a `title`, the explanation as children and an optional `action`. Each page supplies its actual workflow state and next available action.

## Ownership

The rows below reserve work. Only the assigned helper may edit its active allocation. The main agent edits shared navigation, layouts and coordinated integrations. File overrides below take precedence over broad patterns.

| Task | Helper | Files owned | Status |
| --- | --- | --- | --- |
| A Orders | batch_orders | `app/admin/orders/**`, `app/admin/order-responses/**`, `app/admin/shipping/**`, `app/admin/exceptions/**`; admin `order-fulfillment-actions`, `parcel-controls`, `cod-reconciliation`, `exception-order-section`, `exception-work-form`, `cancellation-review-*`, `first-cod-confirmation`, `paid-order-release`, `order-email-retry` | `3a6a5e6`. Main typecheck and 10 focused checks passed. A lint was clean. Independently checked list and detail at 390 and 1440 px. Full suite pending. |
| B Money | batch_money | `app/admin/{payouts,payments,accounting,financial-notices}/**`; admin `payout-*`, `refund-funding-review`, `customer-refund-reversal-review`, `manual-payment-review`, `accounting-workspace`, `recovery-*`, `seller-recovery-review`, `commercial-recovery` | `2a7a19d`. Typecheck and lint passed. Helper passed 46 focused checks. Main verified the board and mobile filters at 390, 768, 1024 and 1440 px. Full suite pending. |
| C Settings | batch_settings | `app/admin/{business-settings,commission,fees,fee-waivers,delivery-rates}/**`; admin `business-settings-manager`, `setting-value-preview`, `commission-settings`, `company-bank-accounts`, `fee-*`, `common-fee-policy`, `delivery-rate-settings` | `5407772`. Main typecheck and 18 focused checks passed. C lint was clean and the in-progress B files still had two lint diagnostics. Checked Settings at 390 and 1440 px independently. Full suite pending. |
| D Care, Sellers and Catalog | batch_care_catalog | `app/admin/{cases,sellers,seller-*,products,catalog,reviews}/**`; admin `return-*`, `complaint-case-actions`, `supported-case-intake`, `seller-*` except B's `seller-recovery-review`, `document-review-workspace`, `protected-*`, `public-profile-review`, `product-*`, `review-*`, `catalog-manager`, `category-*`; `tests/product-publication-browser.test.ts`, `tests/product-source-scope-browser.test.ts` | `d9e9450`. Typecheck and scoped lint passed. Main browser verified the three workspaces at 390 and 1440 px. Focused native and browser checks passed, with one timing-sensitive source-scope case passing on rerun. Full suite pending. |
| E Seller Today, Orders and Returns | batch_seller_orders | `app/seller/page.tsx`, `app/seller/{orders,order-responses,cases,notifications}/**`; seller `seller-action-overview`, `seller-task-summary`, `workspace-task-list`, `seller-order-list`, `order-fulfillment-actions`, `case-response-form`, `onboarding-checklist`, `readiness-summary`; `components/commerce/order-preparation-workspace.tsx`; `tests/seller-workspace-pages.test.ts`, `tests/checkout-delivery-presentation.test.ts`, `tests/cancellation-fulfillment-browser.test.ts`, `tests/form-catalog-commerce.test.ts`, `tests/form-catalog-commerce-success.test.ts`, `tests/seller-dashboard-experience.test.ts`, `tests/form-catalog-seller-case-history.test.ts` | `b16f1b4`. Main scoped checks and 19 focused rerun checks passed. Independently checked Today, Orders and Returns at 390 and 1440 px. All four widths passed in the helper check. Full suite pending. |
| F Seller Products and Earnings | batch_seller_products | `app/seller/{products,finance,analytics}/**`; seller `product-*`, `maker-product-workspace`, `inventory-editor`, `variant-editor`, `price-profit-preview`, `archive-product-button`, `seller-products-description`, `payout-request-form`, `bank-details-form`, `seller-earnings-summary`, `marketplace-fee-breakdown`, `order-marketplace-fees`, `commission-fee-notice`, `recovery-statement` | `14e056b`. Typecheck and lint passed. Main passed 14 product/workspace and 9 payout authority checks. Independently checked Products, New product and Earnings at 390 and 1440 px. Full suite pending. |
| G Today handoffs | batch_today | `app/admin/page.tsx`, `components/admin/overview-*.ts(x)` | `722ae13`. Typecheck, lint, six focused checks and helper browser checks passed. Main confirmed zero overflow and 44 px actions at 390 and 1440 px. Full suite pending. |
| H Button conventions | batch_buttons | Admin activity, business emails, feedback, form submissions, forms, gift cards, homepage, legal policies, loyalty, notifications, operational notices, order emails, privacy, progress, promo codes, referrals and staff form history TSX pages and related components listed below. Seller profile, registration, requests, reviews, shipping, form history and reminders TSX pages and related components. Loading files excluded. | `a1088ab`. Typecheck, lint and 17 isolated browser tests passed. Helper live-checked 27 views at four widths. Main checked ten representative routes at 390 and 1440 px. Full suite pending. |
| I Background loading | batch_loading | `app/admin/loading.tsx`, `app/seller/loading.tsx`, `app/admin/referrals/loading.tsx`. `components/ui/workspace-refresh.tsx`, `components/admin/admin-workspace-ready.tsx`, an approved admin hydration fallback usage. Orders was completed by A. | `30cfe2f`. 21 focused checks passed. The helper verified retained content, filters and exact actor retirement at all four widths. Main checked Admin refresh at 390 and 1440 px. Full suite pending. |
| J Single Super Admin decisions | batch_approval | `lib/marketplace/{policy,permissions}.ts`, relevant repositories, `lib/managed-commerce/{fixed-supply,activation,registered-transition}.ts`, `components/seller/registered-transition-form.tsx`, `lib/forms/access.ts`, relevant unowned tests, and any necessary unapplied migration. | `2567417`. Typecheck, lint and 76 helper focused checks passed. Main passed 14 payout-domain checks and verified protected history at 390 and 1440 px. No migration needed. Full suite pending. |
| K Responsive sweep | batch_responsive | `docs/redesign-batch-1-screens/**`; `app/admin/analytics/page.tsx` and `app/admin/activity/page.tsx` released. Business and Order Emails released. Now `app/admin/orders/page.tsx`, `app/admin/cases/intake/page.tsx`, one intake read scope in `lib/catalog/shop-query.ts`; main breadcrumb in `components/admin/admin-task-context.tsx`. | Helper ready, main review pending |
| L Tests and cleanup | batch_tests | Historical MariaDB fixture tests, staff-access fixture, new UI state tests, parked wording in `components/admin/business-settings-manager.tsx`, `lib/staff/access.ts`, `lib/forms/plain-language.ts`, `app/admin/page.tsx`, `app/admin/staff-form-history/page.tsx`, and the park link in `app/admin/not-in-use/page.tsx`. | Completed in the Tests and parked delivery cleanup commit. Helper passed 37 checks and main passed 17 focused checks. Archive and Staff review history fit at 390, 768, 1024 and 1440 px. Full suite pending. |
| M Dispatch | batch_dispatch | `app/admin/orders/dispatch/**`, `components/admin/dispatch-*.tsx`, seller order detail display only in `app/seller/orders/order-detail.tsx`, and optional slot metadata in `lib/operations/parcels.ts`. Main adds the tab. | In progress after A |
| N Courier cash | batch_courier_cash | `app/admin/payments/page.tsx`, `components/admin/cod-reconciliation.tsx`, new COD-only components, read-only projection in `lib/payments/manual-payment-workspace.ts` and legacy redirect in `app/admin/payments/exceptions/[id]/page.tsx` | In progress after A and B |
| O Parcel problems and delays | batch_parcel_problems | `app/admin/{shipping,exceptions,order-responses}/**`, opt-in form presentation in `components/commerce/order-preparation-workspace.tsx` | In progress after A |
| P Refunds and recoveries | batch_refunds | `app/admin/payments/{refunds,recoveries}/**`, admin `refund-*` and `recovery-*` components. Main adds tab. | In progress after B |
| Q Seller record | Unassigned | `app/admin/sellers/[id]/**` | After D |
| R Customers | Unassigned | `app/admin/customers/**`, `lib/admin/customers*.ts` | Queued |
| S Command search | Unassigned | `components/admin/command-search.tsx`, `app/api/admin/search/**` | After Wave 0 |
| T Payout run | Unassigned | `app/admin/payouts/run/**` | After B and J |
| U Catalog help and publishing | Unassigned | `app/admin/products/{intakes,publications}/**`, admin `product-intake-review.tsx` and `product-publication-review.tsx` | After D |
| V Team and access | Unassigned | `app/admin/{team,governance}/**`, admin `staff-*` and `team-*` components | After J |
| W Business report | Unassigned | `app/admin/analytics/**`, admin `incentive-reports.tsx` and `commission-report.tsx` | Queued |
| X All offers | Unassigned | `app/admin/offers/**`, admin `promo-code-*`, `loyalty-*`, `referral-settings.tsx`; `fee-program-*` only after C releases it | Queued |
| Y System health and backups | Unassigned | `app/admin/system-health/**`, backup-transfer page layout, admin `system-health-workspace.tsx`, `incident-workspace.tsx`, `overview-health*` after G releases it | Queued |

### Task H component ownership

- Admin `business-email-processor.tsx`, `email-delivery-health.tsx`, `homepage-hero-manager.tsx`, `homepage-occasion-manager.tsx`, `homepage-visibility-control.tsx`, `loyalty-manager.tsx`, `loyalty-terms-editor.tsx`, `privacy-actions.tsx`, `promo-code-manager.tsx`, `referral-settings.tsx`, `order-email-retry.tsx`.
- Seller `public-profile-editor.tsx`, `protected-change-request-form.tsx`, `seller-profile-form.tsx`, `shipping-workspace.tsx`.
- Additional admin files: `recorded-progress.tsx`, `form-catalog-list.tsx`, `form-catalog-editor.tsx`, `legal-procedure-workspace.tsx`, `legal-procedure-controls.tsx`, `homepage-visibility-recovery.tsx`, `confirm-operation.tsx`. Additional seller files: `review-reply-form.tsx`, `seller-registration-intake-form.tsx`, `protected-change-withdrawal.tsx`, `protected-identity-form.tsx`. Shared opt-in workspace variants: `components/ui/button.tsx`.
- X waits for H to release the offer components in this list. Any additional shared or page-level styles go through the main agent.

### Integrations reserved to the main agent

- A supplies its order-detail breadcrumb without repeating the shared breadcrumb.
- B uses the existing eligibility predicate through a narrow export in `lib/db/repositories/payouts.ts`.
- C includes approved Settings tab labels in `components/admin/admin-sections.ts`.
- D includes the matching workflow help in `components/admin/page-help-copy.ts`.
- E includes the shell update to reuse the existing first-COD-aware Orders count in `app/seller/layout.tsx`.

## For the owner

- The previous full suite had two failures from missing historical MariaDB test fixtures and a staff-access assertion failure counted with its parent test. The three missing SQL files were generated from checked-in source and matched the exact V8, 156 and reset SHA256 hashes in the historical release evidence. The two affected test files now pass all four checks. This generated test input was never executed as SQL or staged.
- The parked rider links open historical views. The original bookmarked rider operations URL still works. Today reads courier balances from the existing COD reconciliation view.
- The full test runner serializes several shared test-artifact paths. Full runs are coordinated so two suites do not overwrite the same fixtures. The first run spans changes made in Wave 0. The stale privacy wording assertion it surfaced was updated and passed on rerun.
- L now builds the historical test SQL in temporary directories and compares all three checksums to the original release evidence. The staff-access fixture flushes new props before asserting disabled state, and the product scope test waits for its fixture to mount. Four new UI scenarios cover ownership, product readiness, an open payout and return reply validation.
- A keeps saved activity and order payment records. The app has no general order-note or standalone statement write/export. The local order fixture covered the delivered stage.
- C preserves the existing paired commission schedule confirmation and keeps inactive open-box districts read-only. The checked local database showed the customer marketplace fee **On · NPR 10 per order**, which differs from the brief’s Off state. The UI reflects the saved setting. No fee change was submitted.
- D can approve and publish a frozen candidate atomically for Super Admin. Legacy approval and publication remain separate because the older actions do not share one revision guard. The local fixture had no saved return, so the handmade review was exercised in a disposable browser fixture.
- E keeps unaccepted selling terms at the top and puts accepted terms in a disclosure below the workspace. The live Seller fixture had no active orders or returns. Populated scenarios ran in disposable tests. The shared Seller toolbar now mounts one notification bell.
- B checked populated payout stages in a disposable fixture because the live preview has no payout records. Hold leaves the original request pending. Submitted requests approve the available balance checked by the server. Saved payouts show their fixed approval amount.
- F grouped eight real product checks. The live fixture has no listings or open payout. A read-only projection fixed the existing D1 expression-depth failure on Earnings and preserved the same beneficiary, identity, hold and recovery checks. The payout submission guard is retained.
- G uses saved order and seller references. Packing follow-up uses the recorded response clock. There is no stored pack-ready deadline to report hours late. A submitted payout request has no payout number until a payout is created. The live fixture had no active seller pickup handoff.
- H verified the existing legal routes in an isolated step-up fixture. The existing local role selector cannot enter those protected legal routes. Shared account notifications and the storefront gift card form retain their current controls.
- I keeps the private hydration gate and uses a data-free skeleton on the first load. Refresh uses the current route and actor scope. An intermittent empty-style hydration warning was seen on pre-existing Seller search controls.
- J found the live D1 and checked MariaDB definitions already support single-Super-Admin staff decisions. Remaining legacy inequalities protect actual seller or beneficiary conflicts. The exact audited payout decision is now readable by the current Super Admin when they prepared it earlier. No migrations were written or run.
- Database migrations written and awaiting review: none.
