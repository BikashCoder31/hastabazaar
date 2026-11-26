import { getCart, getCartId, type CartView } from '../db/repositories/cart';
import { quotePromo } from '../db/repositories/promo-codes';
import {
  IncentiveError,
  type PromoQuote,
  type CheckoutPromoQuote,
  type PromoQuoteLine,
} from './types';
import { digestFormRequest } from '../forms/submission';
import { offerMoney } from '../products/offer-contracts';
import {
  priceApprovedVariant,
  VARIANT_PRICING_RULE_VERSION,
  variantPricingEnabled,
  variantPricingPublishedOfferSql,
} from '../products/variant-pricing';

export async function promoQuoteIntent(
  userId: string,
  cartId: string,
  lines: readonly PromoQuoteLine[],
  quote: PromoQuote,
  customerAuthSubject: string,
): Promise<string> {
  return digestFormRequest({
    userId,
    customerAuthSubject,
    cartId,
    lines: lines
      .map(({ id, productId, sellerId, pricePaisa, quantity }) => ({
        id,
        productId,
        sellerId,
        pricePaisa,
        quantity,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    campaignId: quote.campaignId,
    revision: quote.revision,
    code: quote.code,
    discountPaisa: quote.discountPaisa,
    subtotalPaisa: quote.subtotalPaisa,
  });
}
async function cartPromoDiscountCap(db: D1Database, cartId: string, cart: CartView) {
  if (!(await variantPricingEnabled(db))) return undefined;
  const pricedLines = cart.items.filter(
    item => item.selectedOffer?.pricingRuleVersion === VARIANT_PRICING_RULE_VERSION,
  );
  if (pricedLines.length === 0) return undefined;

  // Confirm the exact current choice again before taking seller-only amounts.
  const prices = await db.prepare(`
    SELECT l.id, l.offer_id AS offerId, l.version_id AS versionId,
      l.public_version_id AS publicVersionId, l.revision, l.quantity,
      p.return_eligible AS returnEligible, c.offer_json AS offerJson
    FROM cart_offer_lines l
    JOIN products p ON p.id=l.product_id
    JOIN product_offer_heads h ON h.product_id=l.product_id
      AND h.current_version_id=l.version_id AND h.inventory_mapped=1
    JOIN product_offer_current c ON c.product_id=l.product_id
      AND c.offer_id=l.offer_id AND c.version_id=l.version_id
    JOIN product_publication_heads pub ON pub.product_id=l.product_id
      AND pub.current_version_id=l.public_version_id
    WHERE l.cart_id=? AND l.id IN (${pricedLines.map(() => '?').join(', ')})
      AND ${variantPricingPublishedOfferSql('p.id', 'l.version_id')}
  `).bind(cartId, ...pricedLines.map(item => item.id)).all<{
    id: string;
    offerId: string;
    versionId: string;
    publicVersionId: string;
    revision: number;
    quantity: number;
    returnEligible: number;
    offerJson: string;
  }>();
  const approved = new Map(prices.results.map(price => [price.id, price]));
  let cap = BigInt(cart.itemSubtotalPaisa);
  for (const item of pricedLines) {
    const row = approved.get(item.id);
    if (!row || row.offerId !== item.offerId || row.versionId !== item.offerVersionId ||
      row.publicVersionId !== item.publicVersionId || row.revision !== item.revision ||
      row.quantity !== item.quantity)
      throw new IncentiveError('stale');

    const raw = (JSON.parse(row.offerJson) as { price?: unknown } | null)?.price;
    const basePaisa = typeof raw === 'string' ? offerMoney(raw) : null;
    if (basePaisa === null || (row.returnEligible !== 0 && row.returnEligible !== 1))
      throw new IncentiveError('stale');
    const pricing = priceApprovedVariant(basePaisa, row.returnEligible === 1);
    if (pricing.customerUnitPaisa !== item.pricePaisa) throw new IncentiveError('stale');
    cap -= BigInt(pricing.additionPaisa) * BigInt(item.quantity);
  }
  return Number(cap);
}

/** Read-only: never creates wallets, releases referral rewards, or reserves campaign capacity. */
export async function quoteCheckoutPromo(
  db: D1Database,
  userId: string,
  tokenHash: string,
  code: string,
  now: number,
  expectedAuthSubject?: string,
): Promise<CheckoutPromoQuote> {
  const actor = await db
    .prepare(
      "SELECT u.auth_subject AS authSubject FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='customer'",
    )
    .bind(userId)
    .first<{ authSubject: string | null }>();
  if (
    !actor?.authSubject ||
    (expectedAuthSubject !== undefined &&
      actor.authSubject !== expectedAuthSubject)
  )
    throw new IncentiveError('unauthorized');
  const cartId = await getCartId(db, tokenHash);
  const cart = await getCart(db, tokenHash);
  if (
    !cartId ||
    !cart.items.length ||
    cart.hasUnavailableItems ||
    !Number.isSafeInteger(cart.itemSubtotalPaisa)
  )
    throw new IncentiveError('unavailable');
  const discountCapPaisa = await cartPromoDiscountCap(db, cartId, cart);
  const quote = await quotePromo(db, {
    userId,
    code,
    subtotalPaisa: cart.itemSubtotalPaisa,
    discountCapPaisa,
    now,
  });
  return {
    ...quote,
    quoteIntent: await promoQuoteIntent(
      userId,
      cartId,
      cart.items.map(item=>{if(item.pricePaisa===null)throw new IncentiveError('unavailable');return {...item,pricePaisa:item.pricePaisa};}),
      quote,
      actor.authSubject,
    ),
  };
}
