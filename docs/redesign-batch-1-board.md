# Hastabazaar redesign batch board

Branch `admin-redesign`. The checked preview is at `http://localhost:3018`. Reference designs are under `docs/design-reference/admin` and `docs/design-reference/seller`.

## Wave 0

| Task | Owner | Status |
| --- | --- | --- |
| 0.1 Local Super Admin sign-in | Main agent | `8615cb6`. Implemented and verified in the checked preview at 390, 768, 1024 and 1440 px. Typecheck, lint and 16 focused checks passed. Full suite running. |
| 0.2 Own delivery off, couriers on | Main agent | `b574059`. Checked the parked settings at 390, 768, 1024 and 1440 px and Today at 390 and 1440 px. Typecheck, lint and 22 focused checks passed, with one fixture-dependent skip. Full suite pending. |
| 0.3 Phone and tablet shells | Main agent | Checked both workspaces at 390, 768, 1024 and 1440 px. Both menus restore focus on Escape. The phone help sheet fits edge to edge. Typecheck, lint and 49 focused checks passed. Full suite pending. |
| 0.4 Shared UI pieces | Main agent | In progress |

### Local preview sign-in

1. Use `http://localhost:3018/local-testing` on the canonical checkout's checked preview.
2. For admin pages, choose **Open Super Admin interface**. Confirm that the URL is `/admin` and the amber local-only 2-step notice is visible. This selects the existing Super Admin fixture. Its presence was checked read-only before signing in.
3. For Seller Studio, return to the fixture selector and choose **Open Seller interface**. Role selection is stored in the browser, so keep admin and seller checks in separate browser contexts when checking both together.
4. The flag is set in git-ignored `.env.development.local`. It is allowed only for the existing Super Admin fixture on loopback in local staging, and only when explicitly set to `1`. Remove that line before any deploy.

## Ownership

The rows below reserve work. Only the assigned helper may edit its active allocation. The main agent edits shared navigation, layouts and coordinated integrations. File overrides below take precedence over broad patterns.

| Task | Helper | Files owned | Status |
| --- | --- | --- | --- |
| A Orders | Unassigned | `app/admin/orders/**`, `app/admin/order-responses/**`, `app/admin/shipping/**`, `app/admin/exceptions/**`; admin `order-fulfillment-actions`, `parcel-controls`, `cod-reconciliation`, `exception-order-section`, `exception-work-form`, `cancellation-review-*`, `first-cod-confirmation`, `paid-order-release`, `order-email-retry` | Queued |
| B Money | Unassigned | `app/admin/{payouts,payments,accounting,financial-notices}/**`; admin `payout-*`, `refund-funding-review`, `customer-refund-reversal-review`, `manual-payment-review`, `accounting-workspace`, `recovery-*`, `seller-recovery-review`, `commercial-recovery` | Queued |
| C Settings | Unassigned | `app/admin/{business-settings,commission,fees,fee-waivers,delivery-rates}/**`; admin `business-settings-manager`, `setting-value-preview`, `commission-settings`, `company-bank-accounts`, `fee-*`, `common-fee-policy`, `delivery-rate-settings` | Queued |
| D Care, Sellers and Catalog | Unassigned | `app/admin/{cases,sellers,seller-*,products,catalog,reviews}/**`; admin `return-*`, `complaint-case-actions`, `supported-case-intake`, `seller-*` except B's `seller-recovery-review`, `document-review-workspace`, `protected-*`, `public-profile-review`, `product-*`, `review-*`, `catalog-manager`, `category-*` | Queued |
| E Seller Today, Orders and Returns | Unassigned | `app/seller/page.tsx`, `app/seller/{orders,order-responses,cases,notifications}/**`; seller `seller-action-overview`, `seller-task-summary`, `workspace-task-list`, `seller-order-list`, `order-fulfillment-actions`, `case-response-form`, `onboarding-checklist`, `readiness-summary`; `components/commerce/order-preparation-workspace.tsx` | Queued |
| F Seller Products and Earnings | Unassigned | `app/seller/{products,finance,analytics}/**`; seller `product-*`, `maker-product-workspace`, `inventory-editor`, `variant-editor`, `price-profit-preview`, `archive-product-button`, `seller-products-description`, `payout-request-form`, `bank-details-form`, `seller-earnings-summary`, `marketplace-fee-breakdown`, `order-marketplace-fees`, `commission-fee-notice`, `recovery-statement` | Queued |
| G Today handoffs | Unassigned | `app/admin/page.tsx`, `components/admin/overview-*.ts(x)` | Queued |
| H Button conventions | Unassigned | Assigned from free page files | Queued |
| I Background loading | Unassigned | `app/{admin,seller}/loading.tsx`, free route-level loading files | Queued |
| J Single Super Admin decisions | Unassigned | `lib/marketplace/{policy,permissions}.ts`, reviewed files under `lib/db/repositories`, task-specific tests and any required unapplied migration | Queued |
| K Responsive sweep | Unassigned | Free pages assigned one at a time and `docs/redesign-batch-1-screens/**` | Queued |
| L Tests and cleanup | Unassigned | `tests/**` after J releases its tests, plus files assigned by the main agent | Queued |
| M Dispatch | Unassigned | `app/admin/orders/dispatch/**`, `components/admin/dispatch-*.tsx` | After A |
| N Courier cash | Unassigned | `app/admin/payments/page.tsx` and the COD components after A and B release them | After A and B |
| O Parcel problems and delays | Unassigned | `app/admin/{shipping,exceptions,order-responses}/**` | After A |
| P Refunds and recoveries | Unassigned | `app/admin/payments/{refunds,recoveries}/**`, admin `refund-*` and `recovery-*` components | After B |
| Q Seller record | Unassigned | `app/admin/sellers/[id]/**` | After D |
| R Customers | Unassigned | `app/admin/customers/**`, `lib/admin/customers*.ts` | Queued |
| S Command search | Unassigned | `components/admin/command-search.tsx`, `app/api/admin/search/**` | After Wave 0 |
| T Payout run | Unassigned | `app/admin/payouts/run/**` | After B and J |
| U Catalog help and publishing | Unassigned | `app/admin/products/{intakes,publications}/**`, admin `product-intake-review.tsx` and `product-publication-review.tsx` | After D |
| V Team and access | Unassigned | `app/admin/{team,governance}/**`, admin `staff-*` and `team-*` components | After J |
| W Business report | Unassigned | `app/admin/analytics/**`, admin `incentive-reports.tsx` and `commission-report.tsx` | Queued |
| X All offers | Unassigned | `app/admin/offers/**`, admin `promo-code-*`, `loyalty-*`, `referral-settings.tsx`; `fee-program-*` only after C releases it | Queued |
| Y System health and backups | Unassigned | `app/admin/system-health/**`, backup-transfer page layout, admin `system-health-workspace.tsx`, `incident-workspace.tsx`, `overview-health*` after G releases it | Queued |

## For the owner

- The previous full suite had two missing historical MariaDB fixtures and one staff-access assertion failure counted with its parent test. This is the baseline for the redesign verification.
- The parked rider links open historical views. The original bookmarked rider operations URL still works. Today reads courier balances from the existing COD reconciliation view.
- The full test runner serializes several shared test-artifact paths. Full runs are coordinated so two suites do not overwrite the same fixtures. The first run spans changes made in Wave 0. The stale privacy wording assertion it surfaced was updated and passed on rerun.
- Database migrations written and awaiting review: none.
