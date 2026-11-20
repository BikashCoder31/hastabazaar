# Orders & customer care — response, delays, cancellations and returns

Status: Orders & customer care approved by the user on 30 October 2026, including the 2-hour staff follow-up after escalation, 24-hour Super Admin checkpoint, 24-hour first return/complaint review and 48-hour clarification target with a reminder after 24 hours. Approval covers the workspace, scoped response/delay/cancellation/return workflows and truthful financial handoffs. Detailed D6/D11/D12 cancellation/return rules and timings were approved on 31 October 2026 in the linked supplement. Named coverage and actual source/carrier/capability mapping remain outstanding. Implementation remains on hold until planning is complete and the user explicitly resumes work. This document does not change orders, money, stock, cases, notifications, scheduled jobs or production configuration.

Related: [master work plan](../plans/2026-10-30-seller-order-response.md), [decision index](../plans/2026-10-30-planning-readiness-review.md), [Overview and shared review](2026-10-30-super-admin-overview-review.md), [Sellers](2026-10-30-seller-management-workspace.md), [Products & storefront](2026-10-30-products-storefront-workspace.md), [Seller Center](2026-10-30-seller-center-workspace.md), [Email delivery](2026-10-30-email-delivery-automation.md) and [Form Management](2026-10-30-form-management-reliability.md).

The [approved cancellation and return supplement](2026-10-31-cancellation-return-rules.md), approved on 31 October, settles cutoffs, custom/prepaid handling, hold reasons, return costs, logistics and timing conventions below. It preserves earlier target durations and financial authority. Named coverage and later implementation remain outstanding; implementation remains on hold.

The [approved Team & business policies design](2026-10-31-team-business-policies.md) settles eligible owners/backups, full-time coverage and temporary continuous service clocks. Exact fixed hours are deferred. Routing/calendar rules never pause or reset these approved elapsed order/case/cancellation targets. Named coverage and implementation remain outstanding.

## 1. Purpose and boundaries

Give customer care one place to see an order, understand which seller/fulfiller must act, resolve problems and keep the customer informed. Sellers see only their own responsibilities. Customers see clear progress, affected items and the next promised update, without private staff notes or conflicting statuses.

Carry forward approved requirements:

- New actionable orders create seller email and dashboard/bell notifications. Remind an inactive seller after **6 hours** and escalate to admin after **12 hours**, both from the same actionable time for that seller's portion. These are not sequential 6-plus-12-hour waits.
- Keep seller portions independent. Start preparation clocks only after required payment/COD confirmation and other actual preparation blockers are cleared. Dashboard access and permitted existing-order work continue when a new-order terms hold applies.
- Inform the customer when their order is delayed. The factual notice/escalation approach and follow-up targets below are approved. The order-response clock uses elapsed hours displayed in Nepal time; named coverage and customer commitment configuration still need final mapping.
- Use shared task ownership, role-controlled review, exact current records and permanent decision history. Reading a notification or opening an order is not completion.
- Send appropriate notices automatically; use the approved retry/recovery schedule and Super Admin outage/recovery signals. Stop obsolete reminders when the issue is addressed and prevent duplicates. No routine manual email batches.
- Keep historic order prices, product details, policy/fee snapshots and amounts accurate. New 12% terms must not recalculate older orders or their refunds.
- Manual company payments/refunds remain evidence-based recorded operations. QR, payment gateways, automatic bank feeds, website-triggered transfers and new carrier integrations remain outside this phase.

This proposal does not introduce automatic cancellation for seller silence, automatic refunds, new return rights/windows, seller penalties or a language/public-content policy redesign. Such behavior needs an explicit decision where it differs from current approved policy.

## 2. Existing foundations and evidence limits

Read-only local inspection found these reusable paths; none was exercised against real orders:

| Existing source | Planning implication |
|---|---|
| `lib/db/repositories/fulfillment.ts`, seller fulfillment component | Item-level fulfillment, seller Start packing / Ready for pickup, staff actions and company-preparation paths already exist. The current seller component requires uniform item states and can say no action is required for mixed states; design eligible item/group actions with an honest explanation instead. |
| `lib/orders/first-cod-review.ts` | Required COD confirmation blocks fulfillment. A seller-response clock must begin at actual release to preparation, not blindly at checkout. |
| `lib/cancellation/repository.ts` and `accounting.ts` | Native cancellation previews select seller portions/parcels, preserve monetary allocations and check current fulfillment/cash state. Prepaid orders require staff review; custom/uncertain packing can require review. Do not promise arbitrary item-quantity cancellation from a seller-portion operation. |
| `lib/db/repositories/returns.ts`, return validation/presentation and admin routes | Item/quantity cases, seller recommendations, staff review, separate high-value approval and physical/refund operations already exist. Review, refund and payment completion are distinct. Preserve existing problem-item review paths and optional photo evidence. |
| `docs/architecture/returns-refunds-complaints.md` | Describes immutable policy snapshots, separate complaint cases, historical independent high-value approval wording, manual refund evidence and no guessed payment/carrier integration. The later single-Super-Admin amendment supersedes its separate-person approval wording. Thresholds and deployment claims need current verification before release. |
| `lib/orders/progress.ts` | Contains broad order-level progress copy, including cancellation/COD wording. The redesign must show actual payment and partial-order context rather than using one generic sentence for every payment mode. |

The older [fulfillment architecture](../../architecture/order-fulfillment.md) describes a whole-order cancellation cutoff that differs from the newer seller-portion repository. Reconcile actual routes and policies before implementation; do not treat old prose as proof of deployed behavior. The [returns architecture](../../architecture/returns-refunds-complaints.md) is a baseline, not a fresh legal/policy or production audit. No runtime behavior, customer receipt or mail delivery was tested in this planning turn.

## 3. One Orders & customer care workspace

Continue the approved approach of shared records with focused queues, rather than a separate support system that copies orders. Keep order fulfillment, payment, cancellation and support-case states distinct while presenting them together. Reuse existing native modules; a new live-chat service or carrier/payment integration is not required for this interface plan.

| View | Primary work |
|---|---|
| Needs attention | Unanswered seller portions, overdue preparation/pickup/delivery, payment/COD holds, cancellation requests, unresolved cases and failed refund handoffs. |
| All orders | Search by order/reference, customer through authorized access, seller, dates, payment mode, fulfillment and case state. |
| Preparation & delivery | Waiting on seller/company, preparing, ready, pickup/transit exceptions and delivered portions, with existing shipment/tracking links. |
| Cancellations | Requested, reviewing, waiting for evidence, approved/executed or rejected; affected scope and financial consequences visible. |
| Returns & replacements | Item/quantity cases, evidence, seller response, return movement, receipt/inspection, replacement/refund handoff and completion. |
| Complaints & follow-up | Order-wide/item-specific concerns, missed updates, safety issues, assigned investigation and escalations. |

Reuse Overview's Assigned to me, Unassigned, Waiting and Completed task filters, plus department/owner/due-time filters. Each row shows reference, affected seller/items or parcel, problem, current owner, next action, due time, age and money-at-issue only for permitted staff. Display order counts, seller-portion counts and case counts with distinct labels; one order can have several issues without becoming several orders.

Normal priority: urgent safety/access/payment incidents first, then overdue promises and unresolved escalation tasks, then ordinary fulfillment/review. Overdue tasks keep their original age when reassigned. Assignment does not grant permission or make another seller's data visible.

## 4. Order workspace and clear customer view

The persistent order header shows reference/date, payment state, overall fulfillment summary and open issues. Give each seller/fulfiller portion its own card: items/quantities, recorded prices/options, preparation start and promise, shipment state, current owner and next action. A late portion must not mark delivered portions undelivered or prevent another seller's permitted preparation/dispatch.

Use focused panels for Items & fulfillment, Delivery, Payment/refund summary, Cases & messages and History. Keep appropriate customer contact/address details behind role checks. Seller views receive only information needed for their actual fulfillment duty; return/complaint views must not expose contact data currently omitted from those APIs. Payment receipts, bank destinations and internal notes are not shared merely because someone can see an order.

Customer-facing order tracking should show:

- Order received / Awaiting payment verification or COD confirmation, where applicable, with the next action; no preparation promise before release.
- Being prepared, Ready for pickup, On the way and Delivered based on real item/parcel progress. Show partial shipments/deliveries explicitly.
- A separate payment label, such as Payment under review, COD due, Payment confirmed or Refund processing, based on the authoritative financial record.
- Any affected items, factual delay message, confirmed revised estimate if one exists, next update time and a secure Contact support / Request cancellation / Report an issue action where permitted.

Do not call an order late solely because an email failed. Do not show Refund completed when a return is merely approved, or No payment due for a partial cancellation with remaining COD items. Keep public messages free of seller disciplinary reasons and bank evidence. No new language policy is introduced.

## 5. Seller response and preparation

Seller Center Orders shows Action needed first, followed by Preparing, Ready, In transit, Completed, Cancelled and Cases. The order detail links directly from bell/email to the relevant seller portion. It offers Start preparation (mapped to the native packing transition), Ready for pickup, Report a delay and Cannot fulfill, only where the underlying action is allowed.

Do not add a cosmetic Accept button that clears the timer without actual progress. Viewing the order, reading email, posting a generic note or assigning a task is not a preparation response. Starting legitimate preparation resolves initial no-response work only for the affected items; a structured delay/cannot-fulfill report replaces that affected scope with the appropriate active exception task and owner. It must not falsely mark the items packing or silently eliminate the unresolved customer obligation.

Mixed item states need an eligible group/selection and a preview of exactly what will change, not an unsafe update of every item or a false no-action message. Respect existing transaction/parcel constraints; where finer selection needs backend work, record that dependency. No action marks another seller's items ready.

Approved task scope: keep one seller-portion response task with the currently unanswered eligible item/group set, recording each group's actual actionable time. If item A starts preparation, item B is reported delayed and item C remains untouched, resolve A's response work, move B into its delay task and keep C due from its original actionable time. A hold affecting B cannot pause C. Consolidate the remaining due items into one portion reminder/escalation per applicable milestone rather than one email per item. A later newly released group has its own recorded eligibility start; adding it does not reset or duplicate the older overdue work. Close the initial response task only when no unanswered eligible scope remains; separate delay/hold tasks still require resolution.

Company-managed fulfillment must route its preparation work and timers to the actual company operator. A Managed Maker is not automatically the packing owner merely because their product appears in the order. A seller becoming restricted or missing new terms does not erase existing obligations; use the existing scoped restriction policy and staff takeover/escalation path where seller actions are restricted.

Ready for pickup is not dispatched, and dispatched is not delivered. Preserve supported label, consignment, pickup and delivery evidence. Sellers cannot declare company payment received, invent carrier collection or complete a refund through a status shortcut.

## 6. Response clock, escalation and delays

The 6/12-hour thresholds and elapsed-hour order-response clock are approved, including weekends, with dates/times displayed in Nepal time. They run from the recorded actionable event, not the email delivery/open time or latest page visit. The follow-up targets below are also approved; name the actual staff/backup coverage and configure supported customer commitments before enabling them.

| Moment | Planned action | Decision status |
|---|---|---|
| Seller portion becomes actionable | Notify the responsible seller/fulfiller, show its next action and record the shared timer start. | Approved direction. |
| 6 hours, eligible items still unanswered without corresponding progress/exception work | One relevant seller email and bell/dashboard reminder consolidating the due scope. | Approved threshold and scoped handling above. |
| 12 hours, same unresolved no-response issue | Alert assigned order/support staff, expose it to Super Admin oversight and create/update one escalation task. | Approved threshold; recipient/coverage mapping to finalize. |
| Within 2 hours after escalation | Approved staff target: claim the task, contact the seller and record an actionable result or next follow-up. Requires coverage, not a customer guarantee. | Approved. |
| 24 hours from the original actionable time, still unresolved | Approved Super Admin follow-up: require a named owner and recorded plan to fulfill, clear a legitimate hold, offer a revised option or review cancellation. No automatic cancellation. | Approved. |

Keep original actionable/due timestamps and hold history. Before initial release, payment/COD holds do not run the seller preparation clock. If a legitimate blocking hold is imposed after release, preserve elapsed history, stop messages asking for impossible actions and create a staff-owned hold task. The approved clock direction is to pause only for a recorded authorized preparation blocker and resume the remaining allowance after release; never reset it from zero. Use the approved supplement for permitted hold reasons and map actual authorized owners before implementation; this approval does not permit hiding aged orders.

The approved 24-hour Super Admin checkpoint is an absolute supervision check from the original release, even if a later hold pauses the 6/12-hour response allowances. Route a held portion to its hold owner and describe the actual blocker; never treat the hold period as seller inaction or send that seller an impossible preparation reminder. Initial payment/COD holds have no seller release timestamp and belong in their own payment/confirmation queue with its separately agreed service target.

After preparation starts, monitor the saved preparation/pickup/delivery promises separately. The 6-hour no-response reminder is not a universal reminder every six hours forever, and pressing Start preparation must not prevent later delay detection. Use real item/parcel promises and separate exception identity; where no reliable promise exists, staff must set the next update rather than fabricate an ETA.

Report a delay records affected items, the reason category, private detail and proposed preparation/pickup timing. Cannot fulfill creates an urgent operational review with affected scope and reason. Neither action cancels, substitutes, refunds, extends the customer promise or changes the order price by itself. Staff assess the customer-facing outcome and required choices.

**Approved customer communication direction:** update immediately when a real delay is recorded or a promised milestone is missed. At the 12-hour no-response escalation, send a factual preparation update if the issue remains, even when the final delivery date has not yet been missed: “We are checking preparation of [items]. We will update you by [recorded time].” Do not label an on-time future delivery late without evidence. Never wait until 12 hours to report an already-known delay.

That next-update time must come from an agreed support coverage/commitment rule and have an accountable owner, including when a scheduler creates the escalation without staff online. The supplement approves a 24-elapsed-hour unresolved-update commitment, or an earlier promise; name and verify actual coverage before enabling it. If no supported time can yet be assigned, retain the factual preparation message and support link, flag the missing commitment to staff and do not insert an invented timestamp. This is an exception to repair, not a recurring substitute for the planned follow-up promise.

Present a revised date as an estimate/proposal until supported and, where agreement is needed, the customer's choice is recorded. Preserve the original promise and history. Offer permitted cancellation/support options; do not substitute another product, seller or price without the customer's explicit agreement. Silence or opening a notice is not consent.

Use one coherent customer update for the currently affected portions of the order when the same scan/event discovers them together. Do not wait for another seller to delay an urgent notice. Subsequent material changes or a missed promised update may create a new relevant notice; repeated scans must not resend the same event. If staff cannot resolve the issue, keep a visible next update due time and escalate missed updates rather than repeatedly saying Soon.

## 7. Cancellation: request, preview, decision and actual effect

Show the permitted action based on current fulfillment, payment and policy. Use Cancel selected seller portion only where native eligibility permits immediate customer cancellation; otherwise Request cancellation creates a staff review. A pending request is not a cancelled order. These workflows must use the original order and shared case history, not an unrelated form or email-only request.

| Situation | Approved interface direction and preserved boundary |
|---|---|
| Eligible uncollected COD portion before preparation | Show the native cancellation preview and explicit confirmation; apply only where current rules permit. |
| Preparation underway | Check actual product/custom-work and parcel rules. Route custom or uncertain cases to staff. The approved supplement retains direct eligible unpaid COD cancellation for ordinary packing before Ready. Do not copy an obsolete whole-order cutoff into every path. |
| Ready for pickup, carrier handoff or collection already recorded | Offer staff review/help as applicable; do not run an ordinary pre-dispatch cancellation past its server cutoff. Interception/return-to-origin needs a supported separate path and evidence. |
| Prepaid/verified bank payment, partial collection or disputed receipt | Staff coordinate fulfillment and finance review. Keep real receipt and refundable-balance records; a cancellation cannot simply erase money received. |
| Multi-seller order | Preview the exact selected seller portions, retained portions and charges. Do not cancel unrelated sellers. Arbitrary item/quantity cancellation beyond native scope requires a separate decision and implementation. |
| Delivered item | Use the applicable return/complaint route; do not rewrite delivery as if the order never happened. |

A cancellation preview shows affected products/quantities, remaining items, COD still due, wallet restoration, relevant delivery/discount/service-fee consequences and refund review needed. Derive amounts from saved allocations and current authorized adjustments, not a fresh cart or today's fees. Show fees/compensation only when already supported by the applicable policy; this proposal invents none.

For review, staff see the request, seller/fulfillment facts, customer-visible reason and proposed effects. Confirm with current permissions and fresh order/parcel/payment versions. Recheck any collected cash or handoff racing with cancellation. Save the decision, scope, reason and consistent accounting/stock effects once. A repeated click or uncertain response cannot cancel twice, restore stock twice or create another refund.

The approved direction includes a recorded operational hold on the affected portion while eligible staff review it, with exact cutoffs/scope and 2/24-hour cancellation targets approved in the supplement; named review coverage remains outstanding. Check the hold at the actual dispatch/handoff boundary, give it an owner/deadline, preserve history and leave unrelated portions moving. A mere pending label must not imply that such a hold already exists in current code. Time expiry triggers staff escalation, not silent cancellation, rejection or indefinite unowned blocking.

Stock release uses current reservation rules. Do not immediately make an item saleable merely because it was cancelled after handling/shipping or later returned; inspection/restock controls still apply. Existing receipts, invoices and history remain intact with explicit adjustments. Refund settlement remains a separate finance task until actual completion is evidenced.

## 8. Returns, replacements and complaints

Customer flow: open the order → select the relevant delivered item and quantity → explain the issue and preferred supported resolution → add evidence if available → submit → follow the same case. Keep evidence private, uploads recoverable and photo evidence optional under existing policy. A returnability flag for change-of-mind requests must not automatically block the existing wrong/damaged/defective/problem-item review paths. Missing/late evidence may need manual review rather than a blanket UI rejection.

Use the order's stored policy and item eligibility, correct delivery evidence and previous returned/refunded quantities. Do not apply today's return window retrospectively or extend/shorten it by choosing another seller's delivery date. Where historical records do not provide a reliable item/parcel delivery time, require staff reconciliation rather than inventing a date. Prevent overlapping claims/refunds for the same quantities while permitting supported sequential partial returns.

The case workspace shows original item/options/price, requested quantity, policy basis, evidence, seller's factual response, messages, assigned responsibility, proposed resolution, physical movement and money status. A seller may accept the facts, contest or request information; the authorized reviewer decides. Seller silence or a seller recommendation cannot approve/reject a claim or authorize payment by itself.

Approved review path: assess request → request specific information if needed → approve the applicable refund/replacement/return-to-origin outcome or reject with a clear reason → perform the required physical/financial steps → confirm completion. Handle refund-without-return or another exception only if the actual policy and authorized decision permit it. Preserve explicit eligible Super Admin high-value approval under the [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md); the same eligible Super Admin may propose, approve, execute and record. No second-person requirement remains, while evidence and personal-beneficiary conflicts still apply.

| Separate state | What it means |
|---|---|
| Requested / reviewing / waiting for information | Case is open; no refund or replacement has been executed. |
| Approved outcome / further approval needed | Decision and responsibility are recorded, with remaining authorization shown. Approval alone does not pay money or deliver a replacement. |
| Return arranged / in transit / received | Actual supported return logistics progress. Receipt is not proof the goods passed inspection. |
| Inspection/outcome work | Record relevant quantity/condition, disposition and approved restock or replacement steps. Use existing native states or an explicit later extension, not a cosmetic unsupported status. |
| Refund approved / processing / completed / failed | Financial workflow, separate from the item's delivery and return state. Completion needs actual recorded payment evidence. |
| Resolved / closed | Required outcome is complete and communication is recorded. Unpaid refunds or undelivered promised replacements must remain actionable. |

Approved service targets: first staff review within 24 hours of case submission; where seller/customer clarification is needed, show a specific request and normally a 48-hour response target from that saved information request, with one relevant reminder at 24 hours after the request. Reads, reassignment and mail retries do not reset the source timestamps. Overdue requests escalate to the owner/Super Admin; no automatic rejection, cancellation or refund solely for silence. The linked approved supplement confirms elapsed return/clarification hours and valid exceptions. Name actual staffing before enabling these approved durations. These are distinct from the approved order 6/12-hour reminders and unchanged commission schedule.

Keep actual return windows, refund-processing estimates and high-value thresholds from the applicable approved policy; this document assigns no new numeric entitlement or payment promise. The approved supplement settles company-funded approved return shipping, attributable original delivery refunds, physical-return/inspection handling and review of custom/perishable exceptions. Map actual evidence and any applicable category basis without overriding saved terms or reopening these defaults.

Replacement work links to the original case/item and records the supported stock, shipping and completion evidence. No automatic new charge, invented carrier booking or double stock consumption. Restock only an authorized quantity/condition, once. Keep original delivered status and dedicated return/refund/replacement history; other sellers' portions remain unchanged.

Complaints use their existing case records for item-specific or order-wide issues. Route safety concerns urgently; support can investigate, ask for information, record owner/deadline, escalate and resolve/reopen under permissions. Link related returns, delay and refund work without creating duplicate actions or losing distinct outcomes. Keep a clear customer reply/review path for a disputed resolution; do not invent an appeal deadline or close a payment obligation by marking a complaint resolved.

## 9. Refunds and Finance handoff

Orders & customer care owns the customer issue and communicates the outcome. Finance owns the authorized payment review/execution evidence. Show one linked refund record with amount, basis, remaining approval, owner, status and safe reference; do not create one refund in each workspace.

For manual refunds, verify the correct recipient/destination through the approved secure process, record required approvals, perform the bank transfer outside the website and attach appropriate evidence/reference. Do not use the seller payout account or the company receiving account as a default customer refund destination. Existing architecture says in-app destination capture/verification is not implemented; define the approved operational path before using it for real money.

Before completion, reconcile captured customer funds, earlier refunds/credits, applicable delivery/service-fee amounts and original fee/discount allocations. Preserve wallet and non-cash components rather than refunding the full face value twice. Refund totals must not exceed the valid refundable amount; use the current financial model for responsibility and seller/company ledger adjustments. New fee rates cannot rewrite an old refund basis.

Failed or uncertain transfers remain Failed / Confirmation needed with a finance task. Reconcile a transfer reference and recorded outcome before attempting another payment. Email retry never retries a bank transfer. Mark payment refunded/part-refunded only after the actual corresponding refund is recorded complete. A case may have a refund approved while money is still owed; customers must see that distinction.

## 10. Permissions, notifications and reliable actions

Use existing order, support, standard-refund and high-value-refund permissions; assignment and Super Admin oversight do not grant every staff member every action. Preserve approval permissions under the single-Super-Admin finance amendment; one eligible Super Admin may perform all financial stages. Customer ownership uses authenticated/secure receipt access, not a guessed email/order number. Sellers see only their portion/case, and ordinary order/support access does not reveal private bank documents.

| Event | Notify / resolve |
|---|---|
| Portion released for preparation | Responsible seller/company operator; establish one initial response task. |
| Approved 6-hour reminder / 12-hour escalation | Seller at 6 hours; eligible order/support staff and Super Admin oversight at 12. Recheck actionability and unresolved state before sending. |
| Delay/cannot fulfill or missed promise | Assigned support/operations owner; factual customer update under the chosen rule, with relevant seller action. |
| Cancellation requested/decided/executed | Scoped staff/seller/customer messages describing the actual distinct result; suppress obsolete preparation reminders once cancellation takes effect. |
| Return information requested / response / decision | Relevant customer/seller/reviewer only, linked to that case; resolve the specific information task when valid information arrives, not just when read. |
| Refund/replacement progress or completion | Appropriate customer/support/finance participants with truthful result; no private payment data in ordinary emails. |

Use durable identities per order portion/case, event/version, milestone, recipient and channel. Repeated requests, scans, workers and retries reuse the same work. Resolve only the addressed task: starting preparation can close no-response while an unrelated return or payment incident stays open. Recheck resolution before handoff, cancel queued obsolete reminders and do not recreate them on the next scan. A later genuinely new incident/version gets its own identity.

Keep bell/inbox read state shared; reading does not resolve the source task. Use the approved automatic retry/recovery schedule, outage/recovery alerts and uncertainty reconciliation. If the worker recovers after several milestones, send only currently relevant notices, not a burst of stale reminders; keep original lateness visible. A failed email does not undo a committed order/case action. Previously accepted mail cannot be recalled and must not be resent merely because unread.

Every transition rechecks exact current item/parcel/case/payment state and permissions. Preserve request identities, notes and uploads after an uncertain network outcome; retrieve the recorded result before a new attempt. Apply the approved Form Management reliability design to fulfillment, cancellation and return forms. Editable supplementary questions must not create hidden unrelated blockers or disable safe native actions unnecessarily; genuine financial/state requirements remain enforced.

## 11. Later walkthroughs and completion criteria

| Scenario | Expected result |
|---|---|
| New actionable order / required payment or COD hold | Notify the right fulfiller once; start the seller clock only on actual release. Held work has an owner and clear customer state. |
| 6-hour and 12-hour boundaries / scheduler downtime | Correct milestones from one start time, no hour-18 escalation, no obsolete backlog burst; clock rules and Nepal time display match the chosen policy. |
| Seller starts preparation / reports an exception near dispatch time | Suppress obsolete no-response reminders; retain a genuine delay/exception task. Resolve-before-send and concurrent worker races do not create duplicates. |
| Multiple sellers and mixed item states | Each permitted portion progresses independently; customer sees partial progress; no cross-seller data or mutation. |
| One seller's A starts, B reports delay/receives a hold, C is untouched | Only A's response work resolves; B gets its scoped exception/hold; C retains its original actionable deadline and one consolidated relevant reminder. New eligible scope never resets older unanswered work. |
| Legitimate hold crosses the approved 24-hour checkpoint | Pause only the affected 6/12-hour allowance; Super Admin still sees the aged hold with the correct owner, not a false seller-no-response fault. |
| Company fulfillment / new-terms hold | Actual operator receives work. New-order holds do not erase existing-order tasks or falsely blame an inactive seller for company preparation. |
| Missed preparation/delivery promise | Timely factual customer notice, preserved original promise, next update and assigned owner; no unauthorized replacement or invented ETA. |
| COD cancellation / custom work / prepaid / handoff race | Actual eligible scope, clear immediate-versus-review action and fresh preview; no cancellation beyond current authorization or contradictory cash/parcel facts. |
| Partial cancellation, wallet/discounts and retry | Unaffected portions remain valid; amounts derive from original records; stock, adjustments and events occur once. |
| Cancellation hold expires or seller cannot fulfill | Staff escalation and next action, without automatic cancellation, rejection or duplicate refund. |
| Partial/item return and mixed delivery dates | Correct policy/date/quantity basis, no overlapping claims or automatic rejection for absent photos, other items' delivery remains intact. |
| High-value refund / revoked staff authority | Eligible Super Admin approval including their own prepared packet, current role recheck and personal-conflict protection; no ordinary-staff or assignment-based permission bypass. |
| Return inspection / replacement / restock | Supported physical evidence, correct quantity and once-only stock outcome; no false replacement delivered or case completed. |
| Manual refund approved, failed, uncertain or paid | One finance record; no premature Refunded state, over-refund, duplicated wallet restoration or repeat bank transfer from mail retries. |
| Complaint/case resolution and reopened issue | Exact task resolution, relevant next event when reopened, retained history and outstanding financial obligations. |
| Form/config/network failure and privacy | Recover input safely, make actual blockers clear, secure receipt access and private evidence; mobile/keyboard navigation preserves context. |

Use fictional orders, evidence and controlled clocks with captured mail and simulated payment adapters when implementation resumes. Test the UI, authoritative transitions, saved history, finance effects and recipient-specific views together. Do not mutate/seed canonical local data to pass checks. Staging deployment remains held under the latest release preference; any later production release requires explicit resumption and actual verification. No application tests, live orders or delivery jobs were run for this proposal.

Subsequent [D21 new retail/resale and variants](2026-10-31-retail-categories-product-variants.md) is included in this version. Preserve the purchased offer/option/pack identity through fulfillment, holds, carrier evidence and customer care. Its approved lifecycle adds no unsupported finer cancellation action, automatic exchange or new service target. Historical item/fee/quantity snapshots stay authoritative.

## 12. Remaining decisions and plan status

- D5/D6: order-response timing, scoped hold/pause history, factual customer updates, 2-hour post-escalation staff follow-up and the absolute 24-hour Super Admin checkpoint remain approved. D6 permitted blockers and the 24-hour unresolved-update commitment are approved in the supplement. Name actual D5/D14 owners/backups/coverage; do not reopen approved targets.
- D11: the [approved cancellation/return rules](2026-10-31-cancellation-return-rules.md) settle native portion scope, ordinary packing/Ready and actual-handoff cutoffs, custom/prepaid cases, pending-request holds and 2/24-hour cancellation review targets. Narrower exceptions remain explicit D10 capability mapping; silence never automatically cancels or charges.
- D12: the [approved cancellation/return rules and timings](2026-10-31-cancellation-return-rules.md) settle elapsed 24/48/24-hour case clocks, retained seven/fifteen-day baseline, company-funded approved carriage, attributable original delivery refunds, physical-return/inspection coordination and exceptional remedies. Actual saved terms, applicable rights, refund estimates and high-value authority remain protected. Named coverage and source/carrier mapping remain outstanding.
- D7 manual receipt/refund destination, execution evidence, deadlines, exceptions, COD and targets are approved in the linked supplement, with single-Super-Admin authority. Named staffing/calendar and actual reconciliation evidence still need mapping. No automatic transfer or gateway work is included.

Orders & customer care and its follow-up targets are approved as recorded above. D6/D11/D12 policy details and timings are also approved; named coverage and actual source/carrier/capability mapping remain open. Finance & payments with its targets and Fees, programs & promotions were approved on 31 October 2026; the [fee publication, scheduled replacement and combination rules](2026-10-31-fee-publication-schedules-combinations.md) are also approved, preserving original order calculations. Implementation remains on hold until planning is complete and the user resumes work.

The user approved [refunds after seller payouts and recovery](2026-10-31-refunds-after-payout-recovery.md) under D15 on 31 October 2026: company funding, original responsibility, native adjustments counted once, uncertain/returned payouts and separately tracked recovery. Keep the same authorized customer refund obligation; a seller debt or collection dispute does not itself cancel it. All recovery follow-up targets are approved; named staffing/calendar mapping remains. Implementation remains on hold.

The [approved D7 manual-payment rules](2026-10-31-manual-payment-rules.md) cover bank receipt verification, payment/reservation deadlines, partial/excess/late funds, refund execution and COD reconciliation. Their expiry applies to the new manual-bank path; it does not change approved COD/seller-response clocks or cancellation/return policy by implication. Payment confirmation must precede actual fulfillment release, with the 6/12-hour clock starting only on that release. The [approved single-Super-Admin finance amendment](2026-10-31-single-super-admin-finance-approval.md) applies to related financial decisions. Implementation remains on hold.
