import { packedWeightLabel } from '@/lib/shipping/packed-weight';
import type { DispatchParcel } from './read-dispatch';

type WeightRecord = Pick<DispatchParcel, 'key' | 'packedWeightGrams'>;

export function dispatchWeightTotal(parcels: readonly WeightRecord[]): string | null {
  const records = [...new Map(parcels.map(parcel => [parcel.key, parcel.packedWeightGrams])).values()];
  if (records.every(weight => weight === undefined)) return null;
  const known = records.filter((weight): weight is number => weight != null);
  if (!known.length) return packedWeightLabel(null);
  const label = packedWeightLabel(known.reduce((total, grams) => total + grams, 0));
  const missing = records.length - known.length;
  return missing ? `Recorded weight ${label} · ${missing} missing` : `Total weight ${label}`;
}

export function courierBookingSummary(parcels: readonly DispatchParcel[]) {
  const uniqueParcels = new Map(parcels.map(parcel => [parcel.key, parcel]));
  const groups = Map.groupBy(uniqueParcels.values(), parcel => parcel.pickupGroup);
  return [...groups.values()].map(group => {
    const [first] = group;
    const heading = [first.sellerName, first.pickupAddress, dispatchWeightTotal(group)].filter(Boolean).join(' · ');
    const lines = group.map(parcel => [parcel.orderNumber, parcel.destination, packedWeightLabel(parcel.packedWeightGrams)].filter(Boolean).join(' · '));
    return [heading, ...lines].join('\n');
  }).join('\n\n');
}
