# Finance & payments — manual receipts, refunds and seller payouts

Status: Finance & payments and its review/reconciliation targets approved on 31 October 2026: complete incoming claim review within 4 staffed hours, first Finance review of eligible payouts/authorized refunds within 1 business day, and business-day reconciliation. D4/D13 bank/identity/payout rules, D15 refunds/recovery and their targets are approved, as are the [D7 manual-payment rules and targets](2026-10-31-manual-payment-rules.md). The [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md) supersedes all former distinct-preparer/approver requirements, including high-value refunds, payouts, COD and recovery/write-off. D9 standard payout purpose with an optional note is now approved; actual named staffing/calendar coverage still needs mapping. Implementation remains on hold until planning is complete and the user explicitly resumes work. No account, money, ledger, notification or deployment is changed.

Related: [master work plan](../plans/2026-10-30-seller-order-response.md), [decision index](../plans/2026-10-30-planning-readiness-review.md), [Overview/shared review](2026-10-30-super-admin-overview-review.md), [Sellers and company-bank scope](2026-10-30-seller-management-workspace.md), [Seller Center](2026-10-30-seller-center-workspace.md), [approved Orders & customer care](2026-10-30-orders-customer-care-workspace.md), [Form Management](2026-10-30-form-management-reliability.md) and [Email delivery](2026-10-30-email-delivery-automation.md).

The [approved cancellation/return supplement](2026-10-31-cancellation-return-rules.md) settles return carriage and attributable original delivery costs, logistics and review conventions. Finance targets and one eligible Super Admin financial authority remain approved. Company-funded no-fault costs must not silently become seller debt. Named coverage and implementation remain outstanding.

The [approved Team & business policies design](2026-10-31-team-business-policies.md) settles D5/D14 responsibilities, temporary full-time coverage, continuous staffed hours, 24 hours per new staff service business day, daily 2 PM payout queue review and 6 PM reconciliation in Nepal time. Actual named coverage/provider availability still needs mapping; exact fixed hours are deferred. Existing D7/D13/D15 authority, targets and saved contractual commitments remain intact.

## 1. Purpose and approved boundaries

Make it clear what money is expected, what has actually arrived, what belongs to customers or sellers, what is approved to pay and what has really been paid. Use one financial record/history per receipt, refund or payout, linked from order care, Seller Management and Seller Center. The interface organizes existing ledgers and necessary manual-payment work; it must not create a second competing accounting record.

Carry forward approved requirements:

- Start with company bank account management and manual payment verification. Customer proof alone cannot mark an order paid. A transfer approval does not move money.
- Keep company receiving/source accounts, customer refund destinations and seller payout beneficiaries distinct. No third-party seller payout account is accepted merely because someone supplied it; Super Admin compares the verified beneficiary with registration/identity evidence and records the ownership basis.
- Verified bank details require a reasoned change request and review. A replacement does not inherit verification; preserve old evidence and historical transfer destinations.
- Preserve original order prices, fee/discount/policy snapshots and actual adjustments. The scheduled 12% fee applies to eligible new orders from the agreed effective time; older orders/refunds retain their recorded terms. No confusing 9/91 or 12/88 pairs.
- Order/case approval, payment verification, seller activation, available earnings and payout completion remain separate. Existing orders continue to have obligations even when new-order acceptance is held.
- Use automatic appropriate notifications, the approved delivery retry/recovery policy, shared bell/inbox read state, private evidence and suppression of duplicate/obsolete reminders.
- QR, gateways, automatic bank feeds, automatic bank matching, bank-file transfer exports and website-triggered transfers remain deferred. This phase records authorized manual activity and its evidence.

Fees, programs & promotions is approved as its own top-level area. Finance shows the recorded calculation and links to the authoritative policy; it does not duplicate fee scheduling or invent tax/accounting policy. No real banking credentials, PINs or OTPs belong in these forms.

## 2. Local evidence and unresolved implementation differences

Read-only local inspection provides these foundations, not proof of current production capability:

| Source | Finding and consequence |
|---|---|
| `lib/db/repositories/payouts.ts`, seller/admin payout components | Registered-seller requests, eligible ledger selection, reserved payout entries, destination snapshots and prepared/approved/processing/paid/failed states already exist. Reuse the records and reconcile their guards rather than build a parallel payout system. |
| prepareSellerPayout, components/admin/payout-actions.tsx | Some source paths permit direct Super Admin preparation/approval, while older payout documentation describes separate people. Amended D13 now permits one eligible Super Admin; later reconcile all source/evidence/permission/version/hold and real bank-outcome checks. Actor equality is not by itself a defect or proof that the full workflow already works. |
| `lib/managed-commerce/payout-operations.ts`, settlement readiness | Inspected managed payout mutations still call a simulation guard. Managed sale-linked readiness uses its own entitlement/refund/dispute model. Preserve live-activation gates; no label change or company bank setup can turn simulated operations into a production payout path. |
| `lib/accounting/workspace.ts` and accounting modules | Existing accounting views project source records. Keep source links and distinguish balances, reserves, liabilities and receipts instead of summing overlapping views. |
| Order/return/cancellation sources | Payment, original allocation, case, refund and fulfillment facts already exist. The inspected order path includes COD; this review did not establish an end-to-end live manual bank-transfer checkout. That path needs implementation verification before being offered. |
| Earlier payout documentation | Numeric defaults such as 9%, hold/reserve periods and payout minimum are historical descriptions, not newly approved Finance settings. Read current versioned policy later and preserve each order's saved basis. |

No bank statement, production account, real receipt, ledger balance, transfer or SMTP delivery was inspected this turn. Before implementation, inventory actual runtime/schema/route support and reconcile paused work with these requirements. Missing financial data must produce Needs review / Unavailable, never fabricated zero or Paid.

## 3. Finance workspace layout

Recommend one area with these focused views:

| View | Work managed here |
|---|---|
| Overview & needs attention | Incoming claims waiting review, unmatched receipts, approved refunds awaiting action, payout approvals, failed/uncertain transfers and reconciliation exceptions. |
| Incoming payments | Issued payment instructions, customer claims, bank receipts and their explicit order allocations. |
| Refunds | Approved customer obligations, remaining approval, secure destination verification, manual transfer progress and confirmed outcome. |
| Seller payouts | Requests, eligible/held balances, preparation, Super Admin decision, processing and confirmed payment. |
| Company bank accounts | Ownership evidence, permitted purpose, verification, active instruction version, restricted changes and history. |
| Reconciliation & records | Bank movements, COD collection/remittance, allocation differences, linked adjustments and permitted reports/exports. |

Use shared Assigned to me, Unassigned, Waiting and Completed filters, plus account, seller/order, currency, date, commercial route and status. Each row shows reference, amount/currency, subject, source, owner, next action, due time and evidence status. Staff can open the full review workspace without losing filters or unsaved notes.

Summary cards must distinguish Claims awaiting review from Verified receipts; Seller eligible earnings from Reserved for payout; Approved refunds from Refunds completed; and Customer cash collected from COD remitted to the company. Include date/as-of/source and currency. Never present total sales, bank cash or company-held customer funds as free company profit or seller-available cash. No claimed live bank balance when the last check was manual.

## 4. Company bank account management

The user supplied HASTA BAZAAR PRIVATE LIMITED, Nabil Bank, Birgunj Branch, account ending 3252. This is user-supplied information, not verified ownership evidence. Keep the full account number out of repository planning documents; capture it later only through the restricted record. Company identity settings alone are not a bank connection.

Planned record: account holder, bank/branch, account number, currency, permitted receiving/payment-source purpose, private ownership evidence, reviewer/date/reference and history. Suggested states are Draft, Awaiting verification, Verified and Inactive. Verification and enabling an account for new customer instructions are distinct actions. Mask ordinary summaries; full details are visible only to the seller/customer/staff role that legitimately needs those particular details.

Super Admin verifies company ownership and manages account versions. An account used to receive a customer payment is not automatically a seller beneficiary or refund destination. Full account evidence stays restricted; ordinary order/support staff and sellers receive the necessary payment/readiness result, not the company statement.

New instructions use the currently verified, enabled account. Each order keeps the exact account version, currency, amount/reference and instructions issued. Editing or disabling the account stops its use for new instructions; it does not rewrite historic instructions, erase credits arriving at the old account or silently redirect an already-started payment. Route late receipts and any corrective customer notice to explicit review. Reverification is required for a changed account, with no copied Verified label.

Payment-source account verification is also separate from business authorization for a particular outgoing refund/payout. The website will not store bank-login credentials or initiate transfers in this phase.

## 5. Manual customer payment verification

The recommended journey is: **issued instructions → customer payment claim → staff compares actual bank receipt → explicit allocation/confirmation → valid next order step**.

1. Offer manual bank transfer only once the real order/payment/reservation path is ready and the receiving account is verified/enabled. Show amount/currency, bank details, unique reference, supported payment deadline and realistic review timing. This is not a production feature toggle during planning.
2. Customer enters payment date/reference and submits supporting proof if available. Show Payment under review and a saved claim reference. Preserve drafts/uploads and allow clarification without duplicate claims. A receipt image, transaction text or customer assertion is evidence to inspect, not confirmation of company receipt.
3. Authorized staff open one side-by-side review: original order/current payable balance, issued instructions, customer claim and an independently checked actual bank credit. Record account, transaction identity/date, amount/currency, source evidence, allocation and review reason.
4. Use Confirm received payment only after the real receipt is identified and matching/allocation rules pass. Recheck current order state, prior allocations/refunds, permissions, amount/currency and receipt identity atomically. Record the actual saved outcome; an uncertain response uses the same request identity and outcome lookup.
5. Need information / Unable to match gives the customer a specific correction and leaves the claim actionable. Rejecting a claim does not delete a real bank receipt. Keep independently confirmed but unmatched money in the receipt/reconciliation queue until assigned a proper disposition.
6. Release preparation only when the order's actual payment/readiness conditions pass. Payment confirmation cannot reopen a cancelled order, revive unavailable stock, override seller restrictions or bypass other commercial checks. The approved seller 6/12-hour response clock starts only on actual release.

Use an authoritative receipt record, not an attachment as the allocation identity. Reference strings may repeat across banks/accounts; match source account and reliable transaction evidence and route ambiguous matches for review. Repeated uploads, different customer claims and concurrent reviewers must not allocate the same credit twice. Explicit split allocations must total no more than the actual available receipt; order allocations cannot exceed the permitted payable amount without recording excess separately.

Bank-side status matters: a scheduled transfer or pending bank notification is not a confirmed credit. Record the bank's actual completed/credited outcome before payment confirmation; uncertain or pending evidence stays under review. Later reversals remain possible and must use the linked correction/exception path rather than deleting the receipt.

A payer name differing from the customer is a review fact, not automatic proof of fraud or a reason to pretend money was not received. Customer payer matching is distinct from the user's prohibition on unrelated seller payout beneficiaries. Record an auditable matching basis without inventing mandatory personal banking evidence unrelated to the case.

## 6. Payment states and exceptions

Keep Claim state, Receipt state, Allocation/payment state and Fulfillment readiness distinct. Customer wording can be simpler while reflecting the real result: Awaiting payment, Payment under review, More information needed, Payment confirmed, Refund under review, Refund processing or Refund completed. Staff also need Unmatched receipt, Partially allocated, Confirmation needed and Reversed/adjusted where supported.

| Exception | Recommended treatment awaiting approval |
|---|---|
| Partial payment | Record the actual receipt and remaining due; keep fulfillment held until full valid payment unless an explicitly supported partial-fulfillment policy is selected. Never mark the full order paid from a smaller credit. |
| Excess payment | Allocate only the valid payable amount; record the excess as money requiring resolution. Request a reviewed refund or other explicitly authorized disposition; do not book it as revenue or assume wallet credit. |
| Duplicate claim | Link to the existing receipt/claim outcome. If the bank genuinely received two credits, preserve both and review the extra credit separately. |
| Unmatched / wrong account / currency mismatch | Preserve evidence and actual money records, assign an exception owner and seek clarification. No guessed currency conversion or silent reassignment to another customer. |
| Payment after expiry/cancellation | Record the credit, retain the closed order and open resolution/refund review. A new order or other allocation requires an explicit supported decision and available stock; never silently reopen. |
| Bank reversal or corrected confirmation | Append a linked reversal/correction, reevaluate dependent fulfillment and unexecuted payout exposure, and escalate any already-dispatched/already-paid obligation. Preserve original receipts and decisions. |
| Missing stock after money arrives | Record the money and create customer-care resolution. Payment cannot fabricate stock or fulfillment; offer supported options with the customer. |

Payment expiry and reservation are approved in [D7](2026-10-31-manual-payment-rules.md#5-approved-payment-deadline-and-stock-reservation): 24 elapsed hours to pay, one reminder 6 hours before the original deadline, and one fixed four-staffed-hour buffer for a timely unresolved claim or verified partial payment. Enforce the cutoff by authoritative timestamps even if the expiry worker is late. Release stock once at the applicable limit if still unconfirmed, retaining real credits/claims for resolution. No repeated extension, duplicate tender restoration or silent reopening. Implementation and later verification remain outstanding.

COD collection and company remittance remain separate. [Approved D7](2026-10-31-manual-payment-rules.md#8-cod-collection-and-company-remittance) requires actual receipt/allocation review under amended single-Super-Admin authority, distinct bank cash and evidenced approved carrier fees, and no automatic advance of unremitted COD for new sale-linked payouts under applicable accepted terms. All fixed-supply and other independent contractual due dates/required funding remain protected. Customer refunds retain approved D15 company funding. These policies are approved; execution remains held.

## 7. Refund workspace and manual payment

Use the approved Orders & customer care case as the refund's source. Cancellation or return review records the permitted scope, reason, responsibility and approved amount. Finance sees the same refund record and remaining authorizations; it does not open a second refund because the task arrived in another queue.

The review shows customer/order/item context, actual captured receipts and other tender, prior refunds, reserved refund obligations, original discount/fee allocation, proposed item/delivery/service-fee amounts and the valid remaining refundable amount. Confirm the approved policy for each component rather than reflexively refunding the original gross total. Wallet restoration and bank refund are separate effects and must not compensate the same amount twice.

Planned steps:

1. Confirm the case/financial approval and standard/high-value permissions. High-value refunds retain explicit eligible Super Admin approval; under the [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md) that person may also prepare/propose the refund. Ordinary Finance permission or assignment does not bypass the Super Admin requirement.
2. Verify the customer refund destination under the approved secure process. Prefer the original source where supported; exceptions require a documented owner-authorized matching basis and appropriate reviewer. Do not infer a refund beneficiary from the seller payout account or company receiving account. The [approved D7 destination and execution rules](2026-10-31-manual-payment-rules.md#7-refund-destination-approval-and-actual-completion) now details original/alternate destinations, authenticated authority, Super Admin verification, Super Admin packet approval and actual outcomes; the same eligible Super Admin may prepare and approve.
3. Reserve the approved refundable amount for this obligation so another case/cancellation cannot refund it concurrently. Show Ready for payment only after all required decisions and destination checks pass.
4. An authorized operator records Processing and performs the approved transfer through the bank outside the website. Record source account version, recipient/destination version, amount/currency, date and bank reference/evidence. The app action does not send money.
5. Confirm the actual bank outcome before marking Refund completed and applying the corresponding paid/part-refunded record and ledger adjustments. Support sees the result and customers receive one truthful status update.

An uncertain bank outcome is Confirmation needed, not automatically Failed. Keep the amount reserved and reconcile bank evidence before another transfer. A confirmed failure can return to an authorized retry/reapproval flow, preserving attempts and the same obligation. Email retries or a failed save after a real transfer must never trigger another bank payment. Reversals append corrections and a follow-up obligation; they do not delete the first payment.

Refund payment estimates follow the applicable saved policy and bank-operation evidence; no new guaranteed settlement time is introduced by a staff review target. The case remains actionable until its required financial/physical outcome is actually complete.

### Refund after the seller was already paid — explicit recovery decision

An approved refund can arise after seller payout or while that payout's bank outcome is uncertain. Preserve the actual paid payout and any uncertain reserved transfer; neither becomes unused funds merely because a refund is owed. Determine the responsible party from the approved case, not automatically from seller ownership.

Approved policy under D15: fulfill a valid authorized customer refund under its applicable policy through an authorized company funding source, while tracking seller/carrier/other-party recovery separately. Customer refund progress must not be falsely marked complete or silently held waiting for future seller sales. If funding is unavailable, show an owned urgent Finance/Super Admin exception and truthful customer update; approval is not permission to overdraw or promise payment without funding.

Use the existing original-route seller refund debits/managed refund offsets exactly once. Show a negative or recoverable balance explicitly, with source case, original order policy, responsibility, adjustments and recovery owner. Do not hide debt by clamping every report to zero, debit a seller bank account automatically, or offset another seller's balance. Netting future eligible earnings requires an explicitly approved recovery policy in the applicable model; do not cross registered/managed or unrelated obligations without an authorized documented allocation. A new recovery record must not double-charge the same refund already represented in the native ledger.

If future eligible earnings cannot cover the amount, retain a separate owned recovery/reconciliation case for authorized collection, dispute or write-off decisions. Record any recovered money as settlement of that receivable, not new sales or a second customer refund. The user approved company funding, permitted same-model future-earnings recovery and explicit Super Admin authority for uncovered balances/company absorption under the single-Super-Admin amendment under D15. Applicable agreement authority and implementation still need verification before enabling this path.

Approved D15 detail: [refunds after seller payouts and recovery](2026-10-31-refunds-after-payout-recovery.md) covers funding, responsibility, future-earnings/repayment, disputes, closure, uncertain/returned payouts and follow-up targets. The user approved the workflow and all targets on 31 October 2026; named staffing/calendar mapping and implementation remain outstanding.

## 8. Seller earnings and payout preparation

Seller Center shows **Pending earnings, Held, Available for payout, Reserved/in progress and Paid**, with definitions, as-of time and safe links to the seller's own records. Show reasons and next owners for holds, not a generic Cannot withdraw. Do not double count reserved amounts as still available or combine amounts from different currencies/models as one spendable balance.

Use native registered-seller ledger calculations, sale-linked Managed Maker entitlements or fixed supplier obligations according to the recorded commercial route. One interface may organize them, but an order item/earning source must never accrue or be paid through two models. Unsupported/simulated routes stay explicitly unavailable for real transfer until the approved activation work proves the real paths. Adding a company bank account cannot waive that gate.

Eligibility uses actual earned/delivery/payment evidence, original fee basis, hold/reserve maturity, applicable open-return/dispute/refund adjustments, already-paid/reserved amounts, verified beneficiary and current permissions/restrictions. Do not assume old documentation's numeric minimum or hold defaults are current. Show the policy version and per-entry basis. A future 12% fee applies only to appropriate new orders, not retroactively at payout time.

D9 approved by the user on 31 October 2026: use **Request available payout**, showing the server-calculated eligible amount and verified masked beneficiary. Record the standard normal payout purpose automatically and offer a separate optional note; a blank note must not block a normal request. Keep explicit seller submission, one active relevant request, audit history and safe retries. If the balance changes before preparation, show the actual prepared amount and reason; the preview is not a transfer promise. This changes normal seller request wording only, not evidence, readiness, holds, review, bank execution or required reasons for exceptional actions.

Finance preparation selects eligible unallocated entries, snapshots the amount/composition/period, beneficiary evidence version and reviewer note, and reserves them exactly once. Current native preparation selects all eligible entries; arbitrary partial payout amounts or bulk payment files are not implied by this redesign. If a partial/disputed balance cannot be safely separated with current records, show the blocking source and reconciliation task instead of forcing payout.

### Standard payout request — D9 approved

Display the normal purpose as read-only context; do not make sellers select from invented categories or write a repetitive justification. The proposed display copy is Purpose: Seller earnings payout, Note, and Request available payout. Treat absent or whitespace-only note as empty; allow a short note up to the existing 500-character bound, without the old eight-character minimum. Do not fabricate a seller-written note to satisfy the old parser. Preserve historical notes and record the structured purpose with the request. Client, API, repository and native/form-contract validation must all accept the approved optional-note behavior when implemented. Repeated submits or a lost response reuse the request identity and show the existing outcome. This change does not permit arbitrary payout amounts, automatic transfers, bypassing a verified beneficiary or removing reasons from bank changes, disputes and staff financial decisions.

## 9. Payout review, execution and beneficiary changes

Approved D13 flow: **seller request → Finance or Super Admin preparation → eligible Super Admin decision → manual bank processing → confirmed paid record**. One eligible Super Admin may perform all stages. Rejecting preparation records a reason and releases eligible reservations through an audited native transition; it does not delete their history. Do not release allocations for a possibly executed transfer merely because the app has no confirmation yet.

| Approval approach | Tradeoff / decision |
|---|---|
| Finance or Super Admin prepares; an eligible Super Admin approves | Approved current rule: the same eligible Super Admin may prepare, approve, manually execute and record. Evidence, permissions, holds, caps and genuine personal conflicts still apply. |
| Additional staff review | Optional when available; not a prerequisite for ordinary covered finance actions. Preserve actual actors and decisions, not a fabricated second review. |

The user approved [bank/identity changes and payout approval](2026-10-31-bank-identity-changes-payout-approval.md), then explicitly superseded the original different-person rule with the [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md). D13 is settled as amended; one eligible Super Admin is sufficient. Bank privacy and legacy unsent/sent treatment remain. Product/commercial publication permission does not itself grant financial authority.

Super Admin review compares registration/legal identity and the reviewed seller beneficiary, amount/entries, holds, prior payouts and destination version. Name similarity alone is not ownership verification; ambiguous business/trade-name relationships need documented review. A relative/friend/unrelated person's account must not be accepted for seller payouts. The company Nabil receiving account is not a substitute seller destination.

Before recording a new transfer, recheck the approval, available reserved amount, current beneficiary validity, relevant refund/reversal/dispute facts and source-account authorization. If a new refund/hold changes eligibility after preparation, re-review/reprepare the affected unpaid obligation with history rather than paying the stale preview. Do not rewrite a paid payout or silently substitute another destination under an old approval.

For an outgoing transfer, record amount/currency, source/destination versions, date, bank transaction identity and evidence. Paid means the corresponding bank payment was confirmed. Show Processing, Failed and Confirmation needed distinctly; a bank reference text alone without outcome verification must not become a trusted completion shortcut.

Approved D4 bank-change policy: the [detailed rules](2026-10-31-bank-identity-changes-payout-approval.md#5-pending-payouts-status-by-status-policy) pause new/unexecuted payouts from submitted bank changes, including bank-proof refresh. Retain requests/reservations until audited disposition, then prepare a fresh packet and obtain eligible Super Admin approval, which may be by its preparer. Sent/uncertain money stays tied to its original destination and reserved until reconciliation; truthful completed-transfer recording remains available. Material identity changes also pause new orders. Ordinary bank changes allow ordering only while applicable current identity/route readiness remains valid. Rejection/withdrawal needs explicit safe old-record/hold disposition. First change triage within 1 business day is approved; named coverage and implementation remain outstanding.

## 10. Reconciliation, corrections and records

Recommend a dated reconciliation queue for each company account/currency and COD remittance source. Compare actual bank entries with recorded receipts, allocations, refunds, payouts, fees and internal account transfers. A transfer between company accounts is movement of the same company cash, not new customer revenue or another seller earning.

Each bank movement should have one source identity and explicit allocations/dispositions. A batch bank movement may map to documented multiple underlying obligations only with matching total and beneficiary evidence; a label alone is not proof that every seller was paid. Do not silently add bulk bank-transfer tooling to support this matching.

Flag unallocated money, missing bank confirmations, duplicates, partial remittances, bank charges, reversed receipts and differences. Record the reviewer, statement/transaction reference, period, unmatched balance and next owner. If the statement is incomplete or unavailable, show that limitation rather than Reconciled. A manual bank balance is dated and source-labelled.

Use existing accounting projections to provide traceable order/item, receipt, fee, refund and payout reports. Historical corrections are linked adjustments/reversals with permission and reason; no direct editing of totals to make a report balance. Exports respect role, date/currency and private-data controls; ordinary summaries do not include full bank numbers/evidence. No new statutory/tax filing claim or automated bank-feed integration is made here.

## 11. Authority, service targets, notifications and reliability

D7 receipt/refund/COD authority, deadlines, exceptions and targets are approved in the [manual payment rules](2026-10-31-manual-payment-rules.md#3-records-and-staff-authority), with the [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md). D13/D15 funding, privacy, evidence and personal-conflict boundaries remain. Map actual role identifiers and coverage later; one eligible Super Admin can perform every covered finance stage.

| Role/scope | Permitted work to define |
|---|---|
| Seller / customer | Their own permitted request, proof/clarification and status views. Cannot verify company credits, approve payouts or mark transfers paid. |
| Authorized Finance reviewer | Review bank receipts, allocate under limits, prepare refunds/payouts and perform assigned reconciliation. Full evidence access is purpose-limited; exact delegated confirmation/completion permissions need agreement. |
| Super Admin | Company-bank changes, seller-beneficiary verification, specified approvals/exceptions and Finance oversight. May prepare, approve, execute manually and record under amended D7/D13/D15; no mandatory second Super Admin. |
| Order/support staff | Case decision within permissions and safe linked financial result; ordinary support access does not grant bank-evidence or transfer authority. |

Never expand full seller bank evidence access beyond the already approved Super Admin boundary without an explicit decision. A payment operator's need for executable destination details and a finance preparer's masked reference must be mapped precisely, not assumed from their job title. Assignment and a new navigation section do not grant additional permissions.

Finance service targets approved on 31 October 2026, distinct from the approved order/case targets: review a complete incoming payment claim within 4 staffed hours; first review of a complete eligible payout request or fully authorized refund awaiting Finance within 1 business day; reconcile active bank/COD records each business day. These measure review/action, not arrival of money. Define working hours, holidays, coverage and the next visible update before making them customer/seller promises. At a missed target, create one owned Finance escalation visible to Super Admin; do not automatically verify, refund, approve or transfer because time expired. These target durations are approved; named coverage and calendar configuration remain to be mapped.

Committed events notify the correct customer, seller or assigned staff: claim submitted/clarification/confirmation, refund approval/progress/completion, payout request/decision/completion, account-change outcome and unresolved reconciliation issue. One shared event links back to the actual record. Emails contain safe references/status and secure links, not bank statements, full account numbers or private verification documents. The bell and inbox share read state.

Follow the approved automatic mail retry/recovery schedule; retries update existing delivery jobs. Resolved clarification/exception tasks suppress obsolete reminders even during worker races; new genuine events can notify. A mail failure never rolls back a financial decision or triggers a money retry. Known sent events are not repeated merely because unread; uncertain provider outcomes need reconciliation.

Use the approved stable core-form design: necessary amount/destination/state/evidence requirements remain native, supplementary optional fields cannot disable legitimate financial work and failures preserve permitted notes/uploads. Recheck permissions, source versions, reservation/receipt balances and approval scope at every authoritative mutation. Persist request identities and a truthful receipt of the saved result; after a timeout, read that outcome before creating another request. No automatic replay of old queues, imported receipts or historical payout accrual to make a screen appear complete.

## 12. Later walkthroughs and acceptance criteria

| Scenario | Required outcome |
|---|---|
| Company account first added, verified, enabled or replaced | Distinct audited decisions, exact issued instruction version, restricted evidence and no automatic live checkout/bank integration. |
| Genuine matched receipt / only customer screenshot | Independently supported confirmation versus review/clarification; no upload-to-paid shortcut. |
| Repeated claim, reference collision, split receipt and concurrent reviewers | One receipt identity, bounded allocations and one financial outcome; ambiguous matching remains reviewable. |
| Partial/excess/late/wrong-currency/reversed payment | Actual money preserved, correct remaining balance/exception, no fabricated conversion or auto-reopened cancelled order. |
| Payment confirmed with stock/activation/hold changes | Readiness rechecked; no premature fulfillment or seller reminder while action is blocked. |
| COD collected but unremitted | Distinct states; no invented bank cash or silent new payout eligibility. |
| Return/cancellation plus concurrent refund | One refund obligation, total within refundable funds, no duplicated bank/wallet compensation; original order basis retained. |
| Refund/payout approval, bank success, uncertain save or confirmed failure | Correct approval-versus-payment states, reconciliation before any repeat transfer and reservations retained for uncertainty. |
| Valid refund after seller payout or during uncertain payout | Preserve paid/reserved payout facts, fund the customer outcome only through the approved source, record one original-route debit/offset and separately track negative/recoverable balance without cross-seller/model recovery or a duplicate refund. |
| Recovery exceeds future seller earnings | Visible owned exception and authorized recovery/write-off path; no hidden debt, automatic bank debit or falsely completed customer payment. |
| Registered and managed earning paths | No double accrual/payment; live capability proven before enabling a simulation-guarded route; correct source policy displayed. |
| Concurrent payout preparation / new refund or bank change | One reservation, current eligibility, scoped hold/reapproval and no silent destination substitution. |
| Single-Super-Admin authority / optional additional reviewer | Uniform UI/API/data enforcement: one eligible Super Admin can complete all finance stages, including high-value refunds, with unchanged evidence, amount/hold and personal-conflict checks. |
| Payout already sent when beneficiary changes | Reconcile/record the original actual transfer without creating another payout or losing history. |
| Reconciliation and company-account transfers | Complete evidence, no double-counted revenue, unmatched balances remain visible and corrections are auditable. |
| Resolved issue, duplicate notification, outage and recovery | No stale financial reminders or duplicate sends; automatic email recovery never moves money. |
| Missing data, mobile/keyboard, permissions and exports | Truthful state/limitations, recoverable forms, scoped evidence and readable review/action workflow. |

Use fictional receipts/accounts, isolated fixtures, captured mail and simulated payment adapters when implementation resumes. Prove UI → authorization → financial source/reservation → saved outcome → linked order/seller/customer view. No real transfer is a test substitute. Preserve canonical local database/launch safeguards; no seed/reset/migration during planning. Staging release remains held under the latest preference; no production work resumes from approving a design alone. No application tests or live financial checks were performed for this proposal.

Subsequent [D21 category/variant planning](2026-10-31-retail-categories-product-variants.md) now includes new retail/resale and real sellable offers. Finance, receipts, invoices, refunds and settlement must retain the purchased variant/pack quantity and its original money/fee allocations; no pooled parent price or mutable current option label may replace those facts. This adds no new fee, transfer or approval authority.

## 13. Settled decisions and remaining implementation mapping

- D7 is approved: [manual payment rules](2026-10-31-manual-payment-rules.md) and exception/overdue-remittance targets, under the single-Super-Admin amendment. Later map permissions, actual bank/carrier evidence and coverage; no repeated policy approval is required.
- D9 is settled: the user approved the standard payout purpose with an optional note on 31 October 2026. Later implementation must reconcile the old required-note parser without changing historical requests.
- D14: operating rules and existing targets are approved. Use the approved Team continuous service clock and daily 2 PM payout review/6 PM reconciliation, while preserving prior calendar commitments and actual provider availability. Map eligible owners/backups. A review target is not a bank transfer completion guarantee.

Finance & payments, D4/D13 bank/identity/payout rules, D15 refund/recovery and D7 manual-payment rules and targets are approved. The [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md) expressly governs all these financial approvals. D9 request wording is approved; actual D5/D14 account/provider mapping remains open; the Team operating policy and temporary calendar are approved. Implementation remains on hold until planning is complete and the user resumes work.
