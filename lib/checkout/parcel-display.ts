import { allocateOrderCash } from './parcel-cash-allocation';

type ParcelLine = {
  sellerId?: string;
  tradingName: string;
  pricePaisa: number | null;
  quantity: number;
  preparationDays?: number;
};

export type CheckoutParcel<T extends ParcelLine = ParcelLine> = {
  sellerId: string;
  sellerName: string;
  items: T[];
  preparationDays: number | null;
};

export function groupCheckoutParcels<T extends ParcelLine>(items: readonly T[]) {
  const groups = new Map<string, CheckoutParcel<T>>();
  for (const item of items) {
    const sellerId = item.sellerId || item.tradingName;
    let group = groups.get(sellerId);
    if (!group) {
      group = { sellerId, sellerName: item.tradingName, items: [], preparationDays: null };
      groups.set(sellerId, group);
    }
    group.items.push(item);
    if (typeof item.preparationDays === 'number' && item.preparationDays >= 0) {
      group.preparationDays = Math.max(group.preparationDays ?? 0, item.preparationDays);
    }
  }
  return [...groups.values()];
}

export function bagNeedsReview(item: Pick<ParcelLine, 'pricePaisa' | 'quantity'> & {
  productStatus: string;
  inventoryQuantity: number;
  currentChoice?: { pricePaisa: number; orderable: boolean } | null;
}) {
  return item.productStatus !== 'published' || item.pricePaisa === null || item.quantity > item.inventoryQuantity
    || Boolean(item.currentChoice && (!item.currentChoice.orderable || item.currentChoice.pricePaisa !== item.pricePaisa));
}

export function checkoutParcelCash(groups: readonly CheckoutParcel[], options: {
  totalPaisa: number;
  paymentMethod: 'cod' | 'manual_bank';
  discountsPaisa: number;
  feePaisa: number;
  pricedVariant: boolean;
  deliveryBySeller?: ReadonlyMap<string, number>;
}): Map<string, number> | null {
  if (options.paymentMethod !== 'cod' || !groups.length || groups.some(group => group.items.some(item => item.pricePaisa === null))) return null;
  if (groups.length === 1 && Number.isSafeInteger(options.totalPaisa) && options.totalPaisa >= 0) {
    return new Map([[groups[0].sellerId, options.totalPaisa]]);
  }
  const weights = groups.map(group => ({ sellerId: group.sellerId, amount: group.items.reduce((sum, item) => sum + (item.pricePaisa ?? 0) * item.quantity, 0) }));
  const delivery = options.deliveryBySeller;
  try {
    if (!delivery) return options.pricedVariant ? null : new Map(allocateOrderCash(options.totalPaisa, weights).map(row => [row.sellerId, row.amount]));
    // With checkout benefits or fees, the accepted order's line allocations
    // determine which seller receives the remaining paisa. Wait for the saved split.
    if (options.discountsPaisa || options.feePaisa || delivery.size !== weights.length) return null;
    const attributed = weights.map(({ sellerId, amount }) => ({ sellerId, amount: amount + (delivery.get(sellerId) ?? NaN) }));
    if (attributed.some(row => !Number.isSafeInteger(row.amount) || row.amount < 0) ||
      attributed.reduce((sum, row) => sum + row.amount, 0) !== options.totalPaisa) return null;
    return new Map(attributed.map(row => [row.sellerId, row.amount]));
  } catch {
    return null;
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-NP', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'Asia/Kathmandu' });

export function formatParcelEstimate(from: number, minDays: number, maxDays: number) {
  const dayMs = 24 * 60 * 60 * 1000;
  const min = dateFormatter.format(from + minDays * dayMs);
  return minDays === maxDays ? min : `${min} – ${dateFormatter.format(from + maxDays * dayMs)}`;
}
