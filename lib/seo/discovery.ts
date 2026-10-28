import { publicProductEligibility } from '@/lib/products/eligibility';
export const PUBLIC_ORIGIN = 'https://hastabazaar.com';
export const PUBLIC_PAGES = [
  '/',
  '/shop',
  '/about',
  '/contact-us',
  '/categories',
  '/occasions',
  '/legal',
  '/shipping',
  '/returns',
  '/privacy',
  '/terms',
  '/cookies',
  '/prohibited-products',
  '/help',
];
export function isDiscoverablePath(path: string): boolean {
  return (
    PUBLIC_PAGES.includes(path) || /^\/(?:products|makers)\/[^/]+$/.test(path) || /^\/api\/product-media\/[^/]+$/.test(path)
  );
}
export function permitsPublicIndexing(requestUrl: string, configuredOrigin?: string): boolean {
  // Preview/staging hosts must never inherit production indexing policy.
  try {
    return new URL(requestUrl).origin === PUBLIC_ORIGIN &&
      (!configuredOrigin || new URL(configuredOrigin).origin === PUBLIC_ORIGIN);
  } catch { return false; }
}
export function publicUrl(path: string): string {
  return PUBLIC_ORIGIN + path;
}
export function xmlEscape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
}
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
export function productStructuredData(
  product: {
    slug: string;
    nameEn: string;
    descriptionEn: string;
    pricePaisa: number;
    inventoryQuantity: number;
    media: readonly { id: string; mimeType?: string }[];
  },
  rating: { count: number; average: number | null },
) {
  const url = publicUrl('/products/' + encodeURIComponent(product.slug));
  const images = product.media.filter(media => ['image/jpeg', 'image/png', 'image/webp'].includes(media.mimeType ?? ''));
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.nameEn,
    description: product.descriptionEn,
    url,
    ...(images.length
      ? {
          image: images.map((m) =>
            publicUrl('/api/product-media/' + encodeURIComponent(m.id)),
          ),
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'NPR',
      price: (product.pricePaisa / 100).toFixed(2),
      availability:
        'https://schema.org/' +
        (product.inventoryQuantity > 0 ? 'InStock' : 'OutOfStock'),
    },
    ...(rating.count > 0 && rating.average != null
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            reviewCount: rating.count,
            ratingValue: Number(Number(rating.average).toFixed(2)),
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}
export async function publishedRating(database: D1Database, productId: string) {
  return (
    (await database
      .prepare(
        "SELECT COUNT(*) AS count, AVG(rating) AS average FROM product_reviews WHERE product_id=? AND status='published'",
      )
      .bind(productId)
      .first<{ count: number; average: number | null }>()) ?? {
      count: 0,
      average: null,
    }
  );
}
export async function sitemapProductCount(
  database: D1Database,
): Promise<number> {
  const row = await database
    .prepare(
      `SELECT COUNT(*) AS count FROM products WHERE ${publicProductEligibility()}`,
    )
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}
export async function sitemapProducts(database: D1Database, page: number) {
  return (
    await database
      .prepare(
        `SELECT slug,updated_at AS updatedAt FROM products WHERE ${publicProductEligibility()} ORDER BY id LIMIT 1000 OFFSET ?`,
      )
      .bind((page - 1) * 1000)
      .all<{ slug: string; updatedAt: number }>()
  ).results;
}
export function xmlResponse(body: string): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n' + body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
