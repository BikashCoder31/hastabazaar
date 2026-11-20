const CART_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_ITEM_QUANTITY = 10;
export const MAX_CART_LINES = 20;

export class CartConflictError extends Error {}

export async function writeCart(
  database: D1Database,
  cartId: string,
  now: number,
  statements: D1PreparedStatement[],
) {
  try {
    await database.batch([
      // The cart row serializes count checks and quantity mutations on MariaDB;
      // D1 executes the same batch in one SQLite write transaction.
      database
        .prepare('UPDATE carts SET updated_at = ? WHERE id = ?')
        .bind(now, cartId),
      ...statements,
    ]);
  } catch (cause) {
    throw new CartConflictError(
      'The cart changed or an item is no longer available. Refresh the cart and try again.',
      {cause},
    );
  }
}

export function cartGuard(
  database: D1Database,
  predicate: string,
  values: unknown[],
): D1PreparedStatement[] {
  const id = crypto.randomUUID();
  return [
    database
      .prepare(
        `INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`,
      )
      .bind(id, ...values),
    database
      .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
      .bind(id),
  ];
}

export interface CartRow {
  id: string;
}

export async function findCart(
  database: D1Database,
  tokenHash: string,
): Promise<CartRow | null> {
  return (
    (await database
      .prepare(`SELECT id FROM carts WHERE anonymous_token_hash = ? LIMIT 1`)
      .bind(tokenHash)
      .first<CartRow>()) ?? null
  );
}

export async function getOrCreateCart(
  database: D1Database,
  tokenHash: string,
  now: number,
): Promise<CartRow> {
  const existing = await findCart(database, tokenHash);
  if (existing) {
    await database
      .prepare(`UPDATE carts SET expires_at = ?, updated_at = ? WHERE id = ?`)
      .bind(now + CART_LIFETIME_MS, now, existing.id)
      .run();
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
  if (!cart)
    throw new CartConflictError('Cart could not be created. Try again.');
  return cart;
}

