import { buildOrderEmail, type OrderEmailData } from './order-updates';
import { buildBusinessEmail } from '../operations/business-notifications';
import type { BusinessEmailData } from './business-message';
import { courierBookedTemplate, missedDeliveryTemplate } from '../operations/courier-email-notices';
import { caseMessageSubject, reviewMessages } from '../operations/message-event-catalog';

const buyerEmail = 'buyer@local.hastabazaar.test';
const sellerEmail = 'seller@local.hastabazaar.test';
const orderNumber = 'HB-DEMO-504';
const orderId = 'preview-order';
const now = Date.UTC(2026, 10, 21, 10);
const future = Date.UTC(2026, 10, 22, 10);
const orderOrigin = {
  orderNumber, orderId, customerId: 'preview-buyer', paymentMode: 'cod',
  email: buyerEmail, cashPaisa: 164000, walletPaisa: 0, discountPaisa: 0,
  trackingCode: null, occurredAt: now,
};
const customerNotice = {
  email: buyerEmail, audience: 'customer', relatedType: 'order', relatedId: orderId, orderNumber,
};
const sellerNotice = {
  email: sellerEmail, audience: 'seller', relatedType: 'order', relatedId: orderId, orderNumber,
};
const courier = { name: 'Example Parcel Service', trackingCode: 'PREVIEW-705', pickupAt: future };

type OrderPreview = { order: OrderEmailData };
type BusinessPreview = { notice: BusinessEmailData };

interface PreviewLabels {
  id: string;
  label: string;
  when: string;
  next: string;
}

export interface EmailPreviewGroup {
  label: string;
  entries: readonly (PreviewLabels & (OrderPreview | BusinessPreview))[];
}

export const emailPreviewGroups: readonly EmailPreviewGroup[] = [
  { label: 'Customer orders', entries: [
    { id: 'placed', label: 'Order placed', when: 'After a cash-on-delivery order is placed.', next: 'The sellers prepare their parcels.',
      order: { ...orderOrigin, eventStatus: 'confirmed', currentStatus: 'confirmed',
        parcelFacts: [['Parcel · Sample Studio', 'NPR 700.00'], ['Parcel · Example Weavers', 'NPR 940.00']] } },
    { id: 'bank', label: 'Pay by bank transfer', when: 'After checkout with bank transfer.', next: 'The customer transfers the amount on the payment page.',
      notice: { ...customerNotice, template: 'business.payment.order', relatedType: 'order_payment', subject: 'Bank payment instructions ready',
        body: 'Your bank details are ready.', amountPaisa: 164000, issuedAt: now, deadlineAt: future } },
    { id: 'paid', label: 'Payment received', when: 'After the matched payment is released to the seller.', next: 'The seller prepares the order.',
      notice: { ...customerNotice, template: 'business.payment.order', relatedType: 'order_payment', subject: 'Payment received',
        body: 'Payment received.', amountPaisa: 164000, paidAt: now, released: true } },
    { id: 'call', label: 'We will call to confirm', when: 'When a cash-on-delivery order requires a confirmation call.', next: 'Hastabazaar calls the customer.',
      order: { ...orderOrigin, eventStatus: 'confirmed', currentStatus: 'confirmed', firstCodPending: true, maskedPhone: 'the phone number ending in 3021' } },
    { id: 'question', label: 'Seller needs your answer', when: 'A seller has an open question about a new ready date.', next: 'The customer keeps the items or cancels the parcel.',
      notice: { ...customerNotice, template: 'business.order.preparation_update', relatedType: 'order_response_event', relatedId: 'preview-seller-question',
        subject: 'We are checking your order preparation', body: 'Please check the new ready date.',
        question: { id: 'preview-delay', sellerName: 'Sample Studio', readyAt: future, itemNames: 'Handwoven placemats' } } },
    { id: 'way', label: 'On the way', when: 'When the order is handed to the courier.', next: 'The courier delivers the parcel.',
      order: { ...orderOrigin, eventStatus: 'dispatched', currentStatus: 'dispatched', trackingCode: courier.trackingCode,
        parcelFacts: [['Courier', courier.name]] } },
    { id: 'missed', label: 'Delivery missed', when: 'When a courier delivery attempt is recorded as missed.', next: 'The courier records the next delivery update.',
      notice: { ...customerNotice, template: missedDeliveryTemplate, subject: 'Delivery missed',
        body: 'The courier recorded a missed delivery.', failureReason: 'Wrong or incomplete address', courier } },
    { id: 'delivered', label: 'Delivered', when: 'When the order is marked delivered.', next: 'The customer can review the product or get help.',
      order: { ...orderOrigin, eventStatus: 'delivered', currentStatus: 'delivered', collectedPaisa: 164000, returnDays: 7 } },
    { id: 'cancelled', label: 'Cancelled', when: 'When the order is cancelled.', next: 'The customer can open their saved order.',
      order: { ...orderOrigin, eventStatus: 'cancelled', currentStatus: 'cancelled', cashPaisa: 0, walletRestoredPaisa: 8000 } },
  ] },
  { label: 'Customer help & refunds', entries: [
    { id: 'help', label: 'Help request update', when: 'After a seller or Hastabazaar updates the help request.', next: 'The customer checks the saved update.',
      notice: { ...customerNotice, template: 'business.return_request.update', relatedType: 'return_request', relatedId: 'preview-return',
        subject: caseMessageSubject('return_request', 'approve'), body: 'Hastabazaar saved a decision on your request. Open the order to see it.' } },
    { id: 'refund', label: 'Refund sent', when: 'After the completed refund transfer is recorded.', next: 'The customer can review the refund.',
      notice: { ...customerNotice, template: 'business.finance.refund', relatedType: 'refund_obligation', relatedId: 'preview-refund',
        subject: 'Completed payment recorded', body: 'The transfer outcome was recorded.', amountPaisa: 64200, currentStatus: 'packet_paid' } },
  ] },
  { label: 'Sellers', entries: [
    { id: 'neworder', label: 'New order to prepare', when: 'When your items become ready to prepare.', next: 'The seller prepares the items.',
      notice: { ...sellerNotice, template: 'business.order.response', relatedType: 'order_response_event', relatedId: 'preview-release',
        subject: reviewMessages.newSellerOrder, body: 'There are new items to prepare.', itemNames: 'Handwoven placemats × 2' } },
    { id: 'pickup', label: 'Courier booked', when: 'After Hastabazaar books pickup.', next: 'The courier collects the parcel.',
      notice: { ...sellerNotice, template: courierBookedTemplate, subject: 'Courier pickup booked',
        body: 'The courier pickup is booked.', courier } },
    { id: 'return', label: 'Return · your reply', when: 'A customer requests help with an item the seller supplied.', next: 'The seller replies.',
      notice: { ...sellerNotice, template: 'business.return_request.update', relatedType: 'return_request', relatedId: 'preview-return',
        subject: 'Return request update available', body: 'A customer opened a help request.', currentStatus: 'requested' } },
    { id: 'payout', label: 'Payout sent', when: 'After the completed payout is recorded.', next: 'The seller can open the saved payout details.',
      notice: { ...sellerNotice, orderNumber: null, template: 'business.finance.payout', relatedType: 'payout_transfer', relatedId: 'preview-payout',
        reference: 'HKP-DEMO-70', subject: 'Completed payment recorded', body: 'Your payout was sent.', amountPaisa: 420600, currentStatus: 'packet_paid' } },
    { id: 'approved', label: 'Application approved', when: 'After Super Admin approves a seller application.', next: 'The seller sends their first product for review.',
      notice: { ...sellerNotice, orderNumber: null, audience: 'customer', template: 'business.seller_application.result',
        relatedType: 'seller_application', relatedId: 'preview-application', reference: 'SA-DEMO-18', subject: 'Seller application approved',
        body: 'Your application is approved. Send your first product for review. Add your bank account before the first payout.' } },
    { id: 'changes', label: 'Changes requested', when: 'After Hastabazaar requests changes on the application.', next: 'The seller updates the application.',
      notice: { ...sellerNotice, orderNumber: null, audience: 'customer', template: 'business.seller_application.result',
        relatedType: 'seller_application', relatedId: 'preview-application', reference: 'SA-DEMO-18',
        subject: 'Seller application needs changes',
        body: 'Please review the saved application request.\nBank document: Upload a clear copy that shows the account holder name.' } },
  ] },
];

export type EmailPreview = (typeof emailPreviewGroups)[number]['entries'][number];

export function renderEmailPreview(preview: EmailPreview, origin: string, capture = false) {
  const transport = capture ? 'capture' : 'provider';
  return 'order' in preview
    ? buildOrderEmail(preview.order, origin, { transport })
    : buildBusinessEmail(preview.notice, origin, { transport });
}
