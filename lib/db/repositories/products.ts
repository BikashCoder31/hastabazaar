import { productClosurePredicate } from './product-closure';
import { businessNotificationStatements } from '../../operations/business-notifications';
import type { FeaturedProduct } from '@/lib/catalog/featured-products';
import { createProductSku } from '@/lib/products/submission';
import { publicProductEligibility } from '@/lib/products/eligibility';
import { productTransitions } from '@/lib/marketplace/workflows';
import type { ProductStatus } from '@/lib/marketplace/types';
import type {
  ProductImageUpload,
  ProductSubmissionInput,
} from '@/lib/products/submission';
import { buildFormAnswerInsert } from './form-answers';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { digestFormRequest, formRequestReplay } from '@/lib/forms/submission';

type SellerProductFormLink = { requestId: string; versionId: string; answers: FormAnswerSnapshot; digest?: string };

export interface CategoryRow {
  id: string;
  slug: string;
  nameEn: string;
  nameNe: string | null;
}

export interface OccasionRow {
  id: string;
  slug: string;
  nameEn: string;
  nameNe: string | null;
}

export async function listActiveCategories(
  database: D1Database,
): Promise<readonly CategoryRow[]> {
  const result = await database
    .prepare(
      `SELECT id, slug, name_en AS nameEn, name_ne AS nameNe
       FROM categories
       WHERE is_active = 1
       ORDER BY sort_order ASC, name_en ASC`,
    )
    .all<CategoryRow>();
  return result.results;
}

const launchDiscoveryCategorySlugs = [
  'gifts',
  'home-decor',
  'jewelry-accessories',
  'traditional-textiles',
  'lifestyle',
  'art-paintings',
  'pottery',
  'wood-bamboo-craft',
  'personalized-gifts',
  'corporate-gifting',
  'others',
] as const;

export async function listPublicDiscoveryCategories(
  database: D1Database,
): Promise<readonly CategoryRow[]> {
  const placeholders = launchDiscoveryCategorySlugs.map(() => '?').join(', ');
  const result = await database
    .prepare(
      `SELECT id, slug, name_en AS nameEn, name_ne AS nameNe
       FROM categories
       WHERE is_active = 1 AND slug IN (${placeholders})
       ORDER BY sort_order ASC, name_en ASC`,
    )
    .bind(...launchDiscoveryCategorySlugs)
    .all<CategoryRow>();
  return result.results;
}

export async function listActiveOccasions(
  database: D1Database,
): Promise<readonly OccasionRow[]> {
  const result = await database
    .prepare(
      `SELECT id, slug, name_en AS nameEn, name_ne AS nameNe
       FROM occasions
       WHERE is_active = 1
       ORDER BY sort_order ASC, name_en ASC`,
    )
    .all<OccasionRow>();
  return result.results;
}

export async function isActiveCategory(
  database: D1Database,
  categoryId: string,
): Promise<boolean> {
  return Boolean(
    await database
      .prepare(
        `SELECT 1 FROM categories WHERE id = ? AND is_active = 1 LIMIT 1`,
      )
      .bind(categoryId)
      .first(),
  );
}

export async function areActiveOccasions(
  database: D1Database,
  occasionIds: readonly string[],
): Promise<boolean> {
  if (occasionIds.length < 1 || occasionIds.length > 5) return false;
  const placeholders = occasionIds.map(() => '?').join(', ');
  const row = await database
    .prepare(
      `SELECT COUNT(*) AS count FROM occasions
       WHERE is_active = 1 AND id IN (${placeholders})`,
    )
    .bind(...occasionIds)
    .first<{ count: number }>();
  return Number(row?.count ?? 0) === occasionIds.length;
}

export async function createProductSubmission(database: D1Database, options: Parameters<typeof insertProductSubmission>[1]): Promise<string> {
  const action = options.intent === 'draft' ? 'product.draft.created' : 'product.submitted';
  const catalogDigest = options.form ? options.form.digest ?? await digestFormRequest({ sellerId: options.sellerId,
    intent: options.intent ?? 'submit', input: options.input, images: options.images,
    versionId: options.form.versionId, answers: options.form.answers }) : null;
  if (options.form) {
    const replay = await formRequestReplay(database, { formId: 'seller.product-submission',
      requestId: options.form.requestId, actorId: options.actorId, action, digest: catalogDigest! });
    if (replay) return replay;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await insertProductSubmission(database, { ...options,
      form: options.form ? { ...options.form, digest: catalogDigest! } : undefined,
      input: { ...options.input, sku: createProductSku() } }); return options.productId; }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (options.form && /UNIQUE constraint failed|Duplicate entry/i.test(message)) {
        const replay = await formRequestReplay(database, { formId: 'seller.product-submission',
          requestId: options.form.requestId, actorId: options.actorId, action,
          digest: catalogDigest! });
        if (replay) return replay;
      }
      if (attempt === 2 || !/UNIQUE constraint failed|Duplicate entry/i.test(message)) throw error;
    }
  }
  throw new Error('Product submission could not be created after retrying unique SKU generation.');
}

async function insertProductSubmission(
  database: D1Database,
  options: {
    productId: string;
    sellerId: string;
    actorId: string;
    slug: string;
    input: ProductSubmissionInput;
    images: readonly ProductImageUpload[];
    intent?: 'draft' | 'submit';
    now: number;
    form?: SellerProductFormLink;
  },
): Promise<void> {
  const { productId, sellerId, actorId, slug, input, images, now } = options;
  const productStatus = options.intent === 'draft' ? 'draft' : 'submitted';
  const statements: D1PreparedStatement[] = [
    ...(options.form ? [database.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
      THEN 1 ELSE json_extract('invalid', '$') END`).bind(options.form.requestId)] : []),
    database
      .prepare(
        `INSERT INTO products (
          id, seller_id, category_id, slug, sku, name_en, name_ne,
          description_en, description_ne, price_paisa, compare_at_price_paisa,
          inventory_quantity, producer, country_of_origin, materials, materials_json, origin_story, dimensions,
          size, colour, variations, specifications,
          care_instructions, safety_information, return_conditions, return_eligible, warranty,
          made_to_order, preparation_days, manufactured_at, expires_at,
          licence_reference, status, review_note,
          review_request_id, reviewed_by, published_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?
        )`,
      )
      .bind(
        productId,
        sellerId,
        input.categoryId,
        slug,
        input.sku,
        input.nameEn,
        input.nameNe,
        input.descriptionEn,
        input.descriptionNe,
        input.pricePaisa,
        input.compareAtPricePaisa,
        input.inventoryQuantity,
        input.producer,
        input.materials.join(', '),
        JSON.stringify(input.materials),
        input.originStory,
        input.dimensions,
        input.size ?? null,
        input.colour ?? null,
        input.variations ?? null,
        input.specifications ?? null,
        input.careInstructions,
        input.safetyInformation,
        input.returnConditions,
        input.returnEligible ? 1 : 0,
        input.warranty,
        input.madeToOrder ? 1 : 0,
        input.preparationDays,
        input.manufacturedAt,
        input.expiresAt,
        input.licenceReference,
        productStatus,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO inventory_adjustments (
          id, product_id, seller_id, actor_id, previous_quantity,
          next_quantity, reason, created_at
        ) VALUES (?, ?, ?, ?, 0, ?, 'Initial listing inventory', ?)`,
      )
      .bind(
        crypto.randomUUID(),
        productId,
        sellerId,
        actorId,
        input.inventoryQuantity,
        now,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) VALUES (?, ?, ?, 'product', ?, ?, NULL, ?, ?, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        productStatus === 'draft' ? 'product.draft.created' : 'product.submitted',
        productId,
        productStatus === 'draft' ? 'Applicant prepared a private product draft' : 'Seller submitted a product for review',
        JSON.stringify({ status: productStatus, sku: input.sku,
          ...(options.form?.digest ? { catalogDigest: options.form.digest } : {}) }),
        options.form?.requestId ?? null,
        now,
      ),
  ];

  for (const image of images) {
    statements.push(
      database
        .prepare(
          `INSERT INTO product_media (
            id, product_id, object_key, original_name, mime_type, size_bytes,
            alt_en, alt_ne, width, height, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(
          image.id,
          productId,
          image.objectKey,
          image.originalName,
          image.mimeType,
          image.sizeBytes,
          image.altEn,
          image.altNe,
          image.sortOrder,
          now,
        ),
    );
  }

  for (const occasionId of input.occasionIds) {
    statements.push(
      database
        .prepare(
          `INSERT INTO product_occasions (product_id, occasion_id, created_at)
           VALUES (?, ?, ?)`,
        )
        .bind(productId, occasionId, now),
    );
  }

  if (productStatus === 'submitted') statements.push(...await businessNotificationStatements(database,{eventId:productId,sourceType:'product',sourceId:productId,status:'submitted',actorId,now,kind:'submitted'}));
  if (options.form) statements.push(buildFormAnswerInsert(database, {
    formId: 'seller.product-submission', requestId: options.form.requestId, versionId: options.form.versionId,
    subjectType: 'product', subjectId: productId, actorId, answers: options.form.answers, now,
  }));
  await database.batch(statements);
}

export interface SellerProductRow {
  id: string;
  slug: string;
  sku: string;
  nameEn: string;
  nameNe: string | null;
  pricePaisa: number;
  inventoryQuantity: number;
  status: ProductStatus;
  reviewNote: string | null;
  categoryName: string;
  createdAt: number;
  updatedAt: number;
  primaryMediaId: string | null;
}

export async function listSellerProducts(
  database: D1Database,
  sellerId: string,
  filters: { status?: string; search?: string } = {},
): Promise<readonly SellerProductRow[]> {
  const conditions = [
    'products.seller_id = ?',
    'NOT EXISTS (SELECT 1 FROM product_deletions WHERE product_id = products.id)',
  ];
  const bindings: unknown[] = [sellerId];
  if (filters.status === 'pending') {
    conditions.push("products.status IN ('submitted', 'under_review', 'approved')");
  } else if (filters.status === 'out_of_stock') {
    conditions.push("products.status = 'published' AND products.inventory_quantity = 0");
  } else if (
    filters.status &&
    ['draft', 'published', 'rejected', 'needs_changes', 'archived'].includes(filters.status)
  ) {
    conditions.push('products.status = ?');
    bindings.push(filters.status);
  }
  const search = filters.search?.trim();
  if (search) {
    conditions.push("(products.name_en LIKE ? ESCAPE '\\' OR products.sku LIKE ? ESCAPE '\\')");
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    bindings.push(pattern, pattern);
  }
  const result = await database
    .prepare(
      `SELECT products.id, products.slug, products.sku,
        products.name_en AS nameEn, products.name_ne AS nameNe,
        products.price_paisa AS pricePaisa,
        products.inventory_quantity AS inventoryQuantity,
        products.status, products.review_note AS reviewNote, products.review_request_id AS reviewRequestId,
        categories.name_en AS categoryName,
        products.created_at AS createdAt, products.updated_at AS updatedAt,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id AND product_media.mime_type LIKE 'image/%'
          ORDER BY product_media.sort_order ASC LIMIT 1) AS primaryMediaId
       FROM products
       INNER JOIN categories ON categories.id = products.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY products.updated_at DESC`,
    )
    .bind(...bindings)
    .all<SellerProductRow>();
  return result.results;
}

export interface SellerProductRevision {
  id: string;
  categoryId: string;
  sku: string;
  nameEn: string;
  nameNe: string | null;
  descriptionEn: string;
  descriptionNe: string | null;
  pricePaisa: number;
  compareAtPricePaisa: number | null;
  inventoryQuantity: number;
  producer: string;
  materials: string;
  originStory: string | null;
  dimensions: string | null;
  size: string | null;
  colour: string | null;
  variations: string | null;
  specifications: string | null;
  careInstructions: string | null;
  safetyInformation: string | null;
  returnConditions: string | null;
  returnEligible: number;
  warranty: string | null;
  madeToOrder: number;
  preparationDays: number;
  manufacturedAt: number | null;
  expiresAt: number | null;
  licenceReference: string | null;
  status: ProductStatus;
  reviewNote: string | null;
  reviewRequestId: string | null;
  mediaCount: number;
  videoCount: number;
  media: readonly SellerProductMediaRow[];
  occasionIds: readonly string[];
}

export interface SellerProductMediaRow {
  id: string;
  originalName: string;
  mimeType: string;
  sortOrder: number;
}

type SellerProductRevisionRow = Omit<SellerProductRevision, 'occasionIds' | 'media'> & {
  occasionIdsCsv: string | null;
};

export async function getSellerProductForRevision(
  database: D1Database,
  sellerId: string,
  productId: string,
): Promise<SellerProductRevision | null> {
  const row = await database
    .prepare(
      `SELECT products.id, products.category_id AS categoryId, products.sku,
          products.name_en AS nameEn, products.name_ne AS nameNe,
          products.description_en AS descriptionEn,
          products.description_ne AS descriptionNe,
          products.price_paisa AS pricePaisa,
          products.compare_at_price_paisa AS compareAtPricePaisa,
          products.inventory_quantity AS inventoryQuantity,
          products.producer, products.materials, products.origin_story AS originStory, products.dimensions,
           products.size, products.colour, products.variations, products.specifications,
           products.care_instructions AS careInstructions,
           products.safety_information AS safetyInformation,
           products.return_conditions AS returnConditions,
           products.return_eligible AS returnEligible, products.warranty,
           products.made_to_order AS madeToOrder,
           products.preparation_days AS preparationDays,
           products.manufactured_at AS manufacturedAt,
           products.expires_at AS expiresAt,
           products.licence_reference AS licenceReference,
          products.status, products.review_note AS reviewNote, products.review_request_id AS reviewRequestId,
          (SELECT GROUP_CONCAT(product_occasions.occasion_id)
            FROM product_occasions
            WHERE product_occasions.product_id = products.id) AS occasionIdsCsv,
          COUNT(CASE WHEN product_media.mime_type LIKE 'image/%' THEN 1 END) AS mediaCount,
          COUNT(CASE WHEN product_media.mime_type = 'video/mp4' THEN 1 END) AS videoCount
         FROM products
         LEFT JOIN product_media ON product_media.product_id = products.id
         WHERE products.id = ? AND products.seller_id = ?
         GROUP BY products.id LIMIT 1`,
    )
    .bind(productId, sellerId)
    .first<SellerProductRevisionRow>();
  if (!row) return null;
  const media = await database
    .prepare(
      `SELECT id, original_name AS originalName, mime_type AS mimeType,
        sort_order AS sortOrder
       FROM product_media WHERE product_id = ? ORDER BY sort_order ASC`,
    )
    .bind(productId)
    .all<SellerProductMediaRow>();
  return {
    ...row,
    media: media.results,
    occasionIds: row.occasionIdsCsv ? row.occasionIdsCsv.split(',') : [],
  };
}

export interface SellerOwnedMediaMutationRow extends SellerProductMediaRow {
  objectKey: string;
}

export async function listSellerOwnedMediaForMutation(
  database: D1Database,
  sellerId: string,
  productId: string,
): Promise<readonly SellerOwnedMediaMutationRow[]> {
  const result = await database
    .prepare(
      `SELECT product_media.id, product_media.object_key AS objectKey,
        product_media.original_name AS originalName,
        product_media.mime_type AS mimeType, product_media.sort_order AS sortOrder
       FROM product_media
       INNER JOIN products ON products.id = product_media.product_id
       WHERE product_media.product_id = ? AND products.seller_id = ?
       ORDER BY product_media.sort_order ASC`,
    )
    .bind(productId, sellerId)
    .all<SellerOwnedMediaMutationRow>();
  return result.results;
}

export class ProductRevisionConflictError extends Error {}

export async function reviseAndResubmitProduct(
  database: D1Database,
  options: {
    productId: string;
    sellerId: string;
    actorId: string;
    input: ProductSubmissionInput;
    images: readonly ProductImageUpload[];
    removedMediaIds?: readonly string[];
    expectedStatus?: ProductStatus;
    previousInventory: number;
    expectedReviewRequestId?: string | null;
    now: number;
    form?: SellerProductFormLink;
  },
): Promise<'applied' | 'replayed'> {
  const catalogDigest = options.form ? options.form.digest ?? await digestFormRequest({
    productId: options.productId, sellerId: options.sellerId, input: options.input,
    images: options.images, removedMediaIds: options.removedMediaIds ?? [],
    expectedStatus: options.expectedStatus, expectedReviewRequestId: options.expectedReviewRequestId,
    versionId: options.form.versionId, answers: options.form.answers,
  }) : null;
  if (options.form && await formRequestReplay(database, { formId: 'seller.product-submission',
    requestId: options.form.requestId, actorId: options.actorId, action: 'product.resubmitted',
    digest: catalogDigest!, subjectId: options.productId })) return 'replayed';
  const mutationId = crypto.randomUUID();
  const addedPhotos=options.images.filter(m=>m.mimeType.startsWith('image/')).length;
  const addedVideos=options.images.filter(m=>m.mimeType==='video/mp4').length;
  if(addedPhotos+addedVideos!==options.images.length||addedVideos>1)throw new ProductRevisionConflictError('Upload product images and no more than one MP4 video.');
  const expectedStatus = options.expectedStatus ?? 'needs_changes';
  if (!['draft', 'needs_changes', 'rejected', 'approved', 'published'].includes(expectedStatus)) {
    throw new ProductRevisionConflictError('This product status cannot be edited.');
  }
  const removedMediaIds = [...new Set(options.removedMediaIds ?? [])];
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE products SET category_id = ?, name_en = ?, name_ne = ?,
          description_en = ?, description_ne = ?, price_paisa = ?,
          compare_at_price_paisa = ?, inventory_quantity = ?, dimensions = ?,
          materials = ?, materials_json = ?, origin_story = ?,
          size = ?, colour = ?, variations = ?, specifications = ?, care_instructions = ?,
          safety_information = ?, return_conditions = ?, return_eligible = ?, warranty = ?,
          made_to_order = ?, preparation_days = ?, manufactured_at = ?, expires_at = ?,
          licence_reference = ?, status = 'submitted', review_note = NULL,
          review_request_id = ?, reviewed_by = NULL, updated_at = ?
         WHERE id = ? AND seller_id = ? AND status = ?
          AND (? = 0 OR review_request_id = ? OR (review_request_id IS NULL AND ? IS NULL))
          AND (SELECT COUNT(*) FROM product_media WHERE product_id=products.id AND mime_type LIKE 'image/%'${removedMediaIds.length ? ` AND id NOT IN (${removedMediaIds.map(() => '?').join(',')})` : ''}) + ? >= 4
          AND (SELECT COUNT(*) FROM product_media WHERE product_id=products.id AND mime_type='video/mp4'${removedMediaIds.length ? ` AND id NOT IN (${removedMediaIds.map(() => '?').join(',')})` : ''}) + ? <= 1`,
      )
      .bind(
        options.input.categoryId,
        options.input.nameEn,
        options.input.nameNe,
        options.input.descriptionEn,
        options.input.descriptionNe,
        options.input.pricePaisa,
        options.input.compareAtPricePaisa,
        options.input.inventoryQuantity,
        options.input.dimensions,
        options.input.materials.join(', '),
        JSON.stringify(options.input.materials),
        options.input.originStory,
        options.input.size ?? null,
        options.input.colour ?? null,
        options.input.variations ?? null,
        options.input.specifications ?? null,
        options.input.careInstructions,
        options.input.safetyInformation,
        options.input.returnConditions,
        options.input.returnEligible ? 1 : 0,
        options.input.warranty,
        options.input.madeToOrder ? 1 : 0,
        options.input.preparationDays,
        options.input.manufacturedAt,
        options.input.expiresAt,
        options.input.licenceReference,
        mutationId,
        options.now,
        options.productId,
        options.sellerId,
        expectedStatus,
        options.expectedReviewRequestId === undefined ? 0 : 1,
        options.expectedReviewRequestId ?? null,
        options.expectedReviewRequestId ?? null,
        ...removedMediaIds,
        addedPhotos,
        ...removedMediaIds,
        addedVideos,
      ),
    ...(options.form ? [database.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
      THEN 1 ELSE json_extract('invalid', '$') END`).bind(options.form.requestId)] : []),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, 'product.resubmitted', 'product', ?,
          'Seller revised and resubmitted product', ?, ?, ?, NULL, ?
        WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND review_request_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        options.productId,
        JSON.stringify({ status: expectedStatus }),
        JSON.stringify({ status: 'submitted', identityPreserved: true,
          ...(catalogDigest ? { catalogDigest } : {}) }),
        options.form?.requestId ?? mutationId,
        options.now,
        options.productId,
        mutationId,
      ),
  ];

  for (const mediaId of removedMediaIds) {
    statements.push(
      database
        .prepare(
          `DELETE FROM product_media
           WHERE id = ? AND product_id = ?
             AND EXISTS (SELECT 1 FROM products WHERE id = ? AND review_request_id = ?)`,
        )
        .bind(mediaId, options.productId, options.productId, mutationId),
    );
  }

  statements.push(
    database
      .prepare(
        `DELETE FROM product_occasions
         WHERE product_id = ?
           AND EXISTS (SELECT 1 FROM products WHERE id = ? AND review_request_id = ?)`,
      )
      .bind(options.productId, options.productId, mutationId),
  );

  for (const occasionId of options.input.occasionIds) {
    statements.push(
      database
        .prepare(
          `INSERT INTO product_occasions (product_id, occasion_id, created_at)
           SELECT ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND review_request_id = ?)`,
        )
        .bind(
          options.productId,
          occasionId,
          options.now,
          options.productId,
          mutationId,
        ),
    );
  }

  if (options.input.inventoryQuantity !== options.previousInventory) {
    statements.push(
      database
        .prepare(
          `INSERT INTO inventory_adjustments (
            id, product_id, seller_id, actor_id, previous_quantity,
            next_quantity, reason, created_at
          ) SELECT ?, ?, ?, ?, ?, ?, 'Inventory changed during listing revision', ?
          WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND review_request_id = ?)`,
        )
        .bind(
          crypto.randomUUID(),
          options.productId,
          options.sellerId,
          options.actorId,
          options.previousInventory,
          options.input.inventoryQuantity,
          options.now,
          options.productId,
          mutationId,
        ),
    );
  }

  for (const image of options.images) {
    statements.push(
      database
        .prepare(
          `INSERT INTO product_media (
            id, product_id, object_key, original_name, mime_type, size_bytes,
            alt_en, alt_ne, width, height, sort_order, created_at
          ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?
          WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND review_request_id = ?)`,
        )
        .bind(
          image.id,
          options.productId,
          image.objectKey,
          image.originalName,
          image.mimeType,
          image.sizeBytes,
          image.altEn,
          image.altNe,
          image.sortOrder,
          options.now,
          options.productId,
          mutationId,
        ),
    );
  }

  statements.push(...await businessNotificationStatements(database,{eventId:mutationId,sourceType:'product',sourceId:options.productId,status:'submitted',reviewRequestId:mutationId,actorId:options.actorId,now:options.now,kind:'submitted'}));
  if (options.form) statements.push(
    database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM products WHERE id=? AND seller_id=? AND review_request_id=?)
      THEN 1 ELSE json_extract('invalid', '$') END`).bind(options.productId, options.sellerId, mutationId),
    buildFormAnswerInsert(database, { formId: 'seller.product-submission', requestId: options.form.requestId,
      versionId: options.form.versionId, subjectType: 'product', subjectId: options.productId,
      actorId: options.actorId, answers: options.form.answers, now: options.now }),
  );
  let results;
  try { results = await database.batch(statements); }
  catch (error) {
    if (options.form) {
      const replay = await formRequestReplay(database, { formId: 'seller.product-submission',
        requestId: options.form.requestId, actorId: options.actorId, action: 'product.resubmitted',
        digest: catalogDigest!, subjectId: options.productId });
      if (replay) return 'replayed';
    }
    throw error;
  }
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new ProductRevisionConflictError(
      'This product is no longer available for revision. Refresh and try again.',
    );
  }
  return 'applied';
}

export interface SellerProductStats {
  total: number;
  pendingApproval: number;
  published: number;
  rejected: number;
  drafts: number;
  outOfStock: number;
  needsChanges: number;
  lowStock: number;
}

export async function getSellerProductStats(
  database: D1Database,
  sellerId: string,
): Promise<SellerProductStats> {
  return (
    (await database
      .prepare(
        `SELECT COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN status IN ('submitted', 'under_review', 'approved') THEN 1 ELSE 0 END), 0) AS pendingApproval,
          COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published,
          COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected,
          COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS drafts,
          COALESCE(SUM(CASE WHEN status = 'published' AND inventory_quantity = 0 THEN 1 ELSE 0 END), 0) AS outOfStock,
          COALESCE(SUM(CASE WHEN status = 'needs_changes' THEN 1 ELSE 0 END), 0) AS needsChanges,
          COALESCE(SUM(CASE WHEN status = 'published' AND inventory_quantity <= 5 THEN 1 ELSE 0 END), 0) AS lowStock
         FROM products WHERE seller_id = ?
           AND NOT EXISTS (SELECT 1 FROM product_deletions WHERE product_id = products.id)`,
      )
      .bind(sellerId)
      .first<SellerProductStats>()) ?? {
      total: 0,
      pendingApproval: 0,
      published: 0,
      rejected: 0,
      drafts: 0,
      outOfStock: 0,
      needsChanges: 0,
      lowStock: 0,
    }
  );
}

export class InventoryConflictError extends Error {}

export async function setProductInventory(
  database: D1Database,
  options: {
    productId: string;
    sellerId: string;
    actorId: string;
    quantity: number;
    reason: string;
    now: number;
    form?: SellerProductFormLink;
  },
): Promise<void> {
  const catalogDigest = options.form ? await digestFormRequest({ productId: options.productId,
    sellerId: options.sellerId, quantity: options.quantity, reason: options.reason,
    versionId: options.form.versionId, answers: options.form.answers }) : null;
  if (options.form && await formRequestReplay(database, { formId: 'seller.inventory',
    requestId: options.form.requestId, actorId: options.actorId, action: 'product.inventory.updated',
    digest: catalogDigest!, subjectId: options.productId })) return;
  const current = await database
    .prepare(
      `SELECT inventory_quantity AS inventoryQuantity, status
       FROM products WHERE id = ? AND seller_id = ? LIMIT 1`,
    )
    .bind(options.productId, options.sellerId)
    .first<{ inventoryQuantity: number; status: ProductStatus }>();
  if (!current) throw new InventoryConflictError('Product not found.');
  if (current.status === 'archived' || current.status === 'rejected') {
    throw new InventoryConflictError(
      'Inventory cannot be changed for this product status.',
    );
  }

  const mutationId = crypto.randomUUID();
  let results;
  try { results = await database.batch([
    database
      .prepare(
        `UPDATE products SET inventory_quantity = ?, updated_at = ?, review_request_id = ?
         WHERE id = ? AND seller_id = ? AND inventory_quantity = ?`,
      )
      .bind(
        options.quantity,
        options.now,
        mutationId,
        options.productId,
        options.sellerId,
        current.inventoryQuantity,
      ),
    ...(options.form ? [database.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
      THEN 1 ELSE json_extract('invalid', '$') END`).bind(options.form.requestId)] : []),
    database
      .prepare(
        `INSERT INTO inventory_adjustments (
          id, product_id, seller_id, actor_id, previous_quantity,
          next_quantity, reason, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM products WHERE id = ? AND review_request_id = ?
        )`,
      )
      .bind(
        crypto.randomUUID(),
        options.productId,
        options.sellerId,
        options.actorId,
        current.inventoryQuantity,
        options.quantity,
        options.reason,
        options.now,
        options.productId,
        mutationId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        )
        SELECT ?, ?, 'product.inventory.updated', 'product', ?, ?, ?, ?, ?, NULL, ?
        WHERE EXISTS (
          SELECT 1 FROM products WHERE id = ? AND review_request_id = ?
        )`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        options.productId,
        options.reason,
        JSON.stringify({ inventoryQuantity: current.inventoryQuantity }),
        JSON.stringify({ inventoryQuantity: options.quantity, ...(catalogDigest ? { catalogDigest } : {}) }),
        options.form?.requestId ?? mutationId,
        options.now,
        options.productId,
        mutationId,
      ),
    ...(options.form ? [database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM products WHERE id=? AND seller_id=? AND review_request_id=?)
      THEN 1 ELSE json_extract('invalid', '$') END`).bind(options.productId, options.sellerId, mutationId),
      buildFormAnswerInsert(database, { formId: 'seller.inventory', requestId: options.form.requestId,
        versionId: options.form.versionId, subjectType: 'product', subjectId: options.productId,
        actorId: options.actorId, answers: options.form.answers, now: options.now })] : []),
  ]); }
  catch (error) {
    if (options.form && await formRequestReplay(database, { formId: 'seller.inventory',
      requestId: options.form.requestId, actorId: options.actorId, action: 'product.inventory.updated',
      digest: catalogDigest!, subjectId: options.productId })) return;
    throw error;
  }
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new InventoryConflictError(
      'Inventory changed. Refresh and try again.',
    );
  }
}

export interface ProductReviewQueueRow extends SellerProductRow {
  tradingName: string;
  categoryName: string;
  submittedAt: number;
  homepageHidden: number;
  homepageVersion: number;
  homepageReason: string | null;
  homepageUpdatedAt: number | null;
  homepageUpdatedByName: string | null;
}

export async function listProductsForReview(
  database: D1Database,
  limit = 100,
  publishedOnly = false,
): Promise<readonly ProductReviewQueueRow[]> {
  const result = await database
    .prepare(
      `SELECT products.id, products.slug, products.sku,
        products.name_en AS nameEn, products.name_ne AS nameNe,
        products.price_paisa AS pricePaisa,
        products.inventory_quantity AS inventoryQuantity,
        products.status, products.review_note AS reviewNote,
        products.updated_at AS updatedAt, products.created_at AS createdAt,
        products.created_at AS submittedAt,
        seller_profiles.trading_name AS tradingName,
        categories.name_en AS categoryName,
        COALESCE(homepage_product_controls.is_hidden, 0) AS homepageHidden,
        COALESCE(homepage_product_controls.version, 0) AS homepageVersion,
        homepage_product_controls.reason AS homepageReason,
        homepage_product_controls.updated_at AS homepageUpdatedAt,
        homepage_actor.display_name AS homepageUpdatedByName,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id
            AND product_media.mime_type LIKE 'image/%'
          ORDER BY product_media.sort_order ASC LIMIT 1) AS primaryMediaId
       FROM products
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       INNER JOIN categories ON categories.id = products.category_id
       LEFT JOIN homepage_product_controls
         ON homepage_product_controls.product_id = products.id
       LEFT JOIN users homepage_actor
         ON homepage_actor.id = homepage_product_controls.updated_by
       WHERE ${publishedOnly ? "products.status = 'published'" : "products.status IN ('submitted', 'under_review', 'needs_changes', 'approved')"}
       ORDER BY products.created_at ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<ProductReviewQueueRow>();
  return result.results;
}

export interface ProductMediaRow {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  altEn: string;
  altNe: string | null;
  sortOrder: number;
}

export interface ProductModerationEventRow {
  id: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  actorName: string;
  actorEmail: string;
  createdAt: number;
}

export interface ProductReviewDetail extends ProductReviewQueueRow {
  sellerId: string;
  sellerUserId: string;
  descriptionEn: string;
  descriptionNe: string | null;
  compareAtPricePaisa: number | null;
  producer: string;
  materials: string;
  originStory: string | null;
  dimensions: string | null;
  size: string | null;
  colour: string | null;
  variations: string | null;
  specifications: string | null;
  careInstructions: string | null;
  safetyInformation: string | null;
  returnConditions: string | null;
  returnEligible: number;
  warranty: string | null;
  madeToOrder: number;
  preparationDays: number;
  manufacturedAt: number | null;
  expiresAt: number | null;
  licenceReference: string | null;
  occasionNames: string | null;
  categoryId: string;
  occasionIds: string | null;
  media: readonly ProductMediaRow[];
  history: readonly ProductModerationEventRow[];
}

type ProductReviewBase = Omit<ProductReviewDetail, 'media' | 'history'>;

export async function getProductForReview(
  database: D1Database,
  productId: string,
): Promise<ProductReviewDetail | null> {
  const product = await database
    .prepare(
      `SELECT products.id, products.seller_id AS sellerId,
        seller_profiles.user_id AS sellerUserId, products.category_id AS categoryId, products.slug, products.sku,
        products.name_en AS nameEn, products.name_ne AS nameNe,
        products.description_en AS descriptionEn,
        products.description_ne AS descriptionNe,
        products.price_paisa AS pricePaisa,
        products.compare_at_price_paisa AS compareAtPricePaisa,
        products.inventory_quantity AS inventoryQuantity,
        products.producer, products.materials, products.origin_story AS originStory, products.dimensions,
        products.size, products.colour, products.variations, products.specifications,
        products.care_instructions AS careInstructions,
        products.safety_information AS safetyInformation,
        products.return_conditions AS returnConditions,
        products.return_eligible AS returnEligible,
        products.warranty, products.made_to_order AS madeToOrder,
        products.preparation_days AS preparationDays,
        products.manufactured_at AS manufacturedAt,
        products.expires_at AS expiresAt,
        products.licence_reference AS licenceReference,
        (SELECT GROUP_CONCAT(occasions.name_en, ', ')
          FROM product_occasions
          INNER JOIN occasions ON occasions.id = product_occasions.occasion_id
          WHERE product_occasions.product_id = products.id) AS occasionNames,
        (SELECT GROUP_CONCAT(product_occasions.occasion_id, ',')
          FROM product_occasions WHERE product_occasions.product_id = products.id) AS occasionIds,
        products.status, products.review_note AS reviewNote,
        products.updated_at AS updatedAt, products.created_at AS createdAt,
        products.created_at AS submittedAt,
        seller_profiles.trading_name AS tradingName,
        categories.name_en AS categoryName,
        COALESCE(homepage_product_controls.is_hidden, 0) AS homepageHidden,
        COALESCE(homepage_product_controls.version, 0) AS homepageVersion,
        homepage_product_controls.reason AS homepageReason,
        homepage_product_controls.updated_at AS homepageUpdatedAt,
        homepage_actor.display_name AS homepageUpdatedByName,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id
            AND product_media.mime_type LIKE 'image/%'
          ORDER BY product_media.sort_order ASC LIMIT 1) AS primaryMediaId
       FROM products
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       INNER JOIN categories ON categories.id = products.category_id
       LEFT JOIN homepage_product_controls
         ON homepage_product_controls.product_id = products.id
       LEFT JOIN users homepage_actor
         ON homepage_actor.id = homepage_product_controls.updated_by
       WHERE products.id = ? LIMIT 1`,
    )
    .bind(productId)
    .first<ProductReviewBase>();
  if (!product) return null;

  const [mediaResult, historyResult] = await Promise.all([
    database
      .prepare(
        `SELECT id, original_name AS originalName, mime_type AS mimeType,
          size_bytes AS sizeBytes, alt_en AS altEn, alt_ne AS altNe, sort_order AS sortOrder
         FROM product_media WHERE product_id = ? ORDER BY sort_order ASC`,
      )
      .bind(productId)
      .all<ProductMediaRow>(),
    database
      .prepare(
        `SELECT moderation_events.id,
          moderation_events.from_status AS fromStatus,
          moderation_events.to_status AS toStatus,
          moderation_events.reason, users.display_name AS actorName,
          users.email AS actorEmail, moderation_events.created_at AS createdAt
         FROM moderation_events
         INNER JOIN users ON users.id = moderation_events.actor_id
         WHERE moderation_events.subject_type = 'product'
           AND moderation_events.subject_id = ?
         ORDER BY moderation_events.created_at DESC`,
      )
      .bind(productId)
      .all<ProductModerationEventRow>(),
  ]);
  return {
    ...product,
    media: mediaResult.results,
    history: historyResult.results,
  };
}

export type ProductReviewAction =
  | 'start_review'
  | 'request_changes'
  | 'approve'
  | 'publish'
  | 'unpublish'
  | 'reject';

const reviewTransitions: Record<
  ProductReviewAction,
  { from: ProductStatus; to: ProductStatus; auditAction: string }
> = {
  start_review: {
    from: 'submitted',
    to: 'under_review',
    auditAction: 'product.review.started',
  },
  request_changes: {
    from: 'under_review',
    to: 'needs_changes',
    auditAction: 'product.changes.requested',
  },
  approve: {
    from: 'under_review',
    to: 'approved',
    auditAction: 'product.approved',
  },
  unpublish: { from: 'published', to: 'under_review', auditAction: 'product.unpublished' },
  publish: {
    from: 'approved',
    to: 'published',
    auditAction: 'product.published',
  },
  reject: {
    from: 'under_review',
    to: 'rejected',
    auditAction: 'product.rejected',
  },
};

export class ProductReviewConflictError extends Error {}

export async function reviewProduct(
  database: D1Database,
  options: {
    productId: string;
    actorId: string;
    action: ProductReviewAction;
    reason: string;
    requestId: string;
    now: number;
  },
): Promise<ProductStatus> {
  if (options.action === 'unpublish') {
    const allowed = await database.prepare(
      `SELECT 1 FROM users JOIN user_roles ON user_roles.user_id = users.id
       WHERE users.id = ? AND users.status = 'active' AND user_roles.role = 'super_admin'`,
    ).bind(options.actorId).first();
    if (!allowed) throw new ProductReviewConflictError('Only an active Super Admin can unpublish products.');
  }
  const transition = reviewTransitions[options.action];
  const current = await database
    .prepare(
      `SELECT products.status, seller_profiles.user_id AS sellerUserId
       FROM products
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       WHERE products.id = ? LIMIT 1`,
    )
    .bind(options.productId)
    .first<{ status: ProductStatus; sellerUserId: string }>();
  if (!current) throw new ProductReviewConflictError('Product not found.');
  if (current.sellerUserId === options.actorId) {
    throw new ProductReviewConflictError(
      'Staff cannot review their own product.',
    );
  }
  if (
    current.status !== transition.from ||
    !productTransitions[current.status].includes(transition.to)
  ) {
    throw new ProductReviewConflictError(
      `This action is not available while the product is ${current.status}.`,
    );
  }

  const results = await database.batch([
    database
      .prepare(
        `UPDATE products SET status = ?, review_note = ?, review_request_id = ?,
          reviewed_by = ?, published_at = CASE WHEN ? = 'published' THEN ? WHEN ? = 'under_review' THEN NULL ELSE published_at END,
          updated_at = ? WHERE id = ? AND status = ?`,
      )
      .bind(
        transition.to,
        options.reason,
        options.requestId,
        options.actorId,
        transition.to,
        options.now,
        transition.to,
        options.now,
        options.productId,
        transition.from,
      ),
    database
      .prepare(
        `INSERT INTO moderation_events (
          id, subject_type, subject_id, from_status, to_status, reason, actor_id, created_at
        ) SELECT ?, 'product', ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND review_request_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.productId,
        transition.from,
        transition.to,
        options.reason,
        options.actorId,
        options.now,
        options.productId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, ?, 'product', ?, ?, ?, ?, ?, NULL, ?
        WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND review_request_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        transition.auditAction,
        options.productId,
        options.reason,
        JSON.stringify({ status: transition.from }),
        JSON.stringify({ status: transition.to }),
        options.requestId,
        options.now,
        options.productId,
        options.requestId,
      ),
    ...(options.action==='start_review'?[]:await businessNotificationStatements(database,{eventId:options.requestId,sourceType:'product',sourceId:options.productId,status:transition.to,reviewRequestId:options.requestId,actorId:options.actorId,now:options.now,kind:'result'})),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new ProductReviewConflictError(
      'Product changed. Refresh and try again.',
    );
  }
  return transition.to;
}

export interface PublicProductRow {
  id: string;
  sellerId: string;
  slug: string;
  nameEn: string;
  nameNe: string | null;
  descriptionEn: string;
  pricePaisa: number;
  compareAtPricePaisa: number | null;
  inventoryQuantity: number;
  producer: string;
  materials: string;
  originStory: string | null;
  dimensions: string | null;
  size: string | null;
  colour: string | null;
  variations: string | null;
  specifications: string | null;
  careInstructions: string | null;
  safetyInformation: string | null;
  returnConditions: string | null;
  returnEligible: number;
  warranty: string | null;
  madeToOrder: number;
  preparationDays: number;
  manufacturedAt: number | null;
  expiresAt: number | null;
  licenceReference: string | null;
  tradingName: string;
  categoryName: string;
  primaryMediaId: string | null;
}

export interface PublicCatalogueFilters {
  query?: string;
  categorySlugs?: readonly string[];
  occasionSlugs?: readonly string[];
  limit?: number;
  page?: number;
  sort?: 'newest' | 'price-low' | 'price-high' | 'name';
}

interface HomepageProductQueryRow {
  slug: string;
  name: string;
  pricePaisa: number;
  compareAtPricePaisa: number | null;
  category: string;
  tradingName: string;
  mediaId: string;
}

export interface HomepagePromotion {
  id: string;
  nameEn: string;
  startsAt: number;
  endsAt: number;
  productCount: number;
}

export interface HomepageManageableProduct {
  id: string;
  slug: string;
  nameEn: string;
  pricePaisa: number;
  inventoryQuantity: number;
  publishedAt: number;
  tradingName: string;
  categoryName: string;
  primaryMediaId: string | null;
  homepageHidden: number;
  homepageVersion: number;
  homepageReason: string | null;
  homepageUpdatedAt: number | null;
  homepageUpdatedByName: string | null;
}

export interface HomepageProductControlPage {
  items: readonly HomepageManageableProduct[];
  total: number;
  page: number;
  pageSize: number;
}

export class HomepageVisibilityConflictError extends Error {}

function homepageProduct(
  row: HomepageProductQueryRow,
  label: FeaturedProduct['label'],
): FeaturedProduct {
  const pricePaisa = Number(row.pricePaisa);
  return {
    slug: row.slug,
    name: row.name,
    pricePaisa,
    compareAtPricePaisa:
      row.compareAtPricePaisa === null
        ? null
        : Number(row.compareAtPricePaisa),
    price: new Intl.NumberFormat('en-NP').format(pricePaisa / 100),
    category: row.category,
    image: `/api/product-media/${row.mediaId}`,
    imageAlt: row.name,
    tradingName: row.tradingName,
    label,
  };
}

function homepageLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 24)
    throw new RangeError('Homepage product limit must be an integer from 1 through 24.');
  return value;
}

export async function listHomepagePromotedProducts(
  database: D1Database,
  now = Date.now(),
  limit = 8,
): Promise<readonly FeaturedProduct[]> {
  homepageLimit(limit);
  const result = await database
    .prepare(
      `SELECT products.slug, products.name_en AS name, products.price_paisa AS pricePaisa, products.compare_at_price_paisa AS compareAtPricePaisa,
      categories.name_en AS category, seller_profiles.trading_name AS tradingName,
      homepage_media.id AS mediaId
     FROM promotions
     INNER JOIN promotion_products ON promotion_products.promotion_id = promotions.id
     INNER JOIN products ON products.id = promotion_products.product_id
     INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
     INNER JOIN categories ON categories.id = products.category_id
     INNER JOIN product_media homepage_media ON homepage_media.id = (
       SELECT candidate_media.id FROM product_media candidate_media
       WHERE candidate_media.product_id = products.id
         AND candidate_media.mime_type LIKE 'image/%'
       ORDER BY candidate_media.sort_order ASC, candidate_media.id ASC LIMIT 1
     )
     WHERE promotions.status = 'active' AND promotions.placement = 'homepage'
       AND promotions.starts_at <= ? AND promotions.ends_at > ?
       AND ${publicProductEligibility()} AND seller_profiles.status = 'approved'
       AND categories.is_active = 1 AND products.inventory_quantity > 0
       AND NOT EXISTS (
         SELECT 1 FROM homepage_product_controls
         WHERE homepage_product_controls.product_id = products.id
           AND homepage_product_controls.is_hidden = 1
       )
     ORDER BY promotions.created_at DESC, promotion_products.sort_order ASC
     LIMIT ?`,
    )
    .bind(now, now, Math.min(limit * 3, 24))
    .all<HomepageProductQueryRow>();
  const unique = new Map<string, FeaturedProduct>();
  for (const row of result.results) {
    if (!unique.has(row.slug)) unique.set(row.slug, homepageProduct(row, 'Offer'));
  }
  return [...unique.values()].slice(0, limit);
}

export async function listActiveHomepagePromotions(
  database: D1Database,
  now = Date.now(),
): Promise<readonly HomepagePromotion[]> {
  const result = await database
    .prepare(
      `SELECT promotions.id, promotions.name_en AS nameEn,
        promotions.starts_at AS startsAt, promotions.ends_at AS endsAt,
        COUNT(DISTINCT products.id) AS productCount
       FROM promotions
       INNER JOIN promotion_products ON promotion_products.promotion_id = promotions.id
       INNER JOIN products ON products.id = promotion_products.product_id
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       INNER JOIN categories ON categories.id = products.category_id
       WHERE promotions.status = 'active' AND promotions.placement = 'homepage'
         AND promotions.starts_at <= ? AND promotions.ends_at > ?
         AND ${publicProductEligibility()} AND seller_profiles.status = 'approved'
         AND categories.is_active = 1 AND products.inventory_quantity > 0
         AND NOT EXISTS (
           SELECT 1 FROM homepage_product_controls
           WHERE homepage_product_controls.product_id = products.id
             AND homepage_product_controls.is_hidden = 1
         )
         AND EXISTS (
           SELECT 1 FROM product_media offer_media
           WHERE offer_media.product_id = products.id
             AND offer_media.mime_type LIKE 'image/%'
         )
       GROUP BY promotions.id, promotions.name_en, promotions.starts_at, promotions.ends_at
       HAVING COUNT(DISTINCT products.id) > 0
       ORDER BY promotions.created_at DESC
       LIMIT 3`,
    )
    .bind(now, now)
    .all<HomepagePromotion>();
  return result.results.map((row) => ({
    ...row,
    startsAt: Number(row.startsAt),
    endsAt: Number(row.endsAt),
    productCount: Number(row.productCount),
  }));
}

export async function listHomepageLatestProducts(
  database: D1Database,
  limit = 8,
): Promise<readonly FeaturedProduct[]> {
  homepageLimit(limit);
  const result = await database
    .prepare(
      `SELECT products.slug, products.name_en AS name,
        products.price_paisa AS pricePaisa,
        products.compare_at_price_paisa AS compareAtPricePaisa,
        categories.name_en AS category, seller_profiles.trading_name AS tradingName,
        homepage_media.id AS mediaId
       FROM products
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       INNER JOIN categories ON categories.id = products.category_id
       INNER JOIN product_media homepage_media ON homepage_media.id = (
         SELECT candidate_media.id FROM product_media candidate_media
         WHERE candidate_media.product_id = products.id
           AND candidate_media.mime_type LIKE 'image/%'
         ORDER BY candidate_media.sort_order ASC, candidate_media.id ASC LIMIT 1
       )
       WHERE ${publicProductEligibility()} AND seller_profiles.status = 'approved'
         AND categories.is_active = 1 AND products.inventory_quantity > 0
         AND products.published_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM homepage_product_controls
           WHERE homepage_product_controls.product_id = products.id
             AND homepage_product_controls.is_hidden = 1
         )
       ORDER BY products.published_at DESC, products.id ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<HomepageProductQueryRow>();
  return result.results.map((row) => homepageProduct(row, 'New'));
}

export async function listHomepageTopProducts(
  database: D1Database,
  options: { now?: number; windowDays?: number; limit?: number } = {},
): Promise<readonly FeaturedProduct[]> {
  const now = options.now ?? Date.now();
  const windowDays = options.windowDays ?? 90;
  const limit = homepageLimit(options.limit ?? 8);
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 3650)
    throw new RangeError('Homepage sales window must be from 1 through 3650 days.');
  const since = now - windowDays * 86_400_000;
  const result = await database
    .prepare(
      `SELECT products.slug, products.name_en AS name,
        products.price_paisa AS pricePaisa,
        products.compare_at_price_paisa AS compareAtPricePaisa,
        categories.name_en AS category, seller_profiles.trading_name AS tradingName,
        homepage_media.id AS mediaId, SUM(order_items.quantity) AS soldQuantity,
        COUNT(DISTINCT orders.id) AS deliveredOrderCount
       FROM order_items
       INNER JOIN orders ON orders.id = order_items.order_id
       INNER JOIN products ON products.id = order_items.product_id
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       INNER JOIN categories ON categories.id = products.category_id
       INNER JOIN product_media homepage_media ON homepage_media.id = (
         SELECT candidate_media.id FROM product_media candidate_media
         WHERE candidate_media.product_id = products.id
           AND candidate_media.mime_type LIKE 'image/%'
         ORDER BY candidate_media.sort_order ASC, candidate_media.id ASC LIMIT 1
       )
       WHERE orders.status = 'delivered' AND orders.delivered_at IS NOT NULL
         AND orders.delivered_at >= ? AND orders.delivered_at <= ?
         AND order_items.fulfillment_status = 'delivered'
         AND ${publicProductEligibility()} AND seller_profiles.status = 'approved'
         AND categories.is_active = 1 AND products.inventory_quantity > 0
         AND NOT EXISTS (
           SELECT 1 FROM homepage_product_controls
           WHERE homepage_product_controls.product_id = products.id
             AND homepage_product_controls.is_hidden = 1
         )
       GROUP BY products.id, products.slug, products.name_en, products.price_paisa,
         products.compare_at_price_paisa, categories.name_en,
         seller_profiles.trading_name, homepage_media.id, products.published_at
       ORDER BY soldQuantity DESC, deliveredOrderCount DESC,
         products.published_at DESC, products.id ASC
       LIMIT ?`,
    )
    .bind(since, now, limit)
    .all<HomepageProductQueryRow & {
      soldQuantity: number;
      deliveredOrderCount: number;
    }>();
  return result.results.map((row) => homepageProduct(row, 'Popular'));
}

function escapeLike(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

export async function listHomepageProductControls(
  database: D1Database,
  filters: {
    query?: string;
    visibility?: 'all' | 'visible' | 'hidden';
    page?: number;
    pageSize?: number;
  } = {},
): Promise<HomepageProductControlPage> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 30;
  if (!Number.isInteger(page) || page < 1)
    throw new RangeError('Homepage control page must be a positive integer.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new RangeError('Homepage control page size must be from 1 through 100.');
  const visibility = filters.visibility ?? 'all';
  if (!['all', 'visible', 'hidden'].includes(visibility))
    throw new RangeError('Homepage visibility filter is invalid.');

  const query = filters.query?.trim().slice(0, 100) ?? '';
  const conditions = [
    "products.status = 'published'",
    'NOT EXISTS (SELECT 1 FROM product_deletions WHERE product_deletions.product_id = products.id)',
  ];
  const bindings: unknown[] = [];
  if (visibility === 'visible')
    conditions.push('COALESCE(homepage_product_controls.is_hidden, 0) = 0');
  if (visibility === 'hidden')
    conditions.push('COALESCE(homepage_product_controls.is_hidden, 0) = 1');
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(
      `(products.name_en LIKE ? ESCAPE '\\' OR products.sku LIKE ? ESCAPE '\\' OR seller_profiles.trading_name LIKE ? ESCAPE '\\')`,
    );
    bindings.push(pattern, pattern, pattern);
  }
  const where = conditions.join(' AND ');
  const from = `FROM products
    INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
    INNER JOIN categories ON categories.id = products.category_id
    LEFT JOIN homepage_product_controls
      ON homepage_product_controls.product_id = products.id
    LEFT JOIN users homepage_actor
      ON homepage_actor.id = homepage_product_controls.updated_by`;
  const [rows, count] = await Promise.all([
    database
      .prepare(
        `SELECT products.id, products.slug, products.name_en AS nameEn,
          products.price_paisa AS pricePaisa,
          products.inventory_quantity AS inventoryQuantity,
          products.published_at AS publishedAt,
          seller_profiles.trading_name AS tradingName,
          categories.name_en AS categoryName,
          (SELECT product_media.id FROM product_media
            WHERE product_media.product_id = products.id
              AND product_media.mime_type LIKE 'image/%'
            ORDER BY product_media.sort_order ASC, product_media.id ASC LIMIT 1) AS primaryMediaId,
          COALESCE(homepage_product_controls.is_hidden, 0) AS homepageHidden,
          COALESCE(homepage_product_controls.version, 0) AS homepageVersion,
          homepage_product_controls.reason AS homepageReason,
          homepage_product_controls.updated_at AS homepageUpdatedAt,
          homepage_actor.display_name AS homepageUpdatedByName
         ${from} WHERE ${where}
         ORDER BY products.published_at DESC, products.id ASC
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, pageSize, (page - 1) * pageSize)
      .all<HomepageManageableProduct>(),
    database
      .prepare(`SELECT COUNT(*) AS total ${from} WHERE ${where}`)
      .bind(...bindings)
      .first<{ total: number }>(),
  ]);
  return { items: rows.results, total: Number(count?.total ?? 0), page, pageSize };
}

export async function setHomepageProductVisibility(
  database: D1Database,
  options: {
    productId: string;
    actorId: string;
    hidden: boolean;
    expectedVersion: number;
    reason: string;
    requestId: string;
    now: number;
  },
): Promise<{ hidden: boolean; version: number }> {
  const reason = options.reason.trim();
  if (reason.length < 8 || reason.length > 500)
    throw new HomepageVisibilityConflictError(
      'Add a clear homepage-control reason from 8 through 500 characters.',
    );
  if (!Number.isInteger(options.expectedVersion) || options.expectedVersion < 0)
    throw new HomepageVisibilityConflictError('Homepage visibility version is invalid.');
  if (!options.requestId || options.requestId.length > 191)
    throw new HomepageVisibilityConflictError('Homepage control request is invalid.');

  const actor = await database
    .prepare(
      `SELECT 1 FROM users
       INNER JOIN user_roles ON user_roles.user_id = users.id
       WHERE users.id = ? AND users.status = 'active'
         AND user_roles.role = 'super_admin' LIMIT 1`,
    )
    .bind(options.actorId)
    .first();
  if (!actor)
    throw new HomepageVisibilityConflictError(
      'Only an active Super Admin can control homepage visibility.',
    );

  const current = await database
    .prepare(
      `SELECT products.id, COALESCE(homepage_product_controls.is_hidden, 0) AS hidden,
        COALESCE(homepage_product_controls.version, 0) AS version,
        homepage_product_controls.last_request_id AS lastRequestId
       FROM products
       LEFT JOIN homepage_product_controls
         ON homepage_product_controls.product_id = products.id
       WHERE products.id = ?
         AND NOT EXISTS (
           SELECT 1 FROM product_deletions
           WHERE product_deletions.product_id = products.id
         ) LIMIT 1`,
    )
    .bind(options.productId)
    .first<{ id: string; hidden: number; version: number; lastRequestId: string | null }>();
  if (!current) throw new HomepageVisibilityConflictError('Product not found.');
  if (current.lastRequestId === options.requestId) {
    if (Boolean(current.hidden) !== options.hidden)
      throw new HomepageVisibilityConflictError('Homepage request identifier was reused.');
    return { hidden: options.hidden, version: current.version };
  }
  if (current.version !== options.expectedVersion)
    throw new HomepageVisibilityConflictError(
      'Homepage visibility changed. Refresh and try again.',
    );
  if (Boolean(current.hidden) === options.hidden)
    return { hidden: options.hidden, version: current.version };

  const nextVersion = current.version + 1;
  const mutation = current.version === 0
    ? database.prepare(
        `INSERT INTO homepage_product_controls (
          product_id, is_hidden, reason, version, updated_by,
          last_request_id, created_at, updated_at
        ) SELECT ?, ?, ?, 1, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM products WHERE products.id = ?
            AND NOT EXISTS (
              SELECT 1 FROM product_deletions
              WHERE product_deletions.product_id = products.id
            )
        ) AND EXISTS (
          SELECT 1 FROM users
          INNER JOIN user_roles ON user_roles.user_id = users.id
          WHERE users.id = ? AND users.status = 'active'
            AND user_roles.role = 'super_admin'
        ) AND NOT EXISTS (
          SELECT 1 FROM homepage_product_controls WHERE product_id = ?
        )`,
      ).bind(options.productId, options.hidden ? 1 : 0, reason,
        options.actorId, options.requestId, options.now, options.now,
        options.productId, options.actorId, options.productId)
    : database.prepare(
        `UPDATE homepage_product_controls
         SET is_hidden = ?, reason = ?, version = version + 1,
           updated_by = ?, last_request_id = ?, updated_at = ?
         WHERE product_id = ? AND version = ?
           AND EXISTS (
             SELECT 1 FROM users
             INNER JOIN user_roles ON user_roles.user_id = users.id
             WHERE users.id = ? AND users.status = 'active'
               AND user_roles.role = 'super_admin'
           )`,
      ).bind(options.hidden ? 1 : 0, reason, options.actorId,
        options.requestId, options.now, options.productId, current.version,
        options.actorId);
  const results = await database.batch([
    mutation,
    database.prepare(
      `INSERT INTO audit_logs (
        id, actor_id, action, subject_type, subject_id, reason,
        previous_json, next_json, request_id, ip_hash, created_at
      ) SELECT ?, ?, ?, 'product', ?, ?, ?, ?, ?, NULL, ?
      FROM homepage_product_controls
      WHERE product_id = ? AND version = ? AND last_request_id = ?`,
    ).bind(crypto.randomUUID(), options.actorId,
      options.hidden ? 'homepage.product.hidden' : 'homepage.product.shown',
      options.productId, reason,
      JSON.stringify({ homepageHidden: Boolean(current.hidden), version: current.version }),
      JSON.stringify({ homepageHidden: options.hidden, version: nextVersion }),
      options.requestId, options.now, options.productId, nextVersion,
      options.requestId),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1)
    throw new HomepageVisibilityConflictError(
      'Homepage visibility changed. Refresh and try again.',
    );
  return { hidden: options.hidden, version: nextVersion };
}

export async function listPublishedProducts(
  database: D1Database,
  filters: PublicCatalogueFilters = {},
): Promise<readonly PublicProductRow[]> {
  const limit = filters.limit ?? 60;
  if (!Number.isInteger(limit) || limit < 1 || limit > 120) {
    throw new RangeError(
      'Catalogue limit must be an integer from 1 through 120.',
    );
  }
  const page = filters.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 10_000)
    throw new RangeError('Catalogue page must be a positive integer.');
  const sort = filters.sort ?? 'newest';
  const orderBy = {
    newest: 'products.published_at DESC, products.id ASC',
    'price-low': 'products.price_paisa ASC, products.id ASC',
    'price-high': 'products.price_paisa DESC, products.id ASC',
    name: 'products.name_en COLLATE NOCASE ASC, products.id ASC',
  }[sort];
  if (!orderBy) throw new RangeError('Catalogue sort is invalid.');
  const conditions = [
    `${publicProductEligibility()}`,
    `seller_profiles.status = 'approved'`,
    `categories.is_active = 1`,
  ];
  const bindings: Array<string | number> = [];
  const query = filters.query?.trim().slice(0, 100);
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(`(
      products.name_en LIKE ? ESCAPE '\\' OR products.name_ne LIKE ? ESCAPE '\\'
      OR products.description_en LIKE ? ESCAPE '\\' OR products.description_ne LIKE ? ESCAPE '\\'
      OR products.producer LIKE ? ESCAPE '\\' OR products.materials LIKE ? ESCAPE '\\'
      OR seller_profiles.trading_name LIKE ? ESCAPE '\\'
    )`);
    bindings.push(
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
    );
  }
  const categorySlugs = [...new Set(filters.categorySlugs ?? [])].slice(0, 10);
  if (categorySlugs.length > 0) {
    conditions.push(
      `categories.slug IN (${categorySlugs.map(() => '?').join(', ')})`,
    );
    bindings.push(...categorySlugs);
  }
  const occasionSlugs = [...new Set(filters.occasionSlugs ?? [])].slice(0, 11);
  if (occasionSlugs.length > 0) {
    conditions.push(`EXISTS (
      SELECT 1 FROM product_occasions
      INNER JOIN occasions ON occasions.id = product_occasions.occasion_id
      WHERE product_occasions.product_id = products.id
        AND occasions.is_active = 1
        AND occasions.slug IN (${occasionSlugs.map(() => '?').join(', ')})
    )`);
    bindings.push(...occasionSlugs);
  }
  const promotionOrder =
    sort === 'newest'
      ? `CASE WHEN EXISTS (
    SELECT 1 FROM promotion_products featured_assignment
    INNER JOIN promotions featured_promotion ON featured_promotion.id = featured_assignment.promotion_id
    WHERE featured_assignment.product_id = products.id AND featured_promotion.status = 'active'
      AND featured_promotion.placement = 'shop' AND featured_promotion.starts_at <= ?
      AND featured_promotion.ends_at > ?
  ) THEN 0 ELSE 1 END, `
      : '';
  if (sort === 'newest') bindings.push(Date.now(), Date.now());
  const result = await database
    .prepare(
      `SELECT products.id, products.slug, products.name_en AS nameEn,
        products.seller_id AS sellerId,
        products.name_ne AS nameNe, products.description_en AS descriptionEn,
        products.price_paisa AS pricePaisa,
        products.compare_at_price_paisa AS compareAtPricePaisa,
        products.inventory_quantity AS inventoryQuantity,
        products.producer, products.materials, products.origin_story AS originStory, products.dimensions,
        products.size, products.colour, products.variations, products.specifications,
        products.care_instructions AS careInstructions,
        products.safety_information AS safetyInformation,
        products.return_conditions AS returnConditions,
        products.return_eligible AS returnEligible,
        products.warranty, products.made_to_order AS madeToOrder,
        products.preparation_days AS preparationDays,
        products.manufactured_at AS manufacturedAt,
        products.expires_at AS expiresAt,
        products.licence_reference AS licenceReference,
        seller_profiles.trading_name AS tradingName,
        categories.name_en AS categoryName,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id
          ORDER BY product_media.sort_order ASC LIMIT 1) AS primaryMediaId
       FROM products
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       INNER JOIN categories ON categories.id = products.category_id
       WHERE ${conditions.join('\n         AND ')}
       ORDER BY ${promotionOrder}${orderBy} LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, limit, (page - 1) * limit)
    .all<PublicProductRow>();
  return result.results;
}

export async function countPublishedProducts(
  database: D1Database,
  filters: Omit<PublicCatalogueFilters, 'limit' | 'page' | 'sort'> = {},
): Promise<number> {
  const conditions = [
    `${publicProductEligibility()}`,
    `seller_profiles.status = 'approved'`,
    `categories.is_active = 1`,
  ];
  const bindings: Array<string | number> = [];
  const query = filters.query?.trim().slice(0, 100);
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(`(products.name_en LIKE ? ESCAPE '\\' OR products.name_ne LIKE ? ESCAPE '\\'
      OR products.description_en LIKE ? ESCAPE '\\' OR products.description_ne LIKE ? ESCAPE '\\'
      OR products.producer LIKE ? ESCAPE '\\' OR products.materials LIKE ? ESCAPE '\\'
      OR seller_profiles.trading_name LIKE ? ESCAPE '\\')`);
    bindings.push(
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
    );
  }
  const categorySlugs = [...new Set(filters.categorySlugs ?? [])].slice(0, 10);
  if (categorySlugs.length) {
    conditions.push(
      `categories.slug IN (${categorySlugs.map(() => '?').join(', ')})`,
    );
    bindings.push(...categorySlugs);
  }
  const occasionSlugs = [...new Set(filters.occasionSlugs ?? [])].slice(0, 11);
  if (occasionSlugs.length) {
    conditions.push(
      `EXISTS (SELECT 1 FROM product_occasions INNER JOIN occasions ON occasions.id = product_occasions.occasion_id WHERE product_occasions.product_id = products.id AND occasions.is_active = 1 AND occasions.slug IN (${occasionSlugs.map(() => '?').join(', ')}))`,
    );
    bindings.push(...occasionSlugs);
  }
  const row = await database
    .prepare(
      `SELECT COUNT(*) AS count FROM products INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id INNER JOIN categories ON categories.id = products.category_id WHERE ${conditions.join(' AND ')}`,
    )
    .bind(...bindings)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getPublishedProductBySlug(
  database: D1Database,
  slug: string,
): Promise<(PublicProductRow & { media: readonly ProductMediaRow[] }) | null> {
  const product = await database
    .prepare(
      `SELECT products.id, products.slug, products.name_en AS nameEn,
        products.seller_id AS sellerId,
        products.name_ne AS nameNe, products.description_en AS descriptionEn,
        products.price_paisa AS pricePaisa,
        products.compare_at_price_paisa AS compareAtPricePaisa,
        products.inventory_quantity AS inventoryQuantity,
        products.producer, products.materials, products.origin_story AS originStory, products.dimensions,
        products.size, products.colour, products.variations, products.specifications,
        products.care_instructions AS careInstructions,
        products.safety_information AS safetyInformation,
        products.return_conditions AS returnConditions,
        products.return_eligible AS returnEligible,
        products.warranty, products.made_to_order AS madeToOrder,
        products.preparation_days AS preparationDays,
        products.manufactured_at AS manufacturedAt,
        products.expires_at AS expiresAt,
        products.licence_reference AS licenceReference,
        seller_profiles.trading_name AS tradingName,
        categories.name_en AS categoryName,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id
          ORDER BY product_media.sort_order ASC LIMIT 1) AS primaryMediaId
       FROM products
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       INNER JOIN categories ON categories.id = products.category_id
       WHERE products.slug = ? AND ${publicProductEligibility()} LIMIT 1`,
    )
    .bind(slug)
    .first<PublicProductRow>();
  if (!product) return null;
  const media = await database
    .prepare(
      `SELECT id, original_name AS originalName, mime_type AS mimeType,
        size_bytes AS sizeBytes, alt_en AS altEn, alt_ne AS altNe, sort_order AS sortOrder
       FROM product_media WHERE product_id = ? ORDER BY sort_order ASC`,
    )
    .bind(product.id)
    .all<ProductMediaRow>();
  return { ...product, media: media.results };
}

export async function getUnavailablePublishedProductBySlug(
  database: D1Database,
  slug: string,
): Promise<{ slug: string; nameEn: string } | null> {
  return (
    (await database.prepare(
      `SELECT products.slug,products.name_en AS nameEn
       FROM products
       WHERE products.slug=? AND products.status='published'
         AND NOT EXISTS(SELECT 1 FROM product_deletions d WHERE d.product_id=products.id)
         AND NOT (${publicProductEligibility()})
       LIMIT 1`,
    ).bind(slug).first<{ slug: string; nameEn: string }>()) ?? null
  );
}

export async function getProductMediaObject(
  database: D1Database,
  mediaId: string,
): Promise<{
  objectKey: string;
  originalName: string;
  mimeType: string;
  productStatus: ProductStatus;
  sellerId: string;
} | null> {
  return (
    (await database
      .prepare(
        `SELECT product_media.object_key AS objectKey,
          product_media.original_name AS originalName,
          product_media.mime_type AS mimeType,
          CASE WHEN ${publicProductEligibility()} THEN 'published' ELSE 'archived' END AS productStatus, products.seller_id AS sellerId
         FROM product_media
         INNER JOIN products ON products.id = product_media.product_id
         WHERE product_media.id = ? LIMIT 1`,
      )
      .bind(mediaId)
      .first<{
        objectKey: string;
        originalName: string;
        mimeType: string;
        productStatus: ProductStatus;
        sellerId: string;
      }>()) ?? null
  );
}

export class ProductArchiveConflictError extends Error {}

export async function archiveSellerProduct(
  database: D1Database,
  options: { productId: string; sellerId: string; actorId: string; now: number },
): Promise<void> {
  const mutationId = crypto.randomUUID();
  const results = await database.batch([
    database.prepare(
      `UPDATE products SET status = 'archived', updated_at = ?, review_request_id = ?
       WHERE id = ? AND seller_id = ? AND status = 'published' AND ${productClosurePredicate}`,
    ).bind(options.now, mutationId, options.productId, options.sellerId),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason,
        previous_json, next_json, request_id, ip_hash, created_at)
       SELECT ?, ?, 'product.archived', 'product', ?, 'Seller archived published listing',
         ?, ?, ?, NULL, ?
       WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND seller_id = ?
         AND status = 'archived' AND review_request_id = ?)`,
    ).bind(crypto.randomUUID(), options.actorId, options.productId,
      JSON.stringify({status: 'published'}), JSON.stringify({status: 'archived'}),
      mutationId, options.now, options.productId, options.sellerId, mutationId),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new ProductArchiveConflictError('Published product not found, its status changed, or related obligations remain. Review the product blockers and refresh.');
  }
}

export async function deleteSellerProduct(
  database: D1Database,
  options: { productId: string; sellerId: string; actorId: string; now: number },
): Promise<void> {
  const requestId = crypto.randomUUID();
  const results = await database.batch([
    database.prepare(
      `INSERT INTO product_deletions (product_id, deleted_by, deleted_at, request_id)
       SELECT id, ?, ?, ? FROM products WHERE id = ? AND seller_id = ? AND status = 'archived'
       AND NOT EXISTS (SELECT 1 FROM product_deletions WHERE product_id = products.id) AND ${productClosurePredicate}`,
    ).bind(options.actorId, options.now, requestId, options.productId, options.sellerId),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason,
         previous_json, next_json, request_id, ip_hash, created_at)
       SELECT ?, ?, 'product.deleted', 'product', ?, 'Seller removed archived listing',
         NULL, ?, ?, NULL, ? WHERE EXISTS
         (SELECT 1 FROM product_deletions WHERE product_id = ? AND request_id = ?)`,
    ).bind(crypto.randomUUID(), options.actorId, options.productId,
      JSON.stringify({deleted: true, recordsRetained: true}), requestId, options.now,
      options.productId, requestId),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) throw new ProductArchiveConflictError('Archive this product before deleting it. Related obligations must be cleared; review the product blockers and refresh.');
}
