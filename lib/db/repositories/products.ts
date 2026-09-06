import { productTransitions } from '@/lib/marketplace/workflows';
import type { ProductStatus } from '@/lib/marketplace/types';
import type {
  ProductImageUpload,
  ProductSubmissionInput,
} from '@/lib/products/submission';

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

export async function createProductSubmission(
  database: D1Database,
  options: {
    productId: string;
    sellerId: string;
    actorId: string;
    slug: string;
    input: ProductSubmissionInput;
    images: readonly ProductImageUpload[];
    now: number;
  },
): Promise<void> {
  const { productId, sellerId, actorId, slug, input, images, now } = options;
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO products (
          id, seller_id, category_id, slug, sku, name_en, name_ne,
          description_en, description_ne, price_paisa, compare_at_price_paisa,
          inventory_quantity, producer, country_of_origin, materials, dimensions,
          care_instructions, safety_information, return_conditions, return_eligible, warranty,
          made_to_order, preparation_days, manufactured_at, expires_at,
          licence_reference, status, review_note,
          review_request_id, reviewed_by, published_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NP', ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, 'submitted', NULL, NULL, NULL, NULL, ?, ?
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
        input.materials,
        input.dimensions,
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
        ) VALUES (?, ?, 'product.submitted', 'product', ?,
          'Seller submitted a product for review', NULL, ?, NULL, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        productId,
        JSON.stringify({ status: 'submitted', sku: input.sku }),
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
  updatedAt: number;
  primaryMediaId: string | null;
}

export async function listSellerProducts(
  database: D1Database,
  sellerId: string,
): Promise<readonly SellerProductRow[]> {
  const result = await database
    .prepare(
      `SELECT products.id, products.slug, products.sku,
        products.name_en AS nameEn, products.name_ne AS nameNe,
        products.price_paisa AS pricePaisa,
        products.inventory_quantity AS inventoryQuantity,
        products.status, products.review_note AS reviewNote,
        products.updated_at AS updatedAt,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id
          ORDER BY product_media.sort_order ASC LIMIT 1) AS primaryMediaId
       FROM products
       WHERE products.seller_id = ?
       ORDER BY products.updated_at DESC`,
    )
    .bind(sellerId)
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
  dimensions: string | null;
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
  mediaCount: number;
  occasionIds: readonly string[];
}

type SellerProductRevisionRow = Omit<SellerProductRevision, 'occasionIds'> & {
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
          products.producer, products.materials, products.dimensions,
           products.care_instructions AS careInstructions,
           products.safety_information AS safetyInformation,
           products.return_conditions AS returnConditions,
           products.return_eligible AS returnEligible, products.warranty,
           products.made_to_order AS madeToOrder,
           products.preparation_days AS preparationDays,
           products.manufactured_at AS manufacturedAt,
           products.expires_at AS expiresAt,
           products.licence_reference AS licenceReference,
          products.status, products.review_note AS reviewNote,
          (SELECT GROUP_CONCAT(product_occasions.occasion_id)
            FROM product_occasions
            WHERE product_occasions.product_id = products.id) AS occasionIdsCsv,
          COUNT(product_media.id) AS mediaCount
         FROM products
         LEFT JOIN product_media ON product_media.product_id = products.id
         WHERE products.id = ? AND products.seller_id = ?
         GROUP BY products.id LIMIT 1`,
    )
    .bind(productId, sellerId)
    .first<SellerProductRevisionRow>();
  return row
    ? {
        ...row,
        occasionIds: row.occasionIdsCsv ? row.occasionIdsCsv.split(',') : [],
      }
    : null;
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
    previousInventory: number;
    now: number;
  },
): Promise<void> {
  const mutationId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE products SET category_id = ?, sku = ?, name_en = ?, name_ne = ?,
          description_en = ?, description_ne = ?, price_paisa = ?,
          compare_at_price_paisa = ?, inventory_quantity = ?, producer = ?,
          materials = ?, dimensions = ?, care_instructions = ?,
          safety_information = ?, return_conditions = ?, return_eligible = ?, warranty = ?,
          made_to_order = ?, preparation_days = ?, manufactured_at = ?, expires_at = ?,
          licence_reference = ?, status = 'submitted', review_note = NULL,
          review_request_id = ?, reviewed_by = NULL, updated_at = ?
         WHERE id = ? AND seller_id = ? AND status = 'needs_changes'`,
      )
      .bind(
        options.input.categoryId,
        options.input.sku,
        options.input.nameEn,
        options.input.nameNe,
        options.input.descriptionEn,
        options.input.descriptionNe,
        options.input.pricePaisa,
        options.input.compareAtPricePaisa,
        options.input.inventoryQuantity,
        options.input.producer,
        options.input.materials,
        options.input.dimensions,
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
      ),
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
        JSON.stringify({ status: 'needs_changes' }),
        JSON.stringify({ status: 'submitted', sku: options.input.sku }),
        mutationId,
        options.now,
        options.productId,
        mutationId,
      ),
  ];

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

  const results = await database.batch(statements);
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new ProductRevisionConflictError(
      'This product is no longer available for revision. Refresh and try again.',
    );
  }
}

export interface SellerProductStats {
  total: number;
  awaitingReview: number;
  published: number;
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
          COALESCE(SUM(CASE WHEN status IN ('submitted', 'under_review') THEN 1 ELSE 0 END), 0) AS awaitingReview,
          COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published,
          COALESCE(SUM(CASE WHEN status = 'published' AND inventory_quantity <= 5 THEN 1 ELSE 0 END), 0) AS lowStock
         FROM products WHERE seller_id = ?`,
      )
      .bind(sellerId)
      .first<SellerProductStats>()) ?? {
      total: 0,
      awaitingReview: 0,
      published: 0,
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
  },
): Promise<void> {
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
  const results = await database.batch([
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
        JSON.stringify({ inventoryQuantity: options.quantity }),
        mutationId,
        options.now,
        options.productId,
        mutationId,
      ),
  ]);
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
}

export async function listProductsForReview(
  database: D1Database,
  limit = 100,
): Promise<readonly ProductReviewQueueRow[]> {
  const result = await database
    .prepare(
      `SELECT products.id, products.slug, products.sku,
        products.name_en AS nameEn, products.name_ne AS nameNe,
        products.price_paisa AS pricePaisa,
        products.inventory_quantity AS inventoryQuantity,
        products.status, products.review_note AS reviewNote,
        products.updated_at AS updatedAt, products.created_at AS submittedAt,
        seller_profiles.trading_name AS tradingName,
        categories.name_en AS categoryName,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id
          ORDER BY product_media.sort_order ASC LIMIT 1) AS primaryMediaId
       FROM products
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       INNER JOIN categories ON categories.id = products.category_id
       WHERE products.status IN ('submitted', 'under_review', 'needs_changes', 'approved')
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
  dimensions: string | null;
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
        products.producer, products.materials, products.dimensions,
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
        products.updated_at AS updatedAt, products.created_at AS submittedAt,
        seller_profiles.trading_name AS tradingName,
        categories.name_en AS categoryName,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id
          ORDER BY product_media.sort_order ASC LIMIT 1) AS primaryMediaId
       FROM products
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       INNER JOIN categories ON categories.id = products.category_id
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
          reviewed_by = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END,
          updated_at = ? WHERE id = ? AND status = ?`,
      )
      .bind(
        transition.to,
        options.reason,
        options.requestId,
        options.actorId,
        transition.to,
        options.now,
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
  dimensions: string | null;
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

export async function listHomepagePromotedProducts(
  database: D1Database,
  now = Date.now(),
): Promise<
  readonly import('@/lib/catalog/featured-products').FeaturedProduct[]
> {
  const result = await database
    .prepare(
      `SELECT products.slug, products.name_en AS name, products.price_paisa AS pricePaisa,
      categories.name_en AS category,
      (SELECT product_media.id FROM product_media WHERE product_media.product_id = products.id
        ORDER BY product_media.sort_order ASC LIMIT 1) AS mediaId
     FROM promotions
     INNER JOIN promotion_products ON promotion_products.promotion_id = promotions.id
     INNER JOIN products ON products.id = promotion_products.product_id
     INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
     INNER JOIN categories ON categories.id = products.category_id
     WHERE promotions.status = 'active' AND promotions.placement = 'homepage'
       AND promotions.starts_at <= ? AND promotions.ends_at > ?
       AND products.status = 'published' AND seller_profiles.status = 'approved'
       AND categories.is_active = 1
     ORDER BY promotions.created_at DESC, promotion_products.sort_order ASC
     LIMIT 8`,
    )
    .bind(now, now)
    .all<{
      slug: string;
      name: string;
      pricePaisa: number;
      category: string;
      mediaId: string | null;
    }>();
  return result.results
    .filter((row) => row.mediaId)
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      price: new Intl.NumberFormat('en-NP').format(row.pricePaisa / 100),
      category: row.category,
      image: `/api/product-media/${row.mediaId}`,
      imageAlt: row.name,
    }));
}

function escapeLike(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
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
    `products.status = 'published'`,
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
        products.producer, products.materials, products.dimensions,
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
    `products.status = 'published'`,
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
        products.producer, products.materials, products.dimensions,
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
       WHERE products.slug = ? AND products.status = 'published' LIMIT 1`,
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
          products.status AS productStatus, products.seller_id AS sellerId
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
