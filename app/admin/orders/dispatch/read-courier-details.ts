import { readUnbookedSellerParcelCash } from '@/lib/operations/parcels';
import type { NepalAddress } from '@/lib/shipping/provider';
import { ncmSchemaAvailable } from '@/lib/delivery/ncm-settings';
import type { CourierParcelDetails, CourierParcelSelection } from './courier-details';
import { readDispatchParcels } from './read-dispatch';

export class CourierSelectionChanged extends Error {
  constructor() { super('A selected parcel has changed. Refresh Dispatch and select it again.'); }
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function fullAddress(address: Partial<NepalAddress>) {
  const ward = text(address.ward);
  return [...new Set([
    ward && `Ward ${ward}`, text(address.locality), text(address.landmark), text(address.municipality),
    text(address.district), text(address.province), text(address.postalCode),
  ].filter(Boolean))].join(', ');
}

function parseAddress(value: string): Partial<NepalAddress> {
  try { return JSON.parse(value) ?? {}; } catch { return {}; }
}

type ContactRow = {
  addressJson: string;
  customerPhone: string | null;
  sellerPhone: string | null;
  paymentMode: string;
  ward: string | null;
  locality: string | null;
  municipality: string | null;
  district: string | null;
  province: string | null;
};

export async function readCourierBookingDetails(
  db: D1Database, selections: readonly CourierParcelSelection[],
  options: { allowPrepared?: boolean } = {},
): Promise<CourierParcelDetails[]> {
  const current = new Map((await readDispatchParcels(db)).map(row => [row.key, row]));
  const parcels = selections.map(selection => {
    const row = current.get(`${selection.orderId}:${selection.sellerId}`);
    const prepared = options.allowPrepared && selection.version === null &&
      (row?.version === null || row?.version === 0) && (selection.jobId === null || selection.jobId === row?.jobId);
    if (!row || row.orderId !== selection.orderId || row.sellerId !== selection.sellerId || row.lane !== 'ready' ||
      (!prepared && (row.version !== selection.version ||
        (row.version !== null && row.jobId !== selection.jobId)))) throw new CourierSelectionChanged();
    return row;
  });
  if (!options.allowPrepared && parcels.some(parcel => parcel.jobId) && await ncmSchemaAvailable(db)) {
    for (const {jobId} of parcels) {
      if (jobId && await db.prepare("SELECT 1 FROM ncm_bookings WHERE job_id=? AND state IN ('booking','needs_review','booked')")
        .bind(jobId).first()) throw new CourierSelectionChanged();
    }
  }
  const computedCash = new Map<string, Awaited<ReturnType<typeof readUnbookedSellerParcelCash>>>();
  const details: CourierParcelDetails[] = [];
  for (const parcel of parcels) {
    const [contact, items] = await Promise.all([
      db.prepare(`SELECT o.shipping_address_json AS addressJson,o.customer_phone AS customerPhone,
        o.payment_mode AS paymentMode,s.support_phone AS sellerPhone,a.ward,a.locality,a.municipality,a.district,a.province
        FROM orders o JOIN seller_profiles s ON s.id=?
        LEFT JOIN seller_operational_addresses a ON a.seller_id=s.id AND a.purpose='pickup'
        WHERE o.id=?`).bind(parcel.sellerId, parcel.orderId).first<ContactRow>(),
      db.prepare(`SELECT product_name_snapshot AS name,quantity
        FROM order_items WHERE order_id=? AND seller_id=? AND fulfillment_status<>'cancelled' ORDER BY id`)
        .bind(parcel.orderId, parcel.sellerId).all<{ name: string; quantity: number }>(),
    ]);
    const orderedItems = items.results;
    if (!contact || !orderedItems.length) throw new CourierSelectionChanged();
    const address = parseAddress(contact.addressJson);
    const prepaid = contact.paymentMode !== 'cod';
    let codDuePaisa = parcel.codDuePaisa;
    if (!prepaid && codDuePaisa === null) {
      let cash = computedCash.get(parcel.orderId);
      if (!cash) {
        cash = await readUnbookedSellerParcelCash(db, parcel.orderId);
        computedCash.set(parcel.orderId, cash);
      }
      codDuePaisa = cash.find(part => part.sellerId === parcel.sellerId)?.amount ?? null;
    }
    details.push({
      key: parcel.key, orderNumber: parcel.orderNumber, seller: parcel.sellerName, pickupGroup: parcel.pickupGroup,
      pickupAddress: fullAddress({ ward: text(contact.ward), locality: text(contact.locality), municipality: text(contact.municipality),
        province: text(contact.province), district: text(contact.district) }),
      sellerPhone: text(contact.sellerPhone), receiver: text(address.recipientName),
      phone: text(address.phone) || text(contact.customerPhone), address: fullAddress(address), district: text(address.district),
      prepaid, codDuePaisa, packedWeightGrams: parcel.packedWeightGrams ?? null,
      items: orderedItems.map(item => item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name),
    });
  }
  return details;
}
