import {prepareInitialResponseNotices} from './response-notifications';
import {prepareOrderResponseRelease} from './response-workflow';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';

export const FIRST_COD_THRESHOLD_PAISA = 500000;
export class FirstCodReviewConflictError extends Error {}
export interface FirstCodReview {
  orderId: string;
  customerId: string;
  totalPaisa: number;
  status: 'pending' | 'confirmed';
  createdAt: number;
  confirmedBy: string | null;
  confirmedAt: number | null;
  reason: string | null;
  requestId: string | null;
}
/** Prepared after the order INSERT, with purchase history evaluated in the same commit. Total includes delivery and discounts, before wallet credit. */
export function prepareFirstCodReview(
  db: D1Database,
  o: { customerId: string; orderId: string; totalPaisa: number; now: number },
): D1PreparedStatement[] {
  if (!o.customerId || !Number.isSafeInteger(o.totalPaisa) || o.totalPaisa < 0)
    throw new FirstCodReviewConflictError(
      'A verified buyer and valid order total are required.',
    );
  return [
    db
      .prepare(
        "INSERT INTO first_cod_reviews(order_id,customer_id,total_paisa,status,created_at) SELECT id,customer_id,?,'pending',? FROM orders WHERE id=? AND customer_id=? AND payment_mode='cod' AND status='confirmed' AND grand_total_paisa+wallet_credit_paisa=? AND ?>=? AND NOT EXISTS(SELECT 1 FROM orders history WHERE history.customer_id=? AND history.status='delivered')",
      )
      .bind(
        o.totalPaisa,
        o.now,
        o.orderId,
        o.customerId,
        o.totalPaisa,
        o.totalPaisa,
        FIRST_COD_THRESHOLD_PAISA,
        o.customerId,
      ),
  ];
}
export async function getFirstCodReview(
  db: D1Database,
  orderId: string,
): Promise<FirstCodReview | null> {
  return db
    .prepare(
      'SELECT order_id AS orderId,customer_id AS customerId,total_paisa AS totalPaisa,status,created_at AS createdAt,confirmed_by AS confirmedBy,confirmed_at AS confirmedAt,reason,request_id AS requestId FROM first_cod_reviews WHERE order_id=?',
    )
    .bind(orderId)
    .first<FirstCodReview>();
}
export async function assertFirstCodFulfillmentAllowed(
  db: D1Database,
  orderId: string,
  Conflict: new (message: string) => Error = FirstCodReviewConflictError,
) {
  if ((await getFirstCodReview(db, orderId))?.status === 'pending')
    throw new Conflict(
      'This first-time COD order is awaiting staff confirmation before fulfillment.',
    );
}
export async function confirmFirstCodReview(
  db: D1Database,
  o: {
    orderId: string;
    actorId: string;
    reason: string;
    requestId: string;
    now: number;
  },
) {
  const reason = o.reason.trim();
  if (reason.length < 8 || reason.length > 500)
    throw new FirstCodReviewConflictError(
      'Confirmation reason must contain 8–500 characters.',
    );
  if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(o.requestId))
    throw new FirstCodReviewConflictError(
      'A valid confirmation request reference is required.',
    );
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'order.manage',
    FirstCodReviewConflictError,
  );
  const review = await getFirstCodReview(db, o.orderId);
  const order = await db
    .prepare('SELECT status FROM orders WHERE id=?')
    .bind(o.orderId)
    .first<{ status: string }>();
  if (!review || !order || order.status === 'cancelled')
    throw new FirstCodReviewConflictError(
      'COD confirmation is not available for this order, or it was cancelled.',
    );
  if (review.status === 'confirmed') {
    if (
      review.confirmedBy === o.actorId &&
      review.reason === reason &&
      review.requestId === o.requestId
    ) {
      const replayGuard = crypto.randomUUID();
      try {
        await db.batch([
          ...authority.statements,
          db
            .prepare(
              "INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM first_cod_reviews r JOIN orders o ON o.id=r.order_id WHERE r.order_id=? AND r.status='confirmed' AND r.confirmed_by=? AND r.reason=? AND r.request_id=? AND o.status<>'cancelled') AND EXISTS(SELECT 1 FROM audit_logs WHERE action='order.first_cod_confirmed' AND subject_id=? AND actor_id=? AND request_id=? AND reason=?) THEN 1 ELSE 0 END",
            )
            .bind(
              replayGuard,
              o.orderId,
              o.actorId,
              reason,
              o.requestId,
              o.orderId,
              o.actorId,
              o.requestId,
              reason,
            ),
          db
            .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
            .bind(replayGuard),
        ]);
      } catch {
        throw new FirstCodReviewConflictError(
          'The order or staff permission changed. Refresh before confirming.',
        );
      }
      return review;
    }
    throw new FirstCodReviewConflictError(
      'This confirmation reference belongs to a different decision.',
    );
  }
  const guardId = crypto.randomUUID();
  try {
    await db.batch([
      ...authority.statements,
      db
        .prepare(
          "INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM first_cod_reviews r JOIN orders o ON o.id=r.order_id WHERE r.order_id=? AND r.status='pending' AND o.status='confirmed') AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?) AND NOT EXISTS(SELECT 1 FROM first_cod_reviews WHERE request_id=?) THEN 1 ELSE 0 END",
        )
        .bind(guardId, o.orderId, o.requestId, o.requestId),
      db
        .prepare(
          "UPDATE first_cod_reviews SET status='confirmed',confirmed_by=?,confirmed_at=?,reason=?,request_id=? WHERE order_id=? AND status='pending'",
        )
        .bind(o.actorId, o.now, reason, o.requestId, o.orderId),
      db
        .prepare(
          "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at) VALUES (?,?,'order.first_cod_confirmed','order',?,?,?, ?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          o.actorId,
          o.orderId,
          reason,
          JSON.stringify({ status: 'pending' }),
          JSON.stringify({
            status: 'confirmed',
            totalPaisa: review.totalPaisa,
          }),
          o.requestId,
          o.now,
        ),
      ...prepareOrderResponseRelease(db,o.orderId),...await prepareInitialResponseNotices(db,o.orderId),
      db
        .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
        .bind(guardId),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      /constraint|confirmation|guard|immutable/i.test(error.message)
    )
      throw new FirstCodReviewConflictError(
        'The order or staff permission changed. Refresh before confirming.',
      );
    throw error;
  }
  return getFirstCodReview(db, o.orderId);
}

/** Call only on an already authorized order list. Financial and fulfillment status remain unchanged. */
export async function withFirstCodPresentation<
  T extends { orderNumber: string; status: string },
>(
  db: D1Database,
  orders: readonly T[],
): Promise<(T & { firstCodPending: boolean })[]> {
  if (!orders.length) return [];
  const pending = new Set<string>();
  for (let offset = 0; offset < orders.length; offset += 100) {
    const chunk = orders.slice(offset, offset + 100);
    const rows = await db
      .prepare(
        "SELECT o.order_number AS orderNumber FROM orders o JOIN first_cod_reviews r ON r.order_id=o.id WHERE r.status='pending' AND o.status<>'cancelled' AND o.order_number IN (" +
          chunk.map(() => '?').join(',') +
          ')',
      )
      .bind(...chunk.map((order) => order.orderNumber))
      .all<{ orderNumber: string }>();
    for (const row of rows.results) pending.add(row.orderNumber);
  }
  return orders.map((order) => ({
    ...order,
    firstCodPending: pending.has(order.orderNumber),
  }));
}
