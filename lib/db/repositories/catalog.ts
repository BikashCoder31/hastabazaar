export interface PublicProductRow {
  id: string;
  slug: string;
  nameEn: string;
  nameNe: string | null;
  descriptionEn: string;
  descriptionNe: string | null;
  pricePaisa: number;
  inventoryQuantity: number;
  sellerName: string;
  categorySlug: string;
  categoryNameEn: string;
  categoryNameNe: string | null;
  publishedAt: number | null;
}

export async function listPublishedProducts(
  database: D1Database,
  limit = 24,
): Promise<readonly PublicProductRow[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError(
      'Catalogue limit must be an integer from 1 through 100.',
    );
  }

  const result = await database
    .prepare(
      `SELECT
        products.id,
        products.slug,
        products.name_en AS nameEn,
        products.name_ne AS nameNe,
        products.description_en AS descriptionEn,
        products.description_ne AS descriptionNe,
        products.price_paisa AS pricePaisa,
        products.inventory_quantity AS inventoryQuantity,
        seller_profiles.trading_name AS sellerName,
        categories.slug AS categorySlug,
        categories.name_en AS categoryNameEn,
        categories.name_ne AS categoryNameNe,
        products.published_at AS publishedAt
      FROM products
      INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
      INNER JOIN categories ON categories.id = products.category_id
      WHERE products.status = ?
        AND seller_profiles.status = ?
        AND categories.is_active = 1
      ORDER BY products.published_at DESC, products.id ASC
      LIMIT ?`,
    )
    .bind('published', 'approved', limit)
    .all<PublicProductRow>();

  return result.results;
}
