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
| K Responsive sweep | batch_responsive | `docs/redesign-batch-1-screens/**`; `app/admin/analytics/page.tsx` and `app/admin/activity/page.tsx` released. Business and Order Emails released. Now `app/admin/orders/page.tsx`, `app/admin/cases/intake/page.tsx`, one intake read scope in `lib/catalog/shop-query.ts`; main breadcrumb in `components/admin/admin-task-context.tsx`. | `3c2784f`. Helper checked 78 route variants at all four widths, saved 164 screenshots, and passed 42 focused checks. Main independently rechecked Activity, Orders and Case intake at 390 and 1440 px. Missing fixtures and four follow-up layouts are in the screenshot index. |
| L Tests and cleanup | batch_tests | Historical MariaDB fixture tests, staff-access fixture, new UI state tests, parked wording in `components/admin/business-settings-manager.tsx`, `lib/staff/access.ts`, `lib/forms/plain-language.ts`, `app/admin/page.tsx`, `app/admin/staff-form-history/page.tsx`, and the park link in `app/admin/not-in-use/page.tsx`. | `58abf73`. Helper passed 37 checks and main passed 17 focused checks. Archive and Staff review history fit at 390, 768, 1024 and 1440 px. Full suite pending. |
| M Dispatch | batch_dispatch | `app/admin/orders/dispatch/**`, `components/admin/dispatch-*.tsx`, seller order detail display only in `app/seller/orders/order-detail.tsx`, and optional slot metadata in `lib/operations/parcels.ts`. Main adds the tab. | `4fdd03b`. Full typecheck and lint passed, with 16 helper and 15 main focused checks. Checked Dispatch navigation and zero overflow at 390 and 1440 px, and helper verified all four widths with populated fixtures. |
| N Courier cash | batch_courier_cash | `app/admin/payments/page.tsx`, `components/admin/cod-reconciliation.tsx`, new COD-only components, read-only projection in `lib/payments/manual-payment-workspace.ts` and legacy redirect in `app/admin/payments/exceptions/[id]/page.tsx` | `75d7019`. Typecheck and lint passed after the other in-progress changes resolved. Native COD and exact parcel handoff checks pass. The helper checked all four widths and standalone short/excess fixture flows. Main verified selection and recorded cash at 390 and 1440 px. |
| O Parcel problems and delays | batch_parcel_problems | `app/admin/{shipping,exceptions,order-responses}/**`, opt-in form presentation in `components/commerce/order-preparation-workspace.tsx`; main kept the exact order Back link and added matching test coverage. | `017b103`. Full typecheck and lint passed. Main passed seven navigation and authority checks and verified both widths. Helper confirmed all four widths with each problem category and unchanged retry request data. |
| P Refunds and recoveries | batch_refunds | `app/admin/payments/{refunds,recoveries}/**`, admin `refund-*` and `recovery-*` components. Main adds tab. | `6c972dc`. Typecheck, lint, six helper and eight main focused checks passed. Both queues and exact tabs fit at 390 and 1440 px. Populated four-step fixture checks passed at all widths. |
| Q Seller record | batch_seller_record | `app/admin/sellers/[id]/**` | `603f89a`. Global typecheck and lint passed. Helper passed 122 scoped checks and all four widths. Main passed six native and three navigation checks and confirmed the active All sellers tab at 390 and 1440 px. |
| R Customers | batch_customers | `app/admin/customers/**`, `lib/admin/customers*.ts` | `4791619` read-only directory. Helper passed five focused checks and all four widths. Main passed two page help checks and independently verified the active tab and overflow at 390 and 1440 px. COD confirmation awaits migration approval. |
| S Command search | batch_command_search | `components/admin/command-search.tsx`, `app/api/admin/search/**`; main mounts in both toolbar sizes | `d876ff4`. Full typecheck, scoped lint, six helper and seven main checks passed. Main independently checked keyboard selection and the dialog at 390 and 1440 px. Helper covered all four widths and actor access. |
| T Payout run | batch_payout_run | `app/admin/payouts/run/**`; main adds Money tab | `8841538`. Checked active tab and loaded empty state at 390 and 1440 px. All four widths and preselected/blocked rows passed in isolated cases. Native eligibility, replay and audit checks passed. |
| U Catalog help and publishing | batch_catalog_help | `app/admin/products/{intakes,publications}/**`, admin `product-intake-review.tsx` and `product-publication-review.tsx` | `bf31a06`. Helper passed 16 scoped tests and all four browser widths. Main passed ten HTTP checks and five exact navigation guards and independently verified both active tabs at 390 and 1440 px. |
| V Team and access | batch_team_access | `app/admin/{team,governance}/**`, admin `staff-*` and `team-*` components | `5c7452a`. Helper passed 24 checks and all four widths. Main passed 18 scoped checks and verified Team and the retained Governance bookmark at 390 and 1440 px. |
| W Business report | batch_business_report | `app/admin/analytics/**`, admin `commission-report.tsx`, optional date-range projection in `lib/db/repositories/analytics.ts` and `tests/first-party-analytics.test.ts` | `db47b8f`. Helper passed 32 focused checks and all four widths, plus 90-day chart and CSV. Main passed 12 focused checks and verified the active tab and Export at 390 and 1440 px. |
| X All offers | batch_all_offers | `app/admin/offers/**`, admin `promo-code-*`, `loyalty-*`, `referral-settings.tsx`, `incentive-reports.tsx` released by W; `fee-program-*` after C; `tests/admin-offers-overview.test.ts` | `933ffa6`. Global typecheck and lint passed. Helper passed 76 scoped checks and verified All offers and both older activity views at all four widths. Main passed 14 scoped checks and verified the workspace at 390 and 1440 px. |
| Y System health and backups | batch_system_health | `app/admin/system-health/**`, backup-transfer page layout, admin `system-health-workspace.tsx`, `incident-workspace.tsx`, `overview-health*` after G, `tests/system-health-workspace-render.test.ts` and `tests/incident-recovery-browser.test.ts` | `4fc14d6`. Typecheck and lint passed. Helper passed 51 focused and 14 browser tests. Main passed 15 checks, verified four widths and ran the read-only probes on the checked preview. |

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
- The first serial suite ran during implementation and ended with 5,663 passed, 15 failed and 38 skipped. Its failures were reproduced or traced and checked against the updated tree. The final responsive and fixture cleanup fixes the remaining media contracts, retained permission acknowledgment, homepage wrapping and navigation expectations. A fresh serial run exposed two more presentation fixture mismatches with the new command search and common-fee links. The real shell hydration scenarios and four fee scenarios all pass after repairing those fixtures. The restarted suite caught four rendered form-inventory gaps. The customer directory now declares its read-only query, the promo preview is identified as part of the existing draft workflow, and search and publishing use their existing keyboard or button actions. All 25 focused inventory checks passed.
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
- K restores the read-only order lookup on Case intake when its presentation is unpublished. A live order lookup worked. Configuration failures keep protected complaint and return forms disabled.
- M records pickup windows on existing shipment jobs. Its checked local queue was empty. Populated admin and seller views passed in isolated fixtures. Older orders show COD once their saved parcel allocations are prepared. Parcel weight has no recorded source.
- N uses independently verified credits, saved courier costs and one existing match operation per parcel. Short matches open a native review case and excess remains on its original receipt. Existing Incoming payments views remain available via their links and bookmarks.
- O unifies the five recorded problem kinds and keeps the original coordination, exceptions, preparation and private historical evidence URLs. Decisions use only transitions available on the existing records. The prepared-parcel money handoff returns to the exact parcel tab and original filtered work view.
- P retains the existing verified cash and original wallet refund paths. The current staff refund API has no Fonepay refund action outside simulated service. Recovery detail links to recorded courier and seller follow-ups using their original permissions. Populated checks used a disposable fixture.
- Q uses recorded preparedness promises with ready timestamps, published ratings and exact seller return replies. Saved staff restriction notes are shown in read-only history. There is no general seller-note write or exact cancellation attribution, and recovery links to its authoritative workspace.
- S uses saved order and payout references. Some screens use HK and HKP references from this checkout, and refunds use their stored identifiers. Read-only search reuses existing access and identity switching guards.
- T approves each prepared or scheduled payout through native guarded statements. It displays the saved schedule and shows approvals recorded through this batch page as the last run. No verified bank destination export exists, so Download bank file points users to the existing payout transfer workflow and is disabled on the run.
- U uses the original intake proposal, seller question and exact approved publication commands. The local queues had no active records. Approved facts are shown in the staff workspace, and there is no storefront preview for an unpublished candidate or a recorded packed weight field for proposals.
- V keeps invitation review and permissions. Money (view only) reuses the existing Reports only profile. There is no view-only permission for payouts, courier cash or refunds. The existing Governance URL is reachable and the Approval rules tab is removed.
- W shows the saved commission and recorded payouts, refunds and courier cash. Shopper funnel figures are estimates from retained public events. Below-target follow-up uses recorded seller deadlines because configured return or cancellation targets do not exist. The previous commerce, customer and traffic views are retained.
- X shows exact monthly promotion, referral and loyalty costs from recorded data. Gift cards use the existing balance and activity model. Offers without recorded order attribution leave order counts blank. The compact editor continues to the existing review and publication workflow.
- Y only shows Working from recorded observations or successful current probes. Manual checks do not run scheduled jobs or publish incident evidence. SMS is Off. Native backups have no application-linked timestamp or restore-test result. The Backups card shows the latest recorded preliminary export and any existing verification evidence for eligible Super Admins.
- R found that Restricted customer accounts disables the whole account. The existing confirmation records are tied to individual orders. The proposed customer-level COD-only flag defaults off and is held with its companion migration under `docs/redesign-batch-1-migrations/`, outside the active migration paths. The button is hidden pending approval. Neither draft was run. Automatic approval review blocked staging the SQL drafts before owner approval. They remain local review files and are excluded from the directory commit.
- To review the D1 draft on an approved existing copy, set `HASTABAZAAR_REVIEW_D1` to that SQLite file, then run `test -f "$HASTABAZAAR_REVIEW_D1" && sqlite3 -bail "$HASTABAZAAR_REVIEW_D1" < docs/redesign-batch-1-migrations/0164_customer_cod_confirmation.sql` from this checkout. For a separately approved MariaDB fixture, set `HASTABAZAAR_REVIEW_MARIADB_CONFIG` to its client configuration and `HASTABAZAAR_REVIEW_MARIADB_DB` to its database, then run `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < docs/redesign-batch-1-migrations/mariadb-customer-cod-confirmation.sql`.
- R counts only explicit, provider-tagged refusal and not-reached events. The current manual courier failure flow records a generic outcome and a note. It has no structured refusal or not-reached entry, and those notes do not count toward the risk chip.
- The drafts only add storage. Approval and tests are still required before adding the staff write and per-order enforcement through the existing COD workflow.

## Final verification

- The checked local preview is `http://localhost:3018`. Readiness passed with all 107 forms and sign-in ready. The local dev-only Super Admin notice is present, and the gate tests verify production, other hosts and other accounts are excluded.
- Responsive sweep evidence and routes without a fixture are in `docs/redesign-batch-1-screens/README.md`. The final comparison also covers the new Batch 2 workspaces in the ownership table above.
- The UI text audit found the former delivery terminology only in the parked entry and its retained historical operations and help. SMS is Off in System health and listed in Not in use yet. No second-approver UI or hard-coded commission, payout hold or marketplace fee value was found in active workspaces. Seven-day date filters and the existing 3–7-day transit range are unrelated.

### Approved screens and observed differences

The design comparison covered live Admin and Seller Studio at 390, 768 and 1440 px, plus four-width checks for each changed workspace. The archive has dated implementation captures, including some captured before the last navigation integration. Current width checks use the settled routes. No reviewed route had document-level horizontal overflow. The narrow section tab strips can be scrolled within their navigation.

| Reference | Compared workspace | Differences from the picture |
| --- | --- | --- |
| Admin 01 and 11 | Nine section links, phone menu, search and account menu | The local-only amber notice and retained refresh and notification controls take extra space. The phone account menu keeps Sign out in a single row. Data-backed section counts only appear where a count exists. |
| Admin 02 | Today and title help | Work and chip counts reflect the saved queue. Unverified checks show Not checked yet, and zero-count quick filters are hidden as requested. |
| Admin 03 and 04 | Orders and saved order detail | The one local order was delivered, so its next step and progress differ from the packing example. Order cards replace the table on phones. The original activity and financial links remain available. |
| Admin 05, 06 and 07 | Care, Sellers and Catalog | The live Care and moderation queues lacked the example records. Populated decisions used isolated fixtures. The seller registry shows actual review and registration states. |
| Admin 08 | Payout stages and detail | The live queue was empty. The four stages and authorized records were verified with disposable payout fixtures. |
| Admin 09 and 10 | Homepage and Business settings | Homepage retains the original editor and adds help. Business settings displays the current local customer marketplace fee as On at NPR 10 per order, although the brief shows Off. |
| Admin 12 | Not in use yet and linked archive | The parked view uses saved policy values and only links to the retained historical delivery surfaces. |
| Admin 13, 14 and 15 | Dispatch, Courier cash and Parcel problems | Dispatch and Problems used isolated populated parcels. The live courier cash queue held one delivered parcel. Booking is recorded from an external courier and there is no connected courier API or saved parcel weight. |
| Admin 16 and 17 | Refunds and recoveries, seller record | Refund details use actual wallet and verified transfer destinations. Fonepay is simulation-only. Seller scores omit unavailable cancellation attribution and show saved restriction notes. |
| Admin 18 and 19 | Customers, command search | The confirmation-call action waits for migration approval. Search uses real stored references and the staff member’s current access. |
| Admin 20 and 21 | Payout run, catalog help and publication | Reference queues are populated in disposable fixtures. A verified bank file and unpublished storefront preview are unavailable in the current workflows. |
| Admin 22, 23 and 24 | Team, Business report and All offers | Money view only uses Reports only. Reports use observed deadlines, and offer costs omit unrecorded attributions. Growth opens on All offers. |
| Admin 25 | System health, Incidents and Backup & transfer | Current observations determine status. Opening the workspace initially showed checks unverified. Direct probes confirmed the website and database without publishing new observations. Backup export is preliminary, and no restore test is recorded. |
| Seller 01 and 02 | Today and buyer/seller handoffs | The checked seller is still onboarding. Populated follow-ups exercise saved clocks and leave unrecorded time and references out. |
| Seller 03 and 04 | Orders, preparation and Returns | The local Seller account has no linked active orders or returns. Disposable fixtures covered the next-action and reply states. |
| Seller 05, 06 and 07 | Products, new/edit product and Earnings | The live Seller account has no listings or open payout. The new product form starts blank. Saved correction and payout examples are exercised in fixtures. |
| Seller 08 | Seller Studio phone shell | The existing Refresh control appears beside notifications. The local fixture has no Orders count with work to pack. |

Several retained pages put their task breadcrumb or title below the shared section tabs. Approved boards often place a section title before the tabs. Those pages retain the original work context and have one record-specific heading and help control. The Business report CSV and command search were exercised separately.

The 35 detail patterns without a linked local fixture and two legal-policy routes that still require hosted verification are recorded in the screenshot index. The existing test fixtures cover the protected legal routes. No staging data was added to turn empty or guarded pages into populated views.

### Changed files

The list covers tracked changes since the start of this batch. Pending migration drafts are listed under For the owner.

<details>
<summary>Full file list</summary>

```text
app/admin/activity/page.tsx
app/admin/analytics/analytics-details.tsx
app/admin/analytics/business-report-data.ts
app/admin/analytics/business-report-export.tsx
app/admin/analytics/business-report-range.ts
app/admin/analytics/business-report.tsx
app/admin/analytics/page.tsx
app/admin/backup-transfer/page.tsx
app/admin/business-emails/page.tsx
app/admin/business-settings/page.tsx
app/admin/cases/intake/page.tsx
app/admin/cases/page.tsx
app/admin/cases/returns/[id]/page.tsx
app/admin/customers/page.tsx
app/admin/exceptions/page.tsx
app/admin/feedback/page.tsx
app/admin/form-submissions/page.tsx
app/admin/forms/[formId]/page.tsx
app/admin/forms/page.tsx
app/admin/gift-cards/page.tsx
app/admin/governance/page.tsx
app/admin/homepage/page.tsx
app/admin/layout.tsx
app/admin/legal-policies/active/page.tsx
app/admin/legal-policies/page.tsx
app/admin/loading.tsx
app/admin/not-in-use/page.tsx
app/admin/offers/offer-data.ts
app/admin/offers/page.tsx
app/admin/order-emails/page.tsx
app/admin/order-responses/[id]/page.tsx
app/admin/orders/[id]/order-details-tabs.tsx
app/admin/orders/[id]/order-item-photo.tsx
app/admin/orders/[id]/order-overview.tsx
app/admin/orders/[id]/order-progress.tsx
app/admin/orders/[id]/page.tsx
app/admin/orders/[id]/read-order-progress.ts
app/admin/orders/dispatch/booking/route.ts
app/admin/orders/dispatch/page.tsx
app/admin/orders/dispatch/pickup-window.ts
app/admin/orders/dispatch/read-dispatch.ts
app/admin/orders/loading.tsx
app/admin/orders/order-queue-navigation.tsx
app/admin/orders/order-queue-presentation.ts
app/admin/orders/order-stage-badge.tsx
app/admin/orders/page.tsx
app/admin/orders/read-order-queue.ts
app/admin/page.tsx
app/admin/payments/exceptions/[id]/page.tsx
app/admin/payments/page.tsx
app/admin/payments/recoveries/[id]/page.tsx
app/admin/payments/recoveries/claims/[id]/page.tsx
app/admin/payments/recoveries/page.tsx
app/admin/payments/refunds/page.tsx
app/admin/payouts/[id]/page.tsx
app/admin/payouts/page.tsx
app/admin/payouts/run/approve/route.ts
app/admin/payouts/run/page.tsx
app/admin/payouts/run/run-calendar.ts
app/admin/payouts/run/run-data.ts
app/admin/payouts/run/run-workspace.tsx
app/admin/payouts/workspace-data.ts
app/admin/payouts/workspace-detail.tsx
app/admin/products/[id]/page.tsx
app/admin/products/intakes/[id]/page.tsx
app/admin/products/intakes/catalog-product-photo.tsx
app/admin/products/intakes/catalog-queue-data.ts
app/admin/products/intakes/catalog-queue.tsx
app/admin/products/intakes/catalog-selection.tsx
app/admin/products/intakes/page.tsx
app/admin/products/intakes/retained-help.ts
app/admin/products/page.tsx
app/admin/products/publications/page.tsx
app/admin/promo-codes/page.tsx
app/admin/referrals/loading.tsx
app/admin/referrals/page.tsx
app/admin/riders/form-history/page.tsx
app/admin/riders/page.tsx
app/admin/sellers/[id]/page.tsx
app/admin/sellers/[id]/seller-order-controls.tsx
app/admin/sellers/[id]/seller-record-data.ts
app/admin/sellers/[id]/seller-record.tsx
app/admin/sellers/page.tsx
app/admin/shipping/page.tsx
app/admin/shipping/parcel-problem-action.tsx
app/admin/shipping/parcel-problem-queue.tsx
app/admin/shipping/parcel-problems.ts
app/admin/staff-form-history/page.tsx
app/admin/system-health/check-model.ts
app/admin/system-health/checks-panel.tsx
app/admin/system-health/checks/route.ts
app/admin/system-health/evidence.ts
app/admin/system-health/incidents/page.tsx
app/admin/system-health/page.tsx
app/admin/system-health/records/page.tsx
app/admin/team/page.tsx
app/admin/workspace.css
app/api/admin/search/results.ts
app/api/admin/search/route.ts
app/auth.ts
app/globals.css
app/seller/cases/complaints/[id]/page.tsx
app/seller/cases/page.tsx
app/seller/cases/return-detail.tsx
app/seller/cases/returns/[id]/page.tsx
app/seller/finance/overview-data.ts
app/seller/finance/page.tsx
app/seller/finance/payout-overview.tsx
app/seller/form-history/page.tsx
app/seller/layout.tsx
app/seller/loading.tsx
app/seller/order-responses/[id]/page.tsx
app/seller/orders/[id]/page.tsx
app/seller/orders/order-detail.tsx
app/seller/orders/order-queue.ts
app/seller/orders/order-search.tsx
app/seller/orders/page.tsx
app/seller/page.tsx
app/seller/products/new/page.tsx
app/seller/products/page.tsx
app/seller/profile/page.tsx
app/seller/registration/page.tsx
app/seller/requests/changes/[id]/page.tsx
app/seller/requests/page.tsx
app/seller/reviews/page.tsx
app/seller/shipping/page.tsx
components/account/notification-list.tsx
components/admin/admin-navigation.tsx
components/admin/admin-section-tabs.tsx
components/admin/admin-sections.ts
components/admin/admin-task-context.tsx
components/admin/admin-workspace-ready.tsx
components/admin/business-email-processor.tsx
components/admin/business-settings-manager.tsx
components/admin/cod-courier-cash.tsx
components/admin/command-search.tsx
components/admin/common-fee-policy.tsx
components/admin/confirm-operation.tsx
components/admin/dispatch-booking-form.tsx
components/admin/dispatch-parcel-list.tsx
components/admin/dispatch-workspace.tsx
components/admin/document-review-workspace.tsx
components/admin/exception-order-section.tsx
components/admin/first-cod-confirmation.tsx
components/admin/form-catalog-editor.tsx
components/admin/form-catalog-list.tsx
components/admin/homepage-hero-manager.tsx
components/admin/homepage-occasion-manager.tsx
components/admin/homepage-visibility-control.tsx
components/admin/homepage-visibility-recovery.tsx
components/admin/incentive-reports.tsx
components/admin/incident-workspace.tsx
components/admin/legal-procedure-controls.tsx
components/admin/legal-procedure-workspace.tsx
components/admin/loyalty-manager.tsx
components/admin/order-email-retry.tsx
components/admin/overview-seller-handoff-data.ts
components/admin/overview-today-data.ts
components/admin/overview-today-model.ts
components/admin/overview-today.tsx
components/admin/overview-work-summaries.tsx
components/admin/page-help-copy.ts
components/admin/page-help.tsx
components/admin/parcel-controls.tsx
components/admin/payout-actions.tsx
components/admin/payout-hold-button.tsx
components/admin/payout-request-actions.tsx
components/admin/payout-workspace.tsx
components/admin/privacy-actions.tsx
components/admin/product-intake-review.tsx
components/admin/product-publication-review.tsx
components/admin/product-review-actions.tsx
components/admin/promo-code-cost-preview.tsx
components/admin/promo-code-manager.tsx
components/admin/promo-code-offer-panel.tsx
components/admin/recorded-progress.tsx
components/admin/recovery-review-summary.tsx
components/admin/referral-settings.tsx
components/admin/refund-funding-review.tsx
components/admin/refund-recovery-layout.tsx
components/admin/refund-review-summary.tsx
components/admin/return-case-actions.tsx
components/admin/return-case-photo.tsx
components/admin/return-case-queue.tsx
components/admin/review-workspace.tsx
components/admin/seller-application-queue.tsx
components/admin/seller-document-label.ts
components/admin/seller-document-review.tsx
components/admin/seller-recovery-review.tsx
components/admin/seller-review-actions.tsx
components/admin/setting-value-preview.tsx
components/admin/staff-access-controls.tsx
components/admin/staff-access-history.tsx
components/admin/staff-form-history-links.tsx
components/admin/staff-invitation-manager.tsx
components/admin/staff-invitation-presets.ts
components/admin/staff-permission-manager.tsx
components/admin/system-health-workspace.tsx
components/admin/team-people.tsx
components/admin/team-workspace.tsx
components/commerce/order-preparation-workspace.tsx
components/seller/bank-details-form.tsx
components/seller/case-response-form.tsx
components/seller/inventory-editor.tsx
components/seller/maker-application-profile-form.tsx
components/seller/onboarding-checklist.tsx
components/seller/order-fulfillment-actions.tsx
components/seller/payout-request-form.tsx
components/seller/product-catalogue.tsx
components/seller/product-intake-preview.tsx
components/seller/product-intake-workspace.tsx
components/seller/product-legacy-start.tsx
components/seller/product-review-readiness.tsx
components/seller/protected-change-request-form.tsx
components/seller/protected-change-withdrawal.tsx
components/seller/protected-identity-form.tsx
components/seller/public-profile-editor.tsx
components/seller/registered-transition-form.tsx
components/seller/review-reply-form.tsx
components/seller/seller-action-overview.tsx
components/seller/seller-navigation.tsx
components/seller/seller-order-list.tsx
components/seller/seller-profile-form.tsx
components/seller/seller-registration-intake-form.tsx
components/seller/shipping-workspace.tsx
components/seller/variant-editor.tsx
components/ui/button.tsx
components/ui/next-step-box.tsx
components/ui/step-line.tsx
components/ui/whose-turn.tsx
components/ui/workspace-refresh.tsx
docs/redesign-batch-1-board.md
docs/redesign-batch-1-screens/README.md
docs/redesign-batch-1-screens/admin--accounting-390.png
docs/redesign-batch-1-screens/admin--accounting-768.png
docs/redesign-batch-1-screens/admin--activity--records-390.png
docs/redesign-batch-1-screens/admin--activity--records-768.png
docs/redesign-batch-1-screens/admin--activity-390.png
docs/redesign-batch-1-screens/admin--activity-768.png
docs/redesign-batch-1-screens/admin--analytics--records-390.png
docs/redesign-batch-1-screens/admin--analytics--records-768.png
docs/redesign-batch-1-screens/admin--analytics-390.png
docs/redesign-batch-1-screens/admin--analytics-768.png
docs/redesign-batch-1-screens/admin--backup-transfer-390.png
docs/redesign-batch-1-screens/admin--backup-transfer-768.png
docs/redesign-batch-1-screens/admin--business-emails--records-390.png
docs/redesign-batch-1-screens/admin--business-emails--records-768.png
docs/redesign-batch-1-screens/admin--business-emails-390.png
docs/redesign-batch-1-screens/admin--business-emails-768.png
docs/redesign-batch-1-screens/admin--business-settings-390.png
docs/redesign-batch-1-screens/admin--business-settings-768.png
docs/redesign-batch-1-screens/admin--cases--intake-390.png
docs/redesign-batch-1-screens/admin--cases--intake-768.png
docs/redesign-batch-1-screens/admin--cases-390.png
docs/redesign-batch-1-screens/admin--cases-768.png
docs/redesign-batch-1-screens/admin--catalog-390.png
docs/redesign-batch-1-screens/admin--catalog-768.png
docs/redesign-batch-1-screens/admin--commission--terms-390.png
docs/redesign-batch-1-screens/admin--commission--terms-768.png
docs/redesign-batch-1-screens/admin--commission-390.png
docs/redesign-batch-1-screens/admin--commission-768.png
docs/redesign-batch-1-screens/admin--delivery-rates-390.png
docs/redesign-batch-1-screens/admin--delivery-rates-768.png
docs/redesign-batch-1-screens/admin--exceptions-390.png
docs/redesign-batch-1-screens/admin--exceptions-768.png
docs/redesign-batch-1-screens/admin--fee-waivers-390.png
docs/redesign-batch-1-screens/admin--fee-waivers-768.png
docs/redesign-batch-1-screens/admin--feedback-390.png
docs/redesign-batch-1-screens/admin--feedback-768.png
docs/redesign-batch-1-screens/admin--fees-390.png
docs/redesign-batch-1-screens/admin--fees-768.png
docs/redesign-batch-1-screens/admin--form-submissions-390.png
docs/redesign-batch-1-screens/admin--form-submissions-768.png
docs/redesign-batch-1-screens/admin--forms--formid-390.png
docs/redesign-batch-1-screens/admin--forms--formid-768.png
docs/redesign-batch-1-screens/admin--forms-390.png
docs/redesign-batch-1-screens/admin--forms-768.png
docs/redesign-batch-1-screens/admin--gift-cards-390.png
docs/redesign-batch-1-screens/admin--gift-cards-768.png
docs/redesign-batch-1-screens/admin--governance-390.png
docs/redesign-batch-1-screens/admin--governance-768.png
docs/redesign-batch-1-screens/admin--homepage-390.png
docs/redesign-batch-1-screens/admin--homepage-768.png
docs/redesign-batch-1-screens/admin--loyalty-390.png
docs/redesign-batch-1-screens/admin--loyalty-768.png
docs/redesign-batch-1-screens/admin--not-in-use-390.png
docs/redesign-batch-1-screens/admin--not-in-use-768.png
docs/redesign-batch-1-screens/admin--notifications-390.png
docs/redesign-batch-1-screens/admin--notifications-768.png
docs/redesign-batch-1-screens/admin--order-emails--records-390.png
docs/redesign-batch-1-screens/admin--order-emails--records-768.png
docs/redesign-batch-1-screens/admin--order-emails-390.png
docs/redesign-batch-1-screens/admin--order-emails-768.png
docs/redesign-batch-1-screens/admin--orders--record-390.png
docs/redesign-batch-1-screens/admin--orders--record-768.png
docs/redesign-batch-1-screens/admin--orders-390.png
docs/redesign-batch-1-screens/admin--orders-768.png
docs/redesign-batch-1-screens/admin--payments--payouts-390.png
docs/redesign-batch-1-screens/admin--payments--payouts-768.png
docs/redesign-batch-1-screens/admin--payments--recoveries-390.png
docs/redesign-batch-1-screens/admin--payments--recoveries-768.png
docs/redesign-batch-1-screens/admin--payments--refunds-390.png
docs/redesign-batch-1-screens/admin--payments--refunds-768.png
docs/redesign-batch-1-screens/admin--payments-390.png
docs/redesign-batch-1-screens/admin--payments-768.png
docs/redesign-batch-1-screens/admin--payouts-390.png
docs/redesign-batch-1-screens/admin--payouts-768.png
docs/redesign-batch-1-screens/admin--privacy-390.png
docs/redesign-batch-1-screens/admin--privacy-768.png
docs/redesign-batch-1-screens/admin--products--intakes-390.png
docs/redesign-batch-1-screens/admin--products--intakes-768.png
docs/redesign-batch-1-screens/admin--products--publications-390.png
docs/redesign-batch-1-screens/admin--products--publications-768.png
docs/redesign-batch-1-screens/admin--products--record-390.png
docs/redesign-batch-1-screens/admin--products--record-768.png
docs/redesign-batch-1-screens/admin--products-390.png
docs/redesign-batch-1-screens/admin--products-768.png
docs/redesign-batch-1-screens/admin--programs-390.png
docs/redesign-batch-1-screens/admin--programs-768.png
docs/redesign-batch-1-screens/admin--progress-390.png
docs/redesign-batch-1-screens/admin--progress-768.png
docs/redesign-batch-1-screens/admin--promo-codes-390.png
docs/redesign-batch-1-screens/admin--promo-codes-768.png
docs/redesign-batch-1-screens/admin--referrals-390.png
docs/redesign-batch-1-screens/admin--referrals-768.png
docs/redesign-batch-1-screens/admin--review-tasks--record--history-390.png
docs/redesign-batch-1-screens/admin--review-tasks--record--history-768.png
docs/redesign-batch-1-screens/admin--reviews-390.png
docs/redesign-batch-1-screens/admin--reviews-768.png
docs/redesign-batch-1-screens/admin--riders--form-history--application-390.png
docs/redesign-batch-1-screens/admin--riders--form-history--application-768.png
docs/redesign-batch-1-screens/admin--riders--form-history--code-390.png
docs/redesign-batch-1-screens/admin--riders--form-history--code-768.png
docs/redesign-batch-1-screens/admin--riders--form-history--remittance-390.png
docs/redesign-batch-1-screens/admin--riders--form-history--remittance-768.png
docs/redesign-batch-1-screens/admin--riders--form-history--report-390.png
docs/redesign-batch-1-screens/admin--riders--form-history--report-768.png
docs/redesign-batch-1-screens/admin--riders-390.png
docs/redesign-batch-1-screens/admin--riders-768.png
docs/redesign-batch-1-screens/admin--seller-documents--record--review-390.png
docs/redesign-batch-1-screens/admin--seller-documents--record--review-768.png
docs/redesign-batch-1-screens/admin--sellers--record-390.png
docs/redesign-batch-1-screens/admin--sellers--record-768.png
docs/redesign-batch-1-screens/admin--sellers-390.png
docs/redesign-batch-1-screens/admin--sellers-768.png
docs/redesign-batch-1-screens/admin--shipping-390.png
docs/redesign-batch-1-screens/admin--shipping-768.png
docs/redesign-batch-1-screens/admin--staff-form-history-390.png
docs/redesign-batch-1-screens/admin--staff-form-history-768.png
docs/redesign-batch-1-screens/admin--system-health--incidents-390.png
docs/redesign-batch-1-screens/admin--system-health--incidents-768.png
docs/redesign-batch-1-screens/admin--system-health--records-390.png
docs/redesign-batch-1-screens/admin--system-health--records-768.png
docs/redesign-batch-1-screens/admin--system-health-390.png
docs/redesign-batch-1-screens/admin--system-health-768.png
docs/redesign-batch-1-screens/admin--team-390.png
docs/redesign-batch-1-screens/admin--team-768.png
docs/redesign-batch-1-screens/admin-390.png
docs/redesign-batch-1-screens/admin-768.png
docs/redesign-batch-1-screens/seller--analytics-390.png
docs/redesign-batch-1-screens/seller--analytics-768.png
docs/redesign-batch-1-screens/seller--cases-390.png
docs/redesign-batch-1-screens/seller--cases-768.png
docs/redesign-batch-1-screens/seller--finance--recoveries-390.png
docs/redesign-batch-1-screens/seller--finance--recoveries-768.png
docs/redesign-batch-1-screens/seller--finance-390.png
docs/redesign-batch-1-screens/seller--finance-768.png
docs/redesign-batch-1-screens/seller--form-history--payout-request-390.png
docs/redesign-batch-1-screens/seller--form-history--payout-request-768.png
docs/redesign-batch-1-screens/seller--form-history--review-reply-390.png
docs/redesign-batch-1-screens/seller--form-history--review-reply-768.png
docs/redesign-batch-1-screens/seller--form-history--shipping-action-390.png
docs/redesign-batch-1-screens/seller--form-history--shipping-action-768.png
docs/redesign-batch-1-screens/seller--form-history--shipping-request-390.png
docs/redesign-batch-1-screens/seller--form-history--shipping-request-768.png
docs/redesign-batch-1-screens/seller--notifications-390.png
docs/redesign-batch-1-screens/seller--notifications-768.png
docs/redesign-batch-1-screens/seller--orders-390.png
docs/redesign-batch-1-screens/seller--orders-768.png
docs/redesign-batch-1-screens/seller--products--intakes-390.png
docs/redesign-batch-1-screens/seller--products--intakes-768.png
docs/redesign-batch-1-screens/seller--products--new-390.png
docs/redesign-batch-1-screens/seller--products--new-768.png
docs/redesign-batch-1-screens/seller--products-390.png
docs/redesign-batch-1-screens/seller--products-768.png
docs/redesign-batch-1-screens/seller--profile-390.png
docs/redesign-batch-1-screens/seller--profile-768.png
docs/redesign-batch-1-screens/seller--registration-390.png
docs/redesign-batch-1-screens/seller--registration-768.png
docs/redesign-batch-1-screens/seller--requests-390.png
docs/redesign-batch-1-screens/seller--requests-768.png
docs/redesign-batch-1-screens/seller--reviews-390.png
docs/redesign-batch-1-screens/seller--reviews-768.png
docs/redesign-batch-1-screens/seller--shipping-390.png
docs/redesign-batch-1-screens/seller--shipping-768.png
docs/redesign-batch-1-screens/seller-390.png
docs/redesign-batch-1-screens/seller-768.png
lib/admin/customers.ts
lib/admin/navigation.ts
lib/auth/local-test-access.ts
lib/catalog/shop-query.ts
lib/db/repositories/analytics.ts
lib/db/repositories/payouts.ts
lib/forms/access.ts
lib/forms/native-source-contracts.ts
lib/forms/plain-language.ts
lib/managed-commerce/activation.ts
lib/managed-commerce/fixed-supply.ts
lib/managed-commerce/registered-transition.ts
lib/marketplace/policy.ts
lib/operations/parcels.ts
lib/payments/manual-payment-workspace.ts
lib/payments/payout-request-readiness.ts
lib/security/controller.ts
lib/security/local-simulation.ts
lib/security/request.ts
lib/security/runtime-policy.ts
lib/staff/access.ts
lib/staging/local-preview-bindings.ts
tests/admin-autofill-hydration.test.ts
tests/admin-offers-overview.test.ts
tests/admin-page-help.test.ts
tests/admin-presentation.test.ts
tests/bootstrap-prerequisites-import.test.ts
tests/cancellation-fulfillment-browser.test.ts
tests/care-return-context.test.ts
tests/checkout-delivery-presentation.test.ts
tests/first-party-analytics.test.ts
tests/form-catalog-access.test.ts
tests/form-catalog-commerce-success.test.ts
tests/form-catalog-commerce.test.ts
tests/form-catalog-payout-domain.test.ts
tests/form-catalog-policy.test.ts
tests/form-catalog-seller-case-history.test.ts
tests/helpers/common-fee-view.ts
tests/helpers/historical-mariadb-schema.ts
tests/incident-recovery-browser.test.ts
tests/local-staff-mfa-preview.test.ts
tests/managed-commerce-activation.test.ts
tests/managed-fixed-supply.test.ts
tests/product-price-history-schema.test.ts
tests/product-publication-browser.test.ts
tests/product-source-scope-browser.test.ts
tests/promo-aftercare.test.ts
tests/responsive-media-operations.test.ts
tests/return-case-presentation.test.ts
tests/seller-dashboard-experience.test.ts
tests/seller-document-scope-browser.test.ts
tests/seller-guidance-links.test.ts
tests/seller-redesign-ui.test.ts
tests/seller-workspace-pages.test.ts
tests/site-responsive-layout.test.ts
tests/staff-access-ui.test.ts
tests/staff-permission-browser.test.ts
tests/super-admin-marketplace-summary-page.test.ts
tests/system-health-workspace-render.test.ts
tests/workspace-navigation.test.ts
tests/workspace-notification-browser.test.ts
vite.config.ts
```

</details>
