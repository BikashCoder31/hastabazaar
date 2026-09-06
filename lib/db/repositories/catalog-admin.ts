export class CatalogManagementConflictError extends Error {}

export interface ManagedTaxonomyRow {
  id: string;
  slug: string;
  nameEn: string;
  nameNe: string | null;
  isActive: number;
  sortOrder: number;
  usageCount: number;
}

export async function listManagedTaxonomy(database: D1Database): Promise<{
  categories: readonly ManagedTaxonomyRow[];
  occasions: readonly ManagedTaxonomyRow[];
}> {
  const [categories, occasions] = await Promise.all([
    database
      .prepare(
        `SELECT categories.id, categories.slug, categories.name_en AS nameEn, categories.name_ne AS nameNe,
        categories.is_active AS isActive, categories.sort_order AS sortOrder, COUNT(products.id) AS usageCount
       FROM categories LEFT JOIN products ON products.category_id = categories.id GROUP BY categories.id ORDER BY categories.sort_order, categories.name_en`,
      )
      .all<ManagedTaxonomyRow>(),
    database
      .prepare(
        `SELECT occasions.id, occasions.slug, occasions.name_en AS nameEn, occasions.name_ne AS nameNe,
        occasions.is_active AS isActive, occasions.sort_order AS sortOrder, COUNT(product_occasions.product_id) AS usageCount
       FROM occasions LEFT JOIN product_occasions ON product_occasions.occasion_id = occasions.id GROUP BY occasions.id ORDER BY occasions.sort_order, occasions.name_en`,
      )
      .all<ManagedTaxonomyRow>(),
  ]);
  return { categories: categories.results, occasions: occasions.results };
}

function cleanTaxonomy(input: {
  slug: string;
  nameEn: string;
  nameNe: string;
  isActive: boolean;
  sortOrder: number;
}) {
  const slug = input.slug.trim().toLowerCase();
  const nameEn = input.nameEn.trim();
  const nameNe = input.nameNe.trim() || nameEn;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80)
    throw new CatalogManagementConflictError(
      'Use a lowercase URL slug with letters, numbers and hyphens.',
    );
  if (nameEn.length < 2 || nameEn.length > 100 || nameNe.length > 100)
    throw new CatalogManagementConflictError('Add a name of 2–100 characters.');
  if (
    !Number.isInteger(input.sortOrder) ||
    input.sortOrder < 0 ||
    input.sortOrder > 100_000
  )
    throw new CatalogManagementConflictError(
      'Sort order must be a non-negative whole number.',
    );
  return {
    slug,
    nameEn,
    nameNe,
    isActive: input.isActive ? 1 : 0,
    sortOrder: input.sortOrder,
  };
}

export async function saveTaxonomy(
  database: D1Database,
  options: {
    kind: 'category' | 'occasion';
    id?: string;
    actorId: string;
    input: {
      slug: string;
      nameEn: string;
      nameNe: string;
      isActive: boolean;
      sortOrder: number;
    };
    requestId: string;
    now: number;
  },
): Promise<string> {
  const duplicate = await database
    .prepare(
      `SELECT subject_id AS id FROM audit_logs WHERE request_id = ? LIMIT 1`,
    )
    .bind(options.requestId)
    .first<{ id: string }>();
  if (duplicate) return duplicate.id;
  const input = cleanTaxonomy(options.input);
  const table = options.kind === 'category' ? 'categories' : 'occasions';
  const id = options.id ?? crypto.randomUUID();
  const existing = options.id
    ? await database
        .prepare(`SELECT id FROM ${table} WHERE id = ?`)
        .bind(id)
        .first()
    : null;
  if (options.id && !existing)
    throw new CatalogManagementConflictError(
      `${options.kind === 'category' ? 'Category' : 'Occasion'} not found.`,
    );
  try {
    await database.batch([
      existing
        ? database
            .prepare(
              `UPDATE ${table} SET slug = ?, name_en = ?, name_ne = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
            )
            .bind(
              input.slug,
              input.nameEn,
              input.nameNe,
              input.isActive,
              input.sortOrder,
              options.now,
              id,
            )
        : options.kind === 'category'
          ? database
              .prepare(
                `INSERT INTO categories (id, parent_id, slug, name_en, name_ne, is_active, sort_order, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                id,
                input.slug,
                input.nameEn,
                input.nameNe,
                input.isActive,
                input.sortOrder,
                options.now,
                options.now,
              )
          : database
              .prepare(
                `INSERT INTO occasions (id, slug, name_en, name_ne, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                id,
                input.slug,
                input.nameEn,
                input.nameNe,
                input.isActive,
                input.sortOrder,
                options.now,
                options.now,
              ),
      database
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, 'Staff managed bilingual catalogue taxonomy', NULL, ?, ?, NULL, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          options.actorId,
          `catalog.${options.kind}.${existing ? 'updated' : 'created'}`,
          options.kind,
          id,
          JSON.stringify(input),
          options.requestId,
          options.now,
        ),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint'))
      throw new CatalogManagementConflictError('That slug is already in use.');
    throw error;
  }
  return id;
}

export async function classifyProduct(
  database: D1Database,
  options: {
    productId: string;
    categoryId: string;
    occasionIds: readonly string[];
    actorId: string;
    requestId: string;
    now: number;
  },
): Promise<void> {
  if (
    await database
      .prepare(`SELECT id FROM audit_logs WHERE request_id = ? LIMIT 1`)
      .bind(options.requestId)
      .first()
  )
    return;
  const occasionIds = [...new Set(options.occasionIds)];
  if (occasionIds.length < 1 || occasionIds.length > 5)
    throw new CatalogManagementConflictError('Choose 1–5 active occasions.');
  const [product, category, occasionCount] = await Promise.all([
    database
      .prepare(`SELECT id FROM products WHERE id = ?`)
      .bind(options.productId)
      .first(),
    database
      .prepare(`SELECT id FROM categories WHERE id = ? AND is_active = 1`)
      .bind(options.categoryId)
      .first(),
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM occasions WHERE is_active = 1 AND id IN (${occasionIds.map(() => '?').join(',')})`,
      )
      .bind(...occasionIds)
      .first<{ count: number }>(),
  ]);
  if (!product || !category || occasionCount?.count !== occasionIds.length)
    throw new CatalogManagementConflictError(
      'Product, category or occasion selection is invalid.',
    );
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE products SET category_id = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(options.categoryId, options.now, options.productId),
    database
      .prepare(`DELETE FROM product_occasions WHERE product_id = ?`)
      .bind(options.productId),
  ];
  for (const occasionId of occasionIds)
    statements.push(
      database
        .prepare(
          `INSERT INTO product_occasions (product_id, occasion_id, created_at) VALUES (?, ?, ?)`,
        )
        .bind(options.productId, occasionId, options.now),
    );
  statements.push(
    database
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
     VALUES (?, ?, 'catalog.product.classified', 'product', ?, 'Staff updated product category and gift occasions', NULL, ?, ?, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        options.productId,
        JSON.stringify({ categoryId: options.categoryId, occasionIds }),
        options.requestId,
        options.now,
      ),
  );
  await database.batch(statements);
}
