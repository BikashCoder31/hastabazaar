import { assertFirstCodFulfillmentAllowed } from '../../orders/first-cod-review';
import {
  cancellationChoices,
  cancellationPreview,
  cancelSelectedParcels,
  CancellationConflictError,
} from '../../cancellation/repository';
import { operationalBusinessNotificationStatements } from '../../operations/business-notifications';
import { staffMutationGuard } from './staff-mutation-guard';
import type { NepalAddress } from '@/lib/shipping/provider';
import type { OrderStatus } from '@/lib/marketplace/types';
import { buildEarningsAccrualStatements } from '@/lib/db/repositories/payouts';
import type { OrderDocumentSnapshot } from '@/lib/db/repositories/orders';
import {
  readDeliveryPricingSnapshot,
  type DeliveryPricingSnapshot,
} from '@/lib/checkout/delivery-rates';
import { buildFormAnswerInsert } from './form-answers';
import { digestFormRequest } from '@/lib/forms/submission';
import type { FormAnswerSnapshot } from '@/lib/forms/types';

export type ItemFulfillmentStatus =
  | 'confirmed'
  | 'packing'
  | 'ready_for_pickup'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export type SellerFulfillmentAction = 'start_packing' | 'ready_for_pickup';
export type AdminFulfillmentAction = 'dispatch' | 'deliver' | 'cancel';

export class FulfillmentConflictError extends Error {}

export interface FulfillmentItem {
  id: string;
  productId: string | null;
  sellerId: string;
  sellerName: string;
  productName: string;
  sku: string;
  unitPricePaisa: number;
  quantity: number;
  lineTotalPaisa: number;
  commissionPaisa: number;
  fulfillmentStatus: ItemFulfillmentStatus;
}

export interface OrderTimelineEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string;
  actorName: string | null;
  createdAt: number;
}

export interface ShipmentTimelineEvent {
  id: string;
  status: string;
  location: string | null;
  note: string | null;
  occurredAt: number;
}

export interface FulfillmentOrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerEmail: string;
  customerPhone: string;
  address: NepalAddress;
  itemSubtotalPaisa: number;
  deliveryChargePaisa: number;
  grandTotalPaisa: number;
  paymentMode: string;
  paymentStatus: string;
  placedAt: number;
  deliveredAt: number | null;
  cancelledAt: number | null;
  shipmentId: string;
  shipmentStatus: string;
  trackingCode: string | null;
  estimatedMinDays: number;
  estimatedMaxDays: number;
  items: readonly FulfillmentItem[];
  history: readonly OrderTimelineEvent[];
  shipmentHistory: readonly ShipmentTimelineEvent[];
  deliveryPricing:
    | (Pick<DeliveryPricingSnapshot, 'pricingPolicy' | 'baseChargePaisa'> & {
        originalStoreCount: number;
        currentStoreCount: number;
      })
    | null;
}

type FulfillmentOrderBase = Omit<
  FulfillmentOrderDetail,
  'address' | 'items' | 'history' | 'shipmentHistory' | 'deliveryPricing'
> & {
  addressJson: string;
  deliveryRateSnapshotJson: string | null;
  originalStoreCount: number;
  currentStoreCount: number;
};

async function loadOrderBase(
  database: D1Database,
  whereSql: string,
  bindings: readonly unknown[],
): Promise<FulfillmentOrderBase | null> {
  return (
    (await database
      .prepare(
        `SELECT orders.id, orders.order_number AS orderNumber, orders.status,
          orders.customer_email AS customerEmail, orders.customer_phone AS customerPhone,
          orders.shipping_address_json AS addressJson, orders.delivery_rate_snapshot_json AS deliveryRateSnapshotJson,
          (SELECT COUNT(DISTINCT original_items.seller_id) FROM order_items original_items WHERE original_items.order_id=orders.id) AS originalStoreCount,
          (SELECT COUNT(DISTINCT current_items.seller_id) FROM order_items current_items WHERE current_items.order_id=orders.id AND current_items.fulfillment_status<>'cancelled') AS currentStoreCount,
          COALESCE(orders.current_subtotal_paisa,orders.item_subtotal_paisa) AS itemSubtotalPaisa,
          COALESCE(orders.current_delivery_paisa,orders.delivery_charge_paisa) AS deliveryChargePaisa,
          COALESCE(orders.current_total_paisa,orders.grand_total_paisa) AS grandTotalPaisa,
          orders.payment_mode AS paymentMode, orders.payment_status AS paymentStatus,
          orders.placed_at AS placedAt, orders.delivered_at AS deliveredAt,
          orders.cancelled_at AS cancelledAt, shipments.id AS shipmentId,
          shipments.status AS shipmentStatus, shipments.tracking_code AS trackingCode,
          shipments.estimated_min_days AS estimatedMinDays,
          shipments.estimated_max_days AS estimatedMaxDays
         FROM orders INNER JOIN shipments ON shipments.order_id = orders.id
         WHERE ${whereSql} LIMIT 1`,
      )
      .bind(...bindings)
      .first<FulfillmentOrderBase>()) ?? null
  );
}

async function loadItems(
  database: D1Database,
  orderId: string,
  sellerId?: string,
): Promise<readonly FulfillmentItem[]> {
  const sellerFilter = sellerId ? 'AND order_items.seller_id = ?' : '';
  const result = await database
    .prepare(
      `SELECT order_items.id, order_items.product_id AS productId,
        order_items.seller_id AS sellerId,
        order_items.seller_name_snapshot AS sellerName,
        order_items.product_name_snapshot AS productName,
        order_items.sku_snapshot AS sku,
        order_items.unit_price_paisa AS unitPricePaisa, order_items.quantity,
        order_items.line_total_paisa AS lineTotalPaisa,
        order_items.commission_paisa AS commissionPaisa,
        order_items.fulfillment_status AS fulfillmentStatus
       FROM order_items WHERE order_items.order_id = ? ${sellerFilter}
       ORDER BY order_items.created_at ASC`,
    )
    .bind(...(sellerId ? [orderId, sellerId] : [orderId]))
    .all<FulfillmentItem>();
  return result.results;
}

async function loadHistory(
  database: D1Database,
  orderId: string,
): Promise<{
  history: readonly OrderTimelineEvent[];
  shipmentHistory: readonly ShipmentTimelineEvent[];
}> {
  const [orderEvents, shipmentEvents] = await Promise.all([
    database
      .prepare(
        `SELECT order_status_events.id, order_status_events.from_status AS fromStatus,
          order_status_events.to_status AS toStatus, order_status_events.note,
          users.display_name AS actorName, order_status_events.created_at AS createdAt
         FROM order_status_events
         LEFT JOIN users ON users.id = order_status_events.actor_id
         WHERE order_status_events.order_id = ? ORDER BY order_status_events.created_at DESC`,
      )
      .bind(orderId)
      .all<OrderTimelineEvent>(),
    database
      .prepare(
        `SELECT shipment_events.id, shipment_events.status, shipment_events.location,
          shipment_events.note, shipment_events.occurred_at AS occurredAt
         FROM shipment_events INNER JOIN shipments ON shipments.id = shipment_events.shipment_id
         WHERE shipments.order_id = ? ORDER BY shipment_events.occurred_at DESC`,
      )
      .bind(orderId)
      .all<ShipmentTimelineEvent>(),
  ]);
  return {
    history: orderEvents.results,
    shipmentHistory: shipmentEvents.results,
  };
}

export async function getOperationsOrderDetail(
  database: D1Database,
  orderId: string,
): Promise<FulfillmentOrderDetail | null> {
  const base = await loadOrderBase(database, 'orders.id = ?', [orderId]);
  if (!base) return null;
  const [items, timelines] = await Promise.all([
    loadItems(database, base.id),
    loadHistory(database, base.id),
  ]);
  const pricing = readDeliveryPricingSnapshot(
    base.deliveryRateSnapshotJson,
    base.deliveryChargePaisa,
  );
  const {
    addressJson,
    deliveryRateSnapshotJson: _deliveryRateSnapshotJson,
    originalStoreCount,
    currentStoreCount,
    ...safeBase
  } = base;
  return {
    ...safeBase,
    address: JSON.parse(addressJson) as NepalAddress,
    items,
    ...timelines,
    deliveryPricing:
      pricing.kind === 'current'
        ? {
            pricingPolicy: pricing.snapshot.pricingPolicy,
            baseChargePaisa: pricing.snapshot.baseChargePaisa,
            originalStoreCount,
            currentStoreCount,
          }
        : null,
  };
}

export async function getSellerOrderDetail(
  database: D1Database,
  orderId: string,
  sellerId: string,
): Promise<FulfillmentOrderDetail | null> {
  const base = await loadOrderBase(
    database,
    `orders.id = ? AND EXISTS (
      SELECT 1 FROM order_items WHERE order_items.order_id = orders.id
        AND order_items.seller_id = ?
    )`,
    [orderId, sellerId],
  );
  if (!base) return null;
  const [items, timelines] = await Promise.all([
    loadItems(database, base.id, sellerId),
    loadHistory(database, base.id),
  ]);
  const pricing = readDeliveryPricingSnapshot(
    base.deliveryRateSnapshotJson,
    base.deliveryChargePaisa,
  );
  const {
    addressJson,
    deliveryRateSnapshotJson: _deliveryRateSnapshotJson,
    originalStoreCount,
    currentStoreCount,
    ...safeBase
  } = base;
  return {
    ...safeBase,
    address: JSON.parse(addressJson) as NepalAddress,
    items,
    ...timelines,
    deliveryPricing:
      pricing.kind === 'current'
        ? {
            pricingPolicy: pricing.snapshot.pricingPolicy,
            baseChargePaisa: pricing.snapshot.baseChargePaisa,
            originalStoreCount,
            currentStoreCount,
          }
        : null,
  };
}

const sellerActions: Record<
  SellerFulfillmentAction,
  { from: ItemFulfillmentStatus; to: ItemFulfillmentStatus; note: string }
> = {
  start_packing: {
    from: 'confirmed',
    to: 'packing',
    note: 'Seller started packing their items',
  },
  ready_for_pickup: {
    from: 'packing',
    to: 'ready_for_pickup',
    note: 'Seller marked their items ready for carrier pickup',
  },
};

export async function transitionSellerFulfillment(
  database: D1Database,
  options: {
    orderId: string;
    sellerId: string;
    actorId: string;
    action: SellerFulfillmentAction;
    note: string;
    requestId: string;
    now: number;
  },
): Promise<void> {
  await assertFirstCodFulfillmentAllowed(
    database,
    options.orderId,
    FulfillmentConflictError,
  );
  const restriction = await database
    .prepare(
      `SELECT mode,suspended_until AS suspendedUntil,obligation_mode AS obligationMode
     FROM seller_restrictions WHERE seller_id=?`,
    )
    .bind(options.sellerId)
    .first<{
      mode: string;
      suspendedUntil: number | null;
      obligationMode: string;
    }>();
  const restricted = Boolean(
    restriction &&
    (restriction.mode === 'disabled' ||
      (restriction.mode === 'suspended' &&
        restriction.suspendedUntil !== null &&
        restriction.suspendedUntil > options.now)),
  );
  if (restricted && restriction?.obligationMode !== 'allow_existing')
    throw new FulfillmentConflictError(
      'This existing obligation requires an administrative fulfillment decision.',
    );
  const transition = sellerActions[options.action];
  const note = options.note.trim() || transition.note;
  const aggregateStatusSql = `CASE
    WHEN EXISTS(SELECT 1 FROM order_items WHERE order_id=orders.id AND fulfillment_status IN ('dispatched','delivered')) THEN 'dispatched'
    WHEN NOT EXISTS (
      SELECT 1 FROM order_items
      WHERE order_items.order_id = orders.id
        AND order_items.fulfillment_status NOT IN ('ready_for_pickup','cancelled')
    ) THEN 'ready_for_pickup'
    ELSE 'packing'
  END`;
  const results = await database.batch([
    database
      .prepare(
        `UPDATE orders SET operation_request_id = ?, updated_at = ?
         WHERE id = ? AND (status IN ('confirmed', 'packing') OR (status='dispatched' AND EXISTS(SELECT 1 FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=orders.id)))
           AND EXISTS (
             SELECT 1 FROM order_items WHERE order_id = orders.id AND seller_id = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM order_items WHERE order_id = orders.id AND seller_id = ?
               AND fulfillment_status != ?
           )`,
      )
      .bind(
        options.requestId,
        options.now,
        options.orderId,
        options.sellerId,
        options.sellerId,
        transition.from,
      ),
    database
      .prepare(
        `INSERT INTO order_item_status_events (
          id, order_item_id, from_status, to_status, note, actor_id, request_id, created_at
        ) SELECT lower(hex(randomblob(16))), id, fulfillment_status, ?, ?, ?, ?, ?
          FROM order_items WHERE order_id = ? AND seller_id = ?
            AND fulfillment_status = ?
            AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        transition.to,
        note,
        options.actorId,
        options.requestId,
        options.now,
        options.orderId,
        options.sellerId,
        transition.from,
        options.orderId,
        options.requestId,
      ),
    database
      .prepare(
        `UPDATE order_items SET fulfillment_status = ?, fulfillment_request_id = ?
         WHERE order_id = ? AND seller_id = ? AND fulfillment_status = ?
           AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        transition.to,
        options.requestId,
        options.orderId,
        options.sellerId,
        transition.from,
        options.orderId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO order_status_events (
          id, order_id, from_status, to_status, note, actor_id, request_id, created_at
        ) SELECT ?, orders.id, orders.status, ${aggregateStatusSql}, ?, ?, ?, ?
          FROM orders WHERE orders.id = ? AND orders.operation_request_id = ?
            AND orders.status != ${aggregateStatusSql}`,
      )
      .bind(
        crypto.randomUUID(),
        note,
        options.actorId,
        options.requestId,
        options.now,
        options.orderId,
        options.requestId,
      ),
    database
      .prepare(
        `UPDATE orders SET status = ${aggregateStatusSql}
         WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(options.orderId, options.requestId),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, ?, 'order', ?, ?, ?, ?, ?, NULL, ?
          WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        `order.seller.${options.action}`,
        options.orderId,
        note,
        JSON.stringify({ itemStatus: transition.from }),
        JSON.stringify({ itemStatus: transition.to }),
        options.requestId,
        options.now,
        options.orderId,
        options.requestId,
      ),
    ...(transition.to === 'ready_for_pickup'
      ? await operationalBusinessNotificationStatements(database, {
          kind: 'order.pickup_ready',
          sourceId: options.orderId,
          eventId: options.requestId,
          actorId: options.actorId,
          now: options.now,
        })
      : []),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new FulfillmentConflictError(
      'This action is no longer available. Refresh the order.',
    );
  }
}

export async function transitionAdminFulfillment(
  database: D1Database,
  options: {
    orderId: string;
    actorId: string;
    action: AdminFulfillmentAction;
    note: string;
    trackingCode?: string;
    requestId: string;
    now: number;
    form?: {
      requestId: string;
      versionId: string;
      answers: FormAnswerSnapshot;
    };
  },
): Promise<void> {
  const authority = await staffMutationGuard(
    database,
    options.actorId,
    'order.manage',
    FulfillmentConflictError,
  );
  if (options.action !== 'cancel')
    await assertFirstCodFulfillmentAllowed(
      database,
      options.orderId,
      FulfillmentConflictError,
    );
  if (options.form && options.form.requestId !== options.requestId)
    throw new FulfillmentConflictError(
      'Form request reference does not match the fulfilment request.',
    );
  const catalogDigest = options.form
    ? await digestFormRequest({
        orderId: options.orderId,
        actorId: options.actorId,
        action: options.action,
        note: options.note.trim(),
        trackingCode: options.trackingCode?.trim() || null,
        versionId: options.form.versionId,
        answers: options.form.answers,
      })
    : null;
  if (options.form && options.action !== 'cancel') {
    const prior = await database
      .prepare(`SELECT actor_id AS actorId,action,subject_type AS subjectType,
      subject_id AS subjectId,next_json AS nextJson FROM audit_logs WHERE request_id=? LIMIT 1`)
      .bind(options.requestId)
      .first<{
        actorId: string;
        action: string;
        subjectType: string;
        subjectId: string;
        nextJson: string | null;
      }>();
    if (prior) {
      let savedDigest: unknown;
      try {
        savedDigest = JSON.parse(prior.nextJson ?? '').catalogDigest;
      } catch {
        /* conflict below */
      }
      const answer = await database
        .prepare(`SELECT actor_id AS actorId,config_version_id AS versionId,
        subject_type AS subjectType,subject_id AS subjectId FROM form_answer_sets
        WHERE form_id='staff.order-fulfillment' AND request_id=? LIMIT 1`)
        .bind(options.requestId)
        .first<{
          actorId: string;
          versionId: string;
          subjectType: string;
          subjectId: string;
        }>();
      if (
        prior.actorId !== options.actorId ||
        prior.action !== `order.${options.action}` ||
        prior.subjectType !== 'order' ||
        prior.subjectId !== options.orderId ||
        savedDigest !== catalogDigest ||
        answer?.actorId !== options.actorId ||
        answer?.versionId !== options.form.versionId ||
        answer?.subjectType !== 'order' ||
        answer?.subjectId !== options.orderId
      )
        throw new FulfillmentConflictError(
          'Request reference already used for different fulfilment content.',
        );
      return;
    }
  }
  if (
    options.action !== 'cancel' &&
    (await database
      .prepare(
        'SELECT p.shipping_job_id FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=? LIMIT 1',
      )
      .bind(options.orderId)
      .first())
  )
    throw new FulfillmentConflictError(
      'Use the seller parcel controls for this order.',
    );
  const order = await database
    .prepare(
      `SELECT status, order_number AS orderNumber,
        COALESCE(current_wallet_paisa,wallet_credit_paisa) AS walletCreditPaisa, current_referral_discount_paisa AS referralDiscountPaisa,
        CASE WHEN current_discount_paisa IS NULL THEN promo_discount_paisa ELSE current_promo_discount_paisa END AS promoDiscountPaisa,
        promo_campaign_id AS promoCampaignId,promo_revision AS promoRevision,promo_code AS promoCode,promo_label AS promoLabel,
        COALESCE(current_subtotal_paisa,item_subtotal_paisa) AS itemSubtotalPaisa,
        COALESCE(current_delivery_paisa,delivery_charge_paisa) AS deliveryChargePaisa,
        buyer_platform_fee_paisa AS buyerPlatformFeePaisa,
        tax_total_paisa AS taxTotalPaisa,
        COALESCE(current_total_paisa,grand_total_paisa) AS grandTotalPaisa
       FROM orders WHERE id = ? LIMIT 1`,
    )
    .bind(options.orderId)
    .first<{
      status: OrderStatus;
      walletCreditPaisa: number;
      referralDiscountPaisa: number;
      promoDiscountPaisa: number;
      promoCampaignId: string | null;
      promoRevision: number | null;
      promoCode: string | null;
      promoLabel: string | null;
      orderNumber: string;
      itemSubtotalPaisa: number;
      deliveryChargePaisa: number;
      buyerPlatformFeePaisa: number;
      taxTotalPaisa: number;
      grandTotalPaisa: number;
    }>();
  if (!order) throw new FulfillmentConflictError('Order not found.');
  if (options.action === 'cancel') {
    const priorCancellation =
      options.form &&
      (await database
        .prepare(`SELECT id FROM order_cancellation_events
      WHERE id=? AND order_id=? UNION ALL SELECT id FROM order_cancellation_reviews
      WHERE id=? AND order_id=? LIMIT 1`)
        .bind(
          options.requestId,
          options.orderId,
          options.requestId,
          options.orderId,
        )
        .first());
    if (
      !['confirmed', 'packing', 'ready_for_pickup'].includes(order.status) &&
      !priorCancellation
    ) {
      throw new FulfillmentConflictError(
        'This order can no longer be cancelled.',
      );
    }
    return cancelOrder(database, {
      orderId: options.orderId,
      expectedStatus: order.status,
      actorId: options.actorId,
      note: options.note,
      requestId: options.requestId,
      now: options.now,
      recordInventoryAdjustments: true,
      staffGuards: authority.statements,
      form: options.form,
    });
  }

  const from: OrderStatus =
    options.action === 'dispatch' ? 'ready_for_pickup' : 'dispatched';
  const to: OrderStatus =
    options.action === 'dispatch' ? 'dispatched' : 'delivered';
  const itemFrom: ItemFulfillmentStatus = from;
  const itemTo: ItemFulfillmentStatus = to;
  if (order.status !== from)
    throw new FulfillmentConflictError(
      'This action is no longer available. Refresh the order.',
    );
  const tracking = options.trackingCode?.trim() || null;
  if (
    options.action === 'dispatch' &&
    (!tracking || tracking.length < 4 || tracking.length > 80)
  ) {
    throw new FulfillmentConflictError(
      'Enter a tracking or manual consignment reference of 4–80 characters.',
    );
  }
  const note = options.note.trim();
  let paymentReceiptSnapshot: OrderDocumentSnapshot | null = null;
  if (options.action === 'deliver') {
    const receiptItems = await database
      .prepare(
        `SELECT product_name_snapshot AS productName,
        seller_name_snapshot AS sellerName, sku_snapshot AS sku,
        unit_price_paisa AS unitPricePaisa, quantity,
        line_total_paisa AS lineTotalPaisa
       FROM order_items WHERE order_id = ? AND fulfillment_status<>'cancelled' ORDER BY created_at ASC`,
      )
      .bind(options.orderId)
      .all<OrderDocumentSnapshot['items'][number]>();
    paymentReceiptSnapshot = {
      documentTitle: 'Cash on delivery payment receipt',
      taxDocument: false,
      orderNumber: order.orderNumber,
      issuedAt: options.now,
      currency: 'NPR',
      paymentMethod: 'Cash on delivery',
      paymentStatus: 'paid',
      items: receiptItems.results,
      itemSubtotalPaisa: order.itemSubtotalPaisa,
      deliveryChargePaisa: order.deliveryChargePaisa,
      buyerPlatformFeePaisa: order.buyerPlatformFeePaisa,
      taxTotalPaisa: order.taxTotalPaisa,
      grandTotalPaisa: order.grandTotalPaisa,
      walletCreditPaisa: order.walletCreditPaisa,
      referralDiscountPaisa: order.referralDiscountPaisa,
      promoDiscountPaisa: order.promoDiscountPaisa,
      ...(order.promoCampaignId &&
      order.promoRevision &&
      order.promoCode &&
      order.promoLabel
        ? {
            promo: {
              campaignId: order.promoCampaignId,
              revision: order.promoRevision,
              code: order.promoCode,
              label: order.promoLabel,
            },
          }
        : {}),
    };
  }
  const results = await database.batch([
    database
      .prepare(
        `UPDATE orders SET status = ?, operation_request_id = ?,
          payment_status = CASE WHEN ? = 'delivered' THEN 'paid' ELSE payment_status END,
          delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END,
          updated_at = ?
         WHERE id = ? AND status = ?
           AND EXISTS (
             SELECT 1 FROM order_items WHERE order_id = orders.id
               AND fulfillment_status = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM order_items WHERE order_id = orders.id
               AND fulfillment_status NOT IN (?, 'cancelled')
           )`,
      )
      .bind(
        to,
        options.requestId,
        to,
        to,
        options.now,
        options.now,
        options.orderId,
        from,
        itemFrom,
        itemFrom,
      ),
    ...(options.form
      ? [
          database
            .prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status=? AND operation_request_id=?) THEN 1 ELSE 0 END`)
            .bind(
              `${options.requestId}:fulfilment-guard`,
              options.orderId,
              to,
              options.requestId,
            ),
          database
            .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
            .bind(`${options.requestId}:fulfilment-guard`),
        ]
      : []),
    database
      .prepare(
        `INSERT INTO order_status_events (
          id, order_id, from_status, to_status, note, actor_id, request_id, created_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.orderId,
        from,
        to,
        note,
        options.actorId,
        options.requestId,
        options.now,
        options.orderId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO order_item_status_events (
          id, order_item_id, from_status, to_status, note, actor_id, request_id, created_at
        ) SELECT lower(hex(randomblob(16))), id, fulfillment_status, ?, ?, ?, ?, ?
          FROM order_items WHERE order_id = ? AND fulfillment_status = ?
            AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        itemTo,
        note,
        options.actorId,
        options.requestId,
        options.now,
        options.orderId,
        itemFrom,
        options.orderId,
        options.requestId,
      ),
    database
      .prepare(
        `UPDATE order_items SET fulfillment_status = ?, fulfillment_request_id = ?
         WHERE order_id = ? AND fulfillment_status = ?
           AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        itemTo,
        options.requestId,
        options.orderId,
        itemFrom,
        options.orderId,
        options.requestId,
      ),
    database
      .prepare(
        `UPDATE shipments SET status = ?, tracking_code = COALESCE(?, tracking_code), updated_at = ?
         WHERE order_id = ? AND EXISTS (
           SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?
         )`,
      )
      .bind(
        options.action === 'dispatch' ? 'in_transit' : 'delivered',
        tracking,
        options.now,
        options.orderId,
        options.orderId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO shipment_events (
          id, shipment_id, provider_event_id, status, location, note, occurred_at, received_at
        ) SELECT ?, id, ?, ?, NULL, ?, ?, ? FROM shipments
          WHERE order_id = ? AND EXISTS (
            SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?
          )`,
      )
      .bind(
        crypto.randomUUID(),
        options.requestId,
        options.action === 'dispatch' ? 'in_transit' : 'delivered',
        note,
        options.now,
        options.now,
        options.orderId,
        options.orderId,
        options.requestId,
      ),
    database
      .prepare(
        `UPDATE payments SET status = 'captured', updated_at = ?
         WHERE order_id = ? AND ? = 'delivered' AND EXISTS (
           SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?
         )`,
      )
      .bind(
        options.now,
        options.orderId,
        to,
        options.orderId,
        options.requestId,
      ),
    ...(paymentReceiptSnapshot
      ? [
          database
            .prepare(
              `INSERT INTO order_documents (
                id, order_id, kind, document_number, snapshot_json, status,
                request_id, issued_at, voided_at
              ) SELECT ?, ?, 'payment_receipt', ?, ?, 'issued', ?, ?, NULL
                WHERE EXISTS (
                  SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?
                )`,
            )
            .bind(
              crypto.randomUUID(),
              options.orderId,
              `RCPT-${order.orderNumber}`,
              JSON.stringify(paymentReceiptSnapshot),
              `${options.requestId}:payment-receipt`,
              options.now,
              options.orderId,
              options.requestId,
            ),
        ]
      : []),
    ...(options.action === 'deliver'
      ? buildEarningsAccrualStatements(database, {
          orderId: options.orderId,
          now: options.now,
        })
      : []),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, ?, 'order', ?, ?, ?, ?, ?, NULL, ?
          WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        `order.${options.action}`,
        options.orderId,
        note,
        JSON.stringify({ status: from }),
        JSON.stringify({
          status: to,
          trackingCode: tracking,
          ...(catalogDigest ? { catalogDigest } : {}),
        }),
        options.requestId,
        options.now,
        options.orderId,
        options.requestId,
      ),
    ...(options.form
      ? [
          buildFormAnswerInsert(database, {
            formId: 'staff.order-fulfillment',
            requestId: options.requestId,
            versionId: options.form.versionId,
            subjectType: 'order',
            subjectId: options.orderId,
            actorId: options.actorId,
            answers: options.form.answers,
            now: options.now,
          }),
        ]
      : []),
    ...authority.statements,
  ]);
  // D1 metadata includes trigger writes; the in-batch guard checks the direct row.
  if ((results[0].meta.changes ?? 0) < 1) {
    throw new FulfillmentConflictError(
      'This action is no longer available. Refresh the order.',
    );
  }
}

export async function cancelCustomerOrder(
  database: D1Database,
  options: {
    orderNumber: string;
    receiptTokenHash: string | null;
    customerId?: string | null;
    note: string;
    requestId: string;
    now: number;
  },
): Promise<void> {
  const order = await database
    .prepare(
      `SELECT id, status FROM orders
       WHERE order_number = ?
         AND (receipt_token_hash = ? OR customer_id = ?) LIMIT 1`,
    )
    .bind(
      options.orderNumber,
      options.receiptTokenHash,
      options.customerId ?? null,
    )
    .first<{ id: string; status: OrderStatus }>();
  if (
    !order ||
    !['confirmed', 'packing', 'ready_for_pickup', 'dispatched'].includes(
      order.status,
    )
  ) {
    throw new FulfillmentConflictError(
      'This order can no longer be cancelled online.',
    );
  }
  await cancelOrder(database, {
    orderId: order.id,
    expectedStatus: 'confirmed',
    actorId: null,
    note: options.note,
    requestId: options.requestId,
    now: options.now,
    recordInventoryAdjustments: false,
    customerId: options.customerId,
    receiptTokenHash: options.receiptTokenHash,
  });
}

async function cancelOrder(
  database: D1Database,
  options: {
    orderId: string;
    expectedStatus: OrderStatus;
    actorId: string | null;
    note: string;
    requestId: string;
    now: number;
    recordInventoryAdjustments: boolean;
    customerId?: string | null;
    receiptTokenHash?: string | null;
    staffGuards?: readonly D1PreparedStatement[];
    form?: {
      requestId: string;
      versionId: string;
      answers: FormAnswerSnapshot;
    };
  },
): Promise<void> {
  const order = await database
    .prepare('SELECT order_number AS number FROM orders WHERE id=?')
    .bind(options.orderId)
    .first<{ number: string }>();
  if (!order) throw new FulfillmentConflictError('Order not found.');
  const access = {
    orderNumber: order.number,
    actorId: options.actorId ?? undefined,
    customerId: options.customerId,
    receiptTokenHash: options.receiptTokenHash,
  };
  try {
    const previous =
      options.form &&
      (await database
        .prepare(`SELECT e.seller_ids_json AS sellers,
    a.next_json AS catalogJson FROM order_cancellation_events e
    JOIN audit_logs a ON a.request_id=? AND a.action='cancellation.form_submitted'
    WHERE e.id=? AND e.order_id=? LIMIT 1`)
        .bind(
          `${options.requestId}:catalog`,
          options.requestId,
          options.orderId,
        )
        .first<{ sellers: string; catalogJson: string }>());
    const saved = previous
      ? (JSON.parse(previous.catalogJson) as { fingerprint?: unknown })
      : null;
    const sellerIds = previous
      ? (JSON.parse(previous.sellers) as string[])
      : (await cancellationChoices(database, access)).map((r) => r.id);
    const fingerprint =
      typeof saved?.fingerprint === 'string'
        ? saved.fingerprint
        : (await cancellationPreview(database, access, sellerIds)).fingerprint;
    await cancelSelectedParcels(database, access, {
      sellerIds,
      fingerprint,
      requestId: options.requestId,
      note: options.note,
      now: options.now,
      ...(options.form
        ? {
            form: {
              ...options.form,
              formId: 'staff.order-fulfillment' as const,
            },
          }
        : {}),
    });
  } catch (error) {
    throw new FulfillmentConflictError(
      error instanceof CancellationConflictError
        ? error.message
        : 'Cancellation requires a current review.',
    );
  }
}
