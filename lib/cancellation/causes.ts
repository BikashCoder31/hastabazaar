export const cancellationCauses = [
  ['seller', 'Seller'],
  ['customer', 'Customer'],
  ['courier', 'Courier'],
  ['hastabazaar', 'Hastabazaar'],
  ['payment', 'Payment'],
] as const;

export type CancellationCause = (typeof cancellationCauses)[number][0];

export function readCancellationCause(value: unknown): CancellationCause | undefined {
  return cancellationCauses.find(([cause]) => cause === value)?.[0];
}

export function cancellationCauseLabel(cause: CancellationCause | null) {
  return cancellationCauses.find(([value]) => value === cause)?.[1] ?? 'Cause not recorded';
}
