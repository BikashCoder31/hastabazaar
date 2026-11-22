import { checkoutCommitClock } from '../checkout/commit-policy-guards';
import { payableOrderTotalSql } from '../db/repositories/platform-service-fee';
import { readCustomerDelayQuestions, type CustomerDelayQuestion } from './customer-delay-answer';
import { readCustomerOrderParcels, type CustomerOrderParcel } from './customer-parcels';

type OrderRow = {
  id: string;
  orderNumber: string;
  placedAt: number;
  status: string;
  paymentMode: string;
  paymentStatus: string;
  grandTotalPaisa: number;
  firstCodPending: number;
  hasAftercare: number;
  paymentDeadline: number | null;
  paymentCutoff: number | null;
  paymentClosed: number | null;
  paymentVerified: number | null;
  paymentReleased: number | null;
  claimStatus: string | null;
  remainingPaisa: number | null;
  paymentException: number;
  now: number;
};

export type CustomerOrderSummary = Omit<OrderRow, 'firstCodPending' | 'hasAftercare' | 'now'> & {
  firstCodPending: boolean;
  hasAftercare: boolean;
  bankAction: boolean;
  bankReview: boolean;
  parcels: CustomerOrderParcel[];
  questions: CustomerDelayQuestion[];
};

type PaymentState = Pick<OrderRow, 'status' | 'paymentMode' | 'paymentDeadline' | 'paymentCutoff' | 'paymentClosed' |
  'paymentVerified' | 'paymentReleased' | 'claimStatus' | 'remainingPaisa' | 'paymentException' | 'now'>;

export function customerOrderPaymentAction(payment: PaymentState) {
  if (payment.paymentMode !== 'prepaid' || payment.status !== 'placed') return { bankAction: false, bankReview: false };
  if (payment.paymentException) return { bankAction: false, bankReview: true };
  if (payment.paymentVerified !== null) return { bankAction: false, bankReview: payment.paymentReleased === null };
  const open = payment.paymentClosed === null && (payment.paymentCutoff ?? 0) > payment.now;
  const underReview = ['submitted', 'clarified'].includes(payment.claimStatus ?? '');
  const transferDue = (payment.remainingPaisa ?? 0) > 0 && (payment.paymentDeadline ?? 0) > payment.now;
  return { bankAction: open && (payment.claimStatus === 'needs_information' || !underReview && transferDue), bankReview: open && underReview };
}

export async function readCustomerOrderList(db: D1Database, viewer: { id: string; authSubject: string }, limit = 100) {
  const [rows, questions] = await Promise.all([
    db.prepare(`SELECT o.id,o.order_number AS orderNumber,COALESCE(o.placed_at,o.created_at) AS placedAt,o.status,
      o.payment_mode AS paymentMode,o.payment_status AS paymentStatus,${payableOrderTotalSql('o')} AS grandTotalPaisa,
      CASE WHEN f.status='pending' AND o.status<>'cancelled' THEN 1 ELSE 0 END AS firstCodPending,
      CASE WHEN EXISTS(SELECT 1 FROM return_requests r JOIN order_items i ON i.id=r.order_item_id WHERE i.order_id=o.id)
        OR EXISTS(SELECT 1 FROM complaints c WHERE c.order_id=o.id) THEN 1 ELSE 0 END AS hasAftercare,
      w.deadline_at AS paymentDeadline,w.cutoff_at AS paymentCutoff,w.closed_at AS paymentClosed,w.paid_at AS paymentVerified,
      w.released_at AS paymentReleased,c.current_state AS claimStatus,${checkoutCommitClock(db)} AS now,
      CASE WHEN b.payable_paisa>b.received_paisa THEN b.payable_paisa-b.received_paisa ELSE NULL END AS remainingPaisa,
      CASE WHEN EXISTS(SELECT 1 FROM manual_payment_exceptions x WHERE x.order_id=o.id
        AND x.kind IN('receipt_reversal','cancelled_money','expired_money') AND x.state<>'resolved') THEN 1 ELSE 0 END AS paymentException
      FROM orders o JOIN users u ON u.id=o.customer_id LEFT JOIN first_cod_reviews f ON f.order_id=o.id
      LEFT JOIN manual_payment_cutoffs w ON w.order_id=o.id LEFT JOIN manual_payment_claims c ON c.order_id=o.id
      LEFT JOIN manual_payment_balances b ON b.order_id=o.id
      WHERE HEX(o.customer_id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND u.status='active'
      AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='customer')
      ORDER BY o.created_at DESC,o.id DESC LIMIT ?`).bind(viewer.id, viewer.authSubject, limit).all<OrderRow>(),
    readCustomerDelayQuestions(db, viewer),
  ]);
  const parcels = await readCustomerOrderParcels(db, rows.results.map(row => row.id), {withNcmProgress:true});
  const byOrder = new Map<string, CustomerDelayQuestion[]>();
  for (const question of questions) {
    const orderQuestions = byOrder.get(question.orderId) ?? [];
    orderQuestions.push(question);
    byOrder.set(question.orderId, orderQuestions);
  }
  return rows.results.map(({ now, ...row }): CustomerOrderSummary => {
    return { ...row, firstCodPending: Boolean(row.firstCodPending), hasAftercare: Boolean(row.hasAftercare),
      ...customerOrderPaymentAction({ ...row, now }),
      parcels: parcels.get(row.id) ?? [], questions: byOrder.get(row.id) ?? [] };
  });
}

export const customerOrderTabs = [
  ['active', 'Active'], ['delivered', 'Delivered'], ['help', 'Returns & help'], ['cancelled', 'Cancelled'],
] as const;
export type CustomerOrderTab = (typeof customerOrderTabs)[number][0];

function tabMatches(order: CustomerOrderSummary, tab: CustomerOrderTab) {
  if (tab === 'help') return order.hasAftercare;
  if (tab === 'cancelled') return order.status === 'cancelled';
  if (tab === 'delivered') return order.status === 'delivered' || order.parcels.some(parcel => parcel.status === 'delivered');
  return order.status !== 'cancelled' && (order.parcels.length
    ? order.parcels.some(parcel => !['delivered', 'cancelled', 'returned'].includes(parcel.status))
    : ['placed', 'confirmed', 'packing', 'ready_for_pickup', 'dispatched'].includes(order.status));
}

export function selectCustomerOrders(orders: readonly CustomerOrderSummary[], tab: CustomerOrderTab, query: string) {
  const needle = query.trim().toLocaleLowerCase('en-NP');
  return orders.filter(order => tabMatches(order, tab) && (!needle || order.orderNumber.toLocaleLowerCase('en-NP').includes(needle) ||
    order.parcels.some(parcel => [parcel.sellerName, ...parcel.items.map(item => item.name)]
      .some(value => value.toLocaleLowerCase('en-NP').includes(needle)))));
}
