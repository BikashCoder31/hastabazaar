import { buildFormAnswerInsert } from './form-answers';
import { staffMutationGuard } from './staff-mutation-guard';
import { digestFormRequest } from '../../forms/submission';
import type { FormAnswerSnapshot } from '../../forms/types';

export class CatalogManagementConflictError extends Error {}

function catalogBatchGuard(database: D1Database, predicate: string, values: readonly unknown[]): D1PreparedStatement[] {
  const id = crypto.randomUUID();
  return [database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
    SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id, ...values),
  database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}

type StaffCatalogForm = { requestId: string; versionId: string; answers: FormAnswerSnapshot };

async function catalogReplay(database: D1Database, input: {
  requestId: string; actorId: string; action: string; subjectType: string;
  subjectId?: string; formId: 'staff.catalog' | 'staff.product-classification';
  versionId: string; digest: string;
}): Promise<string | null> {
  const rows = await database.prepare(`SELECT actor_id AS actorId,action,subject_type AS subjectType,
    subject_id AS subjectId,next_json AS nextJson FROM audit_logs WHERE request_id=? LIMIT 2`)
    .bind(input.requestId).all<{ actorId: string; action: string; subjectType: string; subjectId: string; nextJson: string | null }>();
  if (!rows.results.length) return null;
  const row = rows.results[0];
  const answer = await database.prepare(`SELECT actor_id AS actorId,subject_type AS subjectType,
    subject_id AS subjectId,config_version_id AS versionId FROM form_answer_sets
    WHERE form_id=? AND request_id=? LIMIT 1`).bind(input.formId, input.requestId)
    .first<{ actorId: string; subjectType: string; subjectId: string; versionId: string }>();
  let recorded: unknown;
  try { recorded = JSON.parse(row.nextJson ?? ''); } catch { /* Invalid audit cannot replay. */ }
  if (rows.results.length !== 1 || row.actorId !== input.actorId || row.action !== input.action ||
    row.subjectType !== input.subjectType || input.subjectId && row.subjectId !== input.subjectId ||
    answer?.actorId !== input.actorId || answer.subjectType !== input.subjectType ||
    answer.subjectId !== row.subjectId || answer.versionId !== input.versionId ||
    !recorded || typeof recorded !== 'object' || !('catalogDigest' in recorded) ||
    recorded.catalogDigest !== input.digest)
    throw new CatalogManagementConflictError('Request reference was already used for different catalogue details.');
  return row.subjectId;
}

export interface ManagedTaxonomyRow {
  id: string;
  slug: string;
  nameEn: string;
  nameNe: string | null;
  isActive: number;
  sortOrder: number;
  usageCount: number;
  imageId?: string | null;
}

export async function listManagedTaxonomy(database: D1Database): Promise<{
  categories: readonly ManagedTaxonomyRow[];
  occasions: readonly ManagedTaxonomyRow[];
}> {
  const [categories, occasions] = await Promise.all([
    database
      .prepare(
        `SELECT categories.id, categories.slug, categories.name_en AS nameEn, categories.name_ne AS nameNe,
        categories.is_active AS isActive, categories.sort_order AS sortOrder, COUNT(products.id) AS usageCount,
        category_image_assignments.media_id AS imageId
       FROM categories LEFT JOIN products ON products.category_id = categories.id
       LEFT JOIN category_image_assignments ON category_image_assignments.category_id=categories.id
       GROUP BY categories.id ORDER BY categories.sort_order, categories.name_en`,
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
      imageId?: string | null;
      expectedImageId?: string | null;
    };
    requestId: string;
    now: number;
    form?: StaffCatalogForm;
  },
): Promise<string> {
  if (options.form && options.form.requestId !== options.requestId)
    throw new CatalogManagementConflictError('Form request reference does not match the catalogue action.');
  const authority = options.form
    ? await staffMutationGuard(database, options.actorId, 'catalog.manage', CatalogManagementConflictError) : null;
  const catalogDigest = options.form ? await digestFormRequest({ kind: options.kind,
    id: options.id, input: options.input, versionId: options.form.versionId,
    answers: options.form.answers }) : null;
  if (options.form) {
    const replay = await catalogReplay(database, { requestId: options.requestId,
      actorId: options.actorId, action: `catalog.${options.kind}.${options.id ? 'updated' : 'created'}`,
      subjectType: options.kind, subjectId: options.id, formId: 'staff.catalog',
      versionId: options.form.versionId, digest: catalogDigest! });
    if (replay) return replay;
  }
  const duplicate = await database
    .prepare(
      `SELECT subject_id AS id FROM audit_logs WHERE request_id = ? LIMIT 1`,
    )
    .bind(options.requestId)
    .first<{ id: string }>();
  if (duplicate) {
    if (!options.form) return duplicate.id;
    throw new CatalogManagementConflictError('Request reference was already used.');
  }
  const input = cleanTaxonomy(options.input);
  const imageChange = options.input.imageId !== undefined;
  if (imageChange && (options.kind !== 'category' || !options.form || options.input.expectedImageId === undefined))
    throw new CatalogManagementConflictError('Category image changes require a validated catalogue form and current image baseline.');
  for (const value of [options.input.imageId, options.input.expectedImageId]) {
    if (value !== undefined && value !== null && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value))
      throw new CatalogManagementConflictError('Category image reference is invalid.');
  }
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
  let previousImageId: string | null = null;
  if (imageChange) {
    previousImageId = (await database.prepare('SELECT media_id AS imageId FROM category_image_assignments WHERE category_id=?')
      .bind(id).first<{ imageId: string | null }>())?.imageId ?? null;
    if (previousImageId !== options.input.expectedImageId)
      throw new CatalogManagementConflictError('The category image changed. Refresh the entry before saving.');
    if (options.input.imageId !== null) {
      const permitted = await database.prepare(`SELECT id FROM category_media WHERE id=?
        AND (category_id=? OR (category_id IS NULL AND created_by=?))`).bind(options.input.imageId!, id, options.actorId).first();
      if (!permitted) throw new CatalogManagementConflictError('Choose your uploaded image or an image already belonging to this category.');
    }
  }
  try {
    await database.batch([
      ...(authority?.statements ?? []),
      ...(options.form && existing ? catalogBatchGuard(database,
        `EXISTS(SELECT 1 FROM ${table} WHERE id=?)`, [id]) : []),
      ...(imageChange ? catalogBatchGuard(database,
        "COALESCE((SELECT media_id FROM category_image_assignments WHERE category_id=?),'')=?",
        [id, previousImageId ?? '']) : []),
      ...(imageChange && options.input.imageId !== null ? catalogBatchGuard(database,
        `EXISTS(SELECT 1 FROM category_media WHERE id=? AND (category_id=? OR (category_id IS NULL AND created_by=?)))`,
        [options.input.imageId!, id, options.actorId]) : []),
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
      ...(imageChange && options.input.imageId !== null ? [database.prepare('UPDATE category_media SET category_id=? WHERE id=? AND category_id IS NULL')
        .bind(id, options.input.imageId!)] : []),
      ...(imageChange ? [database.prepare(`INSERT INTO category_image_assignments(category_id,media_id,updated_by,updated_at)
        VALUES (?,?,?,?) ON CONFLICT(category_id) DO UPDATE SET media_id=excluded.media_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
        .bind(id, options.input.imageId!, options.actorId, options.now)] : []),
      database
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, 'Staff managed bilingual catalogue taxonomy', ?, ?, ?, NULL, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          options.actorId,
          `catalog.${options.kind}.${existing ? 'updated' : 'created'}`,
          options.kind,
          id,
          imageChange && existing ? JSON.stringify({ imageId: previousImageId }) : null,
          JSON.stringify(options.form ? { ...input, ...(imageChange ? { imageId: options.input.imageId } : {}), catalogDigest } : input),
          options.requestId,
          options.now,
        ),
      ...(options.form ? [buildFormAnswerInsert(database, { formId: 'staff.catalog',
        requestId: options.requestId, versionId: options.form.versionId,
        subjectType: options.kind, subjectId: id, actorId: options.actorId,
        answers: options.form.answers, now: options.now })] : []),
    ]);
  } catch (error) {
    if (imageChange && error instanceof Error && /constraint/i.test(error.message))
      throw new CatalogManagementConflictError('Category details or image changed. Refresh the entry before saving.');
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
    form?: StaffCatalogForm;
  },
): Promise<void> {
  if (options.form && options.form.requestId !== options.requestId)
    throw new CatalogManagementConflictError('Form request reference does not match classification.');
  const authority = options.form
    ? await staffMutationGuard(database, options.actorId, 'catalog.manage', CatalogManagementConflictError) : null;
  const catalogDigest = options.form ? await digestFormRequest({ productId: options.productId,
    categoryId: options.categoryId, occasionIds: options.occasionIds,
    versionId: options.form.versionId, answers: options.form.answers }) : null;
  if (options.form) {
    const replay = await catalogReplay(database, { requestId: options.requestId,
      actorId: options.actorId, action: 'catalog.product.classified', subjectType: 'product',
      subjectId: options.productId, formId: 'staff.product-classification',
      versionId: options.form.versionId, digest: catalogDigest! });
    if (replay) return;
  }
  if (
    await database
      .prepare(`SELECT id FROM audit_logs WHERE request_id = ? LIMIT 1`)
      .bind(options.requestId)
      .first()
  ) {
    if (!options.form) return;
    throw new CatalogManagementConflictError('Request reference was already used.');
  }
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
    ...(authority?.statements ?? []),
    ...(options.form ? catalogBatchGuard(database,
      `EXISTS(SELECT 1 FROM products WHERE id=?)
       AND EXISTS(SELECT 1 FROM categories WHERE id=? AND is_active=1)
       AND (SELECT COUNT(*) FROM occasions WHERE is_active=1 AND id IN (${occasionIds.map(() => '?').join(',')}))=?`,
      [options.productId, options.categoryId, ...occasionIds, occasionIds.length]) : []),
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
        JSON.stringify({ categoryId: options.categoryId, occasionIds, ...(options.form ? { catalogDigest } : {}) }),
        options.requestId,
        options.now,
      ),
  );
  if (options.form) statements.push(buildFormAnswerInsert(database, {
    formId: 'staff.product-classification', requestId: options.requestId,
    versionId: options.form.versionId, subjectType: 'product', subjectId: options.productId,
    actorId: options.actorId, answers: options.form.answers, now: options.now,
  }));
  await database.batch(statements);
}
