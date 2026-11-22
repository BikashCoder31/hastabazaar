export class ParcelConflictError extends Error {}

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
