const titles: Record<string, string> = {
  confirmed: 'Your order is confirmed.',
  packing: 'Your makers are preparing your order.',
  ready_for_pickup: 'Your order is ready for pickup.',
  dispatched: 'Your order is on its way.',
  delivered: 'Your order has arrived.',
  cancelled: 'Your order was cancelled.',
  return_requested: 'Your return request is being reviewed.',
  return_in_transit: 'Your return is on its way.',
  returned: 'Your return has been received.',
  refund_processing: 'Your refund is being processed.',
  refunded: 'Your refund is recorded.',
};

export const COD_CONFIRMATION_NOTICE = "We'll call you to confirm this order before it is prepared.";

export function orderPresentation(
  status: string,
  paymentStatus: string,
  firstCodPending = false,
  paymentMode = 'cod',
) {
  return {
    title:
      paymentMode==='prepaid'&&status==='placed'?(paymentStatus==='paid'?'Payment is verified; fulfillment is under review.':'Your order is awaiting bank payment.'):
      firstCodPending && status !== 'cancelled'
        ? 'Your order is awaiting COD confirmation.'
        : (titles[status] ?? 'Your order details.'),
    paymentLabel:
      paymentStatus === 'refunded'
        ? 'Refund recorded'
        : paymentStatus === 'paid'
          ? paymentMode==='prepaid'?'Bank payment verified':'Cash on delivery collected'
          : status === 'cancelled'
            ? 'No payment due'
            : paymentMode==='prepaid'?'Awaiting verified bank payment':'Cash on delivery',
  };
}
