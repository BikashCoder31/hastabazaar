import { MAX_CART_LINES, MAX_ITEM_QUANTITY } from '../cart/storage';
import { paymentGuard } from '../payments/manual-receipts';

export const SELLER_SHIPMENT_DELIVERY_POLICY = 'seller_shipment_equal_units_v2';
export const SELLER_SHIPMENT_DELIVERY_CAPABILITY: unique symbol = Symbol('seller shipment delivery attribution');

type Line = { orderItemId: string; sellerId: string; quantity: number };
type AttributionInput = { totalPaisa: number; sellerIds: readonly string[]; rateVersionId: string };
export type SellerShipmentAttribution = {
  source: string;
  sellerCharges: readonly { sellerId: string; amountPaisa: number }[];
};
type Attributor = (input: Readonly<AttributionInput>) => SellerShipmentAttribution;

export function getSellerShipmentDeliveryAttribution(db: D1Database, input: AttributionInput): SellerShipmentAttribution | null {
  // The regular checkout binding has no trusted seller shipment quote source yet.
  const attribute = (db as D1Database & { [SELLER_SHIPMENT_DELIVERY_CAPABILITY]?: Attributor })[SELLER_SHIPMENT_DELIVERY_CAPABILITY];
  return attribute ? attribute({ ...input, sellerIds: Object.freeze([...input.sellerIds]) }) : null;
}

export function usesSellerShipmentDelivery(snapshotJson: string | null): boolean {
  if (!snapshotJson) return false;
  try {
    return JSON.parse(snapshotJson)?.unitAllocationPolicy === SELLER_SHIPMENT_DELIVERY_POLICY;
  } catch {
    return false;
  }
}

function money(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid seller shipment charges.');
  return value;
}

/** Allocate each charged group independently, in the supplied saved line order. */
export function allocateSellerShipmentDelivery(totalPaisa: number, lines: readonly Line[], attribution: SellerShipmentAttribution) {
  money(totalPaisa);
  if (!lines.length || lines.length > MAX_CART_LINES || new Set(lines.map(line => line.orderItemId)).size !== lines.length) {
    throw new Error('Delivery allocation requires exact order lines.');
  }
  const groups = new Map<string, Line[]>();
  for (const line of lines) {
    if (!line.orderItemId || !line.sellerId || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_ITEM_QUANTITY) {
      throw new Error('Invalid seller shipment line or quantity.');
    }
    if (!groups.has(line.sellerId)) groups.set(line.sellerId, []);
    groups.get(line.sellerId)!.push(line);
  }
  if (typeof attribution.source !== 'string' || attribution.source.trim().length === 0 || attribution.source.length > 191 ||
      !Array.isArray(attribution.sellerCharges) || attribution.sellerCharges.length !== groups.size) {
    throw new Error('Delivery allocation requires explicit seller shipment charges and their source.');
  }
  const charges = new Map<string, number>();
  let total = BigInt(0);
  for (const { sellerId, amountPaisa } of attribution.sellerCharges) {
    if (!groups.has(sellerId) || charges.has(sellerId)) throw new Error('Seller shipment charges must cover each seller once.');
    charges.set(sellerId, money(amountPaisa));
    total += BigInt(amountPaisa);
  }
  if (total !== BigInt(totalPaisa)) throw new Error('Seller shipment charges do not match the checkout delivery total.');

  return [...groups].map(([sellerId, sellerLines], index) => {
    const amountPaisa = charges.get(sellerId)!;
    const unitCount = sellerLines.reduce((sum, line) => sum + line.quantity, 0);
    const share = Number(BigInt(amountPaisa) / BigInt(unitCount));
    const remainder = Number(BigInt(amountPaisa) % BigInt(unitCount));
    let shipmentUnitOrdinal = 0;
    return { sellerId, amountPaisa, unitCount, shipmentOrdinal: index + 1, units: sellerLines.flatMap((line, lineIndex) =>
      Array.from({ length: line.quantity }, (_, unit) => {
        shipmentUnitOrdinal += 1;
        return {
          orderItemId: line.orderItemId, lineOrdinal: lineIndex + 1, unitOrdinal: unit + 1, shipmentUnitOrdinal,
          amountPaisa: share + Number(shipmentUnitOrdinal <= remainder),
        };
      }),
    ) };
  });
}

export function prepareSellerShipmentDeliveryAllocations(db: D1Database, input: {
  orderId: string; totalPaisa: number; lines: readonly Line[]; attribution: SellerShipmentAttribution; now: number;
  shipmentReferences?: ReadonlyMap<string, string>;
}): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  const shipments = allocateSellerShipmentDelivery(input.totalPaisa, input.lines, input.attribution);
  for (const shipment of shipments) {
    const shipmentId = input.shipmentReferences ? input.shipmentReferences.get(shipment.sellerId) : crypto.randomUUID();
    if (!shipmentId) throw new Error('The saved shipment reference is required for each seller.');
    statements.push(db.prepare(`INSERT INTO order_delivery_shipment_allocations
      (id,order_id,seller_id,shipment_ordinal,amount_paisa,unit_count,policy_version,allocation_source,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(shipmentId, input.orderId, shipment.sellerId, shipment.shipmentOrdinal,
      shipment.amountPaisa, shipment.unitCount, SELLER_SHIPMENT_DELIVERY_POLICY, input.attribution.source, input.now));
    // Stay within D1's parameter limit, including when several lines share a parcel.
    for (let start = 0; start < shipment.units.length; start += 10) {
      const units = shipment.units.slice(start, start + 10);
      statements.push(db.prepare(`INSERT INTO order_delivery_unit_allocations
        (shipment_id,order_id,order_item_id,line_ordinal,unit_ordinal,shipment_unit_ordinal,amount_paisa)
        VALUES ${units.map(() => '(?,?,?,?,?,?,?)').join(',')}`).bind(...units.flatMap(unit => [shipmentId,
        input.orderId, unit.orderItemId, unit.lineOrdinal, unit.unitOrdinal, unit.shipmentUnitOrdinal, unit.amountPaisa])));
    }
  }
  statements.push(...paymentGuard(db, `EXISTS(SELECT 1 FROM orders WHERE id=? AND delivery_charge_paisa=?)
    AND (SELECT COUNT(*) FROM order_delivery_shipment_allocations WHERE order_id=?)=?
    AND (SELECT COALESCE(SUM(amount_paisa),0) FROM order_delivery_unit_allocations WHERE order_id=?)=?
    AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id=? AND i.quantity<>
      (SELECT COUNT(*) FROM order_delivery_unit_allocations u WHERE u.order_item_id=i.id))
    AND NOT EXISTS (SELECT 1 FROM order_delivery_shipment_allocations s WHERE s.order_id=? AND
      (s.unit_count<>(SELECT COUNT(*) FROM order_delivery_unit_allocations u WHERE u.shipment_id=s.id)
      OR s.amount_paisa<>(SELECT COALESCE(SUM(u.amount_paisa),0) FROM order_delivery_unit_allocations u WHERE u.shipment_id=s.id)))`,
  [input.orderId, input.totalPaisa, input.orderId, shipments.length, input.orderId, input.totalPaisa, input.orderId, input.orderId]));
  return statements;
}

export async function readSavedSellerShipmentCharges(db: D1Database, orderId: string, totalPaisa: number, sellerIds: readonly string[]) {
  const rows = (await db.prepare(`SELECT seller_id AS sellerId,amount_paisa AS amountPaisa FROM order_delivery_shipment_allocations
    WHERE order_id=? AND policy_version=? ORDER BY shipment_ordinal`).bind(orderId, SELLER_SHIPMENT_DELIVERY_POLICY)
    .all<{ sellerId: string; amountPaisa: number }>()).results;
  const charges = new Map(rows.map(row => [row.sellerId, money(Number(row.amountPaisa))]));
  const sellers = new Set(sellerIds);
  if (charges.size !== sellers.size || [...sellers].some(id => !charges.has(id)) ||
      [...charges.values()].reduce((sum, amount) => sum + BigInt(amount), BigInt(0)) !== BigInt(money(totalPaisa))) {
    throw new Error('Reconcile the original seller shipment charges.');
  }
  return charges;
}

type DeliveryUnit = { unitOrdinal: number; amountPaisa: number };

export async function readUnclaimedDeliveryUnits(db: D1Database, input: {
  orderId: string; orderItemId: string; originalQuantity: number; quantity: number; returnRequestId?: string;
}) {
  const rows = (await db.prepare(`SELECT u.unit_ordinal AS unitOrdinal,u.amount_paisa AS amountPaisa,
    c.unit_ordinal AS claimed,r.return_request_id AS returnRequestId
    FROM order_delivery_unit_allocations u LEFT JOIN order_delivery_unit_claims c
      ON c.order_item_id=u.order_item_id AND c.unit_ordinal=u.unit_ordinal
    LEFT JOIN refunds r ON r.id=c.refund_id
    WHERE u.order_id=? AND u.order_item_id=? ORDER BY u.unit_ordinal`)
    .bind(input.orderId, input.orderItemId).all<DeliveryUnit & { claimed: number | null; returnRequestId: string | null }>()).results;
  if (rows.length !== input.originalQuantity || rows.some((row, index) => Number(row.unitOrdinal) !== index + 1)) return null;
  const retained = input.returnRequestId ? rows.filter(row => row.returnRequestId === input.returnRequestId) : [];
  const available = retained.length ? retained : rows.filter(row => row.claimed === null).slice(0, input.quantity);
  if (available.length !== input.quantity) return null;
  return { units: available.map(row => ({ unitOrdinal: Number(row.unitOrdinal), amountPaisa: money(Number(row.amountPaisa)) })),
    originalPaisa: money(rows.reduce((sum, row) => sum + money(Number(row.amountPaisa)), 0)) };
}

export function prepareRefundDeliveryUnitClaims(db: D1Database, input: {
  refundId: string; orderItemId: string; units: readonly DeliveryUnit[]; now: number;
}): D1PreparedStatement[] {
  return input.units.map(unit => db.prepare(`INSERT INTO order_delivery_unit_claims
    (order_item_id,unit_ordinal,refund_id,cancellation_event_id,created_at) VALUES (?,?,?,NULL,?)`)
    .bind(input.orderItemId, unit.unitOrdinal, input.refundId, input.now));
}

export function prepareCancellationDeliveryUnitClaims(db: D1Database, input: {
  eventId: string; orderId: string; sellerIds: readonly string[]; removedDeliveryPaisa: number; now: number;
}): D1PreparedStatement[] {
  return [...input.sellerIds.map(sellerId => db.prepare(`INSERT INTO order_delivery_unit_claims
    (order_item_id,unit_ordinal,refund_id,cancellation_event_id,created_at)
    SELECT u.order_item_id,u.unit_ordinal,NULL,e.id,e.created_at FROM order_delivery_unit_allocations u
    JOIN order_delivery_shipment_allocations s ON s.id=u.shipment_id
    JOIN order_cancellation_events e ON e.id=? AND e.order_id=u.order_id WHERE u.order_id=? AND s.seller_id=?`)
    .bind(input.eventId, input.orderId, sellerId)), ...paymentGuard(db, `
    (SELECT COUNT(*) FROM order_delivery_unit_claims WHERE cancellation_event_id=?) =
      (SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE order_id=? AND seller_id IN (${input.sellerIds.map(() => '?').join(',')}))
    AND (SELECT COALESCE(SUM(u.amount_paisa),0) FROM order_delivery_unit_claims c JOIN order_delivery_unit_allocations u
      ON u.order_item_id=c.order_item_id AND u.unit_ordinal=c.unit_ordinal WHERE c.cancellation_event_id=?)=?`,
  [input.eventId, input.orderId, ...input.sellerIds, input.eventId, input.removedDeliveryPaisa])];
}
