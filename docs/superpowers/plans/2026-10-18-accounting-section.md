# Hastabazaar Accounting Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first, read-only Accounting workspace from Hastabazaar's existing financial records, then deliver the later bookkeeping packages defined in the companion roadmap without changing approved commercial terms or existing data.

**Architecture:** Existing operational tables remain the source of truth. A new server-only read layer produces separate commission, maker, settlement, cash/refund and incentive views with provenance and honest availability states. The later accounting bridge exchanges reviewed records with one accountant-selected formal-book system; it does not turn this first dashboard into a second general ledger.

**Tech Stack:** Existing TypeScript, React 19, Vinext, D1-shaped repositories, local SQLite/D1 and hosted MariaDB adapter, existing UI components and Node/tsx tests. No new package or external service is required for the first release. Node remains >=22.13.0.

**Spec:** [Accounting design and complete delivery roadmap](../specs/2026-10-18-accounting-section-design.md). Read both documents before implementation. The roadmap contains the later expenses, bridge, reconciliation, full-report and tax-document packages; only the read-only foundation is broken into executable code tasks below.

## Global Constraints

- Preserve the approved **9% company / 91% maker** sale-linked model. Accounting has no rate editor and cannot update commercial policy.
- Historical records keep their saved rate, rounding, commercial model, agreement and monetary snapshots. Never reprice old orders with today's default.
- Preserve current hold, reserve, payout, refund, customer-credit and approval rules.
- Loyalty remains paused and grace off. Do not save, publish, promote or enable a schedule.
- No reset, seed, restore, replacement database, backup import or automatic accrual/backfill. Missing schema/data stops the affected report.
- Active folder: `C:/Users/abinash/Desktop/HastaBazaar`; preview: `http://localhost:3018`. Never launch the retired Hatskala directory or a historical checkout.
- Preserve canonical Git settings and baseline `d9056dc10fee13dc11d15f24a14f63b003befe0b`; never weaken launch checks or add an automatic accounting upgrade.
- The first release requires no migration, new database table, export, money movement, financial write, new permission profile or settings publication.
- No deployment or production changes. This planning request does not authorize implementation or application of later upgrades to retained data.
- Do not stage, overwrite or commit unrelated existing work. Initial work includes four modified files and untracked `qa-test-accounts.json`; recheck current state before execution.

## Review Focus

1. A historical maker who later becomes a registered seller retains old maker obligations and is never counted twice; owned by Task 2/3 tests.
2. Totals include records beyond visible maker/payment pages and survive pagination without omissions; owned by Task 2 tests.
3. Pending/failed payments, credit-funded refunds and document-only corrections are not misrepresented as bank cash or duplicate money movement; owned by Task 3 tests.
4. Source-query failure, missing schema, unsafe numeric sums or concurrent changes produce an explicit unavailable/review result rather than false zero/balanced totals; owned by Tasks 1/2/3 tests.
5. An Admin or a formerly authorized session cannot retrieve cached Accounting data through direct routes, APIs or navigation; owned by Tasks 4/5/6 tests.

---

## 1. Delivery order and decision gates

| Order | Deliverable | Gate before moving on |
| --- | --- | --- |
| 1 | Read-only foundation, Tasks 1-6 below | Existing finance parity, access checks, read-only proof and responsive browser evidence pass. No migration. |
| 2 | Accounting policy and opening-position sheet (roadmap A) | Owner/accountant approve source-to-account mapping, legal entity, periods, supported models, opening method and formal-book system. |
| 3 | Reviewed source-event / journal bridge (roadmap B) | Balanced batches, duplicate/crash/replay proof, source lineage and external acknowledgement are verified in disposable fixtures. |
| 4 | Expenses/purchases (roadmap C) | Expense/payment separation, approvals, evidence access and duplicate bill protection pass. |
| 5 | Statement and carrier reconciliation (roadmap D) | Partial/group matches, fees/reversals and competing allocation tests pass; original operational records remain unchanged. |
| 6 | Full statements and period close (roadmap E) | Approved opening/external adjustments included; accountant reconciles trial balance, P&L, balance sheet and cash flow. |
| 7 | Optional provider connector and live tax documents (roadmap F) | Provider/tax-specific design and sandbox evidence reviewed. Deployment and retained schema changes remain separately authorized. |

Do not implement all packages as a single migration or feature branch without intermediate review. Package A's unresolved business decisions do not delay a truthful, read-only foundation. The founder's future implementation instruction should name the package; it is not an instruction to turn on all later writes.

## 2. Foundation file map

All paths below are relative to the active project root. Proposed new files do not exist yet.

| File | Responsibility |
| --- | --- |
| `lib/accounting/types.ts` | JSON-safe money, query, source, metric, issue, read-bundle and workspace contracts. |
| `lib/accounting/money.ts` | Exact integer-paisa parsing, summation and display; no floating-point money arithmetic. |
| `lib/accounting/filters.ts` | Strict Nepal-date windows, section allowlist and scoped cursor validation. |
| `lib/accounting/source-manifest.ts` | Required tables/columns, source ownership, model classification and supported read capabilities. |
| `lib/accounting/source-queries.ts` | Bounded, parameterized SELECT batches and aggregate queries; no financial mutation helper imports. |
| `lib/accounting/projection.ts` | Pure conversion of source bundles to named metrics, rows and issues. |
| `lib/accounting/workspace.ts` | One report request, its observed time, source readiness and read/projection composition. |
| `lib/accounting/access.ts` | Existing identity/permission integration with an explicit Super Admin restriction. |
| `app/admin/accounting/page.tsx` | Dynamic server page and safe source links. |
| `app/admin/accounting/loading.tsx` | Loading state. |
| `app/admin/accounting/error.tsx` | Recoverable page failure with no misleading zero values. |
| `app/api/admin/accounting/route.ts` | GET-only JSON read endpoint, strict input errors and private/no-store responses. |
| `components/admin/accounting-workspace.tsx` | Read-only section tabs, metrics, date form, source rows and review items. |
| `components/admin/accounting-workspace.module.css` | Responsive layout where shared components are insufficient. |
| `lib/admin/navigation.ts` | One role-restricted Accounting destination, search help and task ordering. |
| `tests/helpers/accounting-fixture.ts` | Synthetic in-memory schema/records and an instrumented read-only D1 facade. |
| `tests/accounting-contract.test.ts` | Money/date/cursor and JSON contracts. |
| `tests/accounting-sources.test.ts` | Read safety, aggregation, schema readiness, parity and pagination. |
| `tests/accounting-projection.test.ts` | Financial meaning, lineage and unavailable states. |
| `tests/accounting-access.test.ts` | Direct page/API/navigation roles and revoked access. |
| `tests/accounting-ui.test.ts` | Rendered UI, filters, empty/error states and misleading-action prevention. |
| `tests/accounting-native-runtime.test.ts` | Same projection/parity fixtures using the guarded disposable MariaDB harness. |
| `docs/testing/2026-10-18-accounting-foundation-inventory.md` | Inventory before browsing; replace date with actual execution date if later. |

No changes are planned to existing commercial calculators, schema/generators, runtime credentials, launchers, saved forms or financial mutation repositories. Reuse an existing icon key such as `analytics` for navigation; adding another icon mapping is unnecessary.

## 3. Shared interfaces

Define these once in `lib/accounting/types.ts`; keep later tasks consistent with them:

```ts
type Paisa = string; // canonical signed base-10 integer; examples '0', '9000', '-50'
type AccountingSection = 'overview' | 'sellers' | 'makers' | 'cash' | 'incentives' | 'issues';
type SourceKind = 'order_item' | 'seller_ledger_entry' | 'seller_payout'
  | 'maker_entitlement' | 'maker_settlement_entry' | 'maker_payout'
  | 'parcel_collection' | 'parcel_remittance' | 'refund' | 'wallet_entry'
  | 'referral_redemption' | 'promo_redemption' | 'loyalty_claim'
  | 'loyalty_redemption' | 'gift_card' | 'invoice_adjustment';
interface AccountingQuery {
  section: AccountingSection;
  period: 'today' | '7d' | '30d' | 'all' | 'custom';
  fromAt: number; toExclusive: number; // UTC epoch milliseconds; flow window only
  pageSize: number; // default 50, maximum 100
  cursor: null | { scope: string; recordedAt: number; sourceKind: SourceKind; sourceId: string };
}
interface AccountingIssue {
  code: 'source_unavailable' | 'missing_attribution' | 'unknown_model'
    | 'source_mismatch' | 'unsafe_money' | 'classification_required';
  message: string; sourceKind?: SourceKind; sourceId?: string;
}
interface AccountingSourceRow {
  sourceKind: SourceKind; sourceId: string; recordedAt: number;
  amountPaisa: Paisa | null; points: string | null;
  model: string | null; state: string; reference: string;
}
interface AccountingMetric {
  key: string; label: string; amountPaisa: Paisa | null;
  status: 'available' | 'unavailable' | 'needs_review';
  basis: 'period_flow' | 'current_position';
  sourceKinds: readonly SourceKind[]; explanation: string;
}
interface AccountingSourceBundle {
  observedAt: number; environment: string;
  metrics: readonly AccountingMetric[]; rows: readonly AccountingSourceRow[];
  issues: readonly AccountingIssue[]; nextCursor: string | null;
  coverage: readonly { source: string; available: boolean; rowCount: number }[];
}
interface AccountingWorkspace extends AccountingSourceBundle { query: AccountingQuery }
```

`rowCount` is a checked safe integer; do not silently truncate a database count. Unknown amounts use null, not '0'. Empty confirmed sources may legitimately return '0'. A cursor's scope binds its section/window/page-size; reject another scope, non-finite time, unsupported source kind, cursor text above 1,024 characters or source IDs above 191 characters. Never put SQL/table names supplied by the client into a query.

Query keys are `section`, `period`, `from`, `to`, `pageSize`, `cursor`; reject repeated/unknown keys. Defaults are Overview, Last 30 days and 50 rows. All time uses `fromAt=0`, `toExclusive=observedAt+1`. Custom requires both dates; reject `from`/`to` on preset periods. `observedAt` must be a positive safe integer. Changing a filter clears its cursor. `StaffUser` is the existing type exported by `lib/auth/staff.ts`.

Function contracts:

- `paisa(value: string | number | bigint): Paisa`, `sumPaisa(values: readonly Paisa[]): Paisa`, `formatPaisa(value: Paisa): string` in `money.ts`.
- `parseAccountingQuery(params: URLSearchParams, observedAt: number): AccountingQuery` in `filters.ts`; raise a typed validation error for invalid input.
- `readAccountingSources(db: D1Database, query: AccountingQuery, observedAt: number, environment: string): Promise<AccountingSourceBundle>` in `source-queries.ts`.
- `projectAccounting(bundle: AccountingSourceBundle, query: AccountingQuery): AccountingWorkspace` in `projection.ts`; pure and deterministic.
- `getAccountingWorkspace(db: D1Database, query: AccountingQuery, observedAt: number, environment: string): Promise<AccountingWorkspace>` in `workspace.ts`.
- `requireAccountingPageReader(): Promise<StaffUser>` and `requireAccountingApiReader(): Promise<StaffUser>` in `access.ts`; use existing staff identity/current-role checks, require Super Admin and `audit_log.view`, and retain normal application session/security behavior.

## Task 1: Contracts, precise amounts and Nepal filters

**Files:** Create `lib/accounting/types.ts`, `money.ts`, `filters.ts`; test `tests/accounting-contract.test.ts`.

**Interfaces:** Consumes no new feature dependency; produces the contracts/functions above.

- [ ] Write failing tests: `split_example_is_9000_and_91000_paisa` asserts existing `calculateManagedSaleLinkedAmounts({eligibleBasePaisa:100000,platformRetentionBps:900})` returns 9000/91000; `exact_money_survives_large_aggregate` expects `sumPaisa(['9007199254740991','1']) === '9007199254740992'`; reject an already unsafe Number, decimal paisa, NaN, Infinity and malformed strings; normalize zero and preserve negative adjustments.
- [ ] Add date/cursor cases: Today at Nepal midnight, previous-month/year crossings, leap day, invalid 30 February, inclusive end date, reversed ranges and wrong-scope cursor. Use injected fixed clocks. For Nepal 18 October 2026, Today starts `2026-10-17T18:15:00.000Z` and ends before `2026-10-18T18:15:00.000Z`; seven days starts local 12 October and thirty days local 19 September.
- [ ] Pin default Overview/30-day/50-row behavior, All time through `observedAt+1`, custom-date requirements, repeated/unknown query-key rejection and cursor reset on filter changes.
- [ ] Run `node --import tsx --test tests/accounting-contract.test.ts`; expect failure because the new contract/modules are absent. Existing split-calculator assertions may already pass; do not edit the calculator to manufacture a failure.
- [ ] Implement only the declared contracts, exact money operations and filter parser. Reuse validated Nepal date primitives where suitable; add strict calendar validation. Use BigInt-compatible formatting without converting a large aggregate back to Number.
- [ ] Repeat the targeted command; expect exit 0. Review and checkpoint only this task's new files after implementation is authorized.

## Task 2: Source readiness and read-only aggregate queries

**Files:** Create `lib/accounting/source-manifest.ts`, `source-queries.ts`, `tests/helpers/accounting-fixture.ts`, `tests/accounting-sources.test.ts`.

**Interfaces:** Consumes Task 1's `AccountingQuery`, `AccountingSourceBundle`, `Paisa`; produces `readAccountingSources(...)`.

- [ ] Write failing fixture tests with real schema/trigger definitions loaded only into `DatabaseSync(':memory:')`, following `tests/helpers/incentive-report-database.ts`. Seed fictional rows only in this fixture. Add an instrumented facade rejecting writes/schema statements, including writable CTEs/PRAGMAs, while allowing the reviewed SELECT batch. Test financial table hashes and query logs before/after reads.
- [ ] Pin independent-versus-managed exclusion to both snapshot presence and the existing managed rule-version marker. Pin historical maker participation changes, legacy paid links versus newer allocations, released reservations, and zero/negative adjustments to the existing finance summaries on identical fixtures. Missing source attribution yields a review issue, not a second entitlement.
- [ ] Seed 201 makers, more than 50 payments and more than 100 detail rows. Assert aggregate totals cover every eligible record; cursor pages have no overlaps/omissions and do not change totals. Do not build aggregates from `getManagedFinanceWorkspace`'s first-page display limits.
- [ ] Test missing table/column, read failure, unsafe aggregate at driver boundary and concurrent source changes. Assert unavailable sections never become zero. Confirm all related aggregates/rows use a consistent all-SELECT batch or verified adapter snapshot. If a driver can round a SQL SUM before conversion, change that new read query to a proven exact strategy rather than trusting the rounded result.
- [ ] Run `node --import tsx --test tests/accounting-sources.test.ts`; expect failure for absent reader/manifest.
- [ ] Implement table/column readiness as read-only metadata inspection, bounded parameterized source queries and section coverage. Every metric query uses saved source values and explicit date/state/model predicates. Keep posted cash distinct from pending/rejected cash. Do not change the database to satisfy readiness, and do not import write-capable report helpers merely to reuse labels.
- [ ] Repeat the targeted command; expect exit 0, zero financial writes, exact parity with current source calculations and complete pagination. Checkpoint task-only files after review.

## Task 3: Financial projection and source lineage

**Files:** Create `lib/accounting/projection.ts`, `workspace.ts`, `tests/accounting-projection.test.ts`.

**Interfaces:** Consumes `readAccountingSources(...)`; produces `projectAccounting(...)` and `getAccountingWorkspace(...)`.

- [ ] Write failing tests: pending order/commission is not earned; prepared/approved/processing/failed payout is not paid; NPR 1,000 posted collection plus NPR 1,000 remittance remains two stages, never NPR 2,000 revenue; payment settles a payable rather than adding a second expense.
- [ ] Add refund examples with gross refund, restored wallet credit, voided promo/referral discount and separately attributed seller/maker liability. Assert a linked invoice correction does not create another refund. Add gift credit -> wallet lineage and loyalty points separate from paisa. Assert paused/grace-off and unsaved weekly defaults produce no inferred new obligation.
- [ ] Pin historical non-default snapshots unchanged; a saved 10% historical record is displayed as recorded, while the approved new sale-linked model remains 9%/91%. Unknown/fixed-supplier records are separately classified or flagged, never converted to 91% automatically.
- [ ] Assert flow filters do not relabel current balances as historical balances. Assert bank balance, tax payable, operating expenses and net profit remain unavailable. Assert a source failure preserves the valid sections and a visible issue; no grand total adds overlapping cash, liabilities, points and commission.
- [ ] Run `node --import tsx --test tests/accounting-projection.test.ts`; expect failure for absent projection/workspace.
- [ ] Implement pure projection and one observed timestamp per request. Keep source IDs, meaning and basis attached to each row/metric. Derive only operational comparisons with complete lineage; display unexplained differences as review items.
- [ ] Repeat the targeted command and Tasks 1/2 tests; expect exit 0 and deterministic JSON-safe output. Checkpoint task-only files after review.

## Task 4: Server access, GET endpoint and navigation

**Files:** Create `lib/accounting/access.ts`, `app/api/admin/accounting/route.ts`, `tests/accounting-access.test.ts`; modify `lib/admin/navigation.ts` destinations/help/task order only.

**Interfaces:** Consumes Task 3's workspace function and Task 1's parser; produces authenticated GET `/api/admin/accounting` and a Super Admin-only navigation entry.

- [ ] Write failing tests: anonymous API 401; Admin, customer, seller and unrelated Staff cannot read 403; signed-in non-Super page redirects to `/staff-access-denied`; anonymous page goes through the normal sign-in return flow; Super Admin succeeds. Re-read role/permission per request, including a session whose role was revoked. Test direct access as well as hidden navigation.
- [ ] Assert GET returns `Cache-Control: private, no-store`, never exposes destination references, gift codes/hashes, credentials or unnecessary customer fields. Invalid filters/cursors return 400. Unsupported mutation methods return 405. No response is placed in a shared/static cache; use dynamic rendering.
- [ ] Run `node --import tsx --test tests/accounting-access.test.ts`; expect failure for absent guards/route/navigation entry.
- [ ] Implement the access helpers using current identity and staff authorization, with explicit Super Admin + `audit_log.view`. Do not change `rolePermissions`, presets, saved profiles or approval behavior. Existing authentication may accept an invitation/update normal security metadata; tests and browser checks use existing identities and disclose that boundary rather than asserting every metadata table is immutable.
- [ ] Add Accounting to Controls with the existing `analytics` icon and appropriate task help. Implement only GET; derive actor/environment on the server and bind query values. No export or financial action endpoint in this package.
- [ ] Repeat targeted access and existing `tests/staff-access.test.ts`, `tests/staff-access-security.test.ts` using isolated fixtures; expect exit 0 with old work-area access unchanged. Checkpoint task-only files after review.

## Task 5: Read-only workspace and clear page states

**Files:** Create `app/admin/accounting/page.tsx`, `loading.tsx`, `error.tsx`, `components/admin/accounting-workspace.tsx`, its CSS module and `tests/accounting-ui.test.ts`.

**Interfaces:** Consumes `AccountingWorkspace`, `AccountingMetric`, `requireAccountingPageReader()` and the server workspace function. Use query-string GET filters, not a financial form submission.

- [ ] Write failing rendered UI tests for the six sections, Today/7/30/All/custom filters, source references, observation/environment labels, pagination and keyboard navigation. Confirm changing pages preserves the selected filters and totals. Include zero, negative adjustment, long source reference and large exact paisa examples.
- [ ] Assert the bank/expense/tax/profit unavailable copy, partial-query error, retry, confirmed-empty message and date-validation error are distinct. Assert the page contains no publish, accrue, prepare payout, mark paid, issue invoice, claim/redeem, statement import or export action. Never render customer wallet links, product thumbnails or auto-downloaded attachments.
- [ ] Run `node --import tsx --test tests/accounting-ui.test.ts`; expect failure for absent page/components.
- [ ] Implement the page/components with existing UI conventions. Main heading: `Accounting`. Information text: `Read-only operational records. Company books and bank balances are not connected.` Show maker model `Approved sale-linked model: 9% company / 91% maker. Historical amounts use their recorded terms.` Use source links only to reviewed staff finance views; a link must not trigger a mutation.
- [ ] Implement loading/error boundaries and phone-friendly tables/row details. Use no fake data, charts implying full profit, non-working future tabs or default zero bank balances.
- [ ] Repeat targeted UI and Tasks 1-4 tests; expect exit 0. Checkpoint task-only files after review.

## Task 6: Portability, preservation evidence and final review

**Files:** Create `tests/accounting-native-runtime.test.ts`, the dated browser inventory and an execution evidence report under `docs/testing/` or the current task's evidence directory. Do not edit deployment or launcher scripts.

**Interfaces:** Exercises the existing D1-shaped contracts and the declared read-only route/page; no new product interface.

- [ ] Add a native test using `tests/helpers/native-fixture-scope.ts`; validate the disposable scope before lazily importing `lib/runtime/node-bindings.ts`. Refuse retained/local-staging/remote credentials. Default execution must skip the native case unless the existing dedicated fictional MariaDB harness enables it. Seed only that freshly created fixture, never either website's database.
- [ ] Assert D1/MariaDB parity for exact amounts, commercial-model separation, aggregate pagination, missing sources, date boundaries and a consistent read during competing fixture changes. Run with the existing reviewed disposable release harness; record its actual command and result. A skipped native test does not establish hosted parity and remains an acceptance gap until run.
- [ ] Run targeted commands: `node --import tsx --test tests/accounting-contract.test.ts tests/accounting-sources.test.ts tests/accounting-projection.test.ts tests/accounting-access.test.ts tests/accounting-ui.test.ts`. Expect all executed cases pass. Then run `npm run lint`, `npm run typecheck`, `npm run build`; expect exit 0. Review full-suite safety before one `npm test` run; keep retained-site and native opt-ins off outside their dedicated fixture harness and disclose skips.
- [ ] Before browsing, save an inventory for Super/Admin/anonymous boundaries, all period filters, all six sections, source links, positive/zero/negative/unavailable money, loading/retry, full page scrolling, 320/390px widths and desktop, keyboard focus and browser errors. Confirm Git state, existing original-file hashes, local database application-table hashes and uploaded-object hashes without copying secrets. Check port 3018 and its owning process before any launch, then `npm run local:check`; never bypass a failure.
- [ ] Use normal Chrome with existing accounts; let the user sign in if needed and never ask for passwords in chat. Open only reviewed financial pages, do not exercise action buttons or public product/customer-wallet journeys. Render the complete Accounting page at narrow/desktop widths, scroll to the bottom, and save screenshots plus full URLs, expected/actual results and console errors. Return the local Super Admin page to a useful final view.
- [ ] Compare protected original work, financial application tables and upload contents afterward. Distinguish normal runtime/auth/security metadata from business records; preserve and disclose newer work that appears during execution. Any unexpected financial write, changed 9%/91% behavior, hidden rate change or weakened launch check blocks acceptance and is reported before fixes.
- [ ] Review the task-only diff and run an independent finance/code/test review when authorized for implementation. Verify every Review Focus item above has actual test/browser evidence. Final report: Passed / Failed / Not tested, problem reproduction, pre-existing versus introduced status, current local/staging differences, exact commands/exits/skips and remaining limits. Do not call staging verified from local evidence or deploy as a finishing step.

## 4. Foundation acceptance checklist

- [ ] `/admin/accounting` and GET endpoint expose data only to current authorized Super Admin sessions.
- [ ] No new permission grants, schema migrations, source-data repair, accrual or financial writes occur during Accounting reads.
- [ ] Existing 9%/91% model, historical snapshots, refunds, holds, paused loyalty and existing approval protections are unchanged.
- [ ] All eligible records contribute to aggregate totals; visible rows are paginated deterministically and source failures remain explicit.
- [ ] Commission, maker liabilities, customer credits, cash stages and operating profit are not conflated.
- [ ] Each reported amount has a source, date basis, observation time, environment label and defined meaning.
- [ ] D1 tests, hosted compatibility evidence, code checks and actual browser checks are reported accurately, including anything skipped or unverified.
- [ ] Retained financial records/uploads and unrelated work are preserved; no production/deployment action has occurred.

## 5. Later-package planning checklist

The complete scope and acceptance rules are in sections 5-7 of the companion design. Before writing code for each later package:

- [ ] A: record the accountant/owner's mapping, opening-position and formal-book decisions; no artificial balancing adjustment to make missing history fit.
- [ ] B: write the separate bridge plan with exact schema/state machine, event identity, balanced posting rules, receipts and lost-response tests. No external writes until specifically authorized.
- [ ] C: write the expense/purchase plan with real form definitions/history, approvals, attachments, tax configuration and separate payment evidence.
- [ ] D: write the reconciliation plan with reviewed statement import, partial/group matching, duplicate/over-allocation concurrency protection and reversal history.
- [ ] E: write the statements/close plan after external and non-marketplace records are included and reconciled. Identify the authoritative ledger and verify all financial statement examples with the accountant.
- [ ] F: write provider/tax-specific plans only after selection and applicability review. Preserve simulated documents and keep deployment, migrations, posting, tax filing and money transfers separately controlled.

## 6. Self-review and handoff

Planning self-review: verify source-path existence; header/spec links; money/date/interface consistency; one task owns each Review Focus test; no task modifies commercial calculations, saved data, launch protections or production; later decisions are explicitly scoped to later packages. These checks are documentation review, not evidence that the future code works.

Recommended future execution method: subagent-driven implementation with a fresh independent reviewer for each financial boundary, while the main agent retains all server/database control. Native implementation is also possible, followed by an independent whole-change review. Choose the method when implementation is requested; this planning turn runs neither workflow and creates no worktree, commit or deployment.

Current deliverable: this plan and its companion design, ready for review. Implementation, schema application and deployment have not started.
