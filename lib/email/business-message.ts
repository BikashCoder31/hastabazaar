import { emailDate, emailMoney, type EmailActor, type EmailFact, type EmailLayout } from './message-layout';

export interface BusinessEmailData {
  template?: string;
  guestOrderId?: string | null;
  orderNumber?: string | null;
  productStatus?: string | null;
  requiredPermission?: string | null;
  email: string;
  subject: string;
  subjectNe?: string | null;
  body: string;
  bodyNe?: string | null;
  audience: string;
  relatedType: string | null;
  relatedId: string | null;
  reference?: string | null;
  amountPaisa?: number;
  issuedAt?: number;
  deadlineAt?: number;
  paidAt?: number;
  released?: boolean;
  currentStatus?: string;
  courier?: { name: string; trackingCode?: string | null; pickupAt?: number | null };
  failureReason?: string;
  question?: { id: string; sellerName: string; readyAt: number; itemNames?: string };
  itemNames?: string;
}

const nepaliSellerCopy = {
  prepare: { headline: 'तयार गर्न नयाँ अर्डर छ', paragraph: 'अर्डर खोल्नुहोस् र सामान प्याक भएपछि पिकअपका लागि तयार भएको जनाउनुहोस्।', action: 'अर्डर खोल्नुहोस्' },
  pickup: { headline: 'कुरियर पिकअप तय भएको छ', paragraph: 'आफ्नो पिकअप ठेगानामा प्याक गरिएको पार्सल तयार राख्नुहोस्।', action: 'अर्डर हेर्नुहोस्' },
  reply: { headline: 'ग्राहकले सहयोग मागेका छन्', paragraph: 'अनुरोध हेरेर जवाफ दिनुहोस्। हस्तबजारले तपाईंको जवाफपछि निर्णय गर्नेछ।', action: 'जवाफ दिनुहोस्' },
  payout: { headline: 'तपाईंको भुक्तानी पठाइएको छ', paragraph: 'रकम र बैंक भुक्तानीको विवरण वित्त खण्डमा हेर्नुहोस्।', action: 'विवरण हेर्नुहोस्' },
  approved: { headline: 'तपाईंको विक्रेता आवेदन स्वीकृत भयो', paragraph: 'आफ्नो पहिलो उत्पादन समीक्षाका लागि पठाउनुहोस्।', action: 'विक्रेता केन्द्र खोल्नुहोस्' },
  changes: { headline: 'तपाईंको आवेदनमा थप जानकारी चाहिन्छ', paragraph: 'अनुरोध हेर्नुहोस् र आवश्यक कागजात वा जवाफ पठाउनुहोस्।', action: 'आवेदन हेर्नुहोस्' },
} as const;

export function businessEmailLayout(data: BusinessEmailData, link: URL): EmailLayout & { subject: string } {
  const sellerApplication = data.relatedType === 'seller_application' && data.audience !== 'staff';
  const customer = data.audience === 'customer' && !sellerApplication;
  const seller = data.audience === 'seller' || sellerApplication;
  const why = sellerApplication
    ? 'You got this because you applied to sell on Hastabazaar.'
    : seller
      ? 'You got this because you sell on Hastabazaar.'
      : customer
        ? 'You got this because you have an order or account on Hastabazaar.'
        : 'You got this because your staff role has access to this update.';
  const help = data.template === 'delivery.authorization'
    ? 'This single-use code authorizes only this parcel handover. It does not provide account, invoice, or order-history access. Contact the purchaser or support if the delivery details are wrong.'
    : data.relatedType?.startsWith('account_status_')
      ? 'Contact support if you have questions about this account update. Opening the support page does not change your account.'
      : data.guestOrderId
        ? 'Use your checkout email to track this order. For a case reply, open the receipt in the browser used at checkout.'
        : 'Sign in to view the current details.';

  const reference = data.orderNumber ?? data.reference;
  const amount = data.amountPaisa == null ? undefined : emailMoney(data.amountPaisa);
  const orderPath = () => data.orderNumber
    ? new URL('/orders/' + encodeURIComponent(data.orderNumber), link)
    : link;
  const knownNepali = seller && data.bodyNe && data.bodyNe !== data.body
    ? { headline: data.subjectNe ?? data.subject, paragraph: data.bodyNe, action: 'विवरण खोल्नुहोस्' }
    : undefined;
  const facts: EmailFact[] = reference ? [[data.orderNumber ? 'Order' : 'Reference', reference]] : [];
  const layout = (
    actor: EmailActor, subject: string, headline: string, paragraph: string, actionLabel: string,
    options: { url?: URL; note?: string; rows?: readonly EmailFact[]; navy?: boolean; nepali?: keyof typeof nepaliSellerCopy } = {},
  ) => ({
    actor, subject, headline, paragraph, preheader: paragraph,
    action: { label: actionLabel, url: options.url ?? link, ...(options.navy ? { tone: 'navy' as const } : {}) },
    help: options.note ?? help, why, facts: [...facts, ...(options.rows ?? [])],
    nepali: knownNepali ?? (options.nepali ? nepaliSellerCopy[options.nepali] : undefined),
  });

  if (customer && data.template === 'business.payment.order') {
    if (data.subject === 'Bank payment instructions ready') {
      const hours = data.deadlineAt != null && data.issuedAt != null ? (data.deadlineAt - data.issuedAt) / 3_600_000 : 0;
      const window = Number.isInteger(hours) && hours > 0 ? ' within ' + hours + ' hours' : '';
      return layout('Your turn', window ? 'Pay' + window : 'Pay by bank transfer',
        amount ? 'Please transfer ' + amount + window : 'Pay by bank transfer',
        'Sellers start preparing after the transfer is matched and the order is released. Pay by the deadline to keep your order.',
        'See bank details', { navy: true, note: 'Already paid? Tell us on the payment page so we can match it.',
          rows: [
            ...(amount ? [['Amount', amount] as const] : []),
            ...(data.deadlineAt != null ? [['Pay by', emailDate(data.deadlineAt, true)] as const] : []),
            ...(reference ? [['Remarks / reference', reference] as const] : []),
            ['Bank details', 'On the payment page'],
          ] });
    }
    if (data.released && ['Order payment updated', 'Payment verified', 'Payment received'].includes(data.subject)) {
      return layout('Seller', 'Payment received', 'Payment received',
        'We matched your bank transfer and released this order to the seller. Nothing is due on delivery.',
        'Track your order', { url: orderPath(), rows: amount ? [['Paid', amount + (data.paidAt != null ? ' · ' + emailDate(data.paidAt) : '')]] : [] });
    }
    if (data.subject === 'Payment verified') {
      return layout('Hastabazaar', 'Bank transfer verified', 'We verified your bank transfer',
        'Hastabazaar will check that your order is ready to release. Your seller can start preparing after release.',
        'View payment', { navy: true });
    }
    if (data.subject === 'Partial payment verified') {
      return layout('Your turn', 'Part of your payment received', 'We recorded part of your payment',
        'The order remains unpaid. Open the payment page to see the exact balance and deadline.',
        'See payment balance', { navy: true });
    }
    if (data.subject === 'Payment window expired') {
      return layout('Done', 'Payment window expired', 'Your payment window closed',
        'The transfer was not fully matched before the payment window closed. Your order is cancelled and nothing is owed.',
        'View your order', { url: orderPath(), navy: true });
    }
  }

  if (customer && data.question) {
    const { id, sellerName, readyAt, itemNames } = data.question;
    return layout('Your turn', 'Your answer is needed', sellerName + ' needs until ' + emailDate(readyAt),
      'Do you still want this seller’s items on the new date? Open the question to keep them or cancel the seller’s parcel.',
      'Keep it or cancel', { url: new URL('/account/order-responses/' + encodeURIComponent(id), link),
        rows: [...(itemNames ? [['Items', itemNames] as const] : []), ['New ready date', emailDate(readyAt)]] });
  }
  if (customer && data.template === 'business.parcel.delivery_missed') {
    return layout('Courier', 'Delivery missed', 'The courier couldn’t deliver your parcel',
      'Check your order for the next delivery update. Contact support if your address or phone number needs correcting.',
      'View your order', { url: data.guestOrderId ? link : orderPath(), navy: true,
        rows: [
          ...(data.failureReason ? [['What happened', data.failureReason] as const] : []),
          ...(data.courier ? [['Courier', data.courier.name] as const] : []),
          ...(data.courier?.trackingCode ? [['Tracking', data.courier.trackingCode] as const] : []),
        ] });
  }
  if (seller && data.template === 'business.parcel.courier_booked') {
    return layout('Courier', 'Courier pickup booked', data.courier ? data.courier.name + ' will collect your parcel' : 'Your courier pickup is booked',
      'Have the packed parcel ready at your pickup address.', 'View the order',
      { navy: true, nepali: 'pickup', rows: [
        ...(data.courier ? [['Courier', data.courier.name] as const] : []),
        ...(data.courier?.pickupAt != null ? [['Pickup', emailDate(data.courier.pickupAt, true)] as const] : []),
      ] });
  }
  if (seller && data.template === 'business.order.response' && data.subject === 'New preparation work') {
    return layout('Your turn', 'New order to prepare', 'You have a new order',
      'Your items are ready to prepare. Once they’re packed, mark the parcel ready for pickup.',
      'Start preparing', { nepali: 'prepare',
        rows: [...(data.itemNames ? [['Items', data.itemNames] as const] : []), ['Your earnings', 'Shown in Seller Studio']] });
  }
  if (sellerApplication && data.template === 'business.seller_application.result') {
    if (['Seller application approved', 'Seller application approved for activation'].includes(data.subject)) {
      return layout('Your turn', 'Your seller application is approved', 'Welcome to Hastabazaar',
        data.body, 'Open Seller Center', { nepali: 'approved' });
    }
    if (data.subject === 'Seller application needs changes') {
      return layout('Your turn', 'Changes requested', 'Your application needs an update',
        'Hastabazaar requested changes. Review the request and add the requested document or reply.', 'Open your application',
        { nepali: 'changes', rows: [['Where', 'Seller Studio · Your application']] });
    }
  }
  if (customer && data.template === 'business.finance.refund' && data.currentStatus === 'packet_paid') {
    return layout('Done', 'Refund sent', 'Your refund is on its way',
      'Hastabazaar recorded the completed refund transfer. Your bank may take time to show it.',
      'See your request', { navy: true, rows: amount ? [['Refund', amount]] : [] });
  }
  if (seller && ((data.template === 'business.finance.payout' && data.currentStatus === 'packet_paid') ||
    (data.template === 'business.payout.result' && data.currentStatus === 'paid'))) {
    return layout('Done', 'Payout sent', 'Your payout was sent',
      'Hastabazaar recorded the completed payout. You can review the payment in Seller Studio.',
      'See your earnings', { navy: true, nepali: 'payout', rows: [
        ...(amount ? [['Amount', amount] as const] : []),
        ...(data.paidAt != null ? [['Paid', emailDate(data.paidAt)] as const] : []),
      ] });
  }
  if (data.template === 'business.return_request.update') {
    if (seller && data.currentStatus === 'requested') {
      return layout('Your turn', 'A customer needs your reply', 'A customer asked for help',
        'Review the customer’s request and reply. Hastabazaar will decide after reading your response.',
        'Reply now', { nepali: 'reply' });
    }
    if (customer) {
      return layout(data.currentStatus === 'needs_customer_changes' ? 'Your turn' : 'Hastabazaar',
        'Help request update', 'Your help request has an update', data.body, 'See your request', { navy: true });
    }
  }
  if (customer && data.template === 'business.cancellation.updated') {
    return layout('Done', 'Cancellation update', data.subject, data.body, 'View your order', { navy: true });
  }
  const label = data.template === 'delivery.authorization' || data.relatedType?.startsWith('account_status_') ? 'Get help' : 'Open record';
  return layout('Hastabazaar', data.subject, data.subject, data.body, label, { navy: true });
}
