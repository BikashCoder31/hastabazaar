# Hastabazaar Accounting Section: Design and Delivery Roadmap

Date: 18 October 2026, Nepal time.

Status: proposed setup design. The user requested a detailed plan, preservation of data and the approved 9% company / 91% maker model, and no deployment. This document authorizes no implementation, database operation, money movement or publication.

## 1. Outcome and scope

Give Hastabazaar one Accounting area where an authorized person can trace an amount from a summary to its original order, entitlement, cash record, refund, settlement or supporting document. Extend this in controlled stages to company expenses, accounting exports, reconciliation and accountant-approved financial statements.

The books cover Hastabazaar's company finances, including money held or owed for customers, registered sellers, makers and carriers. They do not become the private business accounts of each independent seller.

The recommended architecture is connected accounting: Hastabazaar remains authoritative for marketplace operations; one accountant-selected bookkeeping system remains authoritative for the formal company books. Start with a provider-neutral reviewed export/import process. No software vendor, subscription, credentials, bank connection or tax treatment is selected by this plan.

The first build is a read-only operational Accounting workspace. It requires no schema migration. It must not present operational commission or maker retention as company net profit. A complete company ledger is a later, separately specified work package.

## 2. Fresh source evidence

Planning baseline: commit `1addd7e9d60ace09e111d30ad5d4a8140998ecc6` in `C:/Users/abinash/Desktop/HastaBazaar`, checked on 18 October. Existing modified files are `AGENTS.md`, `LOCAL-START.md`, `README.md`, `scripts/start-local.mjs`; `qa-test-accounts.json` is existing untracked work. Preserve all five. Do not read or export test-account credentials.

| Existing records | Current source / tables | Accounting use and boundary |
| --- | --- | --- |
| Orders, items and payments | `db/schema.ts`; `orders`, `order_items`, `payments` | Commercial snapshots and cash due; placing an order alone is not earned income or confirmed bank cash. |
| Registered-seller commission | `lib/db/repositories/commission-reporting.ts`; seller ledger and item snapshots | Separate earned, reversed and pending commission; existing query excludes managed items. Its date filter is order-placement date, not a general-ledger posting date. |
| Registered-seller settlement | `lib/db/repositories/payouts.ts`; `seller_ledger_entries`, `payouts`, `payout_entries`, `payout_events`, `payout_requests` | Preserve eligibility, holds, active/released allocations, paid references and signed ledger entries. A payout request or approval is not a transfer. |
| Company-store / maker money | `lib/managed-commerce/payout-operations.ts`, `finance-workspace.ts`; `managed_commercial_snapshots`, `managed_entitlements`, `managed_settlement_entries`, `managed_payouts`, `managed_payout_entries`, `managed_payout_allocations` | Preserve calculated, earned, held, reserved, blocked, payable and paid distinctions, including legacy allocation paths. Include historical maker money after a seller changes participation route. |
| Maker split and reversals | `lib/managed-makers/settlement.ts`; `lib/configuration/commission-defaults.ts` | Existing launch fallback is 900 basis points. Rounding is half-up for the company amount, with the maker receiving the remainder; refunds use original snapshots. |
| COD and delivery | `lib/operations/parcels.ts`; `shipping_parcels`, `parcel_cash_records`, shipping jobs/events | Collection and remittance are distinct. Cash records can be pending, posted or rejected; do not count pending/rejected records as received money. |
| Refunds and liability | `lib/db/repositories/returns.ts`; `refunds`, `refund_liability_entries` | Keep gross return, actual cash refund, restored credit, voided discount and liability attribution separate. Do not subtract the same refund twice. |
| Wallet and referrals | `lib/db/repositories/wallet.ts`, `admin-referrals.ts`; `wallet_accounts`, `wallet_entries`, `referral_redemptions` | Read stored entries only. Wallet reads used by customer pages can release rewards or create accounts; do not call those helpers from Accounting. |
| Promo and loyalty | `lib/db/repositories/incentive-reporting.ts`; `promo_redemptions`, loyalty claims/entries/redemptions/configuration | Count recorded events, with points separate from NPR. Do not promote scheduled settings or infer obligations from an unsaved editor preview. |
| Gift cards | `lib/db/repositories/gift-cards.ts`; `gift_cards` and linked wallet entries | Preserve their recorded promotional/shopping-credit nature. Do not assume cards were sold for cash; trace wallet credit without adding its funding twice. Never export redemption codes or hashes. |
| Invoices and corrections | `lib/db/repositories/managed-documents.ts`; managed invoice groups/adjustments | Existing managed invoices are explicitly simulated and not live tax documents. A document adjustment does not independently move cash or change settlement. |
| Audit and forms | `audit_logs`, form-answer/version records and existing histories | Read existing evidence; do not insert a new business event merely because someone views Accounting. |

Some runtime tables are supplied by custom migrations rather than every table being represented in `db/schema.ts`. The schema manifest must check both sources without executing migrations. Existing Reports in `app/admin/analytics/page.tsx` provides operational totals, not full financial statements.

Previously verified data counts and staging results from 16 October are historical evidence, not a fresh 18 October database inventory. Implementation must observe its own current state read-only. No retained database or staging website was changed to prepare this design.

## 3. Non-negotiable preservation rules

1. Preserve the approved **9% company / 91% maker** sale-linked model. Accounting has no rate editor and cannot update commercial policy. On a recorded eligible base of NPR 1,000, the split is NPR 90 / NPR 910 before other adjustments.
2. Historical records keep their saved rate, rounding, commercial model, agreement and monetary snapshots. Never reprice old orders with today's default. Unsupported or incomplete history becomes a review issue, not an invented 9% calculation.
3. Registered-seller commission and company-store maker retention are different streams. Never include the same item in both. Legacy fixed-supplier obligations keep their original model and attribution.
4. Preserve current hold, reserve, payout, refund, customer-credit and approval rules. Preserve the existing approved single-Super-Admin behavior; this project does not silently tighten or relax existing payout workflows.
5. Loyalty remains paused and grace off. Do not save, publish, promote or enable a schedule. The editor's visible weekly defaults are not accounting events.
6. No reset, seed, restore, replacement database, backup import or automatic accrual/backfill. No import of a live-site backup. Missing schema/data stops the affected report.
7. Preserve `hastabazaar.localProjectRoot`, approved baseline `d9056dc10fee13dc11d15f24a14f63b003befe0b`, canonical folder checks and all launch protections. Never launch the retired Hatskala directory or a historical checkout.
8. Use only `npm run local:check`, then the existing correct server or `npm run dev` / `START-HASTABAZAAR.cmd` when browser work is later authorized. Do not bypass failed readiness. Keep development/local_staging, captured mail and simulated payments.
9. No deployment or production changes. Later schema application, historical accounting imports and external writes need their own concrete reviewed scope; this plan does not authorize them.

## 4. First release: read-only Accounting

New route: `/admin/accounting`; new GET endpoint: `/api/admin/accounting`. Access is initially Super Admin only, enforced on the server and navigation. Reuse the existing `audit_log.view` permission with the explicit Super Admin restriction; change no saved permission profile or preset. Staff delegation is a later reviewed feature.

| View | Required result |
| --- | --- |
| Overview | Recorded seller commission, maker position, paid payouts, posted COD records, refund breakdown and unresolved source issues, each in its own clearly labeled card. No combined revenue/profit/bank-balance card. |
| Sellers | Independent-seller ledger position and payout states, with links to existing finance workflows. |
| Makers | Historical and current maker entitlements, adjustments, holds, reservations and payments; 9%/91% shown as the approved default while recorded amounts remain authoritative. |
| Cash and refunds | Posted collections/remittances and refund components. An unexplained difference is a review item; never assume it is available bank cash. |
| Credits and incentives | Actual stored wallet movements, referral/promo events, loyalty points/redemptions and gift-card records, with source cross-references. |
| Review items | Missing attribution/schema, mismatched source totals, unknown commercial model, negative/unexplained exposure, and unavailable sections. Each item has a source reference and a clear next review step. |

Expected page states: loading, confirmed empty, partially unavailable, validation error and access denied. A failed query displays unavailable, never a manufactured zero. Bank balances, company expenses, tax payable and net profit display **Not connected / Not available** until the relevant later stage is complete.

No exports, attachments, product images, bank feeds, expense-entry forms, new financial mutations or schema changes in this first release. Do not add non-working future menu entries; explain later scope in a short information panel.

### Amounts, dates and trustworthy totals

- NPR amounts travel as signed integer-paisa decimal strings; use BigInt for aggregation and exact formatting. Counts use safe integers. Reject malformed/unsafe numeric input and prevent aggregate overflow before the driver or formatter can silently round it.
- Preserve existing monetary calculations and historical snapshots. Ordinary numeric conversions must not alter amounts. Points are not money and must never be added to NPR totals.
- Period filters: Today, Last 7 days, Last 30 days, All time, custom dates. Derive Today from the request's server clock in `Asia/Kathmandu`, never a fixed verification date. Inclusive displayed end dates become exclusive next-midnight UTC boundaries.
- Default to Overview and Last 30 days. All time covers recorded flow from epoch zero through the request observation time; custom windows require both valid dates. Positions always remain current, regardless of flow filter.
- Flow totals use each source event's recorded timestamp and show that date basis. Source links to the existing Commission screen explain its order-date basis. A current unpaid balance is labeled **Current position observed at ...** and does not pretend to be an historical balance at the selected end date.
- Read aggregate sections through an all-SELECT database batch/snapshot supported by the deployed adapter. Validate D1 and hosted MariaDB behavior in disposable fixtures. If consistent reads cannot be obtained, mark the report unavailable rather than combining incompatible snapshots.
- Aggregate across all applicable records, not the first 20 makers, 50 payments or visible table page. Detail rows use deterministic cursor pagination, 50 by default and 100 maximum. Page changes do not change totals.
- Keep environment, observation time, source coverage and review warnings visible. Local/staging test records cannot silently enter company books. Unknown record classification blocks future posting/export.
- Never call customer wallet/reward-release helpers, earnings-accrual functions, schedule-promotion helpers, invoice issuers, payout operations or product-media delivery from a read route. Existing authentication/session metadata behavior is separate from financial record preservation and must be disclosed in evidence.

## 5. Later delivery packages

Each package gets a separate implementation plan after the previous package passes its acceptance gate. The following is a roadmap, not permission to run future mutations now.

### Package A — accounting policies and opening position

Owner and Nepal accountant confirm: legal entity, formal-book system, AD/BS financial-year boundaries, opening date, approved opening balances, cash/bank accounts, principal-versus-agent treatment for each commercial model, chart of accounts, expense/tax treatment, and treatment of promotional credit/points. Registration and contracts determine tax treatment; the 9%/91% commercial split alone does not decide gross-versus-net revenue presentation.

Proposed account families: cash/bank; courier/customer receivables; seller and maker payables with held/available subaccounts; supplier/refund obligations; customer credit obligations where applicable; tax control accounts; commission/company-store revenue; purchase/cost accounts; delivery and operating expenses; capital, loans and retained results. The accountant approves which accounts actually apply.

Acceptance: a versioned mapping sheet identifies every supported source event, its debit/credit accounts, recognition trigger, date basis, funding party and reversal rule. Unsupported events are explicitly blocked. Missing opening evidence is not plugged into income or an unexplained balancing account. These decisions do not block read-only foundation work.

### Package B — reviewed accounting bridge

Add a provider-neutral proposal/export layer, using additive tables tested only in disposable databases until a retained-environment upgrade is separately authorized. Proposed records: `accounting_policy_versions`, `accounting_batches`, `accounting_batch_items`, `accounting_posting_lines`, `accounting_receipts`, `accounting_audit_events`. Names are new proposed tables, not claims about existing schema.

Each batch item records environment/company, source kind/ID/revision digest, original event time, observed time, mapping version, amounts and source references. Balanced posting lines are a proposal/mirror for the selected formal-book system, not a second competing general ledger. Source-event identity is unique across batches and retry attempts. Changed intent under the same identity is a conflict. Late events, source edits and corrections create review items or explicit linked reversal/replacement batches.

Initial exchange is a reviewed CSV/JSON package with manifest, digest, period and row count. Protect against spreadsheet formulas and unsafe filenames; omit credentials, bank account details, gift codes and unnecessary customer data. The state machine is draft -> validated -> approved -> exported -> acknowledged, with rejected/reconciled exceptions. Downloading or exporting is not proof of posting, payment or tax filing. Record an external journal ID/receipt before marking acknowledged; retries must reconcile the same batch, never create a second journal.

Acceptance: journal debits equal credits per batch/currency; every item links to source evidence; retries, crashes and lost responses do not duplicate a posting; external corrections return with traceable references. The system never calls payout/refund APIs to fix an accounting difference.

### Package C — expenses and purchases

Add company bill capture with supplier, invoice/reference, incurred date, due date, category, net/tax/gross amount, currency, funding account, cost centre, note and receipt attachment. Stages: draft -> submitted -> approved -> exported/acknowledged; payment has its own evidence and status. Paid purchases, unpaid bills, staff reimbursements, capital purchases, loans and owner drawings need separate classifications.

Recommended new records: `accounting_expense_documents`, `accounting_expense_lines`, `accounting_attachments`, `accounting_expense_events`. Enforce duplicate supplier/reference detection, controlled corrections, optimistic versions, idempotent requests, authorization at commit time and an audit trail. Apply receipt access/validation/retention rules. Extend the existing form catalog and history only when these new forms are implemented; do not republish existing forms.

Acceptance: a bill and its later payment do not count as two expenses; rejected/draft bills never become posted costs; receipt replacement preserves history; no automatic bank transfer or payroll/payment service is introduced.

### Package D — cash, bank and carrier reconciliation

Start with manual, reviewed statement files; no bank credentials or live feeds. Store statement hash, bank/account alias, coverage dates, signed entries, provider references and import audit. Imports go through preview -> validate -> approve -> record. Require company/environment boundaries, bounded file sizes, duplicate file/line detection and private attachment access.

Recommended new records: `accounting_statement_imports`, `accounting_statement_lines`, `accounting_matches`, `accounting_match_events`. Matching supports one-to-many and many-to-one settlement batches, partial remittances, separately evidenced fees, refunds, reversals and unmatched items. References/dates/amounts suggest matches; an operator confirms them. Do not auto-clear solely because amounts match. A match cannot allocate more than the remaining amount, including competing requests. Unmatching is an audited reversal.

Acceptance: collection, remittance, bank receipt and fees reconcile without duplicate income; unmatched items remain visible; recording a match does not mark an order/payout paid or alter the original cash record.

### Package E — full company reports and period close

Import or query approved balances and journals from the one formal-book system, including opening balances, expenses, capital, loans, taxes and external manual adjustments. Record statement source, mapping version, coverage and reconciliation status. An internal projection is labeled incomplete until all these sources reconcile.

Deliver profit and loss, balance sheet, cash-flow report, trial balance, general-ledger drill-down, aged receivables/payables, settlement reconciliations, expense breakdowns and audit exports. Distinguish accounting profit from available cash and contractual payable balances. Implement draft/reviewed/closed period states, late-entry review and authorized reopen history; corrections never silently modify a closed period.

Acceptance: accountant-approved examples match to the paisa, trial balance balances, closing reports tie to source/externally acknowledged journals, and external adjustments do not disappear from the in-app view. Do not derive a statutory P&L by subtracting a few expenses from the Commission screen.

### Package F — external connector and tax documents

After the formal-book system is selected, replace reviewed file exchange with its supported API only if useful. A separate connector plan must cover scoped credentials, secret storage, receipt verification, retries, rate limits, outages and recovery without duplicate postings. No connector may transfer money unless separately requested and designed.

Real tax invoicing is a separate launch gate: accountant-confirmed PAN/VAT/withholding applicability, numbering, legal issuer, financial year, credit/debit notes and applicable IRD electronic-billing requirements. Existing simulated documents remain marked simulated. Never remove their warning, relabel historical simulations as legal invoices or use current tax rules to rewrite old records.

Acceptance: approved sandbox/fixture examples and accountant review, followed by a separately authorized deployment and upgrade procedure. No tax filing, external posting or deployment is part of this planning request.

## 6. Event classification examples

| Event | Operational Accounting view | Later book bridge |
| --- | --- | --- |
| Order placed | Pending order and saved commercial amounts | No automatic earned-income posting just because an order exists. |
| Sale meets its saved earning conditions | Existing commission or maker entitlement, once | Mapping depends on the approved model/recognition policy. |
| Posted COD collection | Customer collection record | Recognize the appropriate collection/control position; not a second sale. |
| Posted remittance / bank receipt | Separate recorded stages | Settle the relevant clearing/receivable balances; identify fees separately. |
| Seller/maker payment | Confirmed paid event and source allocation | Reduce payable and cash/clearing; do not record a second purchase/expense. |
| Refund / cancellation | Original components, cash/credit/discount and liability references | Linked reversal/adjustment using original values; never infer cash from gross refund. |
| Reserve/hold changes | Restricted versus available obligation | Reclassification where applicable, not new revenue. |
| Wallet, promo, points, gift credit | Stored movements and funding lineage | Approved policy decides recognition; points are never converted using an unsaved preview. |
| Invoice credit/debit note | Document evidence | Do not post a second refund where the financial event already represents it. |

## 7. Historical data and cutover

Keep existing records in place. The foundation displays history directly with no import. Before any later accounting cutover, produce a dry-run inventory of supported, duplicate, missing and ambiguous events, including transition-era maker records and original rates. The owner/accountant then chooses a reviewed opening position plus post-cutover events, or an explicitly reviewed historical event export. Never combine both for the same period/source and double count them.

Store a manifest of included source IDs/digests, exclusions, mapping version, opening date, opening balances and external book references. Records predating cutover remain accessible as operational history even if they are not exported as journals. Unsupported history stays in the exception queue. Reconciliation must be complete before calling opening books approved.

Any future schema addition is additive, with D1/MariaDB parity and verified preservation of existing constraints/triggers. Do not change startup readiness or add accounting tables as a mandatory launch requirement before a separately reviewed upgrade exists. Rollback disables the new feature and preserves additive accounting history; it does not restore an older database over newer work.

## 8. Evidence, acceptance and execution boundaries

First-release acceptance: Super Admin-only access; every amount links to a source; all relevant records included beyond pagination; correct Nepal windows; separate models and cash stages; honest unavailable states; zero financial/application-setting mutations on reads; no uploads created; no publish/pay/accrue buttons; existing launch guards untouched.

Every later package requires fixture tests for its own writes, duplicate/replay/concurrency cases, database portability, role revocation and preservation. Real records are for authorized read-only checks, not end-to-end mutation fixtures. Build/test results must be fresh and skips disclosed. The 16 October verification report is a baseline reference, not a substitute for future verification.

No calendar estimate is promised before package sizing and accountant decisions. Deliver in independently reviewable packages; do not make first-release visibility depend on a complete ERP, payroll engine, automated bank feed, tax filing or vendor connector.

Next implementable package: [Accounting read-only foundation plan](../plans/2026-10-18-accounting-section.md). This design and its plan must be reviewed before implementation; neither document is permission to deploy or modify retained databases.

## References

- Current source paths listed in section 2; read these before historical documentation where behavior differs.
- [IFRS Foundation: principal versus agent, IFRS 15](https://www.ifrs.org/news-and-events/updates/ifric/2022/ifric-update-april-2022/): control and contractual facts affect gross/net revenue presentation. This does not decide which accounting framework applies to Hastabazaar.
- [Nepal IRD: electronic invoicing guidance](https://ird.gov.np/category/electronic-invoice/): confirm the rules applicable to the company before live tax invoicing.
- [Cloudflare D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/): prepared/batched reads; validate equivalent hosted-adapter behavior in fixtures.
