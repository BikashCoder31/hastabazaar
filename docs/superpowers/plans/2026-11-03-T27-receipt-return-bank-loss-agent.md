# T27 source0142 — completed original-payer return bank loss

Scope: additive fictional-only local implementation in canonical C:/Users/abinash/Desktop/HastaBazaar. No canonical D1 access/mutation, deployment, real services, seller contact, seed/reset/restore or Git commit occurred.

## Behavior and preserved facts

An eligible nonconflicted Super Admin can explicitly attribute an actual incoming-bank reversal to the exact actually completed original-payer receipt_return. Source0142 appends receipt_return_bank_losses linked to the EXISTING seller_recovery_receipt_reversal_reviews journal. Its common full-actual-reversal equation includes recovery parts, originally unallocated credit, explicit completed-return losses and later0143 bank satisfaction. The original outgoing packet remains paid, original use remains returned, original obligation remains completed, and no seller/customer debt or duplicate payment is created.

A planned journal row, explicit companyLossApproved flag, exact plan_json.returnLosses membership, original receipt/payer/use/obligation, verified own-account/original-payer destination, actual paid packet + retained company outgoing bank identity, current eligible actor, receipt revision and current/retained personal-interest checks are all bound atomically. Company account conflicts on both receiving and outgoing source versions remain excluded. Immutable child rows and a per-use atomic loss pool cap cumulative loss at the actual paid amount.

The shared manual_receipt_bank_backing view preserves original facts while subtracting completed explicit bank-loss backing. Pure helper actualManualReceiptUseSql reads this stable view. Source0143 extends it for actual bank satisfaction of never-paid return portions;0142 proof binds paid packet amount to current net backing PLUS earlier completed0142loss, so bank-satisfied portions cannot become companyloss and later partial losses remain possible.

0142 replaces only three latest native consumption caps (manual_receipt_use_cap,recovery_receipt_cap,manual_receipt_recovery_cap), replacing SUM(manualuse.amount_minor) consumption with stable net backing. Gross original-use/packet proof and originally-unallocated-origin capacity remain unchanged.

## Shared integration and notification truth

Repayment agent integrated optional completedReturns[{receiptUseId,packetId,amountPaisa}]/companyLossApproved into common service review, plan, full sum, guards/inserts, completed history and net coverage. Root owns parser/UI/ORM/shared readers/schema generator and closed-case exact page filters. Source0142 does not overwrite source0139.

New common business kind payment.return_loss gates notices on the immutable loss and completed common review. Public refund history and payer email/inbox use a fixed bank-free no-new-amount-due explanation; Finance/audit retains the evidence. Catalog suppression/recipient revalidation/link permissions were added coherently. Corresponding payment.return_satisfied coherence was added for the0143 agent. Staff links carry exact immutable journal IDs (?returnLoss= / ?returnSatisfaction=), resolved by root's authorized refunds-page helper to the original obligation. Staff notification permission matches destination refund.approve.standard; mutations remain eligible-SA-only.

Reserved/prepared/uncertain outgoing instructions do not qualify as companyloss. The memory test proves an uncertain instruction stays held until the EXISTING recordRefundPacketOutcome records its actual late paid result; only then can its reversed receipt backing receive this disposition.0143 separately handles independently verified direct bank satisfaction of never-paid portions; no debt is inferred from uncertainty.

## Evidence

Initial valid completed-return red: `node --import tsx --test --test-concurrency=1 tests/receipt-return-bank-loss.test.ts` failed at existing common attribution equation excluding the actual4000 completed-return loss. The fixture's receipt revision was read from actual controls before this meaningful red.

Memory suite later **4/4 passed**, latest prior to final no-debt assertion duration12037.4552ms. Covers completed payer10000, actual reversals4000 then6000, unique audited disposition/replay, sharedpool10000/netbacking0, unchanged paid/use/obligation/ledger, owned exception closure, public-safe history and current outbox/catalog/link identity; prepared/uncertain denial and legitimate late actualpaid resolution; approval/source/duplicate/cap/personal denials.

Native D1 initially exposed actual expression-depth100 limits absent from regular memory SQLite. Equivalent monolithic native/source/interest/cap and shared coverage queries were decomposed into separately rechecked atomic guards; no condition was removed. Shared coverage retains financial arithmetic, use count and every untouched/selected-use proof independently.

`node --import tsx --test --test-concurrency=1 tests/receipt-return-bank-loss-native.test.ts` — **1/1 passed**, exit0,duration18501.9907ms. Fresh d1Persist:false Miniflare cloned only from inspected empty-file SQLite fixture; exact4000+6000 cumulative loss races each have one winner, exact replay, native forgedloss denial, role and receipt-source change between preflight/final batch rollback with no header/loss/pool/audit outcome, originalpaid/use retained, netbacking0, four public payer notices and exception closure.

`node --import tsx --test --test-concurrency=1 tests/receipt-return-bank-loss-browser.test.ts` — **1/1 passed**, exit0,duration6478.3324ms. Browser plugin unavailable; repository esbuild/Playwright fully intercepted harness uses actual shared component/protected recovery route, exact4000loss+explicit checkbox, successful commit with lost acknowledgement, reload finished history and saved-outcome recovery with one POST/one disposition. Opaque-only attempt storage and current unauthorized payer denial verified. No canonical preview launched.

Root owns final aggregate/typecheck and native MariaDB execution. Source0142 has Maria parity; no native MariaDB server was started for this task. T27 remains active.

Final source freeze: memory suite **4/4 passed**,exit0,duration11145.0062ms after final no-new-obligation and destination-permission assertions, malformed-array defense and diagnostic-prefix removal. The public notice staff producer/read filter now both require refund.approve.standard, matching the exact refunds page destination; receipt.verify-only delegated staff cannot receive/follow that notice as an authorized refunds-page view. Root resolves ?returnLoss and ?returnSatisfaction immutable source IDs after staff authorization.

Source0142 owned files are stable. Native/browser slot is released to0143 and mixed-attribution agents. Root final aggregate/typecheck remains authoritative for the combined work.

## Final current-party symmetry

Added the current linked refund order customer (recovery case.refund_id → refunds.order_id → orders.customer_id) to the same0142 service interest predicate and native child INSERT interest guard. Existing original payer, retained customer, current/retained seller and receiving/outgoing company-account conflicts remain unchanged. Regenerated source0142 and Maria parity.

Focused new proof: `node --import tsx --test --test-concurrency=1 --test-name-pattern='current linked order customer' tests/receipt-return-bank-loss.test.ts` — **1/1 passed**,exit0,duration5980.8841ms. Uses a real mixed allocated/actually returned receipt fixture. An exact planned common review/header/control is installed inside an explicitly rolled-back memory transaction; native child INSERT denies the newly personal current order customer with receipt_return_bank_loss_personal_interest. A separate post-review/pre-final-batch customer change aborts the composed command atomically, leaving no loss or common review. Canonical data untouched; no native/browser slot used.0143 owner notified for equivalent symmetry.

Final0142 source freeze after this focused correction; root owns aggregate/typecheck and shared generation.
