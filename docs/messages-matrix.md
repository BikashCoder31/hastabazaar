# Hastabazaar message matrix

Each row shows what the current native event queues. The subject column shows the English copy. Email subjects include Hastabazaar branding and an authorized order or record reference where available. Bracketed values come from the saved event. Payment, document and case states can change the final subject. [Event catalog](../lib/operations/message-event-catalog.ts) · [Business email templates](../lib/email/business-message.ts) · [Order email templates](../lib/email/order-updates.ts)

A working row means the producer queues the indicated channel and its existing source and recipient checks apply. Order email expires when the order moves on or the age limit is reached. A superseded business action can also expire. Email delivery depends on the configured sender. A capture test verifies the rendered message and its recipient.

| Event key | Event | Recipient | In app | Email | Subject | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| `order.placed` | Order placed | Customer | Yes | Yes | Order placed | Added at bank checkout |
| `order.received` | Cash-on-delivery order placed | Customer | Yes | Yes | Order placed / We will call to confirm | Paired with the native COD email job |
| `order.confirmed` | Bank order released | Customer | No | Yes | Confirmed | Queues on the current event. The paired app notice is business.payment.order. |
| `order.packing` | Order preparation started | Customer | No | Yes | Being prepared | Queues on the current event |
| `order.ready_for_pickup` | Order ready for pickup | Customer | No | Yes | Ready for pickup | Queues on the current event |
| `order.dispatched` | Order on the way | Customer | Yes | Yes | Your order is on the way | Added the account copy at dispatch |
| `order.delivered` | Order delivered | Customer | Yes | Yes | Your order was delivered | Added the account copy when the whole order is delivered |
| `order.cancelled` | Order cancelled | Customer | No | Yes | Cancelled | Queues on the current event. Customer cancellations also publish the app notice business.cancellation.updated. |
| `business.payment.order` | Bank transfer instructions | Customer | Yes | Yes | Pay by bank transfer / Pay within {hours} hours | Queues on the current event |
| `business.payment.order` | Payment received | Customer | Yes | Yes | Payment received / Bank transfer verified / Part of your payment received | Queues on the current event |
| `business.payment.order` | Bank payment claim | Super Admin | Yes | Yes | Check a bank transfer claim | Queues on the current event |
| `business.payment.order` | Payment window and claim decision | Customer | Yes | Yes | Payment window expired / Payment correction under review / Payment claim received for review | Queues on the current event |
| `business.payment.reminder` | Bank payment reminder | Customer, Super Admin | Yes | Yes | Payment window reminder | Queues on the current event |
| `business.payment.exception` | Payment exception | Super Admin | Yes | Yes | Finance review: {state} | Queues on the current event |
| `business.payment.return_satisfied` | Bank return reconciled | Customer, Super Admin | Yes | Yes | Original return: bank return reconciled | Queues on the current event |
| `business.payment.return_loss` | Bank return loss resolved | Customer, Super Admin | Yes | Yes | Completed return: bank reconciliation resolved | Queues on the current event |
| `business.parcel.customer_courier_booked` | Courier booked | Customer | Yes | Yes | Courier booked for your order | Added at courier booking |
| `business.parcel.courier_booked` | Courier pickup booked | Seller | Yes | Yes | Courier pickup booked | Queues on the current event |
| `business.parcel.delivery_missed` | Delivery problem | Customer | Yes | Yes | Delivery missed | Queues on the current event |
| `business.parcel.problem` | Parcel problem | Super Admin | Yes | Yes | Parcel delivery needs attention | Added at a failed courier delivery |
| `business.order.response` | New order | Seller | Yes | Yes | New order to prepare | Queues on the current event |
| `business.order.response` | Late order | Seller | Yes | Yes | Your order preparation is late | Added at the seller preparation escalation |
| `business.order.response` | Preparation works and follow-up | Super Admin | Yes | Yes | Preparation response needed / Order preparation needs staff follow-up / Aged order requires Super Admin follow-up | Queues on the current event |
| `business.order.preparation_update` | Preparation delay or question | Customer, Super Admin | Yes | Yes | We are checking your order preparation / Your answer is needed | Queues on the current event |
| `business.order.pickup_ready` | Seller items ready to pick up | Super Admin | Yes | Yes | Seller items are ready for pickup | Queues on the current event |
| `business.cancellation.updated` | Cancellation decision | Customer, Seller, Super Admin | Yes | Yes | Cancellation update | Queues on the current event |
| `business.return_request.update` | Return update | Customer, Super Admin | Yes | Yes | Return request · {saved action} | Queues on the current event |
| `business.return_request.update` | Return needs a reply | Seller | Yes | Yes | A customer needs your reply | Queues on the current event |
| `business.complaint.update` | Complaint update | Customer, Seller, Super Admin | Yes | Yes | Complaint · {saved action} / A customer opened a complaint | Queues on the current event |
| `business.finance.refund` | Refund updates | Customer, Super Admin | Yes | Yes | Refund sent / {refund step} | Queues on the current event |
| `business.wallet.referral_reward` | Wallet reward | Customer | Yes | Yes | Referral reward added to your wallet | Added when eligible credit posts |
| `business.gift.redeemed` | Gift card added to wallet | Customer, Super Admin | Yes | Yes | Gift card redemption recorded | Queues on the current event |
| `business.gift.issued` | Gift card issued | Super Admin | Yes | Yes | Gift card issuance recorded | Queues on the current event |
| `business.seller_application.submitted` | Application received | Seller | Yes | Yes | Seller application submitted | Queues on the current event |
| `business.seller_application.submitted` | New seller application | Super Admin | Yes | Yes | Review a new seller application | Queues on the current event |
| `business.seller_application.result` | Application decision | Seller, Super Admin | Yes | Yes | Your shop is approved / Your seller application is approved / Changes requested / Seller application rejected | Queues on decision, including saved fix notes when applicable |
| `business.seller.document.review` | Fix requested with note | Seller, Super Admin | Yes | Yes | Please fix your {document} · Hastabazaar | Queues on the current event |
| `business.seller.document.review` | Document review decision | Seller, Super Admin | Yes | Yes | Your {document} was verified / Your {document} was rejected | Queues on the current event |
| `business.seller.document.review` | Document re-uploaded | Super Admin | Yes | Yes | A seller re-uploaded a document | Queues on replacement with a specific subject |
| `business.seller.document.change` | Protected document replacement | Seller, Super Admin | Yes | Yes | Replacement requested / Replacement approved / Replacement rejected / We received your replacement document | Queues on the current event |
| `business.seller.payout_fix_ready` | Earnings waiting while a fix is open | Seller | Yes | Yes | Your earnings are ready · Fix before your first payout | Queues on the current event |
| `business.product.submitted` | Product submitted | Seller, Super Admin | Yes | Yes | Product submitted / Product review needed | Queues on the current event |
| `business.product.result` | Product decision | Seller, Super Admin | Yes | Yes | Product approved / Product published / Product needs changes / Product rejected | Queues on the current event |
| `business.payout.requested` | Payout requested | Seller | Yes | Yes | Payout request received | Queues on the current event |
| `business.payout.requested` | Payout request to review | Super Admin | Yes | Yes | Review a seller payout request | Queues on the current event |
| `business.payout.request.result` | Payout request decision | Seller, Super Admin | Yes | Yes | Your payout request was {decision} | Queues on the current event |
| `business.payout.prepared` | Payout prepared | Seller, Super Admin | Yes | Yes | Payout prepared for Super Admin approval / Payout approved | Queues on the current event |
| `business.payout.result` | Payout outcome | Seller, Super Admin | Yes | Yes | Your payout was {state} / Payout sent | Queues on the current event |
| `business.finance.payout` | Payout transfer steps | Seller, Super Admin | Yes | Yes | {Payout step} / Payout sent | Queues on the current event |
| `business.seller.restriction` | Selling restriction | Seller | Yes | Yes | Your seller access is active / temporarily suspended / disabled | Queues on the current event |
| `business.system.email_health` | Email sender problem or recovery | Super Admin | Yes | Yes | Email delivery needs attention / Email delivery recovered | Queues when health evaluation records an incident or recovery |
| `business.seller.protected_change` | Identity or bank evidence | Seller, Super Admin | Yes | Yes | Identity or bank change: {step} / We received your replacement document | Queues on the current event |
| `business.seller.public_profile` | Public profile decision | Seller, Super Admin | Yes | Yes | Public profile: {state} | Queues on the current event |
| `business.seller.profile_correction` | Profile correction | Seller, Super Admin | Yes | Yes | Profile correction: {state} | Queues on the current event |
| `business.seller.support_contact` | Public support contacts | Super Admin | Yes | Yes | Public customer-support contacts updated | Queues on the current event |
| `business.seller.live_activation` | Managed-maker activation | Seller, Super Admin | Yes | Yes | Managed-maker live activation recorded | Queues on the current event |
| `business.seller.live_clearance` | Managed-maker clearance | Seller, Super Admin | Yes | Yes | Live financial evidence reviewed / Live clearance revoked | Queues on the current event |
| `business.seller.recovery` | Seller recovery | Seller, Super Admin | Yes | Yes | Recovery statement: {state} | Queues on the current event |
| `business.seller.recovery.claim` | Seller repayment claim | Seller, Super Admin | Yes | Yes | Repayment claim: {state} | Queues on the current event |
| `business.finance.fee_refund_authorized` | Service fee refund approved | Customer, Super Admin | Yes | Yes | Lawful fee refund authorized; payment not recorded | Queues on the current event |
| `business.finance.invoice_adjustment` | Invoice credit | Customer, Super Admin | Yes | Yes | Original commercial invoice credit recorded | Queues on the current event |
| `business.finance.funding_verified` | Company funding verified | Super Admin | Yes | Yes | Internal company funding statement verified | Queues on the current event |
| `business.company.live_financial_scope` | Live financial scope | Super Admin | Yes | Yes | Live financial evidence reviewed / Live clearance revoked | Queues on the current event |
| `business.company.account` | Company receiving account | Super Admin | Yes | Yes | Company receiving account: {step} | Queues on the current event |
| `business.product.intake` | Assisted product decision | Seller, Super Admin | Yes | Yes | Product candidate rejected / Product correction requested / Product version approved or published | Queues on the current event |
| `business.product.availability` | Product availability | Seller, Super Admin | Yes | Yes | New orders paused / listing stopped, restored or withdrawn | Queues on the current event |
| `business.product.priority` | Product concern | Seller, Super Admin | Yes | Yes | Priority product concern received / Product concern resolved | Queues on the current event |
| `business.product.discount_suggestion` | Optional price suggestion | Seller, Super Admin | Yes | Yes | Optional pricing suggestion | Queues on the current event |
| `business.category.policy` | Category requirements | Super Admin | Yes | Yes | Category requirements updated | Queues on the current event |
| `business.fee.policy` | Selling fee policy | Super Admin | Yes | Yes | Selling fee policy: {step} | Queues on the current event |
| `business.fee.terms` | Selling fee terms decision | Seller, Super Admin | Yes | Yes | Selling fee: {step} | Queues on the current event |
| `business.fee.terms` | Extra routine fee nudge | Seller | Yes | No | Selling fee: {step} | Queues on the current event. Seller routine email preference suppresses this extra message. |
| `business.fee.followup` | Selling fee follow-up | Super Admin | Yes | Yes | Selling fee follow-up needs attention | Queues on the current event |
| `business.fee.holds` | Consolidated selling fee hold alert | Super Admin | Yes | Yes | New selling fee holds need review | Queues on the current event |
| `business.programme.updated` | Programme decision | Super Admin | Yes | Yes | Promotion terms published / Loyalty earning paused / Customer marketplace-fee waiver published / Referral offer changed | Queues on the current event |
| `business.workflow.reminder` | Open work due | Customer, Seller, Super Admin | Yes | Yes | Requested clarification is still outstanding / Original follow-up needs attention / Refund update is due / Refund binding deadline is due | Queues on the current event |
| `business.workflow.assignment` | Review assigned | Super Admin | Yes | Yes | Previous work assignment released / Work assigned to you / Work needs eligible coverage | Queues on the current event |
| `business.team.governance` | Team decision | Super Admin | Yes | Yes | Team responsibility updated | Queues on the current event |
| `business.team.handoff` | Team handoff | Super Admin | Yes | Yes | Duty handoff updated | Queues on the current event |
| `business.system.incident` | System incident | Super Admin | Yes | Yes | System incident updated | Queues on the current event |
| `business.incident.updated` | Operational incident | Super Admin | Yes | Yes | Your operational incident has an update | Queues on the current event |
| `business.permissions.proposed` | Permission proposal | Super Admin | Yes | Yes | Super Admin permission approval needed | Queues on the current event |
| `business.permissions.changed` | Permission changed | Super Admin | Yes | Yes | Your Admin permissions changed | Queues on the current event |
| `business.permissions.rejected` | Permission declined | Super Admin | Yes | Yes | Your permission change proposal was rejected | Queues on the current event |
| `business.form.compatibility.changed` | Form compatibility | Super Admin | Yes | Yes | Form compatibility policy updated | Queues on the current event |
| `business.delivery.rates.changed` | Delivery pricing | Super Admin | Yes | Yes | Delivery rates updated for future orders | Queues on the current event |
| `business.exception.assigned` | Order exception assigned | Super Admin | Yes | Yes | Exception follow-up assigned to you | Queues on the current event |
| `business.promotion.proposed` | Promotion approval | Super Admin | Yes | Yes | Super Admin promotion approval needed | Queues on the current event |
| `business.promotion.result` | Promotion decision | Super Admin | Yes | Yes | Your promotion proposal has a decision | Queues on the current event |
| `business.account.status` | Account restored | Customer, Super Admin | Yes | Yes | Your account is now active / Account status changed: active | Queues on the current event |
| `business.account.status` | Account disabled | Customer | No | Yes | Your account is now disabled | Queues on the current event. The account owner loses app access. Staff oversight uses both channels. |
| `business.rider.update` | Rider status | Customer, Super Admin | Yes | Yes | {Rider status} | Dormant. Dormant behind the existing rider feature gate. |
| `delivery.authorization` | Delivery authorization code | Customer | No | Yes | Your delivery authorization code | Dormant. Dormant behind the rider feature gate. The short-lived code is scoped to the designated recipient. |

## For the owner

- A routine selling-fee nudge can stay in the seller’s app when the existing email cadence or preference suppresses it. Selling-fee changes and actionable Super Admin oversight still use their existing channels.
- Applicants see their notices in their account before they have Seller Studio access. Seller restriction notices also use the account inbox so a seller can read the decision after losing Studio access. The recipient remains the seller who owns the record.
- A guest has no account inbox. Their order, courier and support updates go to the address on the order. Disabled users receive the existing factual account-status email.
- When the only sender stops, Today shows the outage from its recorded run times. The existing health evaluation queues the in-app and email notices when it records an incident. Mail still waits for a functioning sender.
- Gift card issuance stays visible to authorized staff. Redemption tells the redeemer their wallet was credited. The notice excludes the redeemable code. Referral reward notices are queued when the native wallet workflow posts the reward. Checkout and cancellation report wallet use or restoration with the associated order update.
- The existing rider switch remains off. Order placement uses the native email job and the account notification. New checkout creates no SMS row.
