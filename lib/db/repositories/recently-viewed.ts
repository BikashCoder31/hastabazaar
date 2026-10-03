import type { FeaturedProduct } from '@/lib/catalog/featured-products';
import type { RecentlyViewedPolicy } from '@/lib/configuration/types';
import { publicProductEligibility } from '@/lib/products/eligibility';
import { publicProductName } from '@/lib/products/truthful-presentation';

export type RecentlyViewedProduct = FeaturedProduct & Readonly<{
  id: string;
  pricePaisa: number;
  compareAtPricePaisa: number | null;
  available: boolean;
  lastViewedAt: number | null;
}>;

type ProductRow = Readonly<{
  id: string; slug: string; name: string; pricePaisa: number;
  compareAtPricePaisa: number | null; inventoryQuantity: number;
  category: string; tradingName: string; mediaId: string;
  lastViewedAt: number | null;
}>;

function asProduct(row: ProductRow): RecentlyViewedProduct {
  const pricePaisa = Number(row.pricePaisa);
  return {
    id: row.id,
    slug: row.slug,
    name: publicProductName(row.name),
    pricePaisa,
    compareAtPricePaisa: row.compareAtPricePaisa === null ? null : Number(row.compareAtPricePaisa),
    price: new Intl.NumberFormat('en-NP').format(pricePaisa / 100),
    category: row.category,
    image: `/api/product-media/${row.mediaId}`,
    imageAlt: publicProductName(row.name),
    tradingName: row.tradingName,
    available: Number(row.inventoryQuantity) > 0,
    lastViewedAt: row.lastViewedAt === null ? null : Number(row.lastViewedAt),
  };
}

function validatePolicy(policy: RecentlyViewedPolicy): void {
  if (!Number.isInteger(policy.maxItems) || policy.maxItems < 1 || policy.maxItems > 24) throw new RangeError('Recently Viewed item limit is invalid.');
  if (!Number.isInteger(policy.retentionDays) || policy.retentionDays < 1 || policy.retentionDays > 365) throw new RangeError('Recently Viewed retention is invalid.');
}

export async function recordRecentlyViewedProduct(
  database: D1Database,
  options: { userId: string; productId: string; now: number; policy: RecentlyViewedPolicy },
): Promise<boolean> {
  validatePolicy(options.policy);
  const eligible = await database.prepare(
    `SELECT 1 FROM products WHERE products.id=? AND ${publicProductEligibility('products', options.now)} LIMIT 1`,
  ).bind(options.productId).first();
  if (!eligible) return false;
  await database.batch([
    database.prepare(
      'INSERT OR IGNORE INTO recently_viewed_products(user_id,product_id,last_viewed_at) VALUES(?,?,?)',
    ).bind(options.userId, options.productId, options.now),
    database.prepare(
      'UPDATE recently_viewed_products SET last_viewed_at=? WHERE user_id=? AND product_id=?',
    ).bind(options.now, options.userId, options.productId),
    database.prepare('DELETE FROM recently_viewed_products WHERE user_id=? AND last_viewed_at<?')
      .bind(options.userId, options.now - options.policy.retentionDays * 86_400_000),
    database.prepare(
      `DELETE FROM recently_viewed_products WHERE user_id=? AND product_id NOT IN (
        SELECT product_id FROM (
          SELECT product_id FROM recently_viewed_products WHERE user_id=? ORDER BY last_viewed_at DESC,product_id ASC LIMIT ?
        ) retained_recently_viewed
      )`,
    ).bind(options.userId, options.userId, options.policy.maxItems),
  ]);
  return true;
}

function productSelect(historyJoin: string, orderBy: string, now: number): string {
  return `SELECT products.id,products.slug,products.name_en AS name,
   products.price_paisa AS pricePaisa,products.compare_at_price_paisa AS compareAtPricePaisa,
   products.inventory_quantity AS inventoryQuantity,categories.name_en AS category,
   seller_profiles.trading_name AS tradingName,media.id AS mediaId,
   ${historyJoin ? 'recently_viewed_products.last_viewed_at' : 'NULL'} AS lastViewedAt
  FROM products ${historyJoin}
  INNER JOIN seller_profiles ON seller_profiles.id=products.seller_id
  INNER JOIN categories ON categories.id=products.category_id
  INNER JOIN product_media media ON media.id=(SELECT candidate.id FROM product_media candidate
    WHERE candidate.product_id=products.id AND candidate.mime_type LIKE 'image/%'
    ORDER BY candidate.sort_order ASC,candidate.id ASC LIMIT 1)
  WHERE ${publicProductEligibility('products', now)} AND categories.is_active=1 ${orderBy}`;
}

export async function listRecentlyViewedProducts(
  database: D1Database,
  options: { userId: string; now: number; policy: RecentlyViewedPolicy },
): Promise<readonly RecentlyViewedProduct[]> {
  validatePolicy(options.policy);
  const cutoff = options.now - options.policy.retentionDays * 86_400_000;
  const result = await database.prepare(productSelect(
    'INNER JOIN recently_viewed_products ON recently_viewed_products.product_id=products.id',
    'AND recently_viewed_products.user_id=? AND recently_viewed_products.last_viewed_at>=? ORDER BY recently_viewed_products.last_viewed_at DESC,products.id ASC LIMIT ?',
    options.now,
  )).bind(options.userId, cutoff, options.policy.maxItems).all<ProductRow>();
  return result.results.map(asProduct);
}

export async function resolveRecentlyViewedProducts(
  database: D1Database,
  options: { productIds: readonly string[]; now: number; policy: RecentlyViewedPolicy },
): Promise<readonly RecentlyViewedProduct[]> {
  validatePolicy(options.policy);
  const ids = [...new Set(options.productIds)].slice(0, options.policy.maxItems);
  if (!ids.length) return [];
  const positions = new Map(ids.map((id, index) => [id, index]));
  const result = await database.prepare(productSelect('', `AND products.id IN (${ids.map(() => '?').join(',')})`, options.now))
    .bind(...ids).all<ProductRow>();
  return result.results.map(asProduct).sort((left, right) => (positions.get(left.id) ?? 999) - (positions.get(right.id) ?? 999));
}

export async function clearRecentlyViewed(database: D1Database, userId: string): Promise<void> {
  await database.prepare('DELETE FROM recently_viewed_products WHERE user_id=?').bind(userId).run();
}
