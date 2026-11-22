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
