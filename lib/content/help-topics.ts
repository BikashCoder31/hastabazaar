import { DELIVERY_ESTIMATE_NOTICE } from '../checkout/delivery-presentation';

// Shared by the help page and assistant so order guidance has one source.
export const orderHelpTopics = [
  {
    id: 'shipping',
    title: 'Shipping',
    body:
      'Review delivery charges and the estimated delivery period at checkout before placing an order. ' +
      DELIVERY_ESTIMATE_NOTICE +
      ' Items from different sellers may ship separately, with one order total and receipt.',
  },
  {
    id: 'tracking',
    title: 'Track an order',
    body: 'Use Track an order with your order number and the email used at checkout. You can see preparation, dispatch, and delivery progress without signing in. Order emails also link to tracking. For cancellations, returns, or full details, use your secure receipt or sign in to My orders.',
  },
  {
    id: 'returns',
    title: 'Returns & refunds',
    body: 'After delivery, open the secure receipt and choose the affected item. Eligibility is checked against the policy saved with that order. You can add a reason, preferred resolution, quantity, and supporting photos. Approved COD refunds are recorded and handled through the verified manual refund process.',
  },
  {
    id: 'complaints',
    title: 'Complaints',
    body: 'Open the secure order receipt to create an item-specific or order-level complaint. Hastabazaar can assign, investigate, escalate, request more information, and record the resolution without exposing unnecessary customer details to a seller.',
  },
] as const;
