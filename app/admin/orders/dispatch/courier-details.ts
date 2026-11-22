import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { packedWeightLabel } from '@/lib/shipping/packed-weight';
import { dispatchWeightTotal } from './packing-summary';

export type CourierParcelSelection = {
  orderId: string;
  sellerId: string;
  jobId: string | null;
  version: number | null;
};

export type CourierParcelDetails = {
  key: string;
  orderNumber: string;
  seller: string;
  pickupGroup: string;
  pickupAddress: string;
  sellerPhone: string;
  receiver: string;
  phone: string;
  address: string;
  district: string;
  prepaid: boolean;
  codDuePaisa: number | null;
  packedWeightGrams: number | null;
  items: string[];
};

export const courierSheetColumns = [
  'Reference', 'Receiver', 'Phone', 'Address', 'District', 'COD', 'Weight', 'Description',
] as const;

export function courierPickupLine(parcel: CourierParcelDetails) {
  return [parcel.seller, parcel.pickupAddress || 'Pickup address not recorded', parcel.sellerPhone || 'Seller phone not recorded'].join(' · ');
}

export function courierCashLabel(parcel: CourierParcelDetails) {
  if (parcel.prepaid) return 'Prepaid · collect NPR 0';
  return parcel.codDuePaisa == null ? 'COD amount not recorded' : `COD ${formatPaisaExact(parcel.codDuePaisa)}`;
}

export function courierPickupGroups(parcels: readonly CourierParcelDetails[]) {
  const unique = new Map(parcels.map(parcel => [parcel.key, parcel]));
  return Map.groupBy(unique.values(), parcel => parcel.pickupGroup).values();
}

export function courierBookingDetailsText(parcels: readonly CourierParcelDetails[]) {
  return [...courierPickupGroups(parcels)].map(group => {
    const heading = [`Pickup: ${courierPickupLine(group[0])}`, group.length > 1 ? dispatchWeightTotal(group) : null].filter(Boolean).join('\n');
    const details = group.map(parcel => [
      `Reference: ${parcel.orderNumber}`,
      `Receiver: ${parcel.receiver || 'Not recorded'}`,
      `Phone: ${parcel.phone || 'Not recorded'}`,
      `Address: ${parcel.address || 'Not recorded'}`,
      courierCashLabel(parcel),
      packedWeightLabel(parcel.packedWeightGrams),
      `Items: ${parcel.items.join(', ')}`,
    ].join('\n'));
    return [heading, ...details].join('\n\n');
  }).join('\n\n');
}

function sheetCell(value: string) {
  // Keep user-supplied cells inert when a spreadsheet interprets the CSV.
  const text = /^[\s\p{Cc}]*[=+@-]|^[\t\r\n]/u.test(value) ? "'" + value : value;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function courierBookingCsv(parcels: readonly CourierParcelDetails[]) {
  return [courierSheetColumns, ...parcels.map(parcel => [
    parcel.orderNumber,
    parcel.receiver,
    parcel.phone,
    parcel.address,
    parcel.district,
    parcel.prepaid ? '0.00' : parcel.codDuePaisa == null ? '' : (parcel.codDuePaisa / 100).toFixed(2),
    parcel.packedWeightGrams == null ? '' : String(parcel.packedWeightGrams / 1000),
    parcel.items.join(', '),
  ])].map(row => row.map(sheetCell).join(',')).join('\r\n') + '\r\n';
}
