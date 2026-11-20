# Refunds after seller payouts and recovery

Status: approved for the work plan, 31 October 2026. The user explicitly approved the D15 refund and recovery workflow and its follow-up targets after approving the [bank/identity rules, payout approval and one-business-day first-review target](2026-10-31-bank-identity-changes-payout-approval.md). The policy and target durations below are settled; the later [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md) supersedes the former distinct-preparer/approver requirement for funding, recovery and closure. Implementation remains on hold until planning is complete and the user resumes work. This document does not issue a refund, create a debt, collect money, change a balance, send a notification or authorize a deployment.

The [approved cancellation/return supplement](2026-10-31-cancellation-return-rules.md) settles return cost responsibility and inspection/logistics rules. It does not amend approved D15 customer funding or recovery authority. Only actual attributable authorized exposure becomes recovery; company-funded no-fault carriage/delivery and duplicate postage reimbursement must not create automatic seller debt.

## 1. Approved approach

Fund a valid, authorized customer refund from available, authorized company funds without making the customer wait for seller repayment. Keep the customer refund and recovery from the responsible party as separate, linked workflows. A refund is not automatically a debt for the full amount against the seller.

Recover only the approved amount supported by the original order, settlement model, accepted agreement and responsibility decision. Use an existing native refund debit or entitlement reversal once; a recovery case explains and reconciles that adjustment rather than charging it again. The original payout remains an accurate record of money actually sent.

Apply an approved recovery plan against eligible future net earnings for the same seller, commercial model and currency, up to the outstanding amount, where the applicable agreement permits this. Otherwise use a verified repayment or a separately approved repayment arrangement. Do not debit the seller's bank automatically, add interest/penalties, or use another seller's balance. No earnings does not automatically mean suspension or write-off.

Waiting for seller repayment before every customer refund would make customer resolution depend on an unrelated collection delay. Automatically deducting every customer refund from a seller would ignore platform/carrier responsibility and original financial allocations. The approved separation preserves both customer resolution and an explainable seller balance.

## 2. Relationship to approved work and source findings

This extends [Finance & payments](2026-10-30-finance-payments-workspace.md), [Orders & customer care](2026-10-30-orders-customer-care-workspace.md), [bank/identity changes and payout approval](2026-10-31-bank-identity-changes-payout-approval.md), and [fee publication and discount rules](2026-10-31-fee-publication-schedules-combinations.md). It does not reopen their settled business rules.

Read-only source inspection found:

| Source | Consequence for the later build |
| --- | --- |
| `lib/db/repositories/returns.ts` | Refund approval records a responsibility party, original item/delivery allocations and commission base. Paid seller-liable registered refunds can already create a seller ledger debit. There is also high-value review and credit/promotion aftercare; do not implement a second refund outside these paths. |
| `lib/db/repositories/payouts.ts` | Registered ledger totals can be negative; commission reversals use refund identity and original eligibility. Recovery must reconcile existing entries and reservations, not add another negative entry for the same obligation. |
| `lib/managed-makers/settlement.ts`, `lib/db/repositories/managed-settlements.ts` | Managed sale-linked refunds reverse recorded platform retention and maker entitlement from the original eligible base. A refund may therefore reduce an entitlement that was already paid. |
| `lib/managed-commerce/fixed-supply.ts` | Fixed-supply obligations have their own authorized adjustments. A customer retail refund is not automatically a percentage-based deduction from a fixed supplier price. |
| `lib/managed-commerce/refund-readiness.ts`, `lib/managed-commerce/settlement-readiness.ts` | Open/refunded cases, reconciled adjustments and original payment/delivery evidence affect settlement eligibility. Recovery must respect these guards. |
| `lib/db/repositories/platform-service-fee-refunds.ts` | Customer service-fee refunds have a separate collected-fee cap and platform-liability record. They must not be folded into a seller debt or paid twice. |

These observations are not proof that the complete approved recovery, Super Admin review or live transfer workflow already works. D18 must map all native paths, including legacy records, rounding, cancellations, partial returns, benefits and fixed-supply adjustments, before implementation can be called verified.

## 3. Keep three linked records and clear states

One approved order/return/cancellation case owns the customer refund obligation. Finance must open that obligation rather than creating a duplicate refund.

1. **Customer refund:** approved / waiting for funding or details / ready / processing / outcome uncertain / completed / confirmed failed or corrected. Keep actual cash and restored credit components separate. Completed means the required financial effects really occurred, not merely that someone approved them.
2. **Original seller payout:** its original amount, destination/version, reservation, approval, execution and confirmed outcome. Never turn a paid payout into an unpaid one to explain a later refund.
3. **Recovery case:** provisional exposure / ready for Super Admin decision / open / disputed / repayment plan / partly recovered / recovered / closed with company absorbing the balance. Show any bank-outcome uncertainty as a blocker. Customer refund completion does not imply recovery completion.

The recovery record includes original order/item/case/refund references, responsible party and evidence, original commercial model and rates, native adjustment references, confirmed amount, funding source, approved method/terms basis, recovered amounts by method, disputed amount, remaining amount, owner, next action/date and history. “Closed with company absorbing the balance” is visibly different from “Recovered.”

Refund approval can create provisional exposure and a scoped reservation to stop affected money being paid out twice. Confirm collectible recovery only for the actually completed refund components, after the responsibility/amount decision and original payout/ledger reconciliation are sufficient to establish what remains owed. An approved but unpaid, failed or uncertain customer refund is not proof that money has been returned. Do not collect a speculative balance while simultaneously retaining the same seller money as an unsettled payout reservation.

## 4. Amount and responsibility

Use the saved order and approved case allocations, not the current catalogue price, current commission rate or an operator-entered total without evidence. Old orders retain their recorded 9% or other historical rate; the later 12% rate does not rewrite them.

- Determine responsibility for the refunded merchandise and any allowed delivery/other charge separately. Platform mistakes, carrier responsibility and platform-funded benefits do not automatically become seller debt. Buyer-responsibility decisions follow the approved return policy and do not create a new unapproved charge against a customer.
- Restore original wallet/credit and refund the authorized cash component through their proper paths once. A promotional discount is not cash to refund a second time. Preserve the approved benefit/refund policy, including its budget/use rules.
- Reverse eligible original commission/retention according to the recorded order and refund scope. Reconcile a native seller debit or managed entitlement adjustment with the approved responsibility decision; if a native adjustment would leave the seller bearing a platform-owned cost, record the authorized compensating allocation rather than silently treating the native debit as proof of liability.
- Fixed-supply liability follows the accepted supply obligation and approved adjustment, not the retail price or the sale-linked percentage example below.
- Mixed responsibility must have explicit component/party allocations whose totals reconcile to the approved case. Preserve one customer refund obligation. If the native route cannot represent the required allocation, keep recovery blocked for that scope and company funding/exception ownership explicit until an authorized supported allocation exists; do not assign the whole amount to the seller as a shortcut.
- Partial refunds, earlier recoveries and rounding must be cumulative and bounded by the original refundable/liable components. Do not collect both a carrier reimbursement and the same seller liability for one cost. A later reimbursement requires reconciliation of any seller amount already collected.

Example, with no delivery, tax, discount, credit or other adjustments: an item sold for NPR 1,000 at a recorded 12% commission paid the seller NPR 880. If a full merchandise refund is approved, the seller is responsible under the applicable policy, and the original NPR 120 commission is fully reversed, the company refunds NPR 1,000 and the net seller recovery is NPR 880. The NPR 120 fee reversal is not another seller charge. The equivalent original 9% order would use NPR 910, not NPR 880. This example is not a formula for mixed-tender, fixed-supply or platform/carrier-liable cases.

## 5. What happens to pending and already-paid payouts

| Actual payout position | Required treatment |
| --- | --- |
| Not prepared or provably not sent | Hold the affected amount/scope; retain existing reservations until an audited disposition. Recalculate after the refund adjustment and prepare a fresh packet with eligible Super Admin approval; the same Super Admin may prepare it. Use the unpaid earnings once; do not demand cash repayment of money the seller never received. Any additional confirmed deficit is separately explained. |
| Sent, processing or outcome unknown | Keep the original destination and reservation, investigate with the bank and block a replacement transfer. Show recovery exposure as provisional for the uncertain amount. An authorized customer refund can still be company-funded, but do not also count the uncertain payout reserve as recovered money. Unrelated confirmed exposure can be handled separately. |
| Confirmed paid | Preserve the payout as paid. After the valid refund and responsibility/ledger reconciliation, recover the confirmed remaining seller share under the approved recovery plan. |
| Confirmed not sent/no debit, or debit confirmed returned | Reconcile the actual evidence, reservation and native refund adjustment first. A released reservation is not a new cash receipt. Reduce/cancel exposure attributable to the transfer that did not remain with the seller, and calculate any residual amount from the full ledger. |
| Money returns after repayment or netting has begun | Apply the returned amount to the original exposure once, stop further collection at the correct balance, and identify any over-recovery. Restore the seller's entitlement/credit or return the excess through an authorized Super Admin-reviewed disposition. Do not book it as revenue or silently reuse it for another case. |

Apply the approved D4/D13 rules to every surviving/reprepared payout: an eligible Super Admin must approve and may also be the preparer, an approval is bound to the current packet/bank versions, and the payment outcome is reconciled. Holding or changing a record cannot recall a bank instruction already sent. A late actual payment must still be recorded truthfully.

## 6. Customer funding and refund execution

Finance or an eligible Super Admin prepares the approved refund with the available company source, destination verification requirement, amount/currency, prior/reserved refunds and current bank outcome. For an after-payout company-funded refund, an eligible Super Admin authorizes the funding allocation, including one they prepared. This is a separate funding decision linked to the existing customer refund, not a new refund case.

Use only an authorized company account and available funds; do not treat a ledger balance, an unsettled COD collection, another seller's reserved money or an expected repayment as cash available to send. For now transfers are manual outside the website. QR/gateway integration stays deferred. Keep the approved standard/high-value refund safeguards, conflict checks, exact destination and execution permissions; the [approved D7 manual-payment rules](2026-10-31-manual-payment-rules.md) detail destination/receipt/completion authority under the single-Super-Admin amendment and cannot be bypassed by this approved design.

If funding is insufficient, create an urgent owned Finance/Super Admin exception, show the real blocker and a next customer update, and arrange an authorized funding decision. Do not falsely mark the refund completed, silently wait for seller sales, automatically overdraw or reassign held funds. The approved one-business-day initial review target is an action target, not a guarantee of bank settlement or available cash.

Reserve the refundable obligation before execution. A confirmed failure may be corrected and retried only after reconciliation shows no completed transfer. A timeout, pending bank result or uncertain outcome remains reserved; inspect the original instruction rather than send a second refund. Email/retry jobs never execute bank transfers. A later reversal of a customer refund appends a correction and re-evaluates recovery: return/credit any seller amount no longer owed or retain it only against the still-valid obligation with an explicit authorized disposition.

## 7. Recovering an approved balance

### A. Apply eligible future earnings

Apply netting up to the lesser of the approved outstanding recovery and eligible, unreserved, undisputed net earnings for the same legal seller, commercial model and currency. The applicable accepted agreement must permit it and the seller must have an itemized notice available before the first application. Approval of this design is not retrospective consent for an old agreement. If the required authority is absent, do not silently net; use an approved repayment arrangement or resolve the terms/authority first.

Super Admin approves the recovery method and cap once. Later eligible earnings can be applied deterministically within that approved plan, with a recorded allocation and refreshed statement, rather than staff repeatedly creating deductions. Use oldest approved open case first unless an explicitly approved installment/priority allocation says otherwise; stop at each cap. Any changed liability, disputed amount or plan needs a fresh decision. No automatic external bank debit occurs.

Exclude uncertain payout reserves, earnings still in return/delivery/payment holds, disputed ownership, and amounts allocated to another case. A bank-details-only payout hold does not itself authorize or prohibit internal recovery: it may proceed only under the already-approved plan while the same verified legal identity and eligible earnings remain valid. Material identity/ownership uncertainty pauses affected netting until resolved. Ordinary bank verification still blocks an external payout under D4.

Show gross eligible earnings, normal recorded fees/adjustments, recovery applied and the remaining amount available for payout. If a native negative ledger/entitlement adjustment already produces that net result, link and allocate it; never subtract the recovery case again. If the route cannot isolate disputed or unauthorized deductions from its current automatic balance calculation, it needs a reconciliation/hold path before payouts resume, not an accidental netting that bypasses the decision.

Example: NPR 880 confirmed recovery and NPR 500 eligible net earnings allow NPR 500 to be applied once and leave NPR 380 outstanding. No payout is available from those same NPR 500. The recovery statement and native financial balance must agree. Later surplus belongs to the seller and remains payable subject to normal checks.

### B. Seller repayment to the company

Provide the approved company receiving account and a unique case reference in a secure seller view. The seller submits a payment reference/evidence; this is a claim, not proof of receipt. Finance matches the actual company bank credit, payer attribution, currency, amount and prior allocations. An eligible Super Admin confirms allocation to the case. Unknown/duplicate/third-party attribution goes to an owned exception rather than silently crediting the wrong seller.

Allocate each actual receipt only once. Record the corresponding settlement of the existing native recovery adjustment so the seller is not still charged via future earnings. A screenshot, email or retry cannot itself clear the balance. Preserve the receipt and handling of any unallocated excess. The company receiving account is not substituted for the seller's verified payout beneficiary.

### C. No earnings, installments or a dispute

Offer a reasoned repayment proposal with amount, dates, method and contact details. An eligible Super Admin can approve an installment plan; its dates/amounts, treatment of future earnings and next follow-up must be explicit. Installments and automatic earnings applications cannot each collect the full amount independently.

A seller can challenge the calculation with evidence. Pause new recovery/collection for the disputed portion and protect the relevant eligible amount pending review; undisputed authorized recovery can continue. The valid customer refund continues independently. Show the seller what is being held, why and when to expect an update. If the decision is reduced or overturned, restore/return the over-collected portion and keep a correction history. Do not charge a fee for disputing it or treat silence as evidence of fault.

Keep dashboard access, support, product preparation and otherwise-valid new orders available. An outstanding recovery alone is not an automatic ban. Fraud, invalid identity, unsafe goods or a genuine inability to fulfill goes through the existing reasoned restriction workflow; do not manufacture a disciplinary status to make a balance disappear. Existing orders keep their original terms and allowed handling.

## 8. Approval and closure

Finance or an eligible Super Admin prepares the responsibility reconciliation, recovery method and amendment/closure. An eligible Super Admin explicitly approves a collectible recovery plan, amount change, repayment arrangement, return of over-recovery, company absorption/write-off and section 6 funding. The same Super Admin may prepare, approve, execute where applicable and record all these actions; another reviewer is optional. Preserve personal-beneficiary conflicts, evidence, caps and truthful history. Existing standard/high-value refund authority and the [approved D7 execution mapping](2026-10-31-manual-payment-rules.md#7-refund-destination-approval-and-actual-completion) apply, with no mandatory separate-person gate.

Routine allocations within an approved plan do not require repeated approval of the same debt; guard the current cap, case state, identity, terms authority and eligible money each time. Manual receipt allocation must use actual matched bank evidence and the stated Super Admin authority. Full bank details remain restricted to eligible Super Admins; ordinary Finance queues use masked references and safe evidence summaries.

No automatic write-off merely because a balance is old, small or the seller has no sales. A company-absorption decision records amount, reason, collection attempts/dispute evidence, actual preparer and eligible Super Admin approver, who may be the same person. It closes further collection for that amount and records a company-borne cost; it is not a payment or “Recovered.” A separate accounting provision does not by itself close the operational claim. No later collection of a closed amount without a new explicit authorized decision and appropriate notice. An unexpected receipt after closure remains unallocated pending an owned disposition; do not quietly restart netting.

## 9. Visibility, follow-up and notifications

Add **Refunds & recoveries** within Finance, linked from Orders and the seller record, not a disconnected approval queue. Show customer refund progress, original payout outcome and recovery progress side by side. Filters: awaiting funding, uncertain bank result, awaiting recovery approval, disputed, awaiting seller response, repayment due/overdue, partly recovered, closed. Every exception has an owner, backup and next action.

Seller **Earnings & payouts** shows the original order/payout, itemized adjustment, amount recovered/remaining, repayment instructions or agreement, next date and **Request a review**. Public customers see their own refund status and realistic next update; private seller debt, bank evidence and disciplinary details are not public.

Recovery follow-up targets approved on 31 October 2026, separate from the approved bank/identity target:

- Review a completed recovery/dispute submission within 1 business day; this is initial review, not guaranteed resolution.
- Ask for a seller response or repayment proposal within 7 calendar days of the initial itemized recovery notice. Send one reminder after 3 calendar days only if action is still outstanding. This is not automatic acceptance of liability or a fixed deadline for repaying the full balance.
- At day 7 without the needed response, create an owned Finance/Super Admin follow-up due within 1 business day. Subsequent installment amounts and due dates come from the approved arrangement. An overdue installment creates one actionable follow-up, with a case-specific next-update date rather than daily duplicate demands.
- Review unresolved funding, uncertain transfers and recovery exceptions in the approved daily reconciliation workflow. Urgent compromise/overpayment is surfaced immediately; do not wait for the ordinary response window.

Start the response window only once the notice is available in the seller inbox and the delivery system has a successful email handoff or staff records actual contact; read status is not proof of action and provider acceptance is not proof of reading. If delivery is stalled, show contact follow-up to staff and keep the case owned rather than falsely marking the seller late. Explain any staff-recorded contact and deadline change in history. Use calendar days for the 3/7-day reminders, Nepal time for displayed deadlines and the still-to-be-configured approved business calendar for staff review targets.

Use the approved automatic email delivery, recovery alerts and bell/inbox shared read status. Before delivery, recheck whether the case is resolved, disputed, paid, superseded or on a current agreed plan. Suppress obsolete reminders and deduplicate by case/event/deadline/recipient; a retry does not create a new demand, recovery allocation or refund. Reading a message alone does not resolve the financial task. Notify meaningful decisions/amount changes with direct secure links and no full bank/PAN/identity details. No notifications are sent during planning.

## 10. Accounting and concurrency invariants

- One economic refund obligation, one bounded customer refund effect and one set of responsibility allocations; link every customer payment, restored credit, native reversal and recovery to them.
- Confirmed recovery balance equals confirmed case liability less actual allocated recoveries and approved reductions/company absorption. Provisional/uncertain portions remain separately visible. Never hide a negative balance by showing only zero payout availability.
- Native ledger/entitlement debit plus recovery explanation is one economic charge. Cash repayment, approved earnings netting, returned payout money and carrier reimbursement share one cap and allocation history. They cannot each recover the same balance.
- A recovery application is atomic with the eligible-money allocation/current case version. Simultaneous payout preparation, installment receipt, refund correction and recovery jobs must not consume the same money or exceed the cap. Native aggregate balances and case allocations must reconcile without double counting either the debit or its settlement.
- Retain historical paid/reserved facts. Unknown transfer results remain reserved until reconciled. A failed label or email timeout is insufficient proof of no debit.
- Never net across sellers, currencies or registered/managed/fixed-supply commercial models under this approved design. Any genuinely needed cross-model allocation requires a separately approved policy and explicit accounting, not inference from a shared login or bank account.
- An operator cannot hide a deficit with an arbitrary balance edit. Every correction has a source event, amount, explanation, actor, permission and immutable history.

## 11. Later rollout and verification

Before a separately authorized cutover, inspect existing refund adjustments, negative balances, pending/sent/uncertain payouts, previously received repayments and outstanding cases read-only. Map a recovery case to the existing adjustment rather than posting the debt again. Do not invent historic consent, approvals, receipts, bank confirmations or missed deadlines. Legacy unmatched amounts get owned reconciliation tasks. Apply the approved new payout-review rules to unexecuted legacy packets; preserve actual sent/paid history.

Current refund-related holds and unsupported allocation paths must be explicit in the release inventory. A legacy negative aggregate is not automatically consent for a new collection program. Give reconciled cases a real notice and prospective response dates at activation; no burst of backdated overdue demands. Do not release unknown reserves to make the new view look balanced.

Later tests must cover one eligible Super Admin preparing/approving/recording funding, recovery and write-off, optional additional review and personal-conflict denial; paid versus unsent/unknown/returned payouts; partial and multiple refunds; old 9% versus new 12%; mixed credit/cash/promotions and separate service-fee refunds; platform/carrier responsibility; fixed-supply versus managed sale-linked versus registered settlement; native debit already present; recovery racing a new payout or repayment; disputed portion versus undisputed balance; insufficient company funds; missing offset authority; partial/duplicate/overpayment; bank-only versus material identity review; changed/overturned liability; refund reversal after collection; approved company absorption and late receipt; recipient privacy; failed/recovered mail and obsolete reminder suppression; and legacy reconciliation without duplicate charges.

Use fictional cases, controlled clocks, captured email and simulated payments when implementation resumes. Do not seed/reset the canonical local database, alter live balances or make bank transfers to test the plan. No application tests, live transactions or deployments are performed for this planning update.

## 12. Decision status

- **Settled:** D4 bank/material identity change rules, D13 single-Super-Admin payout approval, and first bank/identity change triage within 1 business day, approved 31 October 2026. Existing Finance/Orders/fee rules and targets remain approved.
- **Settled — D15:** explicitly approved on 31 October 2026: company funding of authorized after-payout refunds; responsibility-based recovery tied to native adjustments; same-model eligible-earnings netting with actual terms authority; matched repayments/installments/dispute handling; explicit Super Admin recovery/funding/closure decisions under the latest single-Super-Admin amendment; no automatic penalties or write-off; and the follow-up targets in section 9. First recovery/dispute review is within 1 business day; seller response or repayment proposal within 7 calendar days, one day-3 reminder, and staff follow-up within 1 business day after an unanswered day-7 deadline. Repayment dates remain case-specific; named owners/calendar mapping remains open.
- **Also approved:** the [D7 manual-payment rules](2026-10-31-manual-payment-rules.md), including refund destination/execution/receipt authority, payment/COD exceptions and targets, with the single-Super-Admin amendment. D9 standard payout purpose with an optional note is now approved. **Still separate:** D5/D14 named owners, staffing calendar and reconciliation execution; D18 native aftercare compatibility verification.
- **Hold:** all implementation, activation, scheduling, sending, collection, transfers, database work and release remain paused until planning is complete and the user explicitly resumes implementation.
