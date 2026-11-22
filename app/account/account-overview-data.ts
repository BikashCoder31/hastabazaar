import type { CustomerUser } from '@/lib/auth/customer';
import { checkoutCommitClock } from '@/lib/checkout/commit-policy-guards';
import { listCustomerAddresses, listWishlist } from '@/lib/db/repositories/customers';
import { getRewards } from '@/lib/db/repositories/loyalty';
import { getNotificationPanel } from '@/lib/operations/notification-panel';
import { readCustomerDelayQuestions } from '@/lib/orders/customer-delay-answer';
import { readCustomerOrderParcels } from '@/lib/orders/customer-parcels';
import { customerParcelState } from '@/lib/orders/customer-parcel-state';

type RecentOrder = { id: string; orderNumber: string; codPending: number; bankReview: number };
type BankAction = { id: string; orderNumber: string; remainingPaisa: number; deadlineAt: number; claimState: string | null };
type CaseAction = { orderNumber: string; reference: string };

export async function readAccountYourTurn(db: D1Database, customer: CustomerUser) {
  const clock = checkoutCommitClock(db);
  const [questions, banks, cases] = await Promise.all([
    readCustomerDelayQuestions(db, { id: customer.userId, authSubject: customer.authSubject }),
    db.prepare(`SELECT o.id,o.order_number AS orderNumber,b.payable_paisa-b.received_paisa AS remainingPaisa,
      w.deadline_at AS deadlineAt,c.current_state AS claimState
      FROM orders o JOIN manual_payment_cutoffs w ON w.order_id=o.id JOIN manual_payment_balances b ON b.order_id=o.id
      LEFT JOIN manual_payment_claims c ON c.order_id=o.id AND c.customer_id=o.customer_id
      WHERE o.customer_id=? AND o.status<>'cancelled' AND w.closed_at IS NULL AND w.paid_at IS NULL AND w.cutoff_at>${clock}
      AND ((c.id IS NULL OR c.current_state IN('rejected','withdrawn')) AND b.payable_paisa>b.received_paisa AND w.deadline_at>${clock} OR c.current_state='needs_information')
      AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions x WHERE x.order_id=o.id AND x.kind IN('receipt_reversal','cancelled_money','expired_money') AND x.state<>'resolved')
      ORDER BY w.deadline_at,o.id LIMIT 8`).bind(customer.userId).all<BankAction>(),
    db.prepare(`SELECT o.order_number AS orderNumber,r.reference_number AS reference
      FROM return_requests r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id
      WHERE o.customer_id=? AND r.status='needs_customer_changes'
      UNION ALL SELECT o.order_number AS orderNumber,c.reference_number AS reference
      FROM complaints c JOIN orders o ON o.id=c.order_id WHERE o.customer_id=? AND c.status='waiting_customer'
      ORDER BY orderNumber DESC LIMIT 8`).bind(customer.userId, customer.userId).all<CaseAction>(),
  ]);
  return { questions, banks: banks.results, cases: cases.results };
}

export async function readAccountOverview(db: D1Database, customer: CustomerUser) {
  const now = Date.now();
  const clock = checkoutCommitClock(db);
  const [orders, summary, notices, addresses, wishlist, rewards, { questions, banks, cases }] = await Promise.all([
    db.prepare(`SELECT o.id,o.order_number AS orderNumber,
      CASE WHEN EXISTS(SELECT 1 FROM first_cod_reviews c WHERE c.order_id=o.id AND c.status='pending') THEN 1 ELSE 0 END AS codPending,
      CASE WHEN o.payment_mode='prepaid' AND o.status='placed' AND EXISTS (
        SELECT 1 FROM manual_payment_cutoffs w LEFT JOIN manual_payment_claims c ON c.order_id=w.order_id
        WHERE w.order_id=o.id AND (w.paid_at IS NOT NULL AND w.released_at IS NULL
          OR w.closed_at IS NULL AND w.cutoff_at>${clock} AND c.current_state IN('submitted','clarified','matched'))
      ) THEN 1 ELSE 0 END AS bankReview
      FROM orders o WHERE o.customer_id=? AND o.status NOT IN('delivered','cancelled')
      ORDER BY o.created_at DESC,o.id DESC LIMIT 5`).bind(customer.userId).all<RecentOrder>(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM orders WHERE customer_id=? AND status NOT IN('delivered','cancelled')) AS active,
      (SELECT COUNT(*) FROM orders WHERE customer_id=? AND status='delivered') AS delivered`)
      .bind(customer.userId,customer.userId).first<{ active: number; delivered: number }>(),
    getNotificationPanel(db, { userId: customer.userId, audience: 'customer' }),
    listCustomerAddresses(db, customer.userId),
    listWishlist(db, customer.userId),
    getRewards(db, customer.userId, now, undefined, 1, customer.authSubject),
    readAccountYourTurn(db, customer),
  ]);
  const parcels = await readCustomerOrderParcels(db, orders.results.map(order => order.id), {withNcmProgress:true});
  const questionSellers = new Map<string, Set<string>>();
  for (const question of questions) {
    const sellers = questionSellers.get(question.orderId) ?? new Set<string>();
    sellers.add(question.sellerId);
    questionSellers.set(question.orderId, sellers);
  }
  const bankOrders = new Set(banks.map(bank => bank.id));
  const onTheWay = orders.results.flatMap(order => bankOrders.has(order.id) ? [] : (parcels.get(order.id) ?? []).flatMap(parcel => {
    if (['delivered','cancelled','returned'].includes(parcel.status) || questionSellers.get(order.id)?.has(parcel.sellerId)) return [];
    const state = customerParcelState({ status: parcel.status, codPending: Boolean(order.codPending), bankReview: Boolean(order.bankReview) });
    return [{ orderNumber: order.orderNumber, parcel, state }];
  })).slice(0, 5);
  return { summary: { active: summary?.active ?? 0, delivered: summary?.delivered ?? 0, unread: notices.unreadCount },
    addresses, wishlist, rewards, questions, banks, cases, onTheWay };
}
