import { responseScopeContains } from '../orders/response-sql';
import { deliveryFailureSchemaAvailable } from '../shipping/delivery-failure';
import { readCancellationCause, type CancellationCause } from './causes';

export async function cancellationCauseSchemaAvailable(db: D1Database) {
  if ((db as D1Database & { dialect?: string }).dialect === 'mariadb') {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('order_cancellation_events','order_cancellation_reviews')
        AND COLUMN_NAME='cause'`).first<{ count: number }>();
    return Number(row?.count) === 2;
  }
  const tables = await Promise.all([
    db.prepare('PRAGMA table_info(order_cancellation_events)').all<{ name: string }>(),
    db.prepare('PRAGMA table_info(order_cancellation_reviews)').all<{ name: string }>(),
  ]);
  return tables.every(table => table.results.some(column => column.name === 'cause'));
}

export async function savedReviewCancellationCause(db: D1Database, orderId: string, reviewId: string) {
  const review = await db.prepare('SELECT cause FROM order_cancellation_reviews WHERE id=? AND order_id=?')
    .bind(reviewId, orderId).first<{ cause: string | null }>();
  return readCancellationCause(review?.cause);
}

function deliveryCancellationCause(reason: unknown): CancellationCause | undefined {
  if (reason === 'refused' || reason === 'not_reached') return 'customer';
  if (reason === 'courier_problem') return 'courier';
}

export async function readReturnCancellationCause(db: D1Database, jobId: string) {
  const available = await deliveryFailureSchemaAvailable(db);
  const row = await db.prepare(`SELECT ${available ? 'j.delivery_failure_reason' : 'NULL'} AS reason,
      (SELECT e.payload_json FROM parcel_operation_events e WHERE e.shipping_job_id=j.id AND e.action='fail'
        ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS failure
    FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id
    WHERE j.id=? AND j.direction='outbound' AND j.status IN ('returning','returned')
      AND p.method='courier' AND p.rider_user_id IS NULL`).bind(jobId).first<{ reason: string | null; failure: string | null }>();
  if (!row) return undefined;
  if (row.reason !== null) return deliveryCancellationCause(row.reason);
  try {
    return deliveryCancellationCause(JSON.parse(row.failure ?? 'null')?.failureReason);
  } catch {
    return undefined;
  }
}

/** Attribute only the same seller and exact order items named in the seller's own report. */
export function uncoveredSellerCancellationItemsSql(db: D1Database, scoped: boolean) {
  const selectedScope = scoped ? ` AND ${responseScopeContains(db, '?', 'i.seller_id')}` : '';
  return `SELECT 1 FROM order_items i
    WHERE i.order_id=? AND i.fulfillment_status<>'cancelled'${selectedScope}
      AND NOT EXISTS (
        SELECT 1 FROM order_response_portions p JOIN order_response_cases c ON c.portion_id=p.id
        JOIN seller_profiles s ON s.id=p.seller_id
        WHERE p.order_id=i.order_id AND p.seller_id=i.seller_id AND p.operator_mode='seller'
          AND c.kind='cannot_fulfill' AND c.state<>'resolved' AND c.reported_by=s.user_id
          AND ${responseScopeContains(db, 'c.scope_json', 'i.id')}
      )`;
}

export async function inferCancellationCause(
  db: D1Database,
  orderId: string,
  sellerIds?: readonly string[],
): Promise<CancellationCause | undefined> {
  const selectedScope = sellerIds ? ` AND ${responseScopeContains(db, '?', 'i.seller_id')}` : '';
  const selectedBindings = sellerIds ? [JSON.stringify(sellerIds)] : [];
  const targets = (await db.prepare(`SELECT DISTINCT i.seller_id AS sellerId,
      j.id AS returnJobId
    FROM order_items i
    LEFT JOIN shipping_jobs j ON j.order_id=i.order_id AND j.seller_id=i.seller_id
      AND j.direction='outbound' AND j.status IN ('returning','returned')
    WHERE i.order_id=? AND i.fulfillment_status<>'cancelled'${selectedScope}`)
    .bind(orderId, ...selectedBindings).all<{ sellerId: string; returnJobId: string | null }>()).results;
  if (!targets.length) return undefined;
  if (targets.some(target => target.returnJobId)) {
    const causes = await Promise.all(targets.map(async target => target.returnJobId
      ? readReturnCancellationCause(db, target.returnJobId) : undefined));
    return causes[0] && causes.every(cause => cause === causes[0]) ? causes[0] : undefined;
  }
  const uncovered = await db.prepare(uncoveredSellerCancellationItemsSql(db, !!sellerIds) + ' LIMIT 1')
    .bind(orderId, ...selectedBindings).first();
  return uncovered ? undefined : 'seller';
}
