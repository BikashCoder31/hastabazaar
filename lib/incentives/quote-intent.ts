import { getCart, getCartId } from '../db/repositories/cart';
import { quotePromo } from '../db/repositories/promo-codes';
import {
  IncentiveError,
  type PromoQuote,
  type CheckoutPromoQuote,
  type PromoQuoteLine,
} from './types';
import { digestFormRequest } from '../forms/submission';

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
  const quote = await quotePromo(db, {
    userId,
    code,
    subtotalPaisa: cart.itemSubtotalPaisa,
    now,
  });
  return {
    ...quote,
    quoteIntent: await promoQuoteIntent(
      userId,
      cartId,
      cart.items,
      quote,
      actor.authSubject,
    ),
  };
}
