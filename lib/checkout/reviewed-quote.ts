import { parseServiceFeeSnapshot, type PlatformServiceFeeSnapshot } from './platform-service-fee';
import {calculateBenefitTotals} from '../incentives/benefit-combinations';
import { VARIANT_PRICING_RULE_VERSION } from '../products/variant-pricing';

export interface NcmDemoDeliveryQuote {
  sellerId: string;
  originBranch: string;
  destinationBranch: string;
  amountPaisa: number;
}

export interface ReviewedCheckoutQuote {
  serviceFee?: PlatformServiceFeeSnapshot;
  lines: Array<{
    id: string;
    sellerId: string;
    pricePaisa: number;
    quantity: number;
    offerId?: string;
    offerVersionId?: string;
    publicVersionId?: string | null;
    revision?: number;
    pricingRuleVersion?: typeof VARIANT_PRICING_RULE_VERSION;
  }>;
  deliveryPaisa: number;
  ncmDemoQuotes?: NcmDemoDeliveryQuote[];
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
    typeof v === 'string' && v.length > 0 && v.length <= 160 ? v : fail();
  if (!Array.isArray(q.lines) || !q.lines.length || q.lines.length > 20)
    return fail();
  const lines = q.lines
    .map((line: unknown): ReviewedCheckoutQuote['lines'][number] => {
      if (!line || typeof line !== 'object' || Array.isArray(line))
        return fail();
      const l = line as Record<string, unknown>;
      const quantity = amount(l.quantity);
      if (quantity < 1 || quantity > 1000) return fail();
      const selected = ['offerId','offerVersionId','publicVersionId','revision'].some(key => Object.hasOwn(l,key));
      const identity = selected ? {
        offerId: identifier(l.offerId), offerVersionId: identifier(l.offerVersionId),
        publicVersionId: l.publicVersionId === null ? null : identifier(l.publicVersionId),
        revision: amount(l.revision),
      } : {};
      const hasPricingRule = Object.hasOwn(l, 'pricingRuleVersion');
      if (hasPricingRule &&
        (!selected || l.pricingRuleVersion !== VARIANT_PRICING_RULE_VERSION ||
          typeof l.publicVersionId !== 'string'))
        return fail();
      return {
        id: identifier(l.id),
        sellerId: identifier(l.sellerId),
        pricePaisa: amount(l.pricePaisa),
        quantity,
        ...identity,
        ...(hasPricingRule ? { pricingRuleVersion: VARIANT_PRICING_RULE_VERSION } : {}),
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
  let serviceFee: ReviewedCheckoutQuote['serviceFee'];
  if (q.serviceFee !== undefined) {
    try {
      serviceFee = parseServiceFeeSnapshot(q.serviceFee);
    } catch {
      return fail();
    }
  }
  const deliveryPaisa = amount(q.deliveryPaisa);
  let ncmDemoQuotes: NcmDemoDeliveryQuote[] | undefined;
  if (q.ncmDemoQuotes !== undefined) {
    const sellers = new Set(lines.map(line => line.sellerId));
    if (!Array.isArray(q.ncmDemoQuotes) || q.ncmDemoQuotes.length !== sellers.size) return fail();
    const branch = (v: unknown): string => typeof v === 'string' && /^[A-Z0-9 ]{1,40}$/.test(v) ? v : fail();
    ncmDemoQuotes = q.ncmDemoQuotes.map((quote: unknown): NcmDemoDeliveryQuote => {
      if (!quote || typeof quote !== 'object' || Array.isArray(quote)) return fail();
      const row = quote as Record<string, unknown>;
      const sellerId = identifier(row.sellerId);
      if (!sellers.delete(sellerId)) return fail();
      return { sellerId, originBranch: branch(row.originBranch), destinationBranch: branch(row.destinationBranch), amountPaisa: amount(row.amountPaisa) };
    }).sort((a, b) => a.sellerId.localeCompare(b.sellerId));
    if (ncmDemoQuotes.reduce((sum, quote) => sum + BigInt(quote.amountPaisa), BigInt(0)) !== BigInt(deliveryPaisa)) return fail();
  }
  const result: ReviewedCheckoutQuote = {
    lines,
    deliveryPaisa,
    ...(ncmDemoQuotes ? { ncmDemoQuotes } : {}),
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
  try {
    const total=calculateBenefitTotals({merchandisePaisa:Number(subtotal),promoPaisa:result.promoPaisa,referralPaisa:result.referralPaisa,creditPaisa:result.walletPaisa,deliveryPaisa:result.deliveryPaisa,customerFeePaisa:result.serviceFee?.chargedPaisa??0});
    if(total.payablePaisa!==result.payablePaisa)return fail();
  } catch {return fail();}
  return result;
}

export function assertReviewedCheckoutQuote(
  reviewed: unknown,
  current: unknown,
): void {
  // Compare the complete saved fee, including campaign attribution at a zero charge.
  if (
    JSON.stringify(parseReviewedCheckoutQuote(reviewed)) !==
    JSON.stringify(parseReviewedCheckoutQuote(current))
  )
    throw new ReviewedCheckoutChangedError();
}
