import { publicProductVisibility } from '../products/eligibility';
import { currentProductMediaOrder, currentProductMediaSql } from '../products/publication-media';
import { publicProductName } from '../products/truthful-presentation';
import { publicProfileFieldSql } from '../sellers/public-profile-sql';

export type SearchSuggestion = {
  kind: 'product' | 'category' | 'maker';
  label: string;
  href: string;
  imageId?: string | null;
};

const escapedLike = (value: string) => value.replace(/[!%_]/g, '!$&');

/** Read public listings and the public categories and shops attached to them. */
export async function readSearchSuggestions(db: D1Database, raw: string): Promise<SearchSuggestion[]> {
  const query = raw.trim().slice(0, 100);
  if (query.length < 2) return [];

  const pattern = `%${escapedLike(query)}%`;
  const prefix = `${escapedLike(query)}%`;
  const name = publicProfileFieldSql('publicName');
  const scope = publicProductVisibility();
  const productMatches = `(products.name_en LIKE ? ESCAPE '!' OR products.name_ne LIKE ? ESCAPE '!'
    OR products.materials LIKE ? ESCAPE '!' OR ${name} LIKE ? ESCAPE '!')`;
  const listingSource = `FROM products INNER JOIN categories ON categories.id=products.category_id
    INNER JOIN seller_profiles ON seller_profiles.id=products.seller_id WHERE (${scope})`;
  const [products, categories, makers] = await Promise.all([
    db.prepare(`SELECT products.slug, products.name_en AS title, (SELECT product_media.id FROM product_media
      WHERE product_media.product_id=products.id AND ${currentProductMediaSql('product_media')}
      ORDER BY ${currentProductMediaOrder('product_media')} LIMIT 1) AS imageId
      ${listingSource} AND ${productMatches}
      ORDER BY CASE WHEN products.name_en LIKE ? ESCAPE '!' THEN 0 ELSE 1 END,
        products.published_at DESC, products.id ASC LIMIT 5`)
      .bind(pattern, pattern, pattern, pattern, prefix)
      .all<{ slug: string; title: string; imageId: string | null }>(),
    db.prepare(`SELECT DISTINCT categories.slug, categories.name_en AS title ${listingSource}
      AND (${productMatches} OR categories.name_en LIKE ? ESCAPE '!' OR categories.name_ne LIKE ? ESCAPE '!')
      ORDER BY title, categories.slug LIMIT 3`)
      .bind(pattern, pattern, pattern, pattern, pattern, pattern)
      .all<{ slug: string; title: string }>(),
    db.prepare(`SELECT DISTINCT seller_profiles.id, ${name} AS title ${listingSource}
      AND ${name} IS NOT NULL AND ${productMatches} ORDER BY title, seller_profiles.id LIMIT 3`)
      .bind(pattern, pattern, pattern, pattern)
      .all<{ id: string; title: string }>(),
  ]);

  return [
    ...products.results.map(({ slug, title, imageId }) => ({ kind: 'product' as const, label: publicProductName(title), href: `/products/${encodeURIComponent(slug)}`, imageId })),
    ...categories.results.map(({ slug, title }) => ({ kind: 'category' as const, label: title, href: `/shop?${new URLSearchParams({ category: slug })}` })),
    ...makers.results.map(({ id, title }) => ({ kind: 'maker' as const, label: title, href: `/makers/${encodeURIComponent(id)}` })),
  ];
}
