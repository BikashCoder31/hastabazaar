import { sql } from 'drizzle-orm';
import {
  AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const id = (name = 'id') => text(name).primaryKey();
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const users = sqliteTable(
  'users',
  {
    id: id(),
    authSubject: text('auth_subject'),
    email: text('email').notNull(),
    phone: text('phone'),
    displayName: text('display_name').notNull(),
    locale: text('locale', { enum: ['en-NP', 'ne-NP'] })
      .notNull()
      .default('en-NP'),
    status: text('status', { enum: ['active', 'disabled', 'deleted'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_users_email_unique').on(table.email),
    uniqueIndex('idx_users_phone_unique').on(table.phone),
    uniqueIndex('idx_users_auth_subject_unique').on(table.authSubject),
  ],
);

export const userRoles = sqliteTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', {
      enum: ['customer', 'seller', 'admin', 'super_admin'],
    }).notNull(),
    assignedBy: text('assigned_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAt: timestamp('assigned_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    index('idx_user_roles_role').on(table.role),
  ],
);

export const staffInvitations = sqliteTable(
  'staff_invitations',
  {
    id: id(),
    email: text('email').notNull(),
    role: text('role', { enum: ['admin', 'super_admin'] }).notNull(),
    status: text('status', {
      enum: ['pending', 'accepted', 'revoked', 'expired'],
    })
      .notNull()
      .default('pending'),
    invitedBy: text('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    acceptedBy: text('accepted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    uniqueIndex('idx_staff_invitations_pending_email_unique')
      .on(table.email)
      .where(sql`${table.status} = 'pending'`),
    index('idx_staff_invitations_email_status_created').on(
      table.email,
      table.status,
      table.createdAt,
    ),
    index('idx_staff_invitations_status_expires').on(
      table.status,
      table.expiresAt,
    ),
  ],
);

export const sellerProfiles = sqliteTable(
  'seller_profiles',
  {
    id: id(),
    applicationReference: text('application_reference'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    legalName: text('legal_name').notNull(),
    tradingName: text('trading_name').notNull(),
    registrationAuthority: text('registration_authority').notNull(),
    registrationNumber: text('registration_number').notNull(),
    taxMode: text('tax_mode', { enum: ['PAN', 'VAT'] }).notNull(),
    taxRegistrationNumber: text('tax_registration_number').notNull(),
    representativeName: text('representative_name').notNull(),
    businessDescription: text('business_description'),
    productCategories: text('product_categories'),
    supportPhone: text('support_phone').notNull(),
    supportEmail: text('support_email').notNull(),
    province: text('province').notNull(),
    district: text('district').notNull(),
    municipality: text('municipality').notNull(),
    ward: text('ward'),
    locality: text('locality').notNull(),
    payoutAccountReference: text('payout_account_reference'),
    status: text('status', {
      enum: [
        'draft',
        'submitted',
        'under_review',
        'needs_changes',
        'approved',
        'rejected',
        'suspended',
      ],
    })
      .notNull()
      .default('draft'),
    sellerAgreementVersion: text('seller_agreement_version'),
    sellerAgreementAcceptedAt: timestamp('seller_agreement_accepted_at'),
    reviewNote: text('review_note'),
    reviewRequestId: text('review_request_id'),
    reviewedBy: text('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_seller_profiles_application_reference_unique').on(
      table.applicationReference,
    ),
    uniqueIndex('idx_seller_profiles_user_unique').on(table.userId),
    uniqueIndex('idx_seller_profiles_registration_unique').on(
      table.registrationAuthority,
      table.registrationNumber,
    ),
    uniqueIndex('idx_seller_profiles_tax_number_unique').on(
      table.taxRegistrationNumber,
    ),
    index('idx_seller_profiles_review_queue').on(table.status, table.createdAt),
  ],
);

export const sellerDocuments = sqliteTable(
  'seller_documents',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: [
        'business_registration',
        'pan_certificate',
        'vat_certificate',
        'representative_identity',
        'bank_verification',
        'product_licence',
        'other',
      ],
    }).notNull(),
    objectKey: text('object_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: text('status', {
      enum: ['pending', 'verified', 'rejected', 'expired'],
    })
      .notNull()
      .default('pending'),
    uploadedAt: timestamp('uploaded_at').notNull(),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: text('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('idx_seller_documents_object_key_unique').on(table.objectKey),
    index('idx_seller_documents_seller_kind').on(table.sellerId, table.kind),
  ],
);

export const categories = sqliteTable(
  'categories',
  {
    id: id(),
    parentId: text('parent_id').references(
      (): AnySQLiteColumn => categories.id,
      {
        onDelete: 'set null',
      },
    ),
    slug: text('slug').notNull(),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_categories_slug_unique').on(table.slug),
    index('idx_categories_parent_sort').on(table.parentId, table.sortOrder),
  ],
);

export const occasions = sqliteTable(
  'occasions',
  {
    id: id(),
    slug: text('slug').notNull(),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_occasions_slug_unique').on(table.slug),
    index('idx_occasions_active_sort').on(table.isActive, table.sortOrder),
  ],
);

export const products = sqliteTable(
  'products',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    sku: text('sku').notNull(),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    descriptionEn: text('description_en').notNull(),
    descriptionNe: text('description_ne'),
    pricePaisa: integer('price_paisa').notNull(),
    compareAtPricePaisa: integer('compare_at_price_paisa'),
    inventoryQuantity: integer('inventory_quantity').notNull().default(0),
    producer: text('producer').notNull(),
    countryOfOrigin: text('country_of_origin').notNull().default('NP'),
    materials: text('materials').notNull(),
    dimensions: text('dimensions'),
    careInstructions: text('care_instructions'),
    safetyInformation: text('safety_information'),
    returnEligible: integer('return_eligible', { mode: 'boolean' })
      .notNull()
      .default(true),
    warranty: text('warranty'),
    manufacturedAt: timestamp('manufactured_at'),
    expiresAt: timestamp('expires_at'),
    licenceReference: text('licence_reference'),
    status: text('status', {
      enum: [
        'draft',
        'submitted',
        'under_review',
        'needs_changes',
        'approved',
        'published',
        'rejected',
        'archived',
      ],
    })
      .notNull()
      .default('draft'),
    reviewNote: text('review_note'),
    reviewRequestId: text('review_request_id'),
    reviewedBy: text('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_products_slug_unique').on(table.slug),
    uniqueIndex('idx_products_seller_sku_unique').on(table.sellerId, table.sku),
    index('idx_products_public_catalog').on(
      table.status,
      table.categoryId,
      table.publishedAt,
    ),
    index('idx_products_seller_status').on(table.sellerId, table.status),
    index('idx_products_seller_updated').on(table.sellerId, table.updatedAt),
    index('idx_products_review_queue').on(table.status, table.createdAt),
    index('idx_products_public_recent').on(table.status, table.publishedAt),
    check('products_price_non_negative', sql`${table.pricePaisa} >= 0`),
    check(
      'products_compare_price_non_negative',
      sql`${table.compareAtPricePaisa} IS NULL OR ${table.compareAtPricePaisa} >= 0`,
    ),
    check(
      'products_inventory_non_negative',
      sql`${table.inventoryQuantity} >= 0`,
    ),
  ],
);

export const productOccasions = sqliteTable(
  'product_occasions',
  {
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    occasionId: text('occasion_id')
      .notNull()
      .references(() => occasions.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.occasionId] }),
    index('idx_product_occasions_occasion_product').on(
      table.occasionId,
      table.productId,
    ),
  ],
);

export const productMedia = sqliteTable(
  'product_media',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    originalName: text('original_name').notNull().default(''),
    mimeType: text('mime_type').notNull().default('image/jpeg'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    altEn: text('alt_en').notNull(),
    altNe: text('alt_ne'),
    width: integer('width'),
    height: integer('height'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_product_media_object_key_unique').on(table.objectKey),
    index('idx_product_media_product_sort').on(
      table.productId,
      table.sortOrder,
    ),
  ],
);

export const inventoryAdjustments = sqliteTable(
  'inventory_adjustments',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    previousQuantity: integer('previous_quantity').notNull(),
    nextQuantity: integer('next_quantity').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_inventory_adjustments_product_created').on(
      table.productId,
      table.createdAt,
    ),
    index('idx_inventory_adjustments_seller_created').on(
      table.sellerId,
      table.createdAt,
    ),
    check(
      'inventory_adjustments_quantities_non_negative',
      sql`${table.previousQuantity} >= 0 AND ${table.nextQuantity} >= 0`,
    ),
  ],
);

export const productReviews = sqliteTable(
  'product_reviews',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body').notNull(),
    status: text('status', {
      enum: ['pending', 'published', 'rejected', 'hidden'],
    })
      .notNull()
      .default('pending'),
    moderationNote: text('moderation_note'),
    moderatedBy: text('moderated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_product_reviews_order_item_unique').on(table.orderItemId),
    index('idx_product_reviews_public').on(
      table.productId,
      table.status,
      table.createdAt,
    ),
    index('idx_product_reviews_moderation_queue').on(
      table.status,
      table.createdAt,
    ),
    check(
      'product_reviews_rating_valid',
      sql`${table.rating} >= 1 AND ${table.rating} <= 5`,
    ),
  ],
);

export const addresses = sqliteTable(
  'addresses',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    recipientName: text('recipient_name').notNull(),
    phone: text('phone').notNull(),
    province: text('province').notNull(),
    district: text('district').notNull(),
    municipality: text('municipality').notNull(),
    ward: text('ward'),
    locality: text('locality').notNull(),
    landmark: text('landmark'),
    postalCode: text('postal_code'),
    isDefault: integer('is_default', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('idx_addresses_user_default').on(table.userId, table.isDefault),
  ],
);

export const wishlistItems = sqliteTable(
  'wishlist_items',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.productId] }),
    index('idx_wishlist_items_user_created').on(table.userId, table.createdAt),
  ],
);

export const carts = sqliteTable(
  'carts',
  {
    id: id(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    anonymousTokenHash: text('anonymous_token_hash'),
    currency: text('currency').notNull().default('NPR'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_carts_user_unique').on(table.userId),
    uniqueIndex('idx_carts_anonymous_token_unique').on(
      table.anonymousTokenHash,
    ),
  ],
);

export const cartItems = sqliteTable(
  'cart_items',
  {
    id: id(),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_cart_items_cart_product_unique').on(
      table.cartId,
      table.productId,
    ),
    check('cart_items_quantity_positive', sql`${table.quantity} > 0`),
  ],
);

export const policyVersions = sqliteTable(
  'policy_versions',
  {
    id: id(),
    policyKey: text('policy_key').notNull(),
    version: text('version').notNull(),
    documentJson: text('document_json').notNull(),
    effectiveFrom: timestamp('effective_from').notNull(),
    effectiveUntil: timestamp('effective_until'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    approvedBy: text('approved_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_policy_versions_key_version_unique').on(
      table.policyKey,
      table.version,
    ),
    index('idx_policy_versions_effective').on(
      table.policyKey,
      table.effectiveFrom,
    ),
  ],
);

export const orders = sqliteTable(
  'orders',
  {
    id: id(),
    orderNumber: text('order_number').notNull(),
    receiptTokenHash: text('receipt_token_hash'),
    operationRequestId: text('operation_request_id'),
    customerId: text('customer_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    customerEmail: text('customer_email').notNull(),
    customerPhone: text('customer_phone').notNull(),
    status: text('status', {
      enum: [
        'pending_payment',
        'confirmed',
        'packing',
        'ready_for_pickup',
        'dispatched',
        'delivered',
        'cancelled',
        'return_requested',
        'return_in_transit',
        'returned',
        'refund_processing',
        'refunded',
      ],
    }).notNull(),
    locale: text('locale', { enum: ['en-NP', 'ne-NP'] }).notNull(),
    currency: text('currency').notNull().default('NPR'),
    policyVersion: text('policy_version').notNull(),
    returnPolicySnapshotJson: text('return_policy_snapshot_json')
      .notNull()
      .default(
        '{"generalRequestWindowDays":7,"deliveryDamageEvidenceWindowHours":48,"changeOfMindEnabled":true,"highValueRefundThresholdPaisa":1000000,"refundInitiationBusinessDays":2,"codRefundEstimateBusinessDays":[3,7]}',
      ),
    shippingAddressJson: text('shipping_address_json').notNull(),
    itemSubtotalPaisa: integer('item_subtotal_paisa').notNull(),
    sellerDiscountPaisa: integer('seller_discount_paisa').notNull().default(0),
    deliveryChargePaisa: integer('delivery_charge_paisa').notNull(),
    buyerPlatformFeePaisa: integer('buyer_platform_fee_paisa')
      .notNull()
      .default(0),
    taxTotalPaisa: integer('tax_total_paisa').notNull().default(0),
    grandTotalPaisa: integer('grand_total_paisa').notNull(),
    paymentMode: text('payment_mode', { enum: ['cod', 'prepaid'] }).notNull(),
    paymentStatus: text('payment_status', {
      enum: [
        'pending',
        'authorised',
        'paid',
        'failed',
        'cancelled',
        'refunded',
        'part_refunded',
      ],
    }).notNull(),
    placedAt: timestamp('placed_at'),
    deliveredAt: timestamp('delivered_at'),
    cancelledAt: timestamp('cancelled_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_orders_order_number_unique').on(table.orderNumber),
    uniqueIndex('idx_orders_receipt_token_unique').on(table.receiptTokenHash),
    index('idx_orders_customer_created').on(table.customerId, table.createdAt),
    index('idx_orders_status_created').on(table.status, table.createdAt),
    check(
      'orders_money_non_negative',
      sql`${table.itemSubtotalPaisa} >= 0 AND ${table.sellerDiscountPaisa} >= 0 AND ${table.deliveryChargePaisa} >= 0 AND ${table.buyerPlatformFeePaisa} >= 0 AND ${table.taxTotalPaisa} >= 0 AND ${table.grandTotalPaisa} >= 0`,
    ),
  ],
);

export const orderStatusEvents = sqliteTable(
  'order_status_events',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    note: text('note').notNull(),
    actorId: text('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requestId: text('request_id'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_order_status_events_order_created').on(
      table.orderId,
      table.createdAt,
    ),
    uniqueIndex('idx_order_status_events_request_unique').on(table.requestId),
  ],
);

export const orderItems = sqliteTable(
  'order_items',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    sellerNameSnapshot: text('seller_name_snapshot').notNull(),
    productNameSnapshot: text('product_name_snapshot').notNull(),
    skuSnapshot: text('sku_snapshot').notNull(),
    unitPricePaisa: integer('unit_price_paisa').notNull(),
    quantity: integer('quantity').notNull(),
    sellerDiscountPaisa: integer('seller_discount_paisa').notNull().default(0),
    commissionBps: integer('commission_bps').notNull(),
    commissionPaisa: integer('commission_paisa').notNull(),
    taxPaisa: integer('tax_paisa').notNull().default(0),
    lineTotalPaisa: integer('line_total_paisa').notNull(),
    returnEligibleSnapshot: integer('return_eligible_snapshot', {
      mode: 'boolean',
    })
      .notNull()
      .default(true),
    fulfillmentStatus: text('fulfillment_status', {
      enum: [
        'confirmed',
        'packing',
        'ready_for_pickup',
        'dispatched',
        'delivered',
        'cancelled',
      ],
    })
      .notNull()
      .default('confirmed'),
    fulfillmentRequestId: text('fulfillment_request_id'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_order_items_order').on(table.orderId),
    index('idx_order_items_seller').on(table.sellerId, table.createdAt),
    index('idx_order_items_seller_order').on(table.sellerId, table.orderId),
    check('order_items_quantity_positive', sql`${table.quantity} > 0`),
    check(
      'order_items_commission_valid',
      sql`${table.commissionBps} >= 0 AND ${table.commissionBps} <= 10000`,
    ),
  ],
);

export const orderItemStatusEvents = sqliteTable(
  'order_item_status_events',
  {
    id: id(),
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    note: text('note').notNull(),
    actorId: text('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_order_item_status_events_item_created').on(
      table.orderItemId,
      table.createdAt,
    ),
    uniqueIndex('idx_order_item_status_events_request_item_unique').on(
      table.requestId,
      table.orderItemId,
    ),
  ],
);

export const payments = sqliteTable(
  'payments',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    providerReference: text('provider_reference'),
    method: text('method', {
      enum: ['cod', 'wallet', 'card', 'bank'],
    }).notNull(),
    status: text('status', {
      enum: [
        'pending',
        'authorised',
        'captured',
        'failed',
        'cancelled',
        'refunded',
      ],
    }).notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    currency: text('currency').notNull().default('NPR'),
    idempotencyKey: text('idempotency_key').notNull(),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_payments_idempotency_unique').on(table.idempotencyKey),
    uniqueIndex('idx_payments_provider_reference_unique').on(
      table.provider,
      table.providerReference,
    ),
    index('idx_payments_order_created').on(table.orderId, table.createdAt),
    check('payments_amount_non_negative', sql`${table.amountPaisa} >= 0`),
  ],
);

export const shipments = sqliteTable(
  'shipments',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    providerShipmentId: text('provider_shipment_id'),
    trackingCode: text('tracking_code'),
    status: text('status', {
      enum: [
        'pending',
        'pickup_scheduled',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'delivery_failed',
        'return_to_origin',
        'returned',
        'cancelled',
      ],
    }).notNull(),
    paymentMode: text('payment_mode', { enum: ['cod', 'prepaid'] }).notNull(),
    codAmountPaisa: integer('cod_amount_paisa'),
    deliveryChargePaisa: integer('delivery_charge_paisa').notNull(),
    estimatedMinDays: integer('estimated_min_days').notNull(),
    estimatedMaxDays: integer('estimated_max_days').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_shipments_provider_id_unique').on(
      table.provider,
      table.providerShipmentId,
    ),
    index('idx_shipments_order').on(table.orderId),
    index('idx_shipments_tracking').on(table.trackingCode),
  ],
);

export const shipmentEvents = sqliteTable(
  'shipment_events',
  {
    id: id(),
    shipmentId: text('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    providerEventId: text('provider_event_id'),
    status: text('status').notNull(),
    location: text('location'),
    note: text('note'),
    occurredAt: timestamp('occurred_at').notNull(),
    receivedAt: timestamp('received_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_shipment_events_provider_event_unique').on(
      table.shipmentId,
      table.providerEventId,
    ),
    index('idx_shipment_events_timeline').on(
      table.shipmentId,
      table.occurredAt,
    ),
  ],
);

export const returnRequests = sqliteTable(
  'return_requests',
  {
    id: id(),
    referenceNumber: text('reference_number'),
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    requestedBy: text('requested_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason', {
      enum: [
        'damaged',
        'defective',
        'wrong_item',
        'not_as_described',
        'counterfeit',
        'late_delivery',
        'change_of_mind',
        'other',
      ],
    }).notNull(),
    detail: text('detail').notNull(),
    locale: text('locale', { enum: ['en-NP', 'ne-NP'] })
      .notNull()
      .default('en-NP'),
    quantity: integer('quantity').notNull().default(1),
    requestedResolution: text('requested_resolution', {
      enum: ['refund', 'replacement'],
    })
      .notNull()
      .default('refund'),
    status: text('status', {
      enum: [
        'requested',
        'under_investigation',
        'needs_customer_changes',
        'pending_high_value_approval',
        'approved',
        'rejected',
        'in_transit',
        'received',
        'resolved',
      ],
    }).notNull(),
    responsibility: text('responsibility', {
      enum: ['buyer', 'seller', 'carrier', 'platform', 'undetermined'],
    })
      .notNull()
      .default('undetermined'),
    eligibilityDecision: text('eligibility_decision', {
      enum: ['eligible', 'ineligible', 'manual_review'],
    })
      .notNull()
      .default('manual_review'),
    eligibilityReasonEn: text('eligibility_reason_en')
      .notNull()
      .default('Pending review'),
    eligibilityReasonNe: text('eligibility_reason_ne')
      .notNull()
      .default('समीक्षा बाँकी'),
    policySnapshotJson: text('policy_snapshot_json').notNull().default('{}'),
    sellerRecommendation: text('seller_recommendation', {
      enum: ['accept', 'contest', 'request_information'],
    }),
    sellerResponse: text('seller_response'),
    sellerResponseLocale: text('seller_response_locale', {
      enum: ['en-NP', 'ne-NP'],
    }),
    sellerRespondedBy: text('seller_responded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sellerRespondedAt: timestamp('seller_responded_at'),
    investigationSummary: text('investigation_summary'),
    resolutionOutcome: text('resolution_outcome', {
      enum: ['refund', 'replacement', 'return_to_origin', 'no_action'],
    }),
    returnShipmentReference: text('return_shipment_reference'),
    createdRequestId: text('created_request_id'),
    operationRequestId: text('operation_request_id'),
    requestedAt: timestamp('requested_at').notNull(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`0`),
    resolvedAt: timestamp('resolved_at'),
    reviewedBy: text('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('idx_return_requests_reference_unique').on(
      table.referenceNumber,
    ),
    index('idx_return_requests_item').on(table.orderItemId, table.requestedAt),
    uniqueIndex('idx_return_requests_created_request_unique').on(
      table.createdRequestId,
    ),
    index('idx_return_requests_status').on(table.status, table.requestedAt),
    check('return_requests_quantity_positive', sql`${table.quantity} > 0`),
  ],
);

export const returnEvidence = sqliteTable(
  'return_evidence',
  {
    id: id(),
    returnRequestId: text('return_request_id')
      .notNull()
      .references(() => returnRequests.id, { onDelete: 'restrict' }),
    objectKey: text('object_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedByType: text('uploaded_by_type', {
      enum: ['customer', 'seller', 'staff'],
    }).notNull(),
    uploadedBy: text('uploaded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_return_evidence_object_key_unique').on(table.objectKey),
    index('idx_return_evidence_request_created').on(
      table.returnRequestId,
      table.createdAt,
    ),
    check('return_evidence_size_positive', sql`${table.sizeBytes} > 0`),
  ],
);

export const returnRequestEvents = sqliteTable(
  'return_request_events',
  {
    id: id(),
    returnRequestId: text('return_request_id')
      .notNull()
      .references(() => returnRequests.id, { onDelete: 'restrict' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    action: text('action').notNull(),
    actorId: text('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorType: text('actor_type', {
      enum: ['customer', 'seller', 'admin', 'super_admin', 'system'],
    }).notNull(),
    publicMessageEn: text('public_message_en').notNull(),
    publicMessageNe: text('public_message_ne').notNull(),
    internalNote: text('internal_note'),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_return_events_request_created').on(
      table.returnRequestId,
      table.createdAt,
    ),
    uniqueIndex('idx_return_events_request_id_unique').on(table.requestId),
  ],
);

export const refunds = sqliteTable(
  'refunds',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    returnRequestId: text('return_request_id').references(
      () => returnRequests.id,
      {
        onDelete: 'set null',
      },
    ),
    paymentId: text('payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    status: text('status', {
      enum: [
        'requested',
        'pending_high_value_approval',
        'approved',
        'processing',
        'paid',
        'failed',
        'rejected',
      ],
    }).notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    itemAmountPaisa: integer('item_amount_paisa'),
    deliveryAmountPaisa: integer('delivery_amount_paisa').notNull().default(0),
    reason: text('reason').notNull(),
    requestedBy: text('requested_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedBy: text('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    highValueApprovedBy: text('high_value_approved_by').references(
      () => users.id,
      {
        onDelete: 'set null',
      },
    ),
    processedBy: text('processed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    liability: text('liability', {
      enum: ['buyer', 'seller', 'carrier', 'platform', 'shared'],
    })
      .notNull()
      .default('platform'),
    isHighValue: integer('is_high_value', { mode: 'boolean' })
      .notNull()
      .default(false),
    operationRequestId: text('operation_request_id'),
    providerReference: text('provider_reference'),
    requestedAt: timestamp('requested_at').notNull(),
    approvedAt: timestamp('approved_at'),
    processedAt: timestamp('processed_at'),
  },
  (table) => [
    index('idx_refunds_order').on(table.orderId),
    index('idx_refunds_status_requested').on(table.status, table.requestedAt),
    uniqueIndex('idx_refunds_return_request_unique').on(table.returnRequestId),
    check('refunds_amount_positive', sql`${table.amountPaisa} > 0`),
    check(
      'refunds_components_valid',
      sql`${table.itemAmountPaisa} IS NULL OR (${table.itemAmountPaisa} >= 0 AND ${table.deliveryAmountPaisa} >= 0 AND ${table.itemAmountPaisa} + ${table.deliveryAmountPaisa} = ${table.amountPaisa})`,
    ),
    check(
      'refunds_high_value_maker_checker',
      sql`${table.highValueApprovedBy} IS NULL OR ${table.approvedBy} IS NULL OR ${table.highValueApprovedBy} != ${table.approvedBy}`,
    ),
  ],
);

export const refundLiabilityEntries = sqliteTable(
  'refund_liability_entries',
  {
    id: id(),
    refundId: text('refund_id')
      .notNull()
      .references(() => refunds.id, { onDelete: 'restrict' }),
    sellerId: text('seller_id').references(() => sellerProfiles.id, {
      onDelete: 'restrict',
    }),
    party: text('party', {
      enum: ['buyer', 'seller', 'carrier', 'platform'],
    }).notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_refund_liability_refund').on(table.refundId),
    index('idx_refund_liability_seller').on(table.sellerId, table.createdAt),
    check('refund_liability_amount_positive', sql`${table.amountPaisa} > 0`),
  ],
);

export const returnOutcomes = sqliteTable(
  'return_outcomes',
  {
    id: id(),
    returnRequestId: text('return_request_id')
      .notNull()
      .references(() => returnRequests.id, { onDelete: 'restrict' }),
    outcome: text('outcome', {
      enum: ['refund', 'replacement', 'return_to_origin'],
    }).notNull(),
    refundId: text('refund_id').references(() => refunds.id, {
      onDelete: 'restrict',
    }),
    replacementReference: text('replacement_reference'),
    returnShipmentReference: text('return_shipment_reference'),
    restockQuantity: integer('restock_quantity').notNull().default(0),
    noteEn: text('note_en').notNull(),
    noteNe: text('note_ne').notNull(),
    resolvedBy: text('resolved_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_return_outcomes_request_unique').on(table.returnRequestId),
    uniqueIndex('idx_return_outcomes_request_id_unique').on(table.requestId),
    check(
      'return_outcomes_restock_non_negative',
      sql`${table.restockQuantity} >= 0`,
    ),
  ],
);

export const sellerLedgerEntries = sqliteTable(
  'seller_ledger_entries',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    orderItemId: text('order_item_id').references(() => orderItems.id, {
      onDelete: 'restrict',
    }),
    refundId: text('refund_id').references(() => refunds.id, {
      onDelete: 'restrict',
    }),
    payoutId: text('payout_id').references((): AnySQLiteColumn => payouts.id, {
      onDelete: 'restrict',
    }),
    type: text('type', {
      enum: [
        'sale',
        'commission',
        'reserve_hold',
        'reserve_release',
        'refund',
        'shipping_charge',
        'adjustment',
        'payout',
        'payout_reversal',
      ],
    }).notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    availableAt: timestamp('available_at'),
    description: text('description').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_seller_ledger_balance').on(table.sellerId, table.availableAt),
    index('idx_seller_ledger_order_item').on(table.orderItemId),
    uniqueIndex('idx_seller_ledger_refund_unique').on(table.refundId),
    uniqueIndex('idx_seller_ledger_payout_unique').on(table.payoutId),
    uniqueIndex('idx_seller_ledger_order_item_type_unique')
      .on(table.orderItemId, table.type)
      .where(
        sql`${table.orderItemId} IS NOT NULL AND ${table.type} IN ('sale', 'commission', 'reserve_hold', 'reserve_release')`,
      ),
  ],
);

export const payouts = sqliteTable(
  'payouts',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    payoutNumber: text('payout_number').notNull(),
    status: text('status', {
      enum: [
        'prepared',
        'approved',
        'processing',
        'paid',
        'failed',
        'rejected',
        'reversed',
        'scheduled',
      ],
    }).notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    destinationReference: text('destination_reference').notNull(),
    preparedBy: text('prepared_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    approvedBy: text('approved_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    processedBy: text('processed_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    providerReference: text('provider_reference'),
    note: text('note'),
    periodStart: timestamp('period_start'),
    periodEnd: timestamp('period_end'),
    scheduledFor: timestamp('scheduled_for').notNull(),
    approvedAt: timestamp('approved_at'),
    processedAt: timestamp('processed_at'),
    paidAt: timestamp('paid_at'),
    failedAt: timestamp('failed_at'),
    failureReason: text('failure_reason'),
    createdRequestId: text('created_request_id'),
    operationRequestId: text('operation_request_id'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_payouts_number_unique').on(table.payoutNumber),
    uniqueIndex('idx_payouts_created_request_unique').on(
      table.createdRequestId,
    ),
    index('idx_payouts_seller_status').on(table.sellerId, table.status),
    index('idx_payouts_status_scheduled').on(table.status, table.scheduledFor),
    check('payouts_amount_positive', sql`${table.amountPaisa} > 0`),
    check(
      'payouts_maker_checker',
      sql`${table.approvedBy} IS NULL OR ${table.approvedBy} != ${table.preparedBy}`,
    ),
  ],
);

export const payoutRequests = sqliteTable(
  'payout_requests',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    status: text('status', { enum: ['submitted', 'prepared', 'rejected'] })
      .notNull()
      .default('submitted'),
    sellerNote: text('seller_note').notNull(),
    availableAmountSnapshotPaisa: integer(
      'available_amount_snapshot_paisa',
    ).notNull(),
    payoutId: text('payout_id').references(() => payouts.id, {
      onDelete: 'restrict',
    }),
    processedBy: text('processed_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    processingNote: text('processing_note'),
    createdRequestId: text('created_request_id').notNull(),
    operationRequestId: text('operation_request_id'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_payout_requests_created_unique').on(
      table.createdRequestId,
    ),
    index('idx_payout_requests_seller_status').on(table.sellerId, table.status),
    index('idx_payout_requests_queue').on(table.status, table.createdAt),
  ],
);

export const payoutEvents = sqliteTable(
  'payout_events',
  {
    id: id(),
    payoutId: text('payout_id')
      .notNull()
      .references(() => payouts.id, { onDelete: 'restrict' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    action: text('action').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    actorType: text('actor_type', { enum: ['admin', 'super_admin'] }).notNull(),
    note: text('note').notNull(),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_payout_events_payout_created').on(
      table.payoutId,
      table.createdAt,
    ),
    uniqueIndex('idx_payout_events_request_unique').on(table.requestId),
  ],
);

export const payoutEntries = sqliteTable(
  'payout_entries',
  {
    payoutId: text('payout_id')
      .notNull()
      .references(() => payouts.id, { onDelete: 'restrict' }),
    ledgerEntryId: text('ledger_entry_id')
      .notNull()
      .references(() => sellerLedgerEntries.id, { onDelete: 'restrict' }),
    releasedAt: timestamp('released_at'),
    releaseReason: text('release_reason'),
  },
  (table) => [
    primaryKey({ columns: [table.payoutId, table.ledgerEntryId] }),
    uniqueIndex('idx_payout_entries_active_ledger_unique')
      .on(table.ledgerEntryId)
      .where(sql`${table.releasedAt} IS NULL`),
  ],
);

export const moderationEvents = sqliteTable(
  'moderation_events',
  {
    id: id(),
    subjectType: text('subject_type', {
      enum: ['seller', 'product'],
    }).notNull(),
    subjectId: text('subject_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    reason: text('reason').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_moderation_events_subject').on(
      table.subjectType,
      table.subjectId,
      table.createdAt,
    ),
  ],
);

export const complaints = sqliteTable(
  'complaints',
  {
    id: id(),
    referenceNumber: text('reference_number').notNull(),
    customerId: text('customer_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    orderId: text('order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),
    orderItemId: text('order_item_id').references(() => orderItems.id, {
      onDelete: 'set null',
    }),
    sellerId: text('seller_id').references(() => sellerProfiles.id, {
      onDelete: 'set null',
    }),
    category: text('category').notNull(),
    subject: text('subject').notNull(),
    detail: text('detail').notNull(),
    locale: text('locale', { enum: ['en-NP', 'ne-NP'] })
      .notNull()
      .default('en-NP'),
    priority: text('priority', { enum: ['normal', 'high', 'urgent'] })
      .notNull()
      .default('normal'),
    status: text('status', {
      enum: [
        'open',
        'assigned',
        'investigating',
        'waiting_customer',
        'escalated',
        'resolved',
        'closed',
      ],
    }).notNull(),
    assignedTo: text('assigned_to').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolution: text('resolution'),
    resolutionNe: text('resolution_ne'),
    sellerResponse: text('seller_response'),
    sellerRespondedBy: text('seller_responded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sellerRespondedAt: timestamp('seller_responded_at'),
    escalationReason: text('escalation_reason'),
    escalatedTo: text('escalated_to').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAt: timestamp('assigned_at'),
    createdRequestId: text('created_request_id'),
    operationRequestId: text('operation_request_id'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    resolvedAt: timestamp('resolved_at'),
  },
  (table) => [
    uniqueIndex('idx_complaints_reference_unique').on(table.referenceNumber),
    uniqueIndex('idx_complaints_created_request_unique').on(
      table.createdRequestId,
    ),
    index('idx_complaints_queue').on(table.status, table.createdAt),
    index('idx_complaints_order').on(table.orderId),
    index('idx_complaints_seller_queue').on(table.sellerId, table.status),
  ],
);

export const complaintEvents = sqliteTable(
  'complaint_events',
  {
    id: id(),
    complaintId: text('complaint_id')
      .notNull()
      .references(() => complaints.id, { onDelete: 'restrict' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    action: text('action').notNull(),
    actorId: text('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorType: text('actor_type', {
      enum: ['customer', 'seller', 'admin', 'super_admin', 'system'],
    }).notNull(),
    publicMessageEn: text('public_message_en').notNull(),
    publicMessageNe: text('public_message_ne').notNull(),
    internalNote: text('internal_note'),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_complaint_events_case_created').on(
      table.complaintId,
      table.createdAt,
    ),
    uniqueIndex('idx_complaint_events_request_id_unique').on(table.requestId),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: id(),
    actorId: text('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id'),
    reason: text('reason'),
    previousJson: text('previous_json'),
    nextJson: text('next_json'),
    requestId: text('request_id'),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_audit_logs_subject').on(
      table.subjectType,
      table.subjectId,
      table.createdAt,
    ),
    index('idx_audit_logs_actor').on(table.actorId, table.createdAt),
  ],
);

export const notificationMessages = sqliteTable(
  'notification_messages',
  {
    id: id(),
    recipientUserId: text('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    audienceRole: text('audience_role', {
      enum: ['customer', 'seller', 'staff'],
    }).notNull(),
    channel: text('channel', { enum: ['in_app', 'email', 'sms'] }).notNull(),
    templateKey: text('template_key').notNull(),
    subjectEn: text('subject_en').notNull(),
    subjectNe: text('subject_ne').notNull(),
    bodyEn: text('body_en').notNull(),
    bodyNe: text('body_ne').notNull(),
    relatedType: text('related_type'),
    relatedId: text('related_id'),
    status: text('status', {
      enum: ['queued', 'sent', 'failed', 'read', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    providerReference: text('provider_reference'),
    failureReason: text('failure_reason'),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
    sentAt: timestamp('sent_at'),
    readAt: timestamp('read_at'),
  },
  (table) => [
    uniqueIndex('idx_notification_messages_request_unique').on(table.requestId),
    index('idx_notification_messages_recipient_created').on(
      table.recipientUserId,
      table.createdAt,
    ),
    index('idx_notification_messages_delivery_queue').on(
      table.channel,
      table.status,
      table.createdAt,
    ),
  ],
);

export const shippingJobs = sqliteTable(
  'shipping_jobs',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    direction: text('direction', { enum: ['outbound', 'return'] }).notNull(),
    status: text('status', {
      enum: [
        'label_pending',
        'label_ready',
        'pickup_requested',
        'pickup_scheduled',
        'picked_up',
        'in_transit',
        'delivered',
        'claim_open',
        'claim_resolved',
        'cancelled',
      ],
    }).notNull(),
    carrier: text('carrier').notNull().default('nepal_can_move_manual'),
    labelReference: text('label_reference'),
    trackingCode: text('tracking_code'),
    pickupWindowStart: timestamp('pickup_window_start'),
    pickupWindowEnd: timestamp('pickup_window_end'),
    claimReference: text('claim_reference'),
    reconciliationStatus: text('reconciliation_status', {
      enum: ['unreconciled', 'matched', 'variance', 'resolved'],
    })
      .notNull()
      .default('unreconciled'),
    reconciliationNote: text('reconciliation_note'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdRequestId: text('created_request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_shipping_jobs_order_seller_direction_unique').on(
      table.orderId,
      table.sellerId,
      table.direction,
    ),
    uniqueIndex('idx_shipping_jobs_created_request_unique').on(
      table.createdRequestId,
    ),
    index('idx_shipping_jobs_seller_status').on(table.sellerId, table.status),
    index('idx_shipping_jobs_reconciliation').on(
      table.reconciliationStatus,
      table.updatedAt,
    ),
  ],
);

export const shippingJobEvents = sqliteTable(
  'shipping_job_events',
  {
    id: id(),
    shippingJobId: text('shipping_job_id')
      .notNull()
      .references(() => shippingJobs.id, { onDelete: 'restrict' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    action: text('action').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    actorRole: text('actor_role', {
      enum: ['seller', 'admin', 'super_admin'],
    }).notNull(),
    note: text('note').notNull(),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_shipping_job_events_request_unique').on(table.requestId),
    index('idx_shipping_job_events_job_created').on(
      table.shippingJobId,
      table.createdAt,
    ),
  ],
);

export const prohibitedProductRules = sqliteTable(
  'prohibited_product_rules',
  {
    id: id(),
    code: text('code').notNull(),
    titleEn: text('title_en').notNull(),
    titleNe: text('title_ne').notNull(),
    descriptionEn: text('description_en').notNull(),
    descriptionNe: text('description_ne').notNull(),
    severity: text('severity', {
      enum: ['restricted', 'prohibited'],
    }).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_prohibited_product_rules_code_unique').on(table.code),
    index('idx_prohibited_product_rules_active').on(
      table.isActive,
      table.severity,
    ),
  ],
);

export const promotions = sqliteTable(
  'promotions',
  {
    id: id(),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne').notNull(),
    status: text('status', {
      enum: [
        'draft',
        'pending_approval',
        'active',
        'paused',
        'ended',
        'rejected',
      ],
    })
      .notNull()
      .default('draft'),
    placement: text('placement', { enum: ['homepage', 'shop'] }).notNull(),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    approvedBy: text('approved_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    note: text('note').notNull(),
    createdRequestId: text('created_request_id').notNull(),
    operationRequestId: text('operation_request_id'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_promotions_created_request_unique').on(
      table.createdRequestId,
    ),
    index('idx_promotions_status_window').on(
      table.status,
      table.startsAt,
      table.endsAt,
    ),
    check('promotions_window_valid', sql`${table.endsAt} > ${table.startsAt}`),
    check(
      'promotions_maker_checker',
      sql`${table.approvedBy} IS NULL OR ${table.approvedBy} != ${table.createdBy}`,
    ),
  ],
);

export const promotionProducts = sqliteTable(
  'promotion_products',
  {
    promotionId: text('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.promotionId, table.productId] }),
    index('idx_promotion_products_product').on(table.productId),
  ],
);

export const dataRightsRequests = sqliteTable(
  'data_rights_requests',
  {
    id: id(),
    referenceNumber: text('reference_number').notNull(),
    customerId: text('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestType: text('request_type', {
      enum: ['access', 'correction', 'deletion', 'retention_objection'],
    }).notNull(),
    detail: text('detail').notNull(),
    status: text('status', {
      enum: [
        'submitted',
        'assigned',
        'needs_information',
        'approved',
        'rejected',
        'completed',
      ],
    })
      .notNull()
      .default('submitted'),
    assignedTo: text('assigned_to').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolution: text('resolution'),
    createdRequestId: text('created_request_id').notNull(),
    operationRequestId: text('operation_request_id'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    uniqueIndex('idx_data_rights_reference_unique').on(table.referenceNumber),
    uniqueIndex('idx_data_rights_created_request_unique').on(
      table.createdRequestId,
    ),
    index('idx_data_rights_queue').on(table.status, table.createdAt),
  ],
);

export const dataRightsEvents = sqliteTable(
  'data_rights_events',
  {
    id: id(),
    requestId: text('data_rights_request_id')
      .notNull()
      .references(() => dataRightsRequests.id, { onDelete: 'restrict' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    action: text('action').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    actorRole: text('actor_role', {
      enum: ['customer', 'admin', 'super_admin'],
    }).notNull(),
    note: text('note').notNull(),
    operationRequestId: text('operation_request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_data_rights_events_operation_unique').on(
      table.operationRequestId,
    ),
    index('idx_data_rights_events_request_created').on(
      table.requestId,
      table.createdAt,
    ),
  ],
);

export const operationalIncidents = sqliteTable(
  'operational_incidents',
  {
    id: id(),
    referenceNumber: text('reference_number').notNull(),
    severity: text('severity', {
      enum: ['low', 'medium', 'high', 'critical'],
    }).notNull(),
    status: text('status', {
      enum: ['open', 'mitigating', 'monitoring', 'resolved'],
    }).notNull(),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    resolution: text('resolution'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    resolvedAt: timestamp('resolved_at'),
  },
  (table) => [
    uniqueIndex('idx_operational_incidents_reference_unique').on(
      table.referenceNumber,
    ),
    uniqueIndex('idx_operational_incidents_request_unique').on(table.requestId),
    index('idx_operational_incidents_status_severity').on(
      table.status,
      table.severity,
    ),
  ],
);

export const backupVerifications = sqliteTable(
  'backup_verifications',
  {
    id: id(),
    scope: text('scope', { enum: ['d1', 'r2', 'full'] }).notNull(),
    status: text('status', { enum: ['verified', 'failed'] }).notNull(),
    evidenceReference: text('evidence_reference').notNull(),
    note: text('note').notNull(),
    verifiedBy: text('verified_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestId: text('request_id').notNull(),
    verifiedAt: timestamp('verified_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_backup_verifications_request_unique').on(table.requestId),
    index('idx_backup_verifications_verified_at').on(table.verifiedAt),
  ],
);
