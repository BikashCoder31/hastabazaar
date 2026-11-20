import {preparePaymentException} from '../payments/payment-exceptions';
import { assertFirstCodFulfillmentAllowed } from '../orders/first-cod-review';
import { payableOrderTotalSql } from '../db/repositories/platform-service-fee';
import { readOriginalBuyerLinePricing } from '../db/repositories/order-item-pricing-snapshots';
import { allocateCancellationItems, calculateCancellation } from '../cancellation/accounting';
import {
  readSavedSellerShipmentCharges,
  SELLER_SHIPMENT_DELIVERY_POLICY,
  usesSellerShipmentDelivery,
} from '../returns/seller-shipment-delivery';
import {
  cancellationPreview,
  cancelSelectedParcels,
  currentReceiptSnapshot,
} from '../cancellation/repository';
import {
  approvedRiderSql,
  riderReportAcceptance,
  riderGuard,
  riderNotifications,
} from '../riders/repository';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { buildFormAnswerInsert } from '../db/repositories/form-answers';
import { digestFormRequest } from '../forms/submission';
import type { FormAnswerSnapshot } from '../forms/types';
import { safeCourierUrl, parseLocation } from '../delivery/validation';
import { buildEarningsAccrualStatements } from '../db/repositories/payouts';
import { accrueManagedEntitlements } from '../db/repositories/managed-settlements';
import { issueManagedInvoiceGroups } from '../db/repositories/managed-documents';
import { withReceiptGroups } from '../documents/billing';
import type { OrderDocumentSnapshot } from '../db/repositories/orders';
import { receiptNumberStatements,withLiveInvoiceReferences } from '../db/repositories/billing-documents';
import { getEffectiveBusinessSetting } from '../db/repositories/business-settings';
import {
  addKathmanduBusinessDays,
  buildRiderAssignmentPolicySnapshot,
  riderCompensationForOutcome,
  type RiderAssignmentPolicySnapshot,
  type RiderFinancePolicy,
  type RiderTripOutcome,
} from '../riders/operations-policy';
export class ParcelConflictError extends Error {}
export interface Parcel {
  id: string;
  orderId: string;
  sellerId: string;
  sellerName: string;
  status: string;
  codDuePaisa: number;
  collectedPaisa: number;
  remittedPaisa: number;
  version: number;
  method: string | null;
  riderUserId: string | null;
  courierName: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  deliveredAt: number | null;
  paymentMode: string;
  openBoxRequired: number;
  openBoxSnapshotJson: string | null;
  riderFinanceSnapshotJson: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  positionAt: number | null;
  courierCostPaisa: number;
}
const selectParcel = `SELECT j.id,j.order_id AS orderId,j.seller_id AS sellerId,
 (SELECT MAX(i.seller_name_snapshot) FROM order_items i WHERE i.order_id=j.order_id AND i.seller_id=j.seller_id) AS sellerName,
 j.status,p.cod_due_paisa AS codDuePaisa,p.collected_paisa AS collectedPaisa,p.remitted_paisa AS remittedPaisa,p.version,
 p.method,p.rider_user_id AS riderUserId,p.courier_name AS courierName,j.tracking_code AS trackingCode,p.tracking_url AS trackingUrl,p.delivered_at AS deliveredAt,o.payment_mode AS paymentMode,
 p.open_box_required AS openBoxRequired,p.open_box_snapshot_json AS openBoxSnapshotJson,p.rider_finance_snapshot_json AS riderFinanceSnapshotJson,
 (SELECT COALESCE(SUM(c.amount_paisa),0) FROM parcel_courier_costs c WHERE c.shipping_job_id=j.id) AS courierCostPaisa,
 p.latitude,p.longitude,p.accuracy,p.position_at AS positionAt FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id`;
export async function listParcels(
  db: D1Database,
  orderId: string,
  sellerId?: string,
) {
  const rows = await db
    .prepare(
      selectParcel +
        ' WHERE j.order_id=?' +
        (sellerId ? ' AND j.seller_id=?' : '') +
        ' ORDER BY j.seller_id',
    )
    .bind(...(sellerId ? [orderId, sellerId] : [orderId]))
    .all<Parcel>();
  return rows.results;
}
export function allocateOrderCash(
  total: number,
  weights: readonly { sellerId: string; amount: number }[],
) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !weights.length ||
    weights.some((w) => !Number.isSafeInteger(w.amount) || w.amount <= 0)
  )
    throw new ParcelConflictError('Invalid order allocation.');
  const sorted = [...weights].sort((a, b) =>
    a.sellerId.localeCompare(b.sellerId),
  );
  const sum = sorted.reduce((n, w) => n + BigInt(w.amount), BigInt(0));
  const parts = sorted.map((w) => ({
    sellerId: w.sellerId,
    amount: Number((BigInt(total) * BigInt(w.amount)) / sum),
    remainder: (BigInt(total) * BigInt(w.amount)) % sum,
  }));
  let remaining = total - parts.reduce((n, w) => n + w.amount, 0);
  for (const part of [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.sellerId.localeCompare(b.sellerId)
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (remaining-- > 0) part.amount++;
  }
  return parts.map(({ sellerId, amount }) => ({ sellerId, amount }));
}
function assertion(
  db: D1Database,
  predicate: string,
  bindings: unknown[] = [],
) {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`,
      )
      .bind(id, ...bindings),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),
  ];
}
const staffSql = `EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN ('admin','super_admin'))`;
async function repeated(
  db: D1Database,
  id: string,
  actor: string,
  payload: string,
) {
  const row = await db
    .prepare(
      'SELECT actor_id AS actor,payload_json AS payload FROM parcel_operation_events WHERE id=?',
    )
    .bind(id)
    .first<{ actor: string; payload: string }>();
  if (!row) return false;
  if (row.actor !== actor || row.payload !== payload)
    throw new ParcelConflictError(
      'This request reference was already used for another operation.',
    );
  return true;
}
function parcelAudit(
  db: D1Database,
  o: { actorId: string; requestId: string; now: number },
  orderId: string,
  action: string,
) {
  return db
    .prepare(
      "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at) VALUES (?,?,?,'order',?,'Parcel operation recorded',?,?)",
    )
    .bind(
      crypto.randomUUID(),
      o.actorId,
      'parcel.' + action,
      orderId,
      o.requestId + ':audit',
      o.now,
    );
}
async function transact(db: D1Database, statements: D1PreparedStatement[]) {
  try {
    await db.batch(statements);
  } catch {
    throw new ParcelConflictError(
      'The record changed or the reference was already used. Refresh before trying again.',
    );
  }
}

function financeFromAssignment(parcel: Parcel): RiderFinancePolicy | null {
  if (!parcel.riderFinanceSnapshotJson) return null;
  try {
    const parsed = JSON.parse(
      parcel.riderFinanceSnapshotJson,
    ) as RiderAssignmentPolicySnapshot['finance'];
    return parsed.value ?? null;
  } catch {
    return null;
  }
}
async function cashObligationSnapshot(
  db: D1Database,
  parcel: Parcel,
  riderId: string,
  now: number,
) {
  const period = await getEffectiveBusinessSetting(
    db,
    'rider_remittance_business_days',
    now,
  );
  let finance: RiderFinancePolicy | null = null,
    financeVersionId: string | null = null;
  try {
    const current = await getEffectiveBusinessSetting(
      db,
      'rider_finance_policy',
      now,
    );
    finance = current.source === 'persisted' ? current.value : null;
    financeVersionId = current.versionId;
  } catch {}
  finance ??= financeFromAssignment(parcel);
  if (!finance || !finance.operatingWeekdays.length)
    return {
      dueAt: now,
      snapshot: {
        status: 'configuration_required',
        riderId,
        periodBusinessDays: period.value,
        periodVersionId: period.versionId,
        financeVersionId: null,
        recordedAt: now,
      },
    };
  return {
    dueAt: addKathmanduBusinessDays(now, period.value, finance),
    snapshot: {
      status: 'scheduled',
      riderId,
      periodBusinessDays: period.value,
      periodVersionId: period.versionId,
      financeVersionId,
      finance,
      recordedAt: now,
    },
  };
}
function compensationStatement(
  db: D1Database,
  parcel: Parcel,
  riderId: string,
  outcome: RiderTripOutcome,
  requestId: string,
  now: number,
) {
  const finance = financeFromAssignment(parcel);
  if (!finance) return null;
  const rate = riderCompensationForOutcome(finance, outcome);
  return db
    .prepare(
      "INSERT OR IGNORE INTO rider_compensation_entries(id,request_id,shipping_job_id,rider_user_id,outcome,rate_paisa,amount_paisa,policy_snapshot_json,status,created_at) VALUES (?,?,?,?,?,?,?,?,'earned',?)",
    )
    .bind(
      crypto.randomUUID(),
      requestId,
      parcel.id,
      riderId,
      outcome,
      rate,
      rate,
      parcel.riderFinanceSnapshotJson,
      now,
    );
}
export async function remittanceAllocationStatements(
  db: D1Database,
  input: {
    recordId: string;
    jobId: string;
    riderId: string;
    amount: number;
    actorId: string;
    now: number;
  },
) {
  const rows = (
    await db
      .prepare(
        `SELECT o.id,o.amount_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM rider_remittance_allocations a WHERE a.obligation_id=o.id),0) AS remaining FROM rider_cash_obligations o WHERE o.shipping_job_id=? AND o.rider_user_id=? AND o.amount_paisa>COALESCE((SELECT SUM(a.amount_paisa) FROM rider_remittance_allocations a WHERE a.obligation_id=o.id),0) ORDER BY o.due_at,o.created_at,o.id`,
      )
      .bind(input.jobId, input.riderId)
      .all<{ id: string; remaining: number }>()
  ).results;
  let remaining = input.amount;
  const result: D1PreparedStatement[] = [];
  for (const row of rows) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, row.remaining);
    result.push(
      db
        .prepare(
          'INSERT INTO rider_remittance_allocations(id,remittance_record_id,obligation_id,amount_paisa,allocated_by,allocated_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          input.recordId,
          row.id,
          amount,
          input.actorId,
          input.now,
        ),
    );
    remaining -= amount;
  }
  return result;
}
/** A carrier request and parcel setup can reuse the same outbound job. */
export function prepareOutboundDeliveryUnitMappings(
  db: D1Database,
  input: { orderId: string; sellerId: string; deliverySnapshotJson: string | null; now: number },
): D1PreparedStatement[] {
  if (!usesSellerShipmentDelivery(input.deliverySnapshotJson)) return [];
  const { orderId, sellerId, deliverySnapshotJson, now } = input;
  return [
    ...assertion(db,
      'EXISTS(SELECT 1 FROM orders WHERE id=? AND HEX(delivery_rate_snapshot_json)=HEX(?))',
      [orderId, deliverySnapshotJson],
    ),
    db.prepare(`INSERT INTO order_delivery_unit_parcels(order_item_id,unit_ordinal,shipping_job_id,created_at)
      SELECT u.order_item_id,u.unit_ordinal,j.id,?
      FROM order_delivery_unit_allocations u
      JOIN order_delivery_shipment_allocations s ON s.id=u.shipment_id AND s.order_id=u.order_id
      JOIN order_items i ON i.id=u.order_item_id AND i.order_id=s.order_id AND i.seller_id=s.seller_id
      JOIN shipping_jobs j ON j.order_id=s.order_id AND j.seller_id=s.seller_id AND j.direction='outbound'
      WHERE s.order_id=? AND s.seller_id=? AND i.fulfillment_status<>'cancelled'
        AND NOT EXISTS(SELECT 1 FROM order_delivery_unit_parcels retained
          WHERE retained.order_item_id=u.order_item_id AND retained.unit_ordinal=u.unit_ordinal
            AND retained.shipping_job_id=j.id)`)
      .bind(now, orderId, sellerId),
    ...assertion(db, `NOT EXISTS(SELECT 1 FROM order_items i
      WHERE i.order_id=? AND i.seller_id=? AND i.fulfillment_status<>'cancelled'
        AND i.quantity<>(SELECT COUNT(*) FROM order_delivery_unit_parcels mapped
          JOIN shipping_jobs j ON j.id=mapped.shipping_job_id
          WHERE mapped.order_item_id=i.id AND j.order_id=i.order_id AND j.seller_id=i.seller_id AND j.direction='outbound'))`,
      [orderId, sellerId],
    ),
  ];
}

type ParcelSetupOrder = {
  total: number;
  cancellationVersion: number;
  paymentMode: string;
  deliverySnapshotJson: string | null;
  subtotal: number;
  delivery: number;
  wallet: number;
  discount: number;
  promo: number;
  serviceFee: number;
};

async function originalShipmentCashAllocation(db: D1Database, orderId: string, order: ParcelSetupOrder) {
  try {
    const { results } = await db.prepare(`SELECT id,seller_id AS sellerId,line_total_paisa AS amount,
      promo_discount_paisa AS promo FROM order_items WHERE order_id=? AND fulfillment_status<>'cancelled'`)
      .bind(orderId).all<{ id: string; sellerId: string; amount: number; promo: number }>();
    const [buyerPricing, sellerCharges] = await Promise.all([
      readOriginalBuyerLinePricing(db, orderId),
      readSavedSellerShipmentCharges(db, orderId, order.delivery, results.map(item => item.sellerId)),
    ]);
    const items = allocateCancellationItems(results.map(item => ({
      id: item.id,
      sellerId: item.sellerId,
      amount: buyerPricing?.get(item.id)?.customerSubtotalPaisa ?? item.amount,
      ...(order.promo ? { promo: item.promo } : {}),
    })), order.wallet, order.discount);
    const allocation = calculateCancellation(items, new Set<string>(), {
      pricingPolicy: SELLER_SHIPMENT_DELIVERY_POLICY,
      sellerCharges,
    }, order.serviceFee);
    if (allocation.subtotal !== order.subtotal || allocation.total !== order.total ||
        allocation.parcels.reduce((sum, parcel) => sum + parcel.amount, 0) !== order.total) {
      throw new Error('Saved buyer amounts and parcel dues differ from the accepted order.');
    }
    return allocation.parcels;
  } catch (cause) {
    throw new ParcelConflictError('Reconcile the original buyer amounts and seller shipment charges before preparing parcels.', { cause });
  }
}

export async function prepareSellerParcels(
  db: D1Database,
  o: { orderId: string; actorId: string; requestId: string; now: number },
) {
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'order.manage',
    ParcelConflictError,
  );
  await assertFirstCodFulfillmentAllowed(db, o.orderId, ParcelConflictError);
  const payload = JSON.stringify({ action: 'setup', orderId: o.orderId });
  if (await repeated(db, o.requestId, o.actorId, payload)) return;
  const order = await db
    .prepare(
      `SELECT ${payableOrderTotalSql()} AS total,cancellation_version AS cancellationVersion,payment_mode AS paymentMode,
        delivery_rate_snapshot_json AS deliverySnapshotJson,item_subtotal_paisa AS subtotal,delivery_charge_paisa AS delivery,
        wallet_credit_paisa AS wallet,referral_discount_paisa+promo_discount_paisa AS discount,
        promo_discount_paisa AS promo,buyer_platform_fee_paisa AS serviceFee
        FROM orders WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup')`,
    )
    .bind(o.orderId)
    .first<ParcelSetupOrder>();
  if (!order)
    throw new ParcelConflictError(
      'Prepare parcels before dispatch. Historical delivered orders remain unchanged.',
    );
  const items = await db
    .prepare(
      "SELECT seller_id AS sellerId,SUM(line_total_paisa) AS amount FROM order_items WHERE order_id=? AND fulfillment_status<>'cancelled' GROUP BY seller_id",
    )
    .bind(o.orderId)
    .all<{ sellerId: string; amount: number }>();
  const useOriginalShipmentCash = order.paymentMode === 'cod' && !order.cancellationVersion &&
    usesSellerShipmentDelivery(order.deliverySnapshotJson);
  let allocated = useOriginalShipmentCash
    ? await originalShipmentCashAllocation(db, o.orderId, order)
    : allocateOrderCash(order.paymentMode==='cod'?order.total:0, items.results);
  if (order.cancellationVersion && order.paymentMode==='cod') {
    const event = await db
      .prepare(
        'SELECT next_json AS next FROM order_cancellation_events WHERE order_id=? AND version=?',
      )
      .bind(o.orderId, order.cancellationVersion)
      .first<{ next: string }>();
    if (!event)
      throw new ParcelConflictError(
        'Cancellation accounting needs reconciliation.',
      );
    allocated = (
      JSON.parse(event.next) as {
        parcels: { sellerId: string; amount: number }[];
      }
    ).parcels;
    if (allocated.reduce((n, r) => n + r.amount, 0) !== order.total)
      throw new ParcelConflictError(
        'Cancellation allocation does not reconcile.',
      );
  }
  const statements: D1PreparedStatement[] = [
    db
      .prepare('UPDATE orders SET updated_at=updated_at WHERE id=?')
      .bind(o.orderId),
    ...assertion(
      db,
      `EXISTS(SELECT 1 FROM orders WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup') AND payment_mode=? AND cancellation_version=? AND ${payableOrderTotalSql()}=?) AND NOT EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=?) AND ${staffSql}`,
      [o.orderId, order.paymentMode, order.cancellationVersion, order.total, o.orderId, o.actorId],
    ),
  ];
  for (const part of allocated) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO shipping_jobs(id,order_id,seller_id,direction,status,carrier,reconciliation_status,created_by,created_request_id,created_at,updated_at) VALUES (?,?,?,'outbound','pickup_requested','manual','unreconciled',?,?,?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          o.orderId,
          part.sellerId,
          o.actorId,
          o.requestId + ':' + part.sellerId,
          o.now,
          o.now,
        ),
    );
    statements.push(
      ...assertion(
        db,
        "EXISTS(SELECT 1 FROM shipping_jobs WHERE order_id=? AND seller_id=? AND direction='outbound' AND status IN ('pickup_requested','label_pending','label_ready','pickup_scheduled'))",
        [o.orderId, part.sellerId],
      ),
    );
    statements.push(
      db
        .prepare(
          "INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,created_at) SELECT id,?,? FROM shipping_jobs WHERE order_id=? AND seller_id=? AND direction='outbound'",
        )
        .bind(part.amount, o.now, o.orderId, part.sellerId),
      ...prepareOutboundDeliveryUnitMappings(db, {
        orderId: o.orderId,
        sellerId: part.sellerId,
        deliverySnapshotJson: order.deliverySnapshotJson,
        now: o.now,
      }),
    );
  }
  statements.push(
    db
      .prepare('DELETE FROM delivery_assignments WHERE order_id=?')
      .bind(o.orderId),
  );
  statements.push(
    db
      .prepare(
        "INSERT INTO parcel_operation_events(id,order_id,actor_id,action,payload_json,note,created_at) VALUES (?,?,?,'setup',?,'Seller parcels prepared; existing order totals preserved',?)",
      )
      .bind(o.requestId, o.orderId, o.actorId, payload, o.now),
  );
  statements.push(parcelAudit(db, o, o.orderId, 'setup'));
  statements.push(...authority.statements);
  await transact(db, statements);
}
export interface ParcelOperation {
  jobId: string;
  actorId: string;
  requestId: string;
  version: number;
  action: string;
  note: string;
  now: number;
  amountPaisa?: number;
  reference?: string;
  cashRecordId?: string;
  method?: string;
  riderEmail?: string;
  courierName?: string;
  trackingUrl?: string;
  trackingCode?: string;
  riderReportId?: string;
  form?: {
    requestId: string;
    versionId: string;
    answers: FormAnswerSnapshot;
    formId?: 'staff.parcel-control' | 'staff.rider-control-1';
  };
}
export async function operateParcel(db: D1Database, o: ParcelOperation) {
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'order.manage',
    ParcelConflictError,
  );
  if (
    !Number.isSafeInteger(o.version) ||
    o.version < 0 ||
    o.note.trim().length < 8 ||
    o.note.length > 500 ||
    !o.requestId ||
    o.requestId.length > 150
  )
    throw new ParcelConflictError(
      'Add a clear note and refresh the parcel version.',
    );
  if (o.form && o.form.requestId !== o.requestId)
    throw new ParcelConflictError(
      'Form request does not match parcel operation.',
    );
  if (
    o.form?.formId === 'staff.rider-control-1' &&
    (!o.riderReportId || !['deliver', 'fail'].includes(o.action))
  )
    throw new ParcelConflictError(
      'Rider confirmation requires the matching report action.',
    );
  const { form, ...operation } = o;
  const catalogFormId = form?.formId ?? 'staff.parcel-control';
  const formDigest = form
    ? await digestFormRequest({
        ...operation,
        now: undefined,
        formId: catalogFormId,
        versionId: form.versionId,
        answers: form.answers,
      })
    : null;
  const payload = JSON.stringify({
    ...operation,
    now: undefined,
    ...(formDigest ? { formDigest } : {}),
  });
  const replay=await repeated(db,o.requestId,o.actorId,payload);
  const p = await db
    .prepare(selectParcel + ' WHERE j.id=?')
    .bind(o.jobId)
    .first<Parcel>();
  if (!p) throw new ParcelConflictError('Parcel not found.');
  const riderInput = o.method === 'own_rider' || Boolean(o.riderEmail) || Boolean(o.riderReportId);
  const privateAuthoritySql = "EXISTS(SELECT 1 FROM users privacy_user JOIN user_roles privacy_role ON privacy_role.user_id=privacy_user.id WHERE privacy_user.id=? AND privacy_user.status='active' AND privacy_role.role='super_admin') OR (?=0 AND NOT EXISTS(SELECT 1 FROM shipping_parcels privacy_parcel WHERE privacy_parcel.shipping_job_id=? AND (privacy_parcel.method='own_rider' OR privacy_parcel.rider_user_id IS NOT NULL)))";
  const privateAuthorityValues = [o.actorId, riderInput ? 1 : 0, o.jobId];
  if (!await db.prepare('SELECT 1 WHERE ' + privateAuthoritySql).bind(...privateAuthorityValues).first())
    throw new ParcelConflictError('Super Admin access is required.');
  if(replay) {
    // These operations originally return before the managed post-commit hooks.
    if(o.action==='record_cost' || o.action==='cancel')return;
    // The parcel commit can succeed before its managed accrual. A verified replay
    // resumes that atomic, idempotent accrual without repeating collection.
    await accrueManagedEntitlements(db,{orderId:p.orderId,actorId:o.actorId,
      requestId:o.requestId+':managed-accrue',now:o.now});
    await issueManagedInvoiceGroups(db,{orderId:p.orderId,requestId:o.requestId+':managed-invoice',now:o.now});
    return;
  }
  if (o.action !== 'cancel' && o.action !== 'record_cost')
    await assertFirstCodFulfillmentAllowed(db, p.orderId, ParcelConflictError);
  const statements: D1PreparedStatement[] = [
    db
      .prepare('UPDATE orders SET updated_at=updated_at WHERE id=?')
      .bind(p.orderId),
    ...assertion(
      db,
      "EXISTS(SELECT 1 FROM orders WHERE id=? AND (status IN ('confirmed','packing','ready_for_pickup','dispatched','delivered') OR (status='cancelled' AND ?='record_cost')))",
      [p.orderId, o.action],
    ),
    ...assertion(db, staffSql, [o.actorId]),
    ...assertion(db, '(' + privateAuthoritySql + ')', privateAuthorityValues),
    db
      .prepare(
        'UPDATE shipping_parcels SET version=version+1,operation_request_id=? WHERE shipping_job_id=? AND version=?',
      )
      .bind(o.requestId, o.jobId, o.version),
    ...assertion(
      db,
      'EXISTS(SELECT 1 FROM shipping_parcels WHERE shipping_job_id=? AND operation_request_id=? AND version=?)',
      [o.jobId, o.requestId, o.version + 1],
    ),
  ];
  if (o.action === 'record_cost') {
    const amount = o.amountPaisa,
      reference = (o.reference ?? '').trim();
    if (
      !Number.isSafeInteger(amount) ||
      !amount ||
      amount < 1 ||
      amount > 100000000 ||
      reference.length < 4 ||
      reference.length > 120
    )
      throw new ParcelConflictError(
        'Enter an actual courier cost and evidence reference of 4–120 characters.',
      );
    // Operational expense only: do not recalculate order status, cash, documents or seller entitlement.
    statements.push(
      db
        .prepare(
          'INSERT INTO parcel_courier_costs(id,shipping_job_id,amount_paisa,evidence_reference,created_by,note,created_at) VALUES (?,?,?,?,?,?,?)',
        )
        .bind(
          o.requestId,
          o.jobId,
          amount,
          reference,
          o.actorId,
          o.note.trim(),
          o.now,
        ),
    );
    statements.push(
      db
        .prepare(
          'INSERT INTO parcel_operation_events(id,order_id,shipping_job_id,actor_id,action,payload_json,note,created_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .bind(
          o.requestId,
          p.orderId,
          o.jobId,
          o.actorId,
          o.action,
          payload,
          o.note.trim(),
          o.now,
        ),
    );
    statements.push(parcelAudit(db, o, p.orderId, o.action));
    if (form)
      statements.push(
        buildFormAnswerInsert(db, {
          formId: 'staff.parcel-control',
          requestId: o.requestId,
          versionId: form.versionId,
          subjectType: 'shipping_job',
          subjectId: o.jobId,
          actorId: o.actorId,
          answers: form.answers,
          now: o.now,
        }),
      );
    statements.push(...authority.statements);
    await transact(db, statements);
    return;
  }
  if (o.action === 'cancel') {
    if (p.version !== o.version)
      throw new ParcelConflictError('Parcel version changed.');
    const row = await db
      .prepare('SELECT order_number AS number FROM orders WHERE id=?')
      .bind(p.orderId)
      .first<{ number: string }>();
    if (!row) throw new ParcelConflictError('Order not found.');
    const access = { orderNumber: row.number, actorId: o.actorId },
      sellerIds = [p.sellerId];
    const preview = await cancellationPreview(db, access, sellerIds);
    await cancelSelectedParcels(db, access, {
      sellerIds,
      fingerprint: preview.fingerprint,
      requestId: o.requestId,
      note: o.note,
      now: o.now,
      parcelContext: { jobId: o.jobId, payload, riderPrivacyRequired: true, ...(form ? { form } : {}) },
    });
    return;
  }
  if (o.riderReportId) {
    const accepted = await riderReportAcceptance(db, {
      reportId: o.riderReportId,
      jobId: o.jobId,
      actorId: o.actorId,
      version: o.version,
      requestId: o.requestId,
      now: o.now,
    });
    const report = accepted.report;
    if (o.action !== (report.kind === 'delivered' ? 'deliver' : 'fail'))
      throw new ParcelConflictError(
        'Report outcome does not match this staff confirmation.',
      );
    statements.push(...accepted.statements);
    const compensation = compensationStatement(
      db,
      p,
      report.riderId,
      report.kind === 'delivered' ? 'completed' : 'failed',
      o.requestId + ':rider-compensation',
      o.now,
    );
    if (compensation) statements.push(compensation);
    if (report.cashPaisa > 0) {
      const collectionId = crypto.randomUUID(),
        obligation = await cashObligationSnapshot(db, p, report.riderId, o.now);
      statements.push(
        ...riderGuard(
          db,
          'EXISTS(SELECT 1 FROM shipping_parcels WHERE shipping_job_id=? AND collected_paisa+?<=cod_due_paisa)',
          [o.jobId, report.cashPaisa],
        ),
      );
      statements.push(
        db
          .prepare(
            'UPDATE shipping_parcels SET collected_paisa=collected_paisa+? WHERE shipping_job_id=?',
          )
          .bind(report.cashPaisa, o.jobId),
        db
          .prepare(
            "INSERT INTO parcel_cash_records(id,shipping_job_id,kind,amount_paisa,evidence_reference,status,created_by,created_at,rider_user_id) VALUES (?,?,'collection',?,?,'posted',?,?,?)",
          )
          .bind(
            collectionId,
            o.jobId,
            report.cashPaisa,
            'rider-report:' + report.id,
            o.actorId,
            o.now,
            report.riderId,
          ),
        db
          .prepare(
            'INSERT INTO rider_cash_obligations(id,collection_record_id,shipping_job_id,rider_user_id,amount_paisa,due_at,policy_snapshot_json,created_at) VALUES (?,?,?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            collectionId,
            o.jobId,
            report.riderId,
            report.cashPaisa,
            obligation.dueAt,
            JSON.stringify(obligation.snapshot),
            o.now,
          ),
      );
    }
  } else if (o.action === 'deliver' && p.method === 'own_rider')
    throw new ParcelConflictError(
      'Review and confirm the assigned rider delivery proof first.',
    );
  const closed = ['delivered', 'returned', 'cancelled'];
  if (o.action === 'assign') {
    if (
      closed.includes(p.status) ||
      !['own_rider', 'courier'].includes(o.method ?? '')
    )
      throw new ParcelConflictError(
        'Select an active parcel and delivery method.',
      );
    let riderId: string | null = null;
    let assignmentSnapshot: RiderAssignmentPolicySnapshot | null = null;
    if (o.method === 'own_rider') {
      const rider = await db
        .prepare(
          "SELECT u.id FROM users u JOIN rider_profiles r ON r.user_id=u.id WHERE lower(u.email)=? AND u.status='active' AND r.status='approved'",
        )
        .bind((o.riderEmail ?? '').trim().toLowerCase())
        .first<{ id: string }>();
      if (!rider)
        throw new ParcelConflictError(
          'Rider needs an active account and Super Admin approval.',
        );
      riderId = rider.id;
      try {
        assignmentSnapshot = await buildRiderAssignmentPolicySnapshot(db, {
          jobId: o.jobId,
          riderId,
          sellerId: p.sellerId,
          proposedCodPaisa:
            p.paymentMode === 'cod' ? p.codDuePaisa - p.collectedPaisa : 0,
          now: o.now,
        });
      } catch (error) {
        throw new ParcelConflictError(
          error instanceof Error
            ? error.message
            : 'Rider policy could not be evaluated.',
        );
      }
      if (assignmentSnapshot.finance.hasOverdueRemittance)
        throw new ParcelConflictError(
          'This rider has an overdue cash remittance. Existing parcels may be completed or returned, but no new assignment is allowed.',
        );
      if (!assignmentSnapshot.finance.exposure.permitted)
        throw new ParcelConflictError(
          'This assignment would exceed the configured rider cash exposure limit.',
        );
      if (assignmentSnapshot.openBox.assignmentBlocked)
        throw new ParcelConflictError(
          'This parcel is open-box eligible in the configured area and requires a rider approved for open-box inspection.',
        );
    }
    const courier = (o.courierName ?? '').trim(),
      tracking = (o.trackingCode ?? '').trim();
    let url: string;
    try {
      url = safeCourierUrl(o.trackingUrl ?? '');
    } catch {
      throw new ParcelConflictError('Use a public HTTPS tracking link.');
    }
    if (
      tracking.length < 2 ||
      tracking.length > 80 ||
      (o.method === 'courier' && (courier.length < 2 || courier.length > 120))
    )
      throw new ParcelConflictError(
        'Enter a reference of 2–80 characters and the courier name when applicable.',
      );
    if (riderId) statements.push(...assertion(db, approvedRiderSql, [riderId]));
    if (assignmentSnapshot)
      statements.push(
        ...assertion(
          db,
          "EXISTS(SELECT 1 FROM business_setting_versions WHERE id=? AND setting_key='rider_finance_policy' AND status='published' AND effective_from<=? AND (effective_until IS NULL OR effective_until>?))",
          [assignmentSnapshot.finance.settingVersionId, o.now, o.now],
        ),
      );
    const openBoxJson = assignmentSnapshot
        ? JSON.stringify(assignmentSnapshot.openBox)
        : null,
      financeJson = assignmentSnapshot
        ? JSON.stringify(assignmentSnapshot.finance)
        : null;
    statements.push(
      db
        .prepare(
          'UPDATE shipping_parcels SET method=?,rider_user_id=?,courier_name=?,tracking_url=?,latitude=NULL,longitude=NULL,accuracy=NULL,position_at=NULL,open_box_required=?,open_box_snapshot_json=?,rider_finance_snapshot_json=? WHERE shipping_job_id=?',
        )
        .bind(
          o.method,
          riderId,
          o.method === 'courier' ? courier : null,
          url || null,
          assignmentSnapshot?.openBox.required ? 1 : 0,
          openBoxJson,
          financeJson,
          o.jobId,
        ),
    );
    if (riderId && assignmentSnapshot)
      statements.push(
        db
          .prepare(
            'INSERT INTO rider_assignment_snapshots(id,request_id,shipping_job_id,rider_user_id,assignment_version,open_box_snapshot_json,finance_snapshot_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            o.requestId + ':assignment-snapshot',
            o.jobId,
            riderId,
            o.version + 1,
            openBoxJson,
            financeJson,
            o.actorId,
            o.now,
          ),
      );
    statements.push(
      db
        .prepare(
          'UPDATE shipping_jobs SET tracking_code=?,updated_at=? WHERE id=?',
        )
        .bind(tracking, o.now, o.jobId),
    );
    if (riderId)
      statements.push(
        ...(await riderNotifications(
          db,
          o.requestId,
          'rider_assignment',
          o.jobId,
          riderId,
          null,
          o.now,
          'A delivery parcel has been assigned to you',
        )),
      );
  } else if (
    [
      'collect',
      'propose_remittance',
      'approve_remittance',
      'reject_remittance',
    ].includes(o.action)
  ) {
    if (o.action === 'collect' || o.action === 'propose_remittance') {
      const amount = o.amountPaisa,
        reference = (o.reference ?? '').trim();
      const referenceLength = o.action === 'collect' ? Array.from(reference).length : reference.length;
      if (
        !Number.isSafeInteger(amount) ||
        !amount ||
        amount < 1 ||
        referenceLength < 4 ||
        referenceLength > 120
      )
        throw new ParcelConflictError(
          'Enter a positive paisa amount and an evidence reference of 4–120 characters.',
        );
      if (o.action === 'collect') {
        statements.push(
          ...assertion(
            db,
            "EXISTS(SELECT 1 FROM shipping_jobs WHERE id=? AND status IN ('dispatched','delivered'))",
            [o.jobId],
          ),
        );
        statements.push(
          db
            .prepare(
              'UPDATE shipping_parcels SET collected_paisa=collected_paisa+? WHERE shipping_job_id=?',
            )
            .bind(amount, o.jobId),
        );
      }
      if (o.action === 'propose_remittance' && p.method === 'own_rider')
        throw new ParcelConflictError(
          'The rider portal remains on hold. Reconcile retained collector cash through Incoming payments.',
        );
      const kind = o.action === 'collect' ? 'collection' : 'remittance';
      const cashId = crypto.randomUUID();
      const directRemittance = false; // A claim/reference is never independent company receipt.
      statements.push(
        db
          .prepare(
            'INSERT INTO parcel_cash_records(id,shipping_job_id,kind,amount_paisa,evidence_reference,status,created_by,created_at,rider_user_id,approved_by,approved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            cashId,
            o.jobId,
            kind,
            amount,
            reference,
            kind === 'collection' || directRemittance ? 'posted' : 'pending',
            o.actorId,
            o.now,
            p.riderUserId,
            directRemittance ? o.actorId : null,
            directRemittance ? o.now : null,
          ),
      );
      if (directRemittance) {
        statements.push(
          db
            .prepare(
              'UPDATE shipping_parcels SET remitted_paisa=remitted_paisa+? WHERE shipping_job_id=?',
            )
            .bind(amount, o.jobId),
        );
      }
      if(kind==='remittance')statements.push(...await preparePaymentException(db,{sourceKey:'cod:'+o.jobId,orderId:p.orderId,receiptId:null,kind:'cod_remittance',reason:'A carrier remittance is claimed. Match actual company receipt, exact parcel allocations and authorized costs.',ownerId:authority.role==='super_admin'?o.actorId:null,now:o.now}));
      if (kind === 'collection' && p.method === 'own_rider' && p.riderUserId) {
        const obligation = await cashObligationSnapshot(
          db,
          p,
          p.riderUserId,
          o.now,
        );
        statements.push(
          db
            .prepare(
              'INSERT INTO rider_cash_obligations(id,collection_record_id,shipping_job_id,rider_user_id,amount_paisa,due_at,policy_snapshot_json,created_at) VALUES (?,?,?,?,?,?,?,?)',
            )
            .bind(
              crypto.randomUUID(),
              cashId,
              o.jobId,
              p.riderUserId,
              amount,
              obligation.dueAt,
              JSON.stringify(obligation.snapshot),
              o.now,
            ),
        );
      }
    } else {
      const record = await db
        .prepare(
          "SELECT amount_paisa AS amount,created_by AS maker,rider_user_id AS riderId FROM parcel_cash_records WHERE id=? AND shipping_job_id=? AND kind='remittance' AND status='pending'",
        )
        .bind(o.cashRecordId ?? '', o.jobId)
        .first<{ amount: number; maker: string; riderId: string | null }>();
      if (
        !record ||
        (p.method !== 'own_rider' && authority.role !== 'super_admin') ||
        record.riderId === o.actorId ||
        (record.maker === o.actorId && authority.role !== 'super_admin')
      )
        throw new ParcelConflictError(
          'An authorized reviewer must review this pending remittance; staff cannot review their own rider cash.',
        );
      statements.push(
        ...assertion(
          db,
          "EXISTS(SELECT 1 FROM parcel_cash_records WHERE id=? AND shipping_job_id=? AND status='pending' AND (rider_user_id IS NULL OR rider_user_id<>?) AND (created_by<>? OR ?='super_admin'))",
          [o.cashRecordId, o.jobId, o.actorId, o.actorId, authority.role],
        ),
      );
      if (o.action === 'approve_remittance') throw new ParcelConflictError('Match an actual company receipt and approved deductions in Incoming payments before confirming this remittance.');

      statements.push(
        db
          .prepare(
            'UPDATE parcel_cash_records SET status=?,approved_by=?,approved_at=? WHERE id=?',
          )
          .bind(
            'rejected',
            o.actorId,
            o.now,
            o.cashRecordId,
          ),
      );
    }
  } else {
    const transitions: Record<string, { from: string[]; to: string }> = {
      cancel: {
        from: [
          'pickup_requested',
          'label_pending',
          'label_ready',
          'pickup_scheduled',
        ],
        to: 'cancelled',
      },
      dispatch: {
        from: [
          'pickup_requested',
          'label_pending',
          'label_ready',
          'pickup_scheduled',
        ],
        to: 'dispatched',
      },
      deliver: { from: ['dispatched'], to: 'delivered' },
      fail: { from: ['dispatched'], to: 'delivery_failed' },
      retry: { from: ['delivery_failed', 'returning'], to: 'dispatched' },
      return_to_origin: { from: ['delivery_failed'], to: 'returning' },
      receive_return: { from: ['returning'], to: 'returned' },
    };
    const t = transitions[o.action];
    if (!t || !t.from.includes(p.status))
      throw new ParcelConflictError(
        'This action is unavailable from the current parcel state.',
      );
    statements.push(
      ...assertion(
        db,
        'EXISTS(SELECT 1 FROM shipping_jobs WHERE id=? AND status=?)',
        [o.jobId, p.status],
      ),
    );
    if (o.action === 'dispatch')
      statements.push(
        ...assertion(
          db,
          "NOT EXISTS(SELECT 1 FROM order_items WHERE order_id=? AND seller_id=? AND fulfillment_status<>'ready_for_pickup') AND EXISTS(SELECT 1 FROM shipping_parcels WHERE shipping_job_id=? AND method IS NOT NULL)",
          [p.orderId, p.sellerId, o.jobId],
        ),
      );
    if (o.action === 'cancel') {
      statements.push(
        ...assertion(
          db,
          'EXISTS(SELECT 1 FROM shipping_parcels WHERE shipping_job_id=? AND collected_paisa=0)',
          [o.jobId],
        ),
      );
      statements.push(
        db
          .prepare(
            "UPDATE products SET inventory_quantity=inventory_quantity+COALESCE((SELECT SUM(i.quantity) FROM order_items i WHERE i.product_id=products.id AND i.order_id=? AND i.seller_id=? AND i.fulfillment_status<>'cancelled'),0) WHERE id IN (SELECT product_id FROM order_items WHERE order_id=? AND seller_id=?)",
          )
          .bind(p.orderId, p.sellerId, p.orderId, p.sellerId),
      );
      statements.push(
        db
          .prepare(
            "UPDATE order_items SET fulfillment_status='cancelled' WHERE order_id=? AND seller_id=?",
          )
          .bind(p.orderId, p.sellerId),
      );
    }
    statements.push(
      db
        .prepare('UPDATE shipping_jobs SET status=?,updated_at=? WHERE id=?')
        .bind(t.to, o.now, o.jobId),
    );
    if (o.action === 'deliver')
      statements.push(
        db
          .prepare(
            'UPDATE shipping_parcels SET delivered_at=? WHERE shipping_job_id=?',
          )
          .bind(o.now, o.jobId),
      );
    if (
      o.action === 'receive_return' &&
      p.method === 'own_rider' &&
      p.riderUserId
    ) {
      const compensation = compensationStatement(
        db,
        p,
        p.riderUserId,
        'return',
        o.requestId + ':rider-compensation',
        o.now,
      );
      if (compensation) statements.push(compensation);
    }
    if (['dispatch', 'deliver'].includes(o.action))
      statements.push(
        db
          .prepare(
            'UPDATE order_items SET fulfillment_status=? WHERE order_id=? AND seller_id=?',
          )
          .bind(t.to, p.orderId, p.sellerId),
      );
  }
  // Whole-order delivery is true only when every item arrived; cash is a separate event.
  statements.push(
    db
      .prepare(`UPDATE orders SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM order_items WHERE order_id=orders.id AND fulfillment_status<>'cancelled') THEN 'cancelled' WHEN NOT EXISTS(SELECT 1 FROM order_items WHERE order_id=orders.id AND fulfillment_status NOT IN ('delivered','cancelled')) THEN 'delivered' WHEN EXISTS(SELECT 1 FROM order_items WHERE order_id=orders.id AND fulfillment_status IN ('dispatched','delivered')) OR EXISTS(SELECT 1 FROM shipping_jobs WHERE order_id=orders.id AND status IN ('returning','returned','delivery_failed')) THEN 'dispatched' ELSE status END,
 delivered_at=CASE WHEN EXISTS(SELECT 1 FROM order_items WHERE order_id=orders.id AND fulfillment_status='delivered') AND NOT EXISTS(SELECT 1 FROM order_items WHERE order_id=orders.id AND fulfillment_status NOT IN ('delivered','cancelled')) THEN COALESCE(delivered_at,(SELECT MAX(p.delivered_at) FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=orders.id AND j.status='delivered'),?) ELSE delivered_at END,updated_at=? WHERE id=? AND status IN ('confirmed','packing','ready_for_pickup','dispatched','delivered')`)
      .bind(o.now, o.now, p.orderId),
  );
  statements.push(
    db
      .prepare(
        "UPDATE orders SET payment_status='cancelled',cancelled_at=COALESCE(cancelled_at,?) WHERE id=? AND status='cancelled'",
      )
      .bind(o.now, p.orderId),
  );
  statements.push(
    db
      .prepare(
        "UPDATE payments SET status='cancelled',updated_at=? WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='cancelled')",
      )
      .bind(o.now, p.orderId, p.orderId),
  );
  statements.push(
    db
      .prepare(
        `UPDATE orders SET payment_status='paid' WHERE id=? AND status='delivered' AND payment_status NOT IN ('refunded','part_refunded') AND NOT EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=orders.id AND p.collected_paisa<>p.cod_due_paisa)`,
      )
      .bind(p.orderId),
  );
  statements.push(
    db
      .prepare(
        "UPDATE payments SET status='captured',updated_at=? WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='delivered' AND payment_status='paid')",
      )
      .bind(o.now, p.orderId, p.orderId),
  );
  const statement = await db
    .prepare(
      "SELECT snapshot_json AS snapshot FROM order_documents WHERE order_id=? AND kind='order_statement' LIMIT 1",
    )
    .bind(p.orderId)
    .first<{ snapshot: string }>();
  if (statement) {
    const snapshot = await currentReceiptSnapshot(
      db,
      p.orderId,
      JSON.parse(statement.snapshot) as Record<string, unknown>,
    );
    const paymentReceiptSnapshot=await withLiveInvoiceReferences(db,p.orderId,withReceiptGroups({...snapshot,
      documentTitle:'Cash on delivery payment receipt',paymentStatus:'paid',issuedAt:o.now} as OrderDocumentSnapshot));
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO order_documents(id,order_id,kind,document_number,snapshot_json,status,request_id,issued_at) SELECT ?,id,'payment_receipt',?,?,'issued',?,? FROM orders WHERE id=? AND status='delivered' AND payment_status='paid' AND NOT EXISTS(SELECT 1 FROM order_documents d WHERE d.order_id=orders.id AND d.kind='payment_receipt')`,
        )
        .bind(
          crypto.randomUUID(),
          'RCPT-PARCEL-' + p.orderId,
          JSON.stringify(paymentReceiptSnapshot),
          o.requestId + ':payment-receipt',
          o.now,
          p.orderId,
        ),
    );
    statements.push(...await receiptNumberStatements(db,{snapshot:paymentReceiptSnapshot,
      requestId:o.requestId+':payment-receipt',now:o.now}));
  }
  statements.push(
    ...buildEarningsAccrualStatements(db, { orderId: p.orderId, now: o.now }),
  );
  statements.push(
    db
      .prepare(
        'INSERT INTO parcel_operation_events(id,order_id,shipping_job_id,actor_id,action,payload_json,note,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .bind(
        o.requestId,
        p.orderId,
        o.jobId,
        o.actorId,
        o.action,
        payload,
        o.note.trim(),
        o.now,
      ),
  );
  statements.push(parcelAudit(db, o, p.orderId, o.action));
  if (form)
    statements.push(
      buildFormAnswerInsert(db, {
        formId: catalogFormId,
        requestId: o.requestId,
        versionId: form.versionId,
        subjectType:
          catalogFormId === 'staff.rider-control-1'
            ? 'rider_report'
            : 'shipping_job',
        subjectId:
          catalogFormId === 'staff.rider-control-1'
            ? o.riderReportId!
            : o.jobId,
        actorId: o.actorId,
        answers: form.answers,
        now: o.now,
      }),
    );
  statements.push(...authority.statements);
  await transact(db, statements);
  await accrueManagedEntitlements(db, {
    orderId: p.orderId,
    actorId: o.actorId,
    requestId: o.requestId + ':managed-accrue',
    now: o.now,
  });
  await issueManagedInvoiceGroups(db, {
    orderId: p.orderId,
    requestId: o.requestId + ':managed-invoice',
    now: o.now,
  });
}
export async function parcelCashRecords(db: D1Database, orderId: string) {
  return (
    await db
      .prepare(
        `SELECT c.id,c.shipping_job_id AS jobId,c.kind,c.amount_paisa AS amountPaisa,c.evidence_reference AS reference,c.status,c.created_by AS maker,o.due_at AS dueAt,
          CASE WHEN o.id IS NULL THEN NULL ELSE o.amount_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM rider_remittance_allocations a WHERE a.obligation_id=o.id),0) END AS outstandingPaisa,
          c.rider_user_id AS riderId
        FROM parcel_cash_records c JOIN shipping_jobs j ON j.id=c.shipping_job_id LEFT JOIN rider_cash_obligations o ON o.collection_record_id=c.id WHERE j.order_id=?
        UNION ALL
        SELECT c.id,c.shipping_job_id AS jobId,'courier_cost' AS kind,c.amount_paisa AS amountPaisa,c.evidence_reference AS reference,'recorded' AS status,c.created_by AS maker,NULL AS dueAt,NULL AS outstandingPaisa,NULL AS riderId
        FROM parcel_courier_costs c JOIN shipping_jobs j ON j.id=c.shipping_job_id WHERE j.order_id=?`,
      )
      .bind(orderId, orderId)
      .all<{
        id: string;
        jobId: string;
        kind: string;
        amountPaisa: number;
        reference: string;
        status: string;
        maker: string;
        dueAt: number | null;
        outstandingPaisa: number | null;
        riderId: string | null;
      }>()
  ).results;
}
export async function riderCompensationEntries(
  db: D1Database,
  orderId: string,
) {
  return (
    await db
      .prepare(
        `SELECT e.id,e.shipping_job_id AS jobId,e.rider_user_id AS riderId,e.outcome,e.rate_paisa AS ratePaisa,e.amount_paisa AS amountPaisa,e.status,e.created_at AS createdAt FROM rider_compensation_entries e JOIN shipping_jobs j ON j.id=e.shipping_job_id WHERE j.order_id=? ORDER BY e.created_at,e.id`,
      )
      .bind(orderId)
      .all<{
        id: string;
        jobId: string;
        riderId: string;
        outcome: string;
        ratePaisa: number;
        amountPaisa: number;
        status: string;
        createdAt: number;
      }>()
  ).results;
}
export function customerParcel(p: Parcel, _now = Date.now()) {
  const courier = p.method === 'courier';
  return {
    id: p.id,
    sellerName: p.sellerName,
    status: p.status,
    method: p.method === 'own_rider' ? 'delivery' : p.method,
    courierName: courier ? p.courierName : null,
    trackingCode: courier ? p.trackingCode : null,
    trackingUrl: courier ? p.trackingUrl : null,
    codDuePaisa: p.codDuePaisa,
    collectedPaisa: p.collectedPaisa,
    latitude: null,
    longitude: null,
    accuracy: null,
  };
}
export async function shareParcelLocation(
  db: D1Database,
  jobId: string,
  userId: string,
  value: unknown,
  now = Date.now(),
) {
  const point = value === null ? undefined : parseLocation(value);
  if (value !== null && !point)
    throw new ParcelConflictError('Location required.');
  const result = await db
    .prepare(
      `UPDATE shipping_parcels SET latitude=?,longitude=?,accuracy=?,position_at=? WHERE shipping_job_id=? AND rider_user_id=? AND method='own_rider' AND EXISTS(SELECT 1 FROM shipping_jobs j JOIN orders o ON o.id=j.order_id WHERE j.id=shipping_job_id AND j.status='dispatched' AND o.status='dispatched') AND ${approvedRiderSql}`,
    )
    .bind(
      point?.latitude ?? null,
      point?.longitude ?? null,
      point?.accuracy ?? null,
      point ? now : null,
      jobId,
      userId,
      userId,
    )
    .run();
  if (result.meta.changes !== 1)
    throw new ParcelConflictError(
      'Sharing is no longer available for this assignment.',
    );
}
export async function riderParcels(db: D1Database, userId: string) {
  return (
    await db
      .prepare(
        `SELECT j.id,o.order_number AS orderNumber,j.status,o.shipping_address_json AS addressJson FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE p.rider_user_id=? AND EXISTS(SELECT 1 FROM rider_profiles rp JOIN users ru ON ru.id=rp.user_id WHERE rp.user_id=p.rider_user_id AND rp.status='approved' AND ru.status='active') AND p.method='own_rider' AND j.status NOT IN ('delivered','returned','cancelled') AND o.status IN ('confirmed','packing','ready_for_pickup','dispatched') ORDER BY j.created_at`,
      )
      .bind(userId)
      .all<{
        id: string;
        orderNumber: string;
        status: string;
        addressJson: string;
      }>()
  ).results;
}
