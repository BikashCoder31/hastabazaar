export const packedWeightMinGrams = 50;
export const packedWeightMaxGrams = 30_000;
export const packedWeightRange = 'Enter a weight from 0.05 to 30 kg.';

export function isPackedWeightGrams(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) &&
    value >= packedWeightMinGrams && value <= packedWeightMaxGrams;
}

export function parsePackedWeightKg(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d{1,2}(?:\.\d{1,3})?|\.\d{1,3})$/.test(text)) return null;
  const grams = Math.round(Number(text) * 1000);
  return isPackedWeightGrams(grams) ? grams : null;
}

export function packedWeightLabel(grams: number | null | undefined) {
  return grams == null ? 'Weight not recorded' : `${grams / 1000} kg`;
}
