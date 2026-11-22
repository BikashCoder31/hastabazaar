import type {AtomicActionProof} from '../../orders/action-recovery';
import {formAnswerSourceSql} from '../../forms/answer-proof';
import {commandReceipt} from '../../workflows/contracts';
import {withOrderOfferSnapshots,type OrderOfferSnapshot} from '../../products/offer-order-contract';
import { publicTrackingReferenceSql } from '../../riders/public-tracking';
import { currentPlatformServiceFeeSql, payableOrderTotalSql } from './platform-service-fee';
import { assertFirstCodFulfillmentAllowed } from '../../orders/first-cod-review';
import { usesSellerShipmentDelivery } from '../../returns/seller-shipment-delivery';
import {
  cancellationChoices,
  cancellationPreview,
  cancelSelectedParcels,
  CancellationConflictError,
} from '../../cancellation/repository';
import { operationalBusinessNotificationStatements } from '../../operations/business-notifications';
import { orderMessageStatements } from '../../operations/order-message-statements';
import { staffMutationGuard } from './staff-mutation-guard';
import type { NepalAddress } from '@/lib/shipping/provider';
import type { OrderStatus } from '@/lib/marketplace/types';
import { buildEarningsAccrualStatements } from '@/lib/db/repositories/payouts';
import {
  readDeliveryPricingSnapshot,
  type DeliveryPricingSnapshot,
} from '@/lib/checkout/delivery-rates';
import { buildFormAnswerInsert } from './form-answers';
import { digestFormRequest } from '@/lib/forms/submission';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { companyDetails } from '@/lib/content/company-details';
import { isPackedWeightGrams, packedWeightRange } from '@/lib/shipping/packed-weight';
import { packedParcelWeightStatement, packedWeightSchemaAvailable } from '@/lib/shipping/packed-weight-storage';

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
export class PackedParcelWeightError extends Error {}

export interface FulfillmentItem {
  offerSnapshot?:OrderOfferSnapshot|null;
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
  buyerPlatformFeePaisa: number;
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
          ${currentPlatformServiceFeeSql()} AS buyerPlatformFeePaisa,
          ${payableOrderTotalSql()} AS grandTotalPaisa,
          orders.payment_mode AS paymentMode, orders.payment_status AS paymentStatus,
          orders.placed_at AS placedAt, orders.delivered_at AS deliveredAt,
          orders.cancelled_at AS cancelledAt, shipments.id AS shipmentId,
          shipments.status AS shipmentStatus, ${publicTrackingReferenceSql('orders.id', 'shipments.tracking_code')} AS trackingCode,
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
  return withOrderOfferSnapshots(database,result.results,item=>item.id);
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

type PreparationInput = {
  orderId: string; sellerId: string; actorId: string; action: SellerFulfillmentAction;
  note: string; requestId: string; now: number; itemIds?:readonly string[]; originalProof?:AtomicActionProof;
  packedParcelWeightGrams?: unknown;
};

export async function transitionSellerFulfillment(database: D1Database, options: PreparationInput): Promise<void> {
  return transitionPreparation(database, options);
}

/** Historical commercial snapshots, not the maker's current route, determine company responsibility. */
export async function listCompanyPreparationGroups(database: D1Database, orderId: string) {
  const rows = await database.prepare(`SELECT i.seller_id AS sellerId,i.fulfillment_status AS status,COUNT(*) AS itemCount,
    MIN(COALESCE(m.maker_name_snapshot,i.seller_name_snapshot)) AS makerName
    FROM order_items i LEFT JOIN managed_commercial_snapshots m ON m.order_item_id=i.id AND m.seller_id=i.seller_id
    WHERE i.order_id=? GROUP BY i.seller_id,i.fulfillment_status
    HAVING COUNT(*)=COUNT(m.id)
      AND MIN(i.fulfillment_status) IN ('confirmed','packing')
      AND MIN(m.legal_seller_reference)=? AND MAX(m.legal_seller_reference)=?
      AND MIN(m.invoice_issuer_reference)=? AND MAX(m.invoice_issuer_reference)=?`)
    .bind(orderId,...Array(4).fill(companyDetails.entityReference)).all<{sellerId:string;status:string;makerName:string;itemCount:number}>();
  return rows.results;
}

export async function transitionCompanyPreparation(database: D1Database, options: PreparationInput & {
  form: { requestId: string; versionId: string; answers: FormAnswerSnapshot };
}): Promise<void> {
  const authority = await staffMutationGuard(database,options.actorId,'order.manage',FulfillmentConflictError,'super_admin');
  if (!['start_packing','ready_for_pickup'].includes(options.action) || options.note.trim().length<8 || options.note.trim().length>500 ||
      !/^[a-zA-Z0-9:_-]{1,100}$/.test(options.requestId) || options.form.requestId!==options.requestId)
    throw new FulfillmentConflictError('Review the company preparation action, note and request reference.');
  const catalogDigest = await digestFormRequest({orderId:options.orderId,sellerId:options.sellerId,actorId:options.actorId,
    action:options.action,note:options.note.trim(),versionId:options.form.versionId,answers:options.form.answers,...(options.itemIds?{itemIds:[...options.itemIds].sort()}:{} )});
  const action=`order.company.${options.action}`;
  const prior=await database.prepare(`SELECT a.actor_id AS actorId,a.action,a.subject_type AS subjectType,a.subject_id AS subjectId,
    a.next_json AS nextJson,f.actor_id AS answerActor,f.config_version_id AS versionId,f.subject_type AS answerType,f.subject_id AS answerId
    FROM audit_logs a LEFT JOIN ${formAnswerSourceSql(database)} f ON f.form_id='staff.order-fulfillment' AND f.request_id=a.request_id
    WHERE a.request_id=? LIMIT 1`).bind(options.requestId).first<{
      actorId:string;action:string;subjectType:string;subjectId:string;nextJson:string;answerActor:string;versionId:string;answerType:string;answerId:string}>();
  if(prior) {
    let digest:unknown;try{digest=JSON.parse(prior.nextJson).catalogDigest;}catch{/* conflict below */}
    if(prior.actorId!==options.actorId||prior.action!==action||prior.subjectType!=='order'||prior.subjectId!==options.orderId||
      prior.answerActor!==options.actorId||prior.versionId!==options.form.versionId||prior.answerType!=='order'||prior.answerId!==options.orderId||digest!==catalogDigest)
      throw new FulfillmentConflictError('Request reference already used for different company preparation content.');
    return;
  }
  if(!(await listCompanyPreparationGroups(database,options.orderId)).some(group=>group.sellerId===options.sellerId))
    throw new FulfillmentConflictError('Only matching company-store items can be prepared here.');
  const guardId=crypto.randomUUID();
  const guards=[...authority.statements,
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN
      EXISTS(SELECT 1 FROM orders WHERE id=? AND operation_request_id=?)
      AND EXISTS(SELECT 1 FROM order_items WHERE order_id=? AND seller_id=?)
      AND NOT EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=? AND i.seller_id=? AND NOT EXISTS(
        SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=i.id AND m.seller_id=i.seller_id
          AND m.participation_route='managed_maker' AND m.legal_seller_reference=? AND m.invoice_issuer_reference=?))
      AND NOT EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=? AND status<>'confirmed')
      AND NOT EXISTS(SELECT 1 FROM seller_restrictions WHERE seller_id=? AND obligation_mode<>'allow_existing'
        AND (mode='disabled' OR (mode='suspended' AND suspended_until>?))) THEN 1 ELSE 0 END`)
      .bind(guardId,options.orderId,options.requestId,options.orderId,options.sellerId,options.orderId,options.sellerId,
        companyDetails.entityReference,companyDetails.entityReference,options.orderId,options.sellerId,options.now),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),
    buildFormAnswerInsert(database,{formId:'staff.order-fulfillment',requestId:options.requestId,versionId:options.form.versionId,
      subjectType:'order',subjectId:options.orderId,actorId:options.actorId,answers:options.form.answers,now:options.now})];
  try { await transitionPreparation(database,options,{guards,action,catalogDigest}); }
  catch(error) {
    if(error instanceof Error && /constraint|guard|invalid_form|awaits staff confirmation/i.test(error.message))
      throw new FulfillmentConflictError('Company items, form or staff authority changed. Refresh the order before retrying.');
    throw error;
  }
}

async function transitionPreparation(
  database: D1Database,
  options: PreparationInput,
  company?: { guards: readonly D1PreparedStatement[]; action: string; catalogDigest: string },
): Promise<void> {
  const definition=sellerActions[options.action];if(!definition||!/^[a-zA-Z0-9:_-]{1,150}$/.test(options.requestId)||options.note.length>500||options.itemIds&&(!options.itemIds.length||options.itemIds.length>100||new Set(options.itemIds).size!==options.itemIds.length||options.itemIds.some(id=>typeof id!=='string'||id.length>160)))throw new FulfillmentConflictError('Review the exact items and request reference.');
  const authoritySql="EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND u.id=? AND u.status='active')";
  if(!company&&!await database.prepare('SELECT 1 WHERE '+authoritySql).bind(options.sellerId,options.actorId).first())throw new FulfillmentConflictError('Only the active owner of this seller portion can prepare these items.');
  const receiptContext={actorId:options.actorId,requestId:options.requestId,expectedRevision:null,now:options.now};
  const receiptSource={action:'order.preparation.command',subjectType:'order',subjectId:options.orderId};
  const receiptPayload={sellerId:options.sellerId,action:options.action,note:options.note.trim(),itemIds:options.itemIds?[...options.itemIds].sort():null,
    ...(options.packedParcelWeightGrams!==undefined?{packedParcelWeightGrams:options.packedParcelWeightGrams}:{})};
  const receipt=company?null:await commandReceipt(database,receiptContext,receiptSource,receiptPayload);if(receipt?.replayed){if(options.originalProof)throw new FulfillmentConflictError('Original authenticated action proof is unavailable; keep this attempt unconfirmed.');return;}
  let packedParcelWeightGrams: number | null = null;
  if (!company && options.action === 'ready_for_pickup' && await packedWeightSchemaAvailable(database)) {
    if (!isPackedWeightGrams(options.packedParcelWeightGrams)) throw new PackedParcelWeightError(packedWeightRange);
    packedParcelWeightGrams = options.packedParcelWeightGrams;
  }
  const selected=options.itemIds?[...options.itemIds].sort():(await database.prepare("SELECT i.id FROM order_items i WHERE i.order_id=? AND i.seller_id=? AND i.fulfillment_status=? AND NOT EXISTS(SELECT 1 FROM order_fulfillment_holds h WHERE h.order_item_id=i.id AND h.ended_at IS NULL AND h.prevents_preparation=1) ORDER BY i.id").bind(options.orderId,options.sellerId,definition.from).all<{id:string}>()).results.map(i=>i.id);
  if(!selected.length)throw new FulfillmentConflictError('No selected items can take this action now. Review the current progress and holds.');const marks=selected.map(()=>'?').join(','),authorityGuard=crypto.randomUUID();
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
  let results:D1Result<unknown>[];try{results = await database.batch([
    database
      .prepare(
        `UPDATE orders SET operation_request_id = ?, updated_at = ?
         WHERE id = ? AND (status IN ('confirmed', 'packing') OR (status='dispatched' AND EXISTS(SELECT 1 FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=orders.id)))
           AND EXISTS (
             SELECT 1 FROM order_items WHERE order_id = orders.id AND seller_id = ?
           )
           AND (SELECT COUNT(*) FROM order_items WHERE order_id=orders.id AND seller_id=? AND fulfillment_status=? AND id IN (${marks}))=?`,
      )
      .bind(
        options.requestId,
        options.now,
        options.orderId,
        options.sellerId,
        options.sellerId,
        transition.from,...selected,selected.length,
      ),
    database
      .prepare(
        `INSERT INTO order_item_status_events (
          id, order_item_id, from_status, to_status, note, actor_id, request_id, created_at
        ) SELECT lower(hex(randomblob(16))), id, fulfillment_status, ?, ?, ?, ?, ?
          FROM order_items WHERE order_id = ? AND seller_id = ?
            AND fulfillment_status = ? AND id IN (${marks})
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
        transition.from,...selected,
        options.orderId,
        options.requestId,
      ),
    database
      .prepare(
        `UPDATE order_items SET fulfillment_status = ?, fulfillment_request_id = ?
         WHERE order_id = ? AND seller_id = ? AND fulfillment_status = ? AND id IN (${marks})
           AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        transition.to,
        options.requestId,
        options.orderId,
        options.sellerId,
        transition.from,...selected,
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
        company?.action ?? `order.seller.${options.action}`,
        options.orderId,
        note,
        JSON.stringify({ itemStatus: transition.from }),
        JSON.stringify({ itemStatus: transition.to, ...(company ? { sellerId: options.sellerId, catalogDigest: company.catalogDigest } : {}),
          ...(packedParcelWeightGrams === null ? {} : { packedParcelWeightGrams, sellerId: options.sellerId }) }),
        options.requestId,
        options.now,
        options.orderId,
        options.requestId,
      ),
    ...(packedParcelWeightGrams === null ? [] : [packedParcelWeightStatement(database, options, packedParcelWeightGrams)]),
    ...(transition.to === 'ready_for_pickup'
      ? await operationalBusinessNotificationStatements(database, {
          kind: 'order.pickup_ready',
          sourceId: options.orderId,
          eventId: options.requestId,
          actorId: options.actorId,
          now: options.now,
        })
      : []),
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=? AND operation_request_id=?) AND (SELECT COUNT(*) FROM order_items WHERE order_id=? AND seller_id=? AND id IN (${marks}) AND fulfillment_status=? AND fulfillment_request_id=?)=? THEN 1 ELSE 0 END`).bind(authorityGuard,options.orderId,options.requestId,options.orderId,options.sellerId,...selected,transition.to,options.requestId,selected.length),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(authorityGuard),
    ...(!company?[database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${authoritySql} AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots WHERE order_item_id IN (${marks}) AND legal_seller_reference=?) THEN 1 ELSE 0 END`).bind(authorityGuard,options.sellerId,options.actorId,...selected,companyDetails.entityReference),database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(authorityGuard)]:[]),
    ...(receipt&&!receipt.replayed?[receipt.insert({ok:true})]:[]),
    ...(company?.guards ?? []),...(options.originalProof?.statements??[]),
  ]);}catch(error){
    if(!company&&await database.prepare('SELECT 1 WHERE '+authoritySql).bind(options.sellerId,options.actorId).first()){
      const recovered=await commandReceipt(database,receiptContext,receiptSource,receiptPayload);if(recovered.replayed&&!options.originalProof)return;
    }
    throw error;
  }

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
    codNotConfirmed?: boolean;
    cause?: string;
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
        subject_type AS subjectType,subject_id AS subjectId FROM ${formAnswerSourceSql(database)} retained_answers
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
      `SELECT status, order_number AS orderNumber, delivery_rate_snapshot_json AS deliverySnapshotJson,
        COALESCE(current_wallet_paisa,wallet_credit_paisa) AS walletCreditPaisa, current_referral_discount_paisa AS referralDiscountPaisa,
        CASE WHEN current_discount_paisa IS NULL THEN promo_discount_paisa ELSE current_promo_discount_paisa END AS promoDiscountPaisa,
        promo_campaign_id AS promoCampaignId,promo_revision AS promoRevision,promo_code AS promoCode,promo_label AS promoLabel,
        COALESCE(current_subtotal_paisa,item_subtotal_paisa) AS itemSubtotalPaisa,
        COALESCE(current_delivery_paisa,delivery_charge_paisa) AS deliveryChargePaisa,
        ${currentPlatformServiceFeeSql()} AS buyerPlatformFeePaisa,
        tax_total_paisa AS taxTotalPaisa,
        ${payableOrderTotalSql()} AS grandTotalPaisa
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
      deliverySnapshotJson: string | null;
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
      codNotConfirmed: options.codNotConfirmed,
      cause: options.cause,
    });
  }

  if (usesSellerShipmentDelivery(order.deliverySnapshotJson)) {
    throw new FulfillmentConflictError('Prepare seller parcels and use their controls for this order.');
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
  const results = await database.batch([
    database
      .prepare(
        `UPDATE orders SET status = ?, operation_request_id = ?,
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
    ...orderMessageStatements(database, { orderId: options.orderId, event: to, now: options.now }),
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
    codNotConfirmed?: boolean;
    cause?: string;
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
      ...(options.codNotConfirmed ? { codNotConfirmed: true } : {}),
      cause: options.cause,
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
