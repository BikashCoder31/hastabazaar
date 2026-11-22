import {DELIVERY_PRICING_POLICY,deliveryChargeForStores} from '../checkout/delivery-rates';

export interface CancellationItem {
  id: string;
  sellerId: string;
  amount: number;
  wallet: number;
  discount: number;
  promo?: number;
}
function safe(n: number) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error('Invalid cancellation amount.');
  return n;
}
export function splitOriginalPaisa(total: number, rows: readonly { id: string; amount: number }[]) {
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
  source: readonly { id: string; sellerId: string; amount: number; promo?: number }[],
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
  // Promo allocations were sealed at checkout using cart line keys. Never resplit
  // those savings using the newly generated order-item IDs.
  if (source.some((row) => row.promo !== undefined)) {
    if (source.reduce((sum, row) => sum + safe(row.promo ?? 0), 0) !== discount)
      throw new Error('Invalid original promo allocation.');
    const rows = [...source].sort((a, b) => a.id.localeCompare(b.id));
    const walletParts = splitOriginalPaisa(wallet, rows.map((row) => ({
      id: row.id, amount: safe(row.amount - safe(row.promo ?? 0)),
    })));
    return rows.map((row) => ({ ...row, promo: row.promo ?? 0,
      wallet: walletParts.get(row.id)!, discount: row.promo ?? 0 }));
  }
  const rows = [...source].sort((a, b) => a.id.localeCompare(b.id)),
    combined = splitOriginalPaisa(promo, rows),
    walletParts = splitOriginalPaisa(
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
  } | {
    pricingPolicy: 'seller_shipment_equal_units_v2';
    sellerCharges: ReadonlyMap<string, number>;
  },
  originalServiceFeePaisa = 0,
) {
  safe(originalServiceFeePaisa);
  if(typeof deliveryRule==='number')safe(deliveryRule);
  else if (deliveryRule.pricingPolicy === DELIVERY_PRICING_POLICY) safe(deliveryRule.baseChargePaisa);
  else if (deliveryRule.pricingPolicy !== 'seller_shipment_equal_units_v2') throw new Error('Invalid delivery pricing policy.');
  const remaining = items.filter((r) => !cancelledSellers.has(r.sellerId)),
    cancelled = items.filter((r) => cancelledSellers.has(r.sellerId));
  const subtotal = remaining.reduce((n, r) => n + r.amount, 0),
    wallet = remaining.reduce((n, r) => n + r.wallet, 0),
    discount = remaining.reduce((n, r) => n + r.discount, 0);
  const sellers = new Map<string, { amount: number; net: number }>();
  for (const row of remaining) {
    const existing = sellers.get(row.sellerId) ?? { amount: 0, net: 0 };
    existing.amount += row.amount;
    existing.net += row.amount - row.wallet - row.discount;
    sellers.set(row.sellerId, existing);
  }
  const savedCharges = typeof deliveryRule !== 'number' && deliveryRule.pricingPolicy === 'seller_shipment_equal_units_v2'
    ? deliveryRule.sellerCharges : null;
  const savedCharge = (sellerId: string) => safe(savedCharges?.get(sellerId) ?? (savedCharges ? NaN : 0));
  const delivery = savedCharges
    ? safe([...sellers.keys()].reduce((sum, sellerId) => sum + savedCharge(sellerId), 0))
    : typeof deliveryRule === 'number' ? (remaining.length ? deliveryRule : 0)
    : deliveryRule.pricingPolicy === DELIVERY_PRICING_POLICY
      ? deliveryChargeForStores(deliveryRule.baseChargePaisa, sellers.size) : 0;
  const fees = splitOriginalPaisa(
    safe((savedCharges ? 0 : delivery) + (remaining.length ? originalServiceFeePaisa : 0)),
    [...sellers].map(([id, r]) => ({ id, amount: r.amount })),
  );
  return {
    subtotal,
    wallet,
    discount,
    delivery,
    ...(originalServiceFeePaisa ? { platformServiceFeePaisa: remaining.length ? originalServiceFeePaisa : 0,
      uncollectedServiceFeeWaivedPaisa: remaining.length ? 0 : originalServiceFeePaisa } : {}),
    promoDiscount: remaining.reduce((n, r) => n + (r.promo ?? 0), 0),
    total: safe(
      Number(
        BigInt(subtotal) + BigInt(delivery) + BigInt(remaining.length ? originalServiceFeePaisa : 0) - BigInt(wallet) - BigInt(discount),
      ),
    ),
    walletRestored: cancelled.reduce((n, r) => n + r.wallet, 0),
    promoRemoved: cancelled.reduce((n, r) => n + (r.promo ?? 0), 0),
    discountRemoved: cancelled.reduce((n, r) => n + r.discount, 0),
    parcels: [...sellers]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sellerId, r]) => ({
        sellerId,
        amount: safe(r.net + fees.get(sellerId)! + savedCharge(sellerId)),
      })),
  };
}
