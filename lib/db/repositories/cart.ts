import { publicProductEligibility } from '@/lib/products/eligibility';
const CART_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEM_QUANTITY = 10;
const MAX_CART_LINES = 20;

export class CartConflictError extends Error {}

interface CartRow {
  id: string;
}

export interface CartItemRow {
  id: string;
  productId: string;
  sellerId: string;
  slug: string;
  nameEn: string;
  nameNe: string | null;
  tradingName: string;
  pricePaisa: number;
  quantity: number;
  inventoryQuantity: number;
  preparationDays: number;
  productStatus: string;
  primaryMediaId: string | null;
}

export interface CartView {
  items: readonly CartItemRow[];
  itemSubtotalPaisa: number;
  itemCount: number;
  hasUnavailableItems: boolean;
}

async function findCart(database: D1Database, tokenHash: string): Promise<CartRow | null> {
  return (
    (await database
      .prepare(`SELECT id FROM carts WHERE anonymous_token_hash = ? LIMIT 1`)
      .bind(tokenHash)
      .first<CartRow>()) ?? null
  );
}

async function getOrCreateCart(database: D1Database, tokenHash: string, now: number): Promise<CartRow> {
  const existing = await findCart(database, tokenHash);
  if (existing) {
    await database.prepare(`UPDATE carts SET expires_at = ?, updated_at = ? WHERE id = ?`).bind(now + CART_LIFETIME_MS, now, existing.id).run();
    return existing;
  }
  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT OR IGNORE INTO carts (
        id, user_id, anonymous_token_hash, currency, expires_at, created_at, updated_at
      ) VALUES (?, NULL, ?, 'NPR', ?, ?, ?)`,
    )
    .bind(id, tokenHash, now + CART_LIFETIME_MS, now, now)
    .run();
  const cart = await findCart(database, tokenHash);
  if (!cart) throw new CartConflictError('Cart could not be created. Try again.');
  return cart;
}

export async function getCart(database: D1Database, tokenHash: string): Promise<CartView> {
  const cart = await findCart(database, tokenHash);
  if (!cart) return { items: [], itemSubtotalPaisa: 0, itemCount: 0, hasUnavailableItems: false };
  const result = await database
    .prepare(
      `SELECT cart_items.id, cart_items.product_id AS productId,
        products.seller_id AS sellerId,
        products.slug, products.name_en AS nameEn, products.name_ne AS nameNe,
        seller_profiles.trading_name AS tradingName,
        products.price_paisa AS pricePaisa, cart_items.quantity,
        products.inventory_quantity AS inventoryQuantity,
        products.preparation_days AS preparationDays,
        CASE WHEN ${publicProductEligibility()} THEN 'published' ELSE 'archived' END AS productStatus,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id
          ORDER BY product_media.sort_order ASC LIMIT 1) AS primaryMediaId
       FROM cart_items
       INNER JOIN products ON products.id = cart_items.product_id
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       WHERE cart_items.cart_id = ?
       ORDER BY cart_items.created_at ASC`,
    )
    .bind(cart.id)
    .all<CartItemRow>();
  const items = result.results;
  return {
    items,
    itemSubtotalPaisa: items.reduce((total, item) => total + item.pricePaisa * item.quantity, 0),
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    hasUnavailableItems: items.some(
      (item) => item.productStatus !== 'published' || item.inventoryQuantity < item.quantity,
    ),
  };
}

export async function addCartItem(
  database: D1Database,
  tokenHash: string,
  productId: string,
  quantity: number,
  now: number,
): Promise<CartView> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
    throw new CartConflictError(`Choose a quantity from 1 to ${MAX_ITEM_QUANTITY}.`);
  }
  const product = await database
    .prepare(`SELECT inventory_quantity AS inventoryQuantity FROM products WHERE id = ? AND ${publicProductEligibility()} LIMIT 1`)
    .bind(productId)
    .first<{ inventoryQuantity: number }>();
  if (!product || product.inventoryQuantity < 1) throw new CartConflictError('This product is currently unavailable.');
  const cart = await getOrCreateCart(database, tokenHash, now);
  const existing = await database
    .prepare(`SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? LIMIT 1`)
    .bind(cart.id, productId)
    .first<{ id: string; quantity: number }>();
  const nextQuantity = (existing?.quantity ?? 0) + quantity;
  if (nextQuantity > MAX_ITEM_QUANTITY || nextQuantity > product.inventoryQuantity) {
    throw new CartConflictError(`Only ${Math.min(MAX_ITEM_QUANTITY, product.inventoryQuantity)} can be added to this cart.`);
  }
  if (existing) {
    await database.prepare(`UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ? AND cart_id = ?`).bind(nextQuantity, now, existing.id, cart.id).run();
  } else {
    const count = await database.prepare(`SELECT COUNT(*) AS count FROM cart_items WHERE cart_id = ?`).bind(cart.id).first<{ count: number }>();
    if ((count?.count ?? 0) >= MAX_CART_LINES) throw new CartConflictError(`A cart can contain up to ${MAX_CART_LINES} different products.`);
    await database
      .prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), cart.id, productId, quantity, now, now)
      .run();
  }
  return getCart(database, tokenHash);
}

export async function updateCartItem(
  database: D1Database,
  tokenHash: string,
  itemId: string,
  quantity: number,
  now: number,
): Promise<CartView> {
  const cart = await findCart(database, tokenHash);
  if (!cart) throw new CartConflictError('Cart not found.');
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_ITEM_QUANTITY) {
    throw new CartConflictError(`Choose a quantity from 0 to ${MAX_ITEM_QUANTITY}.`);
  }
  if (quantity === 0) {
    await database.prepare(`DELETE FROM cart_items WHERE id = ? AND cart_id = ?`).bind(itemId, cart.id).run();
    return getCart(database, tokenHash);
  }
  const item = await database
    .prepare(
      `SELECT products.inventory_quantity AS inventoryQuantity, products.status
       FROM cart_items INNER JOIN products ON products.id = cart_items.product_id
       WHERE cart_items.id = ? AND cart_items.cart_id = ? LIMIT 1`,
    )
    .bind(itemId, cart.id)
    .first<{ inventoryQuantity: number; status: string }>();
  if (!item) throw new CartConflictError('Cart item not found.');
  if (item.status !== 'published' || item.inventoryQuantity < quantity) {
    throw new CartConflictError(`Only ${item.inventoryQuantity} currently available.`);
  }
  await database.prepare(`UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ? AND cart_id = ?`).bind(quantity, now, itemId, cart.id).run();
  return getCart(database, tokenHash);
}

export async function removeCartItem(database: D1Database, tokenHash: string, itemId: string): Promise<CartView> {
  const cart = await findCart(database, tokenHash);
  if (cart) await database.prepare(`DELETE FROM cart_items WHERE id = ? AND cart_id = ?`).bind(itemId, cart.id).run();
  return getCart(database, tokenHash);
}

export async function getCartId(database: D1Database, tokenHash: string): Promise<string | null> {
  return (await findCart(database, tokenHash))?.id ?? null;
}
