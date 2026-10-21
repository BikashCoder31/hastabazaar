import { parseServiceFeeSnapshot, type PlatformServiceFeeSnapshot } from './platform-service-fee';

export interface ReviewedCheckoutQuote {
  serviceFee?: PlatformServiceFeeSnapshot;
  lines: Array<{
    id: string;
    sellerId: string;
    pricePaisa: number;
    quantity: number;
  }>;
  deliveryPaisa: number;
  walletPaisa: number;
  referralPaisa: number;
  promoPaisa: number;
  payablePaisa: number;
  policyContext: string;
  referralCampaign: {
    enabled: number;
    friendDiscountPaisa: number;
    rewardPaisa: number;
    minimumSubtotalPaisa: number;
    returnWindowDays: number;
  } | null;
}

export class ReviewedCheckoutChangedError extends Error {
  constructor() {
    super(
      'Your checkout quote or policies changed. Reload checkout and review the updated total and terms before placing a new order.',
    );
  }
}

export function parseReviewedCheckoutQuote(
  value: unknown,
): ReviewedCheckoutQuote {
  const fail = () => {
    throw new ReviewedCheckoutChangedError();
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const q = value as Record<string, unknown>;
  const amount = (v: unknown): number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail();
  const identifier = (v: unknown): string =>
    typeof v === 'string' && v.length > 0 && v.length <= 120 ? v : fail();
  if (!Array.isArray(q.lines) || !q.lines.length || q.lines.length > 20)
    return fail();
  const lines = q.lines
    .map((line: unknown) => {
      if (!line || typeof line !== 'object' || Array.isArray(line))
        return fail();
      const l = line as Record<string, unknown>;
      const quantity = amount(l.quantity);
      if (quantity < 1 || quantity > 1000) return fail();
      return {
        id: identifier(l.id),
        sellerId: identifier(l.sellerId),
        pricePaisa: amount(l.pricePaisa),
        quantity,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(lines.map((line) => line.id)).size !== lines.length)
    return fail();
  if (
    typeof q.policyContext !== 'string' ||
    !/^[a-f0-9]{64}$/.test(q.policyContext)
  )
    return fail();
  let referralCampaign: ReviewedCheckoutQuote['referralCampaign'] = null;
  if (q.referralCampaign !== null) {
    if (
      !q.referralCampaign ||
      typeof q.referralCampaign !== 'object' ||
      Array.isArray(q.referralCampaign)
    )
      return fail();
    const c = q.referralCampaign as Record<string, unknown>;
    if (![0, 1].includes(Number(c.enabled)) || typeof c.enabled !== 'number')
      return fail();
    referralCampaign = {
      enabled: c.enabled,
      friendDiscountPaisa: amount(c.friendDiscountPaisa),
      rewardPaisa: amount(c.rewardPaisa),
      minimumSubtotalPaisa: amount(c.minimumSubtotalPaisa),
      returnWindowDays: amount(c.returnWindowDays),
    };
  }
  let serviceFee: PlatformServiceFeeSnapshot | undefined;
  if (q.serviceFee !== undefined) {
    try { serviceFee = parseServiceFeeSnapshot(q.serviceFee); } catch { return fail(); }
  }
  const result = {
    lines,
    deliveryPaisa: amount(q.deliveryPaisa),
    walletPaisa: amount(q.walletPaisa),
    referralPaisa: amount(q.referralPaisa),
    promoPaisa: amount(q.promoPaisa),
    payablePaisa: amount(q.payablePaisa),
    policyContext: q.policyContext,
    referralCampaign,
    ...(serviceFee ? { serviceFee } : {}),
  };
  const subtotal = lines.reduce(
    (sum, line) => sum + BigInt(line.pricePaisa) * BigInt(line.quantity),
    BigInt(0),
  );
  const payable =
    subtotal +
    BigInt(result.deliveryPaisa) -
    BigInt(result.walletPaisa) -
    BigInt(result.referralPaisa) -
    BigInt(result.promoPaisa) + BigInt(serviceFee?.chargedPaisa ?? 0);
  if (
    payable !== BigInt(result.payablePaisa) ||
    subtotal > BigInt(Number.MAX_SAFE_INTEGER)
  )
    return fail();
  return result;
}

export function assertReviewedCheckoutQuote(
  reviewed: unknown,
  current: unknown,
): void {
  if (
    JSON.stringify(parseReviewedCheckoutQuote(reviewed)) !==
    JSON.stringify(parseReviewedCheckoutQuote(current))
  )
    throw new ReviewedCheckoutChangedError();
}
