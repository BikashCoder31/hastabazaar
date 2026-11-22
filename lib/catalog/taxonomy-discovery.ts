import {
  listActiveOccasions,
  listPublicDiscoveryCategories,
  type CategoryRow,
  type OccasionRow,
} from '@/lib/db/repositories/products';
import { publicProductVisibility } from '@/lib/products/eligibility';
import { publicCatalogueQuery } from '@/lib/products/public-catalogue-query';
import { hasOccasionImageStorage } from './taxonomy-image-storage';

export type DiscoveryCategory = CategoryRow & { productCount?: number };
export type OccasionGroup = { name: string; entries: readonly OccasionRow[] };
type OccasionMetadata = {
  id: string;
  groupName: string | null;
  currentSeason: number;
};
const discoveryColumns = ['occasion_id', 'group_name', 'group_sort_order', 'season_starts_at', 'season_ends_at'];

async function hasDiscoveryStorage(db: D1Database) {
  const maria = (db as D1Database & { dialect?: string }).dialect === 'mariadb';
  const { results } = await db.prepare(maria
    ? `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='occasion_discovery'`
    : 'PRAGMA table_info(occasion_discovery)').all<{ name: string }>();
  const columns = new Set(results.map(row => row.name));
  return discoveryColumns.every(column => columns.has(column));
}

export async function readDiscoveryCategories(db: D1Database): Promise<readonly DiscoveryCategory[]> {
  const [entries, hasStorage] = await Promise.all([listPublicDiscoveryCategories(db), hasDiscoveryStorage(db)]);
  if (!hasStorage || !entries.length) return entries;
  const { results } = await db.prepare(`
    SELECT products.category_id AS categoryId, COUNT(*) AS count
    FROM products WHERE ${publicProductVisibility()}
    GROUP BY products.category_id
  `).all<{ categoryId: string; count: number }>();
  const counts = new Map(results.map(row => [row.categoryId, Number(row.count)]));
  return entries.map(entry => ({ ...entry, productCount: counts.get(entry.id) ?? 0 }));
}

async function readBudgetCaps(db: D1Database, now: number) {
  const catalogue = await publicCatalogueQuery(db, now);
  const { results } = await db.prepare(`
    ${catalogue.withClause}, public_prices AS (
      SELECT ${catalogue.price()} AS price
      FROM products WHERE ${publicProductVisibility('products', now)}
    ), price_bands AS (
      SELECT price, NTILE(4) OVER (ORDER BY price) AS band
      FROM public_prices WHERE price > 0 AND price <= 100000000000
    )
    SELECT MAX(price) AS price FROM price_bands GROUP BY band ORDER BY band
  `).all<{ price: number }>();
  return [...new Set(results.map(row => Number(row.price)))];
}

async function listPublicDiscoveryOccasions(db: D1Database): Promise<readonly OccasionRow[]> {
  if (!await hasOccasionImageStorage(db)) return listActiveOccasions(db);
  const { results } = await db.prepare(`
    SELECT o.id,o.slug,o.name_en AS nameEn,o.name_ne AS nameNe,a.media_id AS imageId
    FROM occasions o LEFT JOIN occasion_image_assignments a ON a.occasion_id=o.id
    WHERE o.is_active=1 ORDER BY o.sort_order,o.name_en
  `).all<OccasionRow>();
  return results;
}

export async function readDiscoveryOccasions(db: D1Database, now = Date.now()) {
  const [entries, hasStorage, priceCaps] = await Promise.all([
    listPublicDiscoveryOccasions(db),
    hasDiscoveryStorage(db),
    readBudgetCaps(db, now),
  ]);
  const groups: OccasionGroup[] = [];
  let featured: OccasionRow | null = null;
  if (hasStorage) {
    const { results } = await db.prepare(`
      SELECT o.id, d.group_name AS groupName,
        CASE WHEN d.season_starts_at <= ? AND d.season_ends_at > ? THEN 1 ELSE 0 END AS currentSeason
      FROM occasion_discovery d JOIN occasions o ON o.id=d.occasion_id
      WHERE o.is_active=1
      ORDER BY d.group_sort_order, d.group_name, o.sort_order, o.name_en, o.id
    `).bind(now, now).all<OccasionMetadata>();
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    const groupsByName = new Map<string, OccasionRow[]>();
    const assigned = new Set<string>();
    for (const row of results) {
      const entry = byId.get(row.id);
      if (!entry) continue;
      if (!featured && Number(row.currentSeason) === 1) featured = entry;
      if (!row.groupName) continue;
      const group = groupsByName.get(row.groupName) ?? [];
      group.push(entry);
      groupsByName.set(row.groupName, group);
      assigned.add(entry.id);
    }
    for (const [name, groupEntries] of groupsByName) groups.push({ name, entries: groupEntries });
    const unassigned = entries.filter(entry => !assigned.has(entry.id));
    if (groups.length && unassigned.length) groups.push({ name: 'More occasions', entries: unassigned });
  }
  return { entries, groups, featured, priceCaps };
}
