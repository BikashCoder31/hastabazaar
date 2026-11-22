import type { Paisa } from './types';

export function paisa(value: string | number | bigint): Paisa {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new RangeError('An amount needs financial review.');
  const text = String(value);
  if (!/^-?(0|[1-9]\d*)$/.test(text))
    throw new RangeError('An amount needs financial review.');
  return BigInt(text).toString();
}
export function sumPaisa(values: readonly Paisa[]): Paisa {
  return values
    .reduce((sum, value) => sum + BigInt(paisa(value)), BigInt(0))
    .toString();
}
export function formatPaisa(value: Paisa): string {
  const amount = BigInt(paisa(value)),
    absolute = amount < BigInt(0) ? -amount : amount;
  return `${amount < BigInt(0) ? '-' : ''}NPR ${new Intl.NumberFormat('en-US').format(absolute / BigInt(100))}.${String(absolute % BigInt(100)).padStart(2, '0')}`;
}
