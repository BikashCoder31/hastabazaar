# Incentives First Release Implementation Plan

> **For agentic workers:** Use test-first implementation and scoped parallel work for the two independent client editors. The approved design is the user's first-release request in this chat.

**Goal:** Give Promo codes and Daily loyalty points readable controls, totals, activity, change history and cost previews in their own Super Admin pages.

**Architecture:** Preserve the existing immutable financial records and mutation APIs. Add authorized read-only reporting over those records, server-rendered tables, and pure presentation/calculation helpers. Work in the existing isolated full-app preview copy.

**Tech Stack:** React, Vinext, TypeScript, D1-compatible SQL, Node SQLite fixtures.

## Constraints

- NPR accepts at most two decimals; percentage accepts at most two decimals; internal paisa and basis points stay integers.
- All displayed and entered operational dates use Asia/Kathmandu.
- Existing campaign budget consumption, refund handling, locked loyalty conversion and idempotent mutation recovery remain unchanged.
- New reports and exports require an active Super Admin with matching authenticated subject.
- Totals distinguish live terms from drafts; previews are labelled estimates and never post transactions.
- Keep all controls and history on their own page. Use the complete local app and persistent isolated test database.

## Review focus

- Fractional amounts, overflow and scientific notation must not silently change financial values.
- A saved draft must not appear as live financial terms.
- Cancelled/refunded promo orders retain consumed campaign budget and their recorded amounts.
- Activity search, Nepal date boundaries and pagination must agree between table and CSV.
- Loyalty previews must not mutate or contradict locked conversion or retained attempts.

## Tasks and progress

- [x] 1. Write and run failing tests for decimal conversion, Nepal dates, previews and CSV safety. Implement `lib/incentives/presentation.ts` and `lib/incentives/reporting.ts`.
- [x] 2. Write real-migration database tests for authorized promo/loyalty reporting, filters, totals and history. Implement `lib/db/repositories/incentive-reporting.ts` and the read-only report/export routes.
- [x] 3. Update the independent promo and loyalty editors, retaining existing mutation/recovery behavior. Add live cost previews, readable NPR/% fields, Nepal dates and status summaries.
- [x] 4. Integrate server-rendered overview, activity, customer balances and before/after history on both existing pages.
- [x] 5. Seed labelled fictional reporting scenarios in the isolated preview. Run scoped regressions, typecheck, lint and native build. Restart port 3000, verify save/publish/activity/history/export and previews, check all 34 sections and leave Super Admin open in Chrome.
- [x] 6. The additional full-project regression run completed cleanly: 2,588 passed, zero failed, 15 native integration tests skipped. The current `weekly-full-suite.log` supersedes the older fixture-failure log.

## Execution notes

User explicitly authorized implementation of the first release. The existing copy is isolated under `work/super-admin-full-preview-20261014`; original checkouts remain intact. No production credentials, live services, deployment, commits or permission changes are needed.

Review identified exact-paisa formatting and aggregate monetary overflow at large
values; both were fixed with regression tests. Cost-preview anchor targets were
added to both editors. Native report filters and the integrated Commission forms
were registered without allowing custom accounting fields or generic answers.
The original catalog baseline remains covered, with the five new native contracts
explicitly inventoried. The loyalty reversed-date fixture now enters Nepal midnight
at epoch zero (`1970-01-01T05:45`), so it still tests reversed dates rather than an
unsupported negative epoch.

Fresh verification: 37 focused release tests, 19 catalog tests and 21 mounted promo
regressions passed; TypeScript, scoped lint and native build passed. The local API
verified publication, draft/live totals, unchanged balances, filters, both exports
and authorization. Chrome verified draft save, previews, activity filters, history
and native order details. A browser-extension focus timeout prevented dismissing
the native publication dialog; real publication was verified through the local API
and the mounted browser regression suite. The subsequent full project suite
completed with 2,588 passing tests, zero failures and 15 skipped native integration
tests; its four earlier fixture failures were repaired. Complete test logs are in
`.wrangler/full-preview/`; the clean run is `weekly-full-suite.log`.

The preview copy also omitted two import JSON fixtures used by the existing
product-truthfulness suite; the exact source files were restored and all 12 tests
passed. Simulated promo orders now include their native shipment/address fixtures,
so every order-detail link returned HTTP 200 and was verified in Chrome. The
sample loyalty program was restored to 10 daily points after publication testing.
Both incentive dashboards are open in Chrome with full local Super Admin access.
