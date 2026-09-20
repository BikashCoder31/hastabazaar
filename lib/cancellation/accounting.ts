import {DELIVERY_PRICING_POLICY,deliveryChargeForStores} from '../checkout/delivery-rates';

export interface CancellationItem {
  id: string;
  sellerId: string;
  amount: number;
  wallet: number;
  discount: number;
}
function safe(n: number) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error('Invalid cancellation amount.');
  return n;
}
function split(total: number, rows: readonly { id: string; amount: number }[]) {
  safe(total);
  const sum = rows.reduce((n, r) => n + BigInt(safe(r.amount)), BigInt(0));
  if (sum > BigInt(Number.MAX_SAFE_INTEGER) || (!sum && total))
    throw new Error('Invalid allocation.');
  const parts = rows.map((r) => ({
    id: r.id,
    amount: sum ? Number((BigInt(total) * BigInt(r.amount)) / sum) : 0,
    remainder: sum ? (BigInt(total) * BigInt(r.amount)) % sum : BigInt(0),
  }));
  let residue = total - parts.reduce((n, r) => n + r.amount, 0);
  for (const row of [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (residue-- > 0) row.amount++;
  }
  return new Map(parts.map((r) => [r.id, r.amount]));
}
export function allocateCancellationItems(
  source: readonly { id: string; sellerId: string; amount: number }[],
  wallet: number,
  discount: number,
): CancellationItem[] {
  safe(wallet);
  safe(discount);
  if (!source.length || new Set(source.map((r) => r.id)).size !== source.length)
    throw new Error('Invalid order items.');
  const subtotal = source.reduce((n, r) => n + safe(r.amount), 0),
    promo = safe(wallet + discount);
  safe(subtotal);
  if (promo > subtotal) throw new Error('Credit exceeds merchandise.');
  const rows = [...source].sort((a, b) => a.id.localeCompare(b.id)),
    combined = split(promo, rows),
    walletParts = split(
      wallet,
      rows.map((r) => ({ id: r.id, amount: combined.get(r.id)! })),
    );
  return rows.map((r) => ({
    ...r,
    wallet: walletParts.get(r.id)!,
    discount: combined.get(r.id)! - walletParts.get(r.id)!,
  }));
}
export function calculateCancellation(
  items: readonly CancellationItem[],
  cancelledSellers: ReadonlySet<string>,
  deliveryRule: number | {
    pricingPolicy: typeof DELIVERY_PRICING_POLICY;
    baseChargePaisa: number;
  },
) {
  if(typeof deliveryRule==='number')safe(deliveryRule);
  else {
    if(deliveryRule.pricingPolicy!==DELIVERY_PRICING_POLICY)throw new Error('Invalid delivery pricing policy.');
    safe(deliveryRule.baseChargePaisa);
  }
  const remaining = items.filter((r) => !cancelledSellers.has(r.sellerId)),
    cancelled = items.filter((r) => cancelledSellers.has(r.sellerId));
  const subtotal = remaining.reduce((n, r) => n + r.amount, 0),
    wallet = remaining.reduce((n, r) => n + r.wallet, 0),
    discount = remaining.reduce((n, r) => n + r.discount, 0),
    delivery = typeof deliveryRule==='number'
      ? (remaining.length ? deliveryRule : 0)
      : deliveryChargeForStores(deliveryRule.baseChargePaisa,new Set(remaining.map((r)=>r.sellerId)).size);
  const sellers = new Map<string, { amount: number; net: number }>();
  for (const row of remaining) {
    const existing = sellers.get(row.sellerId) ?? { amount: 0, net: 0 };
    existing.amount += row.amount;
    existing.net += row.amount - row.wallet - row.discount;
    sellers.set(row.sellerId, existing);
  }
  const fees = split(
    delivery,
    [...sellers].map(([id, r]) => ({ id, amount: r.amount })),
  );
  return {
    subtotal,
    wallet,
    discount,
    delivery,
    total: safe(
      Number(
        BigInt(subtotal) + BigInt(delivery) - BigInt(wallet) - BigInt(discount),
      ),
    ),
    walletRestored: cancelled.reduce((n, r) => n + r.wallet, 0),
    discountRemoved: cancelled.reduce((n, r) => n + r.discount, 0),
    parcels: [...sellers]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sellerId, r]) => ({
        sellerId,
        amount: safe(r.net + fees.get(sellerId)!),
      })),
  };
}
