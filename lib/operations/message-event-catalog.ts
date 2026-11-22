export type MessageAudience = 'customer' | 'seller' | 'super_admin';

export const pairedMessageChannels = ['in_app', 'email'] as const;
type MessageChannel = (typeof pairedMessageChannels)[number];

interface MessageEvent {
  key: string;
  label: string;
  subject: string;
  audiences: readonly MessageAudience[];
  channels: readonly MessageChannel[];
  note?: string;
  overview?: boolean;
}

function notification(
  key: string, label: string, subject: string, audiences: readonly MessageAudience[],
  options: Pick<MessageEvent, 'note' | 'overview'> & { channels?: readonly MessageChannel[] } = {},
): MessageEvent {
  return { key, label, subject, audiences, channels: pairedMessageChannels, ...options };
}

export const orderStatusMessages = {
  placed: { key: 'order.placed', subject: 'Order placed', body: 'We received your order. Check your order for bank transfer instructions.' },
  checkoutCod: { key: 'order.received', subject: 'Order placed', body: 'We received your cash-on-delivery order. Check your order for confirmation and delivery progress.' },
  dispatched: { key: 'order.dispatched', subject: 'Your order is on the way', body: 'Your parcel has been handed to the delivery team. Open your order for its tracking details.' },
  delivered: { key: 'order.delivered', subject: 'Your order was delivered', body: 'Your order has been marked delivered. Open your order to review the delivery or ask for help.' },
} as const;

export const parcelMessages = {
  sellerBooked: { key: 'business.parcel.courier_booked', subject: 'Courier pickup booked' },
  customerBooked: { key: 'business.parcel.customer_courier_booked', subject: 'Courier booked for your order' },
  deliveryMissed: { key: 'business.parcel.delivery_missed', subject: 'Delivery missed' },
  staffProblem: { key: 'business.parcel.problem', subject: 'Parcel delivery needs attention' },
} as const;

export const referralWalletMessage = {
  key: 'business.wallet.referral_reward',
  subject: 'Referral reward added to your wallet',
} as const;

export const reviewMessages = {
  applicantReceived: 'Seller application submitted',
  staffApplication: 'Review a new seller application',
  staffDocumentReplacement: 'A seller re-uploaded a document',
  sellerDocumentReplacement: 'We received your replacement document',
  newSellerOrder: 'New order to prepare',
  oldSellerOrder: 'Your order preparation is late',
  staffBankClaim: 'Check a bank transfer claim',
  staffPayoutRequest: 'Review a seller payout request',
} as const;

export const caseSubjects: Readonly<Record<string, string>> = {
  created: 'received',
  customer_response: 'customer replied',
  seller_response: 'seller replied',
  request_changes: 'more details needed',
  request_customer: 'more details needed',
  reject: 'declined',
  approve: 'review decision ready',
  high_value_decision: 'refund decision ready',
  mark_in_transit: 'on the way back',
  mark_received: 'parcel received',
  resolve_replacement: 'replacement arranged',
  resolve_return_to_origin: 'returned to the seller',
  close_paid_refund: 'refunded and closed',
  start_refund: 'refund in progress',
  complete_refund: 'refund sent',
  fail_refund: 'refund needs attention',
  assign_to_me: 'assigned for review',
  investigate: 'under review',
  escalate: 'escalated for review',
  resolve: 'resolved',
  close: 'closed',
  reopen: 'reopened',
};

export function caseMessageSubject(source: 'return_request' | 'complaint', action: string) {
  return (source === 'return_request' ? 'Return request' : 'Complaint') + ' · ' + (caseSubjects[action] ?? 'review decision ready');
}

export const messageEventCatalog: readonly MessageEvent[] = [
  notification(orderStatusMessages.placed.key, 'Order placed', orderStatusMessages.placed.subject, ['customer'], { overview: true }),
  notification(orderStatusMessages.checkoutCod.key, 'Cash-on-delivery order placed', 'Order placed / We will call to confirm', ['customer']),
  notification('order.confirmed', 'Bank order released', 'Confirmed', ['customer'], { channels: ['email'], note: 'The paired app notice is business.payment.order.' }),
  notification('order.packing', 'Order preparation started', 'Being prepared', ['customer'], { channels: ['email'] }),
  notification('order.ready_for_pickup', 'Order ready for pickup', 'Ready for pickup', ['customer'], { channels: ['email'] }),
  notification(orderStatusMessages.dispatched.key, 'Order on the way', orderStatusMessages.dispatched.subject, ['customer'], { overview: true }),
  notification(orderStatusMessages.delivered.key, 'Order delivered', orderStatusMessages.delivered.subject, ['customer'], { overview: true }),
  notification('order.cancelled', 'Order cancelled', 'Cancelled', ['customer'], { channels: ['email'], note: 'Customer cancellations also publish the app notice business.cancellation.updated.' }),
  notification('business.payment.order', 'Bank transfer instructions', 'Pay by bank transfer / Pay within {hours} hours', ['customer'], { overview: true }),
  notification('business.payment.order', 'Payment received', 'Payment received / Bank transfer verified / Part of your payment received', ['customer'], { overview: true }),
  notification('business.payment.order', 'Bank payment claim', reviewMessages.staffBankClaim, ['super_admin'], { overview: true }),
  notification('business.payment.order', 'Payment window and claim decision', 'Payment window expired / Payment correction under review / Payment claim received for review', ['customer']),
  notification('business.payment.reminder', 'Bank payment reminder', 'Payment window reminder', ['customer', 'super_admin']),
  notification('business.payment.exception', 'Payment exception', 'Finance review: {state}', ['super_admin']),
  notification('business.payment.return_satisfied', 'Bank return reconciled', 'Original return: bank return reconciled', ['customer', 'super_admin']),
  notification('business.payment.return_loss', 'Bank return loss resolved', 'Completed return: bank reconciliation resolved', ['customer', 'super_admin']),
  notification(parcelMessages.customerBooked.key, 'Courier booked', parcelMessages.customerBooked.subject, ['customer'], { overview: true }),
  notification(parcelMessages.sellerBooked.key, 'Courier pickup booked', parcelMessages.sellerBooked.subject, ['seller']),
  notification(parcelMessages.deliveryMissed.key, 'Delivery problem', parcelMessages.deliveryMissed.subject, ['customer'], { overview: true }),
  notification(parcelMessages.staffProblem.key, 'Parcel problem', parcelMessages.staffProblem.subject, ['super_admin'], { overview: true }),
  notification('business.order.response', 'New order', reviewMessages.newSellerOrder, ['seller'], { overview: true }),
  notification('business.order.response', 'Late order', reviewMessages.oldSellerOrder, ['seller'], { overview: true }),
  notification('business.order.response', 'Preparation works and follow-up', 'Preparation response needed / Order preparation needs staff follow-up / Aged order requires Super Admin follow-up', ['super_admin']),
  notification('business.order.preparation_update', 'Preparation delay or question', 'We are checking your order preparation / Your answer is needed', ['customer', 'super_admin']),
  notification('business.order.pickup_ready', 'Seller items ready to pick up', 'Seller items are ready for pickup', ['super_admin']),
  notification('business.cancellation.updated', 'Cancellation decision', 'Cancellation update', ['customer', 'seller', 'super_admin']),
  notification('business.return_request.update', 'Return update', 'Return request · {saved action}', ['customer', 'super_admin'], { overview: true }),
  notification('business.return_request.update', 'Return needs a reply', 'A customer needs your reply', ['seller'], { overview: true }),
  notification('business.complaint.update', 'Complaint update', 'Complaint · {saved action} / A customer opened a complaint', ['customer', 'seller', 'super_admin'], { overview: true }),
  notification('business.finance.refund', 'Refund updates', 'Refund sent / {refund step}', ['customer', 'super_admin'], { overview: true }),
  notification(referralWalletMessage.key, 'Wallet reward', referralWalletMessage.subject, ['customer'], { overview: true }),
  notification('business.gift.redeemed', 'Gift card added to wallet', 'Gift card redemption recorded', ['customer', 'super_admin'], { overview: true }),
  notification('business.gift.issued', 'Gift card issued', 'Gift card issuance recorded', ['super_admin']),
  notification('business.seller_application.submitted', 'Application received', reviewMessages.applicantReceived, ['seller'], { overview: true }),
  notification('business.seller_application.submitted', 'New seller application', reviewMessages.staffApplication, ['super_admin'], { overview: true }),
  notification('business.seller_application.result', 'Application decision', 'Your shop is approved / Your seller application is approved / Changes requested / Seller application rejected', ['seller', 'super_admin'], { overview: true }),
  notification('business.seller.document.review', 'Fix requested with note', 'Please fix your {document}', ['seller', 'super_admin'], { overview: true }),
  notification('business.seller.document.review', 'Document review decision', 'Your {document} was verified / Your {document} was rejected', ['seller', 'super_admin']),
  notification('business.seller.document.review', 'Document re-uploaded', reviewMessages.staffDocumentReplacement, ['super_admin'], { overview: true }),
  notification('business.seller.document.change', 'Protected document replacement', 'Replacement requested / Replacement approved / Replacement rejected / We received your replacement document', ['seller', 'super_admin']),
  notification('business.seller.checklist_request', 'Shop checklist request or reminder', 'Please update your {detail} / Please renew your {document} / Reminder: please update your {detail}', ['seller'], { overview: true }),
  notification('business.seller.document.expiring', 'Required document expires soon', 'Your {document} expires on {date}', ['seller'], { overview: true }),
  notification('business.seller.payout_fix_ready', 'Earnings waiting while a fix is open', 'Your earnings are ready · Fix before your first payout', ['seller'], { overview: true }),
  notification('business.product.submitted', 'Product submitted', 'Product submitted / Product review needed', ['seller', 'super_admin']),
  notification('business.product.result', 'Product decision', 'Product approved / Product published / Product needs changes / Product rejected', ['seller', 'super_admin'], { overview: true }),
  notification('business.payout.requested', 'Payout requested', 'Payout request received', ['seller'], { overview: true }),
  notification('business.payout.requested', 'Payout request to review', reviewMessages.staffPayoutRequest, ['super_admin'], { overview: true }),
  notification('business.payout.request.result', 'Payout request decision', 'Your payout request was {decision}', ['seller', 'super_admin']),
  notification('business.payout.prepared', 'Payout prepared', 'Payout prepared for Super Admin approval / Payout approved', ['seller', 'super_admin']),
  notification('business.payout.result', 'Payout outcome', 'Your payout was {state} / Payout sent', ['seller', 'super_admin']),
  notification('business.finance.payout', 'Payout transfer steps', '{Payout step} / Payout sent', ['seller', 'super_admin']),
  notification('business.seller.restriction', 'Selling restriction', 'Your seller access is active / temporarily suspended / disabled', ['seller'], { overview: true }),
  notification('business.system.email_health', 'Email sender problem or recovery', 'Email delivery needs attention / Email delivery recovered', ['super_admin'], { overview: true }),
  notification('business.seller.protected_change', 'Identity or bank evidence', 'Identity or bank change: {step} / We received your replacement document', ['seller', 'super_admin']),
  notification('business.seller.public_profile', 'Public profile decision', 'Public profile: {state}', ['seller', 'super_admin']),
  notification('business.seller.profile_correction', 'Profile correction', 'Profile correction: {state}', ['seller', 'super_admin']),
  notification('business.seller.support_contact', 'Public support contacts', 'Public customer-support contacts updated', ['super_admin']),
  notification('business.seller.live_activation', 'Managed-maker activation', 'Managed-maker live activation recorded', ['seller', 'super_admin']),
  notification('business.seller.live_clearance', 'Managed-maker clearance', 'Live financial evidence reviewed / Live clearance revoked', ['seller', 'super_admin']),
  notification('business.seller.recovery', 'Seller recovery', 'Recovery statement: {state}', ['seller', 'super_admin']),
  notification('business.seller.recovery.claim', 'Seller repayment claim', 'Repayment claim: {state}', ['seller', 'super_admin']),
  notification('business.finance.fee_refund_authorized', 'Service fee refund approved', 'Lawful fee refund authorized; payment not recorded', ['customer', 'super_admin']),
  notification('business.finance.invoice_adjustment', 'Invoice credit', 'Original commercial invoice credit recorded', ['customer', 'super_admin']),
  notification('business.finance.funding_verified', 'Company funding verified', 'Internal company funding statement verified', ['super_admin']),
  notification('business.company.live_financial_scope', 'Live financial scope', 'Live financial evidence reviewed / Live clearance revoked', ['super_admin']),
  notification('business.company.account', 'Company receiving account', 'Company receiving account: {step}', ['super_admin']),
  notification('business.product.intake', 'Assisted product decision', 'Product candidate rejected / Product correction requested / Product version approved or published', ['seller', 'super_admin']),
  notification('business.product.availability', 'Product availability', 'New orders paused / listing stopped, restored or withdrawn', ['seller', 'super_admin']),
  notification('business.product.priority', 'Product concern', 'Priority product concern received / Product concern resolved', ['seller', 'super_admin']),
  notification('business.product.discount_suggestion', 'Optional price suggestion', 'Optional pricing suggestion', ['seller', 'super_admin']),
  notification('business.category.policy', 'Category requirements', 'Category requirements updated', ['super_admin']),
  notification('business.fee.policy', 'Selling fee policy', 'Selling fee policy: {step}', ['super_admin']),
  notification('business.fee.terms', 'Selling fee terms decision', 'Selling fee: {step}', ['seller', 'super_admin']),
  notification('business.fee.terms', 'Extra routine fee nudge', 'Selling fee: {step}', ['seller'], { channels: ['in_app'], note: 'Seller routine email preference suppresses this extra message.' }),
  notification('business.fee.followup', 'Selling fee follow-up', 'Selling fee follow-up needs attention', ['super_admin']),
  notification('business.fee.holds', 'Consolidated selling fee hold alert', 'New selling fee holds need review', ['super_admin']),
  notification('business.programme.updated', 'Programme decision', 'Promotion terms published / Loyalty earning paused / Customer marketplace-fee waiver published / Referral offer changed', ['super_admin']),
  notification('business.workflow.reminder', 'Open work due', 'Requested clarification is still outstanding / Original follow-up needs attention / Refund update is due / Refund binding deadline is due', ['customer', 'seller', 'super_admin']),
  notification('business.workflow.assignment', 'Review assigned', 'Previous work assignment released / Work assigned to you / Work needs eligible coverage', ['super_admin']),
  notification('business.team.governance', 'Team decision', 'Team responsibility updated', ['super_admin']),
  notification('business.team.handoff', 'Team handoff', 'Duty handoff updated', ['super_admin']),
  notification('business.system.incident', 'System incident', 'System incident updated', ['super_admin']),
  notification('business.incident.updated', 'Operational incident', 'Your operational incident has an update', ['super_admin']),
  notification('business.permissions.proposed', 'Permission proposal', 'Super Admin permission approval needed', ['super_admin']),
  notification('business.permissions.changed', 'Permission changed', 'Your Admin permissions changed', ['super_admin']),
  notification('business.permissions.rejected', 'Permission declined', 'Your permission change proposal was rejected', ['super_admin']),
  notification('business.form.compatibility.changed', 'Form compatibility', 'Form compatibility policy updated', ['super_admin']),
  notification('business.delivery.rates.changed', 'Delivery pricing', 'Delivery rates updated for future orders', ['super_admin']),
  notification('business.exception.assigned', 'Order exception assigned', 'Exception follow-up assigned to you', ['super_admin']),
  notification('business.promotion.proposed', 'Promotion approval', 'Super Admin promotion approval needed', ['super_admin']),
  notification('business.promotion.result', 'Promotion decision', 'Your promotion proposal has a decision', ['super_admin']),
  notification('business.account.status', 'Account restored', 'Your account is now active / Account status changed: active', ['customer', 'super_admin']),
  notification('business.account.status', 'Account disabled', 'Your account is now disabled', ['customer'], { channels: ['email'], note: 'The account owner loses app access. Staff oversight uses both channels.' }),
  notification('business.rider.update', 'Rider status', '{Rider status}', ['customer', 'super_admin'], { note: 'Dormant behind the existing rider feature gate.' }),
  notification('delivery.authorization', 'Delivery authorization code', 'Your delivery authorization code', ['customer'], { channels: ['email'], note: 'Dormant behind the rider feature gate. The short-lived code is scoped to the designated recipient.' }),
];

export function messageEventsForAudience(audience: MessageAudience) {
  return messageEventCatalog.filter(event => event.overview && event.audiences.includes(audience));
}
