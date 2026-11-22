import { currentProductMediaOrder, currentProductMediaSql } from '@/lib/products/publication-media';
import { getCustomerComplaintDetail } from '@/lib/db/repositories/complaints';
import { getCustomerReturnDetail } from '@/lib/db/repositories/returns';
import { itemDeliverySql } from './item-delivery';
import { parseReturnPolicySnapshot } from './validation';

export type CustomerRequestKind = 'return' | 'complaint';

export interface CustomerRequestEvent {
  id: string;
  caseId: string;
  kind: CustomerRequestKind;
  action: string;
  actorType: string;
  toStatus: string;
  message: string;
  createdAt: number;
}

export interface CustomerRequestPhoto {
  id: string;
  caseId: string;
  name: string;
  mimeType: string;
}

export interface CustomerAftercareContext {
  paymentMode: string;
  policy: { generalDays: number; sealedDays: number; changeOfMindEnabled: boolean } | null;
  items: readonly { id: string; deliveredAt: number | null; photoId: string | null }[];
  events: readonly CustomerRequestEvent[];
  photos: readonly CustomerRequestPhoto[];
}

/** Only the signed-in owner or the existing receipt token can read these public case facts. */
export async function readCustomerAftercareContext(db: D1Database, scope: {
  orderNumber: string;
  receiptTokenHash: string | null;
  customerId: string | null;
}): Promise<CustomerAftercareContext | null> {
  const orderScope = 'orders.order_number = ? AND (orders.receipt_token_hash = ? OR orders.customer_id = ?)';
  const binding = [scope.orderNumber, scope.receiptTokenHash, scope.customerId] as const;
  const order = await db.prepare(`SELECT orders.id, orders.payment_mode AS paymentMode,
    orders.return_policy_snapshot_json AS policyJson FROM orders WHERE ${orderScope} LIMIT 1`)
    .bind(...binding).first<{ id: string; paymentMode: string; policyJson: string | null }>();
  if (!order) return null;

  const [items, events, photos] = await Promise.all([
    db.prepare(`SELECT order_items.id, ${itemDeliverySql()} AS deliveredAt,
      (SELECT product_media.id FROM product_media JOIN products ON products.id = product_media.product_id
        WHERE product_media.product_id = order_items.product_id AND products.status = 'published'
        AND product_media.mime_type LIKE 'image/%' AND ${currentProductMediaSql('product_media')}
        ORDER BY ${currentProductMediaOrder('product_media')}, product_media.id LIMIT 1) AS photoId
      FROM order_items JOIN orders ON orders.id = order_items.order_id WHERE ${orderScope}`)
      .bind(...binding).all<CustomerAftercareContext['items'][number]>(),
    db.prepare(`SELECT e.id AS id, e.return_request_id AS caseId, 'return' AS kind, e.action,
      e.actor_type AS actorType, e.to_status AS toStatus, e.public_message_en AS message, e.created_at AS createdAt
      FROM return_request_events e JOIN return_requests r ON r.id = e.return_request_id
      JOIN order_items ON order_items.id = r.order_item_id JOIN orders ON orders.id = order_items.order_id
      WHERE ${orderScope}
      UNION ALL
      SELECT e.id, e.complaint_id, 'complaint', e.action, e.actor_type, e.to_status, e.public_message_en, e.created_at
      FROM complaint_events e JOIN complaints c ON c.id = e.complaint_id JOIN orders ON orders.id = c.order_id
      WHERE ${orderScope} ORDER BY createdAt DESC, id DESC LIMIT 500`)
      .bind(...binding, ...binding).all<CustomerRequestEvent>(),
    db.prepare(`SELECT f.id, f.return_request_id AS caseId, f.original_name AS name, f.mime_type AS mimeType
      FROM return_evidence f JOIN return_requests r ON r.id = f.return_request_id
      JOIN order_items ON order_items.id = r.order_item_id JOIN orders ON orders.id = order_items.order_id
      WHERE ${orderScope} AND f.uploaded_by_type = 'customer' ORDER BY f.created_at, f.id`)
      .bind(...binding).all<CustomerRequestPhoto>(),
  ]);

  let policy: CustomerAftercareContext['policy'] = null;
  if (order.policyJson) {
    try {
      const recorded = parseReturnPolicySnapshot(order.policyJson);
      policy = { generalDays: recorded.generalRequestWindowDays, sealedDays: recorded.sealedGoodsWindowDays,
        changeOfMindEnabled: recorded.changeOfMindEnabled };
    } catch {
      // Old or incomplete receipts still support case entry without an invented deadline.
    }
  }
  return { paymentMode: order.paymentMode, policy, items: items.results, events: events.results, photos: photos.results };
}

export interface CustomerRequestIndexRow {
  id: string;
  kind: CustomerRequestKind;
  referenceNumber: string;
  orderNumber: string;
  title: string;
  status: string;
  waitingFor: string | null;
  phase: string | null;
  outcome: string | null;
  replacementStatus: string | null;
  refundObligationId: string | null;
  updatedAt: number;
}

export async function listCustomerRequestIndex(db: D1Database, customerId: string) {
  return (await db.prepare(`SELECT r.id AS id, 'return' AS kind, r.reference_number AS referenceNumber,
    orders.order_number AS orderNumber, i.product_name_snapshot AS title, r.status, h.waiting_for AS waitingFor,
    h.phase, r.resolution_outcome AS outcome,
    (SELECT shipment.state FROM return_replacement_shipments shipment WHERE shipment.case_id = r.id
      ORDER BY shipment.created_at DESC, shipment.id DESC LIMIT 1) AS replacementStatus,
    (SELECT obligation.id FROM refund_obligations obligation JOIN refunds ON refunds.id = obligation.source_id
      WHERE refunds.return_request_id = r.id AND obligation.source_kind = 'return_refund'
        AND obligation.customer_id = orders.customer_id LIMIT 1) AS refundObligationId,
    r.updated_at AS updatedAt FROM return_requests r JOIN order_items i ON i.id = r.order_item_id
    JOIN orders ON orders.id = i.order_id LEFT JOIN return_handling h ON h.case_id = r.id
    WHERE orders.customer_id = ?
    UNION ALL
    SELECT c.id, 'complaint', c.reference_number, orders.order_number, c.subject, c.status,
      c.waiting_for, NULL, NULL, NULL, NULL, c.updated_at FROM complaints c JOIN orders ON orders.id = c.order_id
    WHERE orders.customer_id = ? ORDER BY updatedAt DESC, id DESC LIMIT 100`)
    .bind(customerId, customerId).all<CustomerRequestIndexRow>()).results;
}

export async function readOwnedCustomerRequest(db: D1Database, customerId: string, kind: CustomerRequestKind, id: string) {
  const query = kind === 'return'
    ? `SELECT o.order_number AS orderNumber FROM return_requests r JOIN order_items i ON i.id = r.order_item_id
       JOIN orders o ON o.id = i.order_id WHERE r.id = ? AND o.customer_id = ? LIMIT 1`
    : `SELECT o.order_number AS orderNumber FROM complaints c JOIN orders o ON o.id = c.order_id
       WHERE c.id = ? AND o.customer_id = ? LIMIT 1`;
  const order = await db.prepare(query).bind(id, customerId).first<{ orderNumber: string }>();
  if (!order) return null;
  const context = readCustomerAftercareContext(db, { orderNumber: order.orderNumber, receiptTokenHash: null, customerId });
  if (kind === 'return') {
    const [row, aftercare] = await Promise.all([getCustomerReturnDetail(db, id, order.orderNumber, null, customerId), context]);
    return row ? { record: { kind, row }, context: aftercare } as const : null;
  }
  const [row, aftercare] = await Promise.all([getCustomerComplaintDetail(db, id, order.orderNumber, null, customerId), context]);
  return row ? { record: { kind, row }, context: aftercare } as const : null;
}
