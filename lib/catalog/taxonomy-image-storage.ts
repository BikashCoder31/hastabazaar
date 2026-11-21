export type TaxonomyKind = 'category' | 'occasion';

export const taxonomyImageStorage = {
  category: { table: 'categories', media: 'category_media', assignments: 'category_image_assignments', parent: 'category_id' },
  occasion: { table: 'occasions', media: 'occasion_media', assignments: 'occasion_image_assignments', parent: 'occasion_id' },
} as const;

export async function hasOccasionImageStorage(db: D1Database) {
  const { media, assignments } = taxonomyImageStorage.occasion;
  const catalog = (db as D1Database & { dialect?: string }).dialect === 'mariadb'
    ? 'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\' AND TABLE_NAME IN (?,?)'
    : "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?)";
  const { results } = await db.prepare(catalog).bind(media, assignments).all<{ name: string }>();
  return results.some(row => row.name === media) && results.some(row => row.name === assignments);
}
