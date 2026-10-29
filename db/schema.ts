import { sql } from 'drizzle-orm';
import {
  AnySQLiteColumn,
  check,
  foreignKey,
  index,
  integer,
  real,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const id = (name = 'id') => text(name).primaryKey();
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

// Private registration progress is durable across devices and hosting transfers.
export const sellerApplicationDrafts = sqliteTable('seller_application_drafts', {
  userId: text('user_id').primaryKey().references(() => users.id),
  revision: text('revision').notNull(), attemptId: text('attempt_id').notNull(), formVersion: integer('form_version').notNull(),
  answersJson: text('answers_json').notNull(), filesJson: text('files_json').notNull(),
  updatedAt: timestamp('updated_at').notNull(), expiresAt: timestamp('expires_at').notNull(),
}, table => [index('seller_application_drafts_expiry').on(table.expiresAt)]);
export const sellerApplicationDraftUploads = sqliteTable('seller_application_draft_uploads', {
  id: id(), userId: text('user_id').notNull().references(() => users.id), objectKey: text('object_key').notNull().unique(),
  status: text('status', { enum: ['uploading', 'ready', 'deleting'] }).notNull(), expiresAt: timestamp('expires_at').notNull(),
}, table => [index('seller_application_draft_uploads_expiry').on(table.status, table.expiresAt),
  check('seller_application_draft_uploads_status', sql`${table.status} IN ('uploading','ready','deleting')`)]);
export const sellerRegistrationIntakes = sqliteTable('seller_registration_intakes', {
  sellerId: text('seller_id').primaryKey().references(() => sellerProfiles.id),
  userId: text('user_id').notNull().unique().references(() => users.id), version: integer('version').notNull(),
  answersJson: text('answers_json').notNull(), documentsJson: text('documents_json').notNull(),
  reviewReady: integer('review_ready', { mode: 'boolean' }).notNull(), updatedAt: timestamp('updated_at').notNull(),
}, table => [check('seller_registration_intakes_ready', sql`${table.reviewReady} IN (0,1)`)]);

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
    taxMode: text('tax_mode', {
      enum: ['PAN', 'VAT', 'BOTH', 'NONE'],
    }).notNull(),
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
    settlementTermsReference: text('settlement_terms_reference'),
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

export const sellerRestrictions = sqliteTable(
  'seller_restrictions',
  {
    sellerId: text('seller_id')
      .primaryKey()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    mode: text('mode', { enum: ['active', 'suspended', 'disabled'] }).notNull(),
    suspendedUntil: timestamp('suspended_until'),
    obligationMode: text('obligation_mode', {
      enum: ['allow_existing', 'admin_review', 'stop_fulfillment'],
    }).notNull(),
    reasonCode: text('reason_code').notNull(),
    privateReason: text('private_reason').notNull(),
    version: integer('version').notNull().default(1),
    appliedBy: text('applied_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    appliedAt: timestamp('applied_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('idx_seller_restrictions_mode_until').on(
      table.mode,
      table.suspendedUntil,
    ),
  ],
);

export const sellerRestrictionEvents = sqliteTable(
  'seller_restriction_events',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    fromMode: text('from_mode').notNull(),
    toMode: text('to_mode').notNull(),
    suspendedUntil: timestamp('suspended_until'),
    obligationMode: text('obligation_mode').notNull(),
    reasonCode: text('reason_code').notNull(),
    privateReason: text('private_reason').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_seller_restriction_events_request').on(table.requestId),
    index('idx_seller_restriction_events_seller').on(
      table.sellerId,
      table.createdAt,
    ),
  ],
);

export const sellerDeletionPreflights = sqliteTable(
  'seller_deletion_preflights',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    status: text('status', {
      enum: ['blocked', 'awaiting_retention_policy'],
    }).notNull(),
    outstandingJson: text('outstanding_json').notNull(),
    retentionCategoriesJson: text('retention_categories_json').notNull(),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_seller_deletion_preflight_request').on(table.requestId),
    index('idx_seller_deletion_preflight_seller').on(
      table.sellerId,
      table.createdAt,
    ),
  ],
);

export const sellerParticipationProfiles = sqliteTable(
  'seller_participation_profiles',
  {
    sellerId: text('seller_id')
      .primaryKey()
      .references(() => sellerProfiles.id, { onDelete: 'cascade' }),
    participationRoute: text('participation_route', {
      enum: ['registered_seller', 'managed_maker'],
    }).notNull(),
    applicationStage: text('application_stage', {
      enum: [
        'draft',
        'submitted',
        'under_review',
        'changes_requested',
        'approved_for_activation',
        'active',
        'rejected',
        'suspended',
      ],
    }).notNull(),
    taxStatus: text('tax_status', {
      enum: ['business_pan_only', 'vat_registered'],
    }),
    publicName: text('public_name').notNull(),
    publicCity: text('public_city').notNull(),
    craftExperienceJson: text('craft_experience_json').notNull().default('[]'),
    socialLinksJson: text('social_links_json').notNull().default('{}'),
    commercialModel: text('commercial_model', {
      enum: [
        'managed_sale_linked_percentage_v1',
        'managed_fixed_supplier_price_v1',
      ],
    }),
    legalSellerReference: text('legal_seller_reference'),
    invoiceIssuerReference: text('invoice_issuer_reference'),
    payoutBeneficiaryReference: text('payout_beneficiary_reference'),
    managedAgreementVersion: text('managed_agreement_version'),
    managedAgreementLanguage: text('managed_agreement_language', {
      enum: ['en', 'ne'],
    }),
    managedAgreementAcceptedAt: timestamp('managed_agreement_accepted_at'),
    returnDestinationType: text('return_destination_type', {
      enum: ['maker_address', 'hastabazaar_collection_point'],
    })
      .notNull()
      .default('maker_address'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('idx_seller_participation_review').on(
      table.participationRoute,
      table.applicationStage,
      table.createdAt,
    ),
    check('seller_participation_version', sql`${table.version} >= 1`),
  ],
);

export const sellerParticipationGuards = sqliteTable(
  'seller_participation_guards',
  {
    id: id(),
    valid: integer('valid').notNull(),
  },
  (table) => [
    check('seller_participation_guard_valid', sql`${table.valid} = 1`),
  ],
);

export const sellerOperationalAddresses = sqliteTable(
  'seller_operational_addresses',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'cascade' }),
    purpose: text('purpose', {
      enum: ['verification', 'pickup', 'returns', 'invoice'],
    }).notNull(),
    sameAsAddressId: text('same_as_address_id').references(
      (): AnySQLiteColumn => sellerOperationalAddresses.id,
      { onDelete: 'set null' },
    ),
    province: text('province').notNull(),
    district: text('district').notNull(),
    municipality: text('municipality').notNull(),
    ward: text('ward'),
    locality: text('locality').notNull(),
    isPublic: integer('is_public', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_seller_addresses_purpose').on(
      table.sellerId,
      table.purpose,
    ),
    check('seller_address_private', sql`${table.isPublic} = 0`),
  ],
);

export const sellerProfileMedia = sqliteTable(
  'seller_profile_media',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['profile_image', 'maker_video'] }).notNull(),
    objectKey: text('object_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    moderationStatus: text('moderation_status', {
      enum: ['pending', 'approved', 'rejected'],
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
    uniqueIndex('idx_seller_profile_media_kind').on(table.sellerId, table.kind),
    uniqueIndex('idx_seller_profile_media_object_key').on(table.objectKey),
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

export const categoryMedia = sqliteTable('category_media', {
  id: id(),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'restrict' }),
  objectKey: text('object_key').notNull().unique(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type', { enum: ['image/webp'] }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  contentHash: text('content_hash').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  requestId: text('request_id').notNull(),
  createdAt: timestamp('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_category_media_actor_request').on(table.createdBy, table.requestId),
  index('idx_category_media_category').on(table.categoryId, table.id),
  check('category_media_size', sql`${table.sizeBytes}>0 AND ${table.sizeBytes}<=5242880`),
  check('category_media_dimensions', sql`${table.width}>0 AND ${table.width}<=2400 AND ${table.height}>0 AND ${table.height}<=1600`),
  check('category_media_mime', sql`${table.mimeType}='image/webp'`),
  check('category_media_hash', sql`length(${table.contentHash})=64`),
]);

export const categoryImageAssignments = sqliteTable('category_image_assignments', {
  categoryId: text('category_id').primaryKey().references(() => categories.id, { onDelete: 'restrict' }),
  mediaId: text('media_id').unique().references(() => categoryMedia.id, { onDelete: 'restrict' }),
  updatedBy: text('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedAt: timestamp('updated_at').notNull(),
});

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
    countryOfOrigin: text('country_of_origin').notNull().default(''),
    originEvidenceStatus: text('origin_evidence_status', {enum:['unverified','seller_declared','verified']}).notNull().default('unverified'),
    originEvidenceReference: text('origin_evidence_reference'),
    materials: text('materials').notNull(),
    materialsJson: text('materials_json').notNull().default('[]'),
    originStory: text('origin_story'),
    dimensions: text('dimensions'),
    size: text('size'),
    colour: text('colour'),
    variations: text('variations'),
    specifications: text('specifications'),
    careInstructions: text('care_instructions'),
    safetyInformation: text('safety_information'),
    returnConditions: text('return_conditions'),
    returnEligible: integer('return_eligible', { mode: 'boolean' })
      .notNull()
      .default(true),
    warranty: text('warranty'),
    madeToOrder: integer('made_to_order', { mode: 'boolean' })
      .notNull()
      .default(false),
    preparationDays: integer('preparation_days').notNull().default(2),
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

export const marketplaceSettings = sqliteTable('marketplace_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedBy: text('updated_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  updatedAt: timestamp('updated_at').notNull(),
});

export const businessSettingVersions = sqliteTable(
  'business_setting_versions',
  {
    id: id(),
    settingKey: text('setting_key').notNull(),
    version: integer('version').notNull(),
    valueJson: text('value_json').notNull(),
    status: text('status', {
      enum: ['draft', 'pending_approval', 'published', 'rejected', 'cancelled'],
    })
      .notNull()
      .default('draft'),
    revision: integer('revision').notNull().default(1),
    changeControl: text('change_control', {
      enum: ['simple', 'controlled'],
    }).notNull(),
    effectiveFrom: timestamp('effective_from'),
    effectiveUntil: timestamp('effective_until'),
    reason: text('reason').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').notNull(),
    submittedBy: text('submitted_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    submittedAt: timestamp('submitted_at'),
    approvedBy: text('approved_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    approvedAt: timestamp('approved_at'),
    publishedBy: text('published_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    publishedAt: timestamp('published_at'),
    decisionNote: text('decision_note'),
    supersedesId: text('supersedes_id').references(
      (): AnySQLiteColumn => businessSettingVersions.id,
      { onDelete: 'restrict' },
    ),
    lastRequestId: text('last_request_id').notNull(),
  },
  (table) => [
    uniqueIndex('idx_business_setting_versions_key_version').on(
      table.settingKey,
      table.version,
    ),
    uniqueIndex('idx_business_setting_versions_request').on(
      table.lastRequestId,
    ),
    index('idx_business_setting_versions_effective').on(
      table.settingKey,
      table.status,
      table.effectiveFrom,
      table.effectiveUntil,
    ),
    index('idx_business_setting_versions_review').on(
      table.status,
      table.createdAt,
    ),
    check(
      'business_setting_versions_status',
      sql`${table.status} IN ('draft', 'pending_approval', 'published', 'rejected', 'cancelled')`,
    ),
    check('business_setting_versions_revision', sql`${table.revision} >= 1`),
    check(
      'business_setting_versions_control',
      sql`${table.changeControl} IN ('simple', 'controlled')`,
    ),
    check(
      'business_setting_versions_interval',
      sql`${table.effectiveUntil} IS NULL OR (${table.effectiveFrom} IS NOT NULL AND ${table.effectiveUntil} > ${table.effectiveFrom})`,
    ),
  ],
);

export const businessSettingGuards = sqliteTable(
  'business_setting_guards',
  {
    id: id(),
    valid: integer('valid').notNull(),
  },
  (table) => [check('business_setting_guards_valid', sql`${table.valid} = 1`)],
);

export const homepageProductControls = sqliteTable(
  'homepage_product_controls',
  {
    productId: text('product_id')
      .primaryKey()
      .references(() => products.id, { onDelete: 'cascade' }),
    isHidden: integer('is_hidden', { mode: 'boolean' })
      .notNull()
      .default(false),
    reason: text('reason').notNull(),
    version: integer('version').notNull().default(1),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    lastRequestId: text('last_request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('idx_homepage_product_controls_hidden_updated').on(
      table.isHidden,
      table.updatedAt,
    ),
    check(
      'homepage_product_controls_hidden_boolean',
      sql`${table.isHidden} IN (0, 1)`,
    ),
    check(
      'homepage_product_controls_version_positive',
      sql`${table.version} >= 1`,
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

/** Minimal owner link for address answers after the saved address is deleted. */
export const addressAnswerOwnerTombstones = sqliteTable(
  'address_answer_owner_tombstones',
  {
    addressId: text('address_id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    deletionRequestId: text('deletion_request_id').notNull(),
    deletedAt: timestamp('deleted_at').notNull(),
  },
  (table) => [
    index('idx_address_answer_owner_tombstones_user').on(table.userId, table.deletedAt, table.addressId),
    check('address_answer_owner_tombstones_address_length', sql`length(${table.addressId}) BETWEEN 1 AND 191`),
    check('address_answer_owner_tombstones_request_length', sql`length(${table.deletionRequestId}) BETWEEN 1 AND 191`),
    check('address_answer_owner_tombstones_time', sql`${table.deletedAt} >= 0`),
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
    deliveryFor: text('delivery_for', { enum: ['self', 'other'] })
      .notNull()
      .default('self'),
    recipientEmail: text('recipient_email'),
    sourceAddressId: text('source_address_id'),
    addressSavedForFuture: integer('address_saved_for_future', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
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
    walletCreditPaisa: integer('wallet_credit_paisa').notNull().default(0),
    referralDiscountPaisa: integer('referral_discount_paisa')
      .notNull()
      .default(0),
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
    platformDiscountPaisa: integer('platform_discount_paisa')
      .notNull()
      .default(0),
    commissionBasePaisa: integer('commission_base_paisa'),
    commissionRuleVersion: text('commission_rule_version'),
    sellerAgreementVersion: text('seller_agreement_version'),
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

export const orderPolicyAcceptances = sqliteTable(
  'order_policy_acceptances',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    policyVersion: text('policy_version').notNull(),
    termsSnapshotJson: text('terms_snapshot_json').notNull(),
    acceptanceMethod: text('acceptance_method', {
      enum: ['affirmative_checkbox'],
    }).notNull(),
    actorUserId: text('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requestId: text('request_id').notNull(),
    acceptedAt: timestamp('accepted_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_order_policy_acceptances_order_unique').on(table.orderId),
    uniqueIndex('idx_order_policy_acceptances_request_unique').on(
      table.requestId,
    ),
  ],
);

export const orderDocuments = sqliteTable(
  'order_documents',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    kind: text('kind', {
      enum: ['order_statement', 'payment_receipt'],
    }).notNull(),
    documentNumber: text('document_number').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    status: text('status', { enum: ['issued', 'void'] })
      .notNull()
      .default('issued'),
    requestId: text('request_id').notNull(),
    issuedAt: timestamp('issued_at').notNull(),
    voidedAt: timestamp('voided_at'),
  },
  (table) => [
    uniqueIndex('idx_order_documents_number_unique').on(table.documentNumber),
    uniqueIndex('idx_order_documents_request_unique').on(table.requestId),
    uniqueIndex('idx_order_documents_order_kind_unique').on(
      table.orderId,
      table.kind,
    ),
    index('idx_order_documents_order_issued').on(table.orderId, table.issuedAt),
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
    originalSealIntact: integer('original_seal_intact', { mode: 'boolean' })
      .notNull()
      .default(false),
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
    walletCreditPaisa: integer('wallet_credit_paisa').notNull().default(0),
    referralDiscountPaisa: integer('referral_discount_paisa')
      .notNull()
      .default(0),
    creditBasePaisa: integer('credit_base_paisa').notNull().default(0),
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
    commissionBaseRefundedPaisa: integer('commission_base_refunded_paisa')
      .notNull()
      .default(0),
    commissionReversalPaisa: integer('commission_reversal_paisa')
      .notNull()
      .default(0),
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
    // Current active Super Admin authority for same-author approval is enforced
    // by the role-aware triggers in 0062_single_super_admin_approvals.sql.
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
        'commission_reversal',
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
    uniqueIndex('idx_seller_ledger_refund_type_unique').on(
      table.refundId,
      table.type,
    ),
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

export const requestRateLimits = sqliteTable(
  'request_rate_limits',
  {
    key: text('key').primaryKey(),
    requestCount: integer('request_count').notNull().default(0),
    windowStartedAt: timestamp('window_started_at').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => [index('idx_request_rate_limits_expiry').on(table.expiresAt)],
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

// Store-credit triggers and cross-row guards are generated by scripts/generate-wallet-schema.mjs.
export const walletAccounts = sqliteTable(
  'wallet_accounts',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id),
    referralCode: text('referral_code').notNull().unique(),
    balancePaisa: integer('balance_paisa').notNull().default(0),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [check('wallet_balance_nonnegative', sql`${t.balancePaisa} >= 0`)],
);

export const referralCampaign = sqliteTable(
  'referral_campaign',
  {
    id: id(),
    enabled: integer('enabled').notNull().default(1),
    friendDiscountPaisa: integer('friend_discount_paisa').notNull(),
    rewardPaisa: integer('reward_paisa').notNull(),
    minimumSubtotalPaisa: integer('minimum_subtotal_paisa').notNull(),
    returnWindowDays: integer('return_window_days').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    check(
      'referral_offer_valid',
      sql`${t.friendDiscountPaisa}>0 AND ${t.rewardPaisa}>0 AND ${t.minimumSubtotalPaisa}>${t.friendDiscountPaisa} AND ${t.returnWindowDays}>=7`,
    ),
  ],
);

export const referralRedemptions = sqliteTable(
  'referral_redemptions',
  {
    customerId: text('customer_id')
      .primaryKey()
      .references(() => users.id),
    referrerId: text('referrer_id')
      .notNull()
      .references(() => walletAccounts.userId),
    orderId: text('order_id')
      .notNull()
      .unique()
      .references(() => orders.id),
    phoneKey: text('phone_key').notNull().unique(),
    rewardPaisa: integer('reward_paisa').notNull(),
    waitDays: integer('wait_days').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    index('idx_referrals_referrer').on(t.referrerId, t.createdAt),
    check('referral_no_self', sql`${t.customerId} <> ${t.referrerId}`),
  ],
);

export const reviewPhotos = sqliteTable(
  'review_photos',
  {
    id: id(),
    reviewId: text('review_id')
      .notNull()
      .references(() => productReviews.id),
    objectKey: text('object_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [uniqueIndex('idx_review_photo_slot').on(t.reviewId, t.sortOrder)],
);

export const reviewReplies = sqliteTable(
  'review_replies',
  {
    id: id(),
    reviewId: text('review_id')
      .notNull()
      .references(() => productReviews.id),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id),
    body: text('body').notNull(),
    version: integer('version').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at').notNull(),
    moderatedBy: text('moderated_by').references(() => users.id),
    moderationNote: text('moderation_note'),
  },
  (t) => [uniqueIndex('idx_review_reply_version').on(t.reviewId, t.version)],
);

export const orderEmailJobs = sqliteTable(
  'order_email_jobs',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    orderStatus: text('order_status').notNull(),
    createdAt: timestamp('created_at').notNull(),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at').notNull().default(0),
    leaseUntil: integer('lease_until').notNull().default(0),
    claimToken: text('claim_token'),
    sentAt: timestamp('sent_at'),
    failureCode: text('failure_code'),
  },
  (t) => [
    uniqueIndex('idx_order_email_event').on(t.orderId, t.orderStatus),
    index('idx_order_email_due').on(t.status, t.nextAttemptAt, t.leaseUntil),
  ],
);

export const passwordResetChallenges = sqliteTable(
  'password_reset_challenges',
  {
    tokenHash: text('token_hash').primaryKey(),
    codeHash: text('code_hash').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    completionId: text('completion_id'),
  },
  (t) => [index('idx_password_reset_user').on(t.userId)],
);

export const walletEntries = sqliteTable(
  'wallet_entries',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => walletAccounts.userId),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    amountPaisa: integer('amount_paisa').notNull(),
    platformAmountPaisa: integer('platform_amount_paisa').notNull(),
    kind: text('kind', {
      enum: ['referral_reward', 'order_spend', 'cancellation', 'refund'],
    }).notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    index('idx_wallet_entries_user').on(t.userId, t.createdAt),
    check(
      'wallet_entry_balanced',
      sql`${t.amountPaisa}+${t.platformAmountPaisa}=0 AND ${t.amountPaisa}<>0`,
    ),
  ],
);

export const productDeletions = sqliteTable('product_deletions', {
  productId: text('product_id')
    .primaryKey()
    .notNull()
    .references(() => products.id),
  deletedBy: text('deleted_by')
    .notNull()
    .references(() => users.id),
  deletedAt: timestamp('deleted_at').notNull(),
  requestId: text('request_id').notNull(),
});

export const addressLocations = sqliteTable('address_locations', {
  addressId: text('address_id')
    .primaryKey()
    .notNull()
    .references(() => addresses.id, { onDelete: 'cascade' }),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
});
export const deliveryAssignments = sqliteTable('delivery_assignments', {
  orderId: text('order_id')
    .primaryKey()
    .notNull()
    .references(() => orders.id),
  method: text('method').notNull(),
  riderUserId: text('rider_user_id').references(() => users.id),
  courierName: text('courier_name'),
  trackingUrl: text('tracking_url'),
  trackingReference: text('tracking_reference'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  accuracy: real('accuracy'),
  positionAt: timestamp('position_at'),
  assignedBy: text('assigned_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at').notNull(),
});

export const accountEmailVerifications = sqliteTable(
  'account_email_verifications',
  {
    userId: text('user_id')
      .primaryKey()
      .notNull()
      .references(() => users.id),
    email: text('email').notNull(),
    verifiedAt: timestamp('verified_at').notNull(),
  },
);

// Static account security; contact proofs and codes are never form catalogue fields.
export const accountPhoneVerifications = sqliteTable('account_phone_verifications', {
  userId: text('user_id').primaryKey().notNull().references(() => users.id, {onDelete:'cascade'}),
  phone: text('phone').notNull(),
  verifiedAt: timestamp('verified_at').notNull(),
});
export const accountContactChallenges = sqliteTable('account_contact_challenges', {
  tokenHash:text('token_hash').primaryKey().notNull(), codeHash:text('code_hash').notNull(),
  userId:text('user_id').notNull().references(() => users.id,{onDelete:'cascade'}),
  authSubject:text('auth_subject').notNull(), channel:text('channel',{enum:['email','phone']}).notNull(),
  contactValue:text('contact_value').notNull(), contactSnapshot:text('contact_snapshot').notNull(),
  attempts:integer('attempts').notNull().default(0), expiresAt:timestamp('expires_at').notNull(),
  createdAt:timestamp('created_at').notNull(),deliveredAt:timestamp('delivered_at'),consumedAt:timestamp('consumed_at'),
}, t => [uniqueIndex('idx_account_contact_owner_channel').on(t.userId,t.channel),check('account_contact_attempts',sql`${t.attempts}>=0`)]);
export const localContactCaptures=sqliteTable('local_contact_captures',{
  tokenHash:text('token_hash').primaryKey().notNull().references(()=>accountContactChallenges.tokenHash,{onDelete:'cascade'}),
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),channel:text('channel').notNull(),
  contactValue:text('contact_value').notNull(),code:text('code').notNull(),expiresAt:timestamp('expires_at').notNull(),
  simulationLabel:text('simulation_label').notNull(),
},t=>[check('local_contact_simulation_label',sql`${t.simulationLabel}='SIMULATED — NOT VALID FOR PRODUCTION'`)]);

// Seller parcels extend the existing outbound shipping job identity.
export const shippingParcels = sqliteTable(
  'shipping_parcels',
  {
    shippingJobId: text('shipping_job_id')
      .primaryKey()
      .references(() => shippingJobs.id),
    codDuePaisa: integer('cod_due_paisa').notNull(),
    collectedPaisa: integer('collected_paisa').notNull().default(0),
    remittedPaisa: integer('remitted_paisa').notNull().default(0),
    version: integer('version').notNull().default(0),
    operationRequestId: text('operation_request_id'),
    method: text('method'),
    riderUserId: text('rider_user_id').references(() => users.id),
    courierName: text('courier_name'),
    trackingUrl: text('tracking_url'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    accuracy: real('accuracy'),
    positionAt: integer('position_at'),
    deliveredAt: integer('delivered_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    check('parcel_cod_nonnegative', sql`${t.codDuePaisa}>=0`),
    check(
      'parcel_collected_bound',
      sql`${t.collectedPaisa}>=0 AND ${t.collectedPaisa}<=${t.codDuePaisa}`,
    ),
    check(
      'parcel_remitted_bound',
      sql`${t.remittedPaisa}>=0 AND ${t.remittedPaisa}<=${t.collectedPaisa}`,
    ),
  ],
);
export const parcelCashRecords = sqliteTable(
  'parcel_cash_records',
  {
    id: id(),
    shippingJobId: text('shipping_job_id')
      .notNull()
      .references(() => shippingParcels.shippingJobId),
    kind: text('kind').notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    evidenceReference: text('evidence_reference').notNull(),
    status: text('status').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    approvedBy: text('approved_by').references(() => users.id),
    createdAt: integer('created_at').notNull(),
    approvedAt: integer('approved_at'),
  },
  (t) => [
    uniqueIndex('parcel_cash_evidence').on(t.kind, t.evidenceReference),
    index('idx_parcel_cash_status').on(t.status, t.createdAt),
    check('parcel_cash_positive', sql`${t.amountPaisa}>0`),
    check('parcel_cash_kind', sql`${t.kind} IN ('collection','remittance')`),
    check(
      'parcel_cash_state',
      sql`${t.status} IN ('pending','posted','rejected')`,
    ),
    check(
      'parcel_cash_checker',
      sql`${t.kind}<>'remittance' OR ${t.status}<>'posted' OR ${t.approvedBy} IS NOT NULL`,
    ),
  ],
);
export const parcelOperationEvents = sqliteTable('parcel_operation_events', {
  id: id(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  shippingJobId: text('shipping_job_id').references(
    () => shippingParcels.shippingJobId,
  ),
  actorId: text('actor_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  payloadJson: text('payload_json').notNull(),
  note: text('note').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const operationTransactionGuards = sqliteTable(
  'operation_transaction_guards',
  { id: id(), valid: integer('valid').notNull() },
  (t) => [check('operation_transaction_valid', sql`${t.valid}=1`)],
);

export const managedCommercialSnapshots = sqliteTable(
  'managed_commercial_snapshots',
  {
    id: id(),
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    participationRoute: text('participation_route', {
      enum: ['managed_maker'],
    }).notNull(),
    commercialModel: text('commercial_model', {
      enum: [
        'managed_sale_linked_percentage_v1',
        'managed_fixed_supplier_price_v1',
      ],
    }).notNull(),
    legalSellerReference: text('legal_seller_reference').notNull(),
    invoiceIssuerReference: text('invoice_issuer_reference').notNull(),
    payoutBeneficiaryReference: text('payout_beneficiary_reference').notNull(),
    agreementVersion: text('agreement_version').notNull(),
    agreementLanguage: text('agreement_language', {
      enum: ['en', 'ne'],
    }).notNull(),
    termsSettingVersionId: text('terms_setting_version_id'),
    deliveryHoldDays: integer('delivery_hold_days').notNull().default(7),
    holdSettingVersionId: text('hold_setting_version_id'),
    productValuePaisa: integer('product_value_paisa').notNull(),
    makerFundedDiscountPaisa: integer('maker_funded_discount_paisa')
      .notNull()
      .default(0),
    platformFundedDiscountPaisa: integer('platform_funded_discount_paisa')
      .notNull()
      .default(0),
    eligibleBasePaisa: integer('eligible_base_paisa').notNull(),
    platformRetentionBps: integer('platform_retention_bps')
      .notNull()
      .default(0),
    platformRetainedPaisa: integer('platform_retained_paisa')
      .notNull()
      .default(0),
    makerEntitlementPaisa: integer('maker_entitlement_paisa')
      .notNull()
      .default(0),
    agreedSupplierAmountPaisa: integer('agreed_supplier_amount_paisa'),
    simulationLabel: text('simulation_label').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_managed_snapshots_order_item').on(t.orderItemId),
    index('idx_managed_snapshots_seller_created').on(t.sellerId, t.createdAt),
    check(
      'managed_snapshot_route',
      sql`${t.participationRoute}='managed_maker'`,
    ),
    check(
      'managed_snapshot_money',
      sql`${t.platformRetainedPaisa}+${t.makerEntitlementPaisa}=${t.eligibleBasePaisa}`,
    ),
    check(
      'managed_snapshot_fixed_no_retention',
      sql`${t.commercialModel}<>'managed_fixed_supplier_price_v1' OR ${t.platformRetainedPaisa}=0`,
    ),
  ],
);

export const managedEntitlements = sqliteTable(
  'managed_entitlements',
  {
    id: id(),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => managedCommercialSnapshots.id, {
        onDelete: 'restrict',
      }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    status: text('status', {
      enum: [
        'calculated',
        'earned',
        'held',
        'eligible',
        'part_paid',
        'paid',
        'reversed',
      ],
    }).notNull(),
    calculatedPaisa: integer('calculated_paisa').notNull(),
    earnedAt: timestamp('earned_at'),
    holdUntil: timestamp('hold_until'),
    eligibleAt: timestamp('eligible_at'),
    paidAt: timestamp('paid_at'),
    disputeHoldReason: text('dispute_hold_reason'),
    disputeReviewAt: timestamp('dispute_review_at'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_managed_entitlements_snapshot').on(t.snapshotId),
    index('idx_managed_entitlements_status').on(t.status, t.eligibleAt),
  ],
);

export const managedSettlementEntries = sqliteTable(
  'managed_settlement_entries',
  {
    id: id(),
    entitlementId: text('entitlement_id')
      .notNull()
      .references(() => managedEntitlements.id, { onDelete: 'restrict' }),
    refundId: text('refund_id').references(() => refunds.id, {
      onDelete: 'restrict',
    }),
    type: text('type', {
      enum: [
        'earned',
        'refund_adjustment',
        'dispute_adjustment',
        'defect_adjustment',
        'payout',
        'payout_reversal',
      ],
    }).notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    baseAmountPaisa: integer('base_amount_paisa'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    reasonCode: text('reason_code').notNull(),
    requestId: text('request_id').notNull(),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_managed_settlement_request').on(t.requestId),
    index('idx_managed_settlement_entitlement').on(
      t.entitlementId,
      t.createdAt,
    ),
    check('managed_settlement_nonzero', sql`${t.amountPaisa}<>0`),
  ],
);

export const managedPayouts = sqliteTable(
  'managed_payouts',
  {
    id: id(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: 'restrict' }),
    payoutNumber: text('payout_number').notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    status: text('status', {
      enum: [
        'prepared',
        'approved',
        'processing',
        'paid',
        'failed',
        'rejected',
        'reversed',
      ],
    }).notNull(),
    destinationReference: text('destination_reference').notNull(),
    simulationLabel: text('simulation_label').notNull(),
    preparedBy: text('prepared_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    approvedBy: text('approved_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    scheduledFor: timestamp('scheduled_for').notNull(),
    providerReference: text('provider_reference'),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    paidAt: timestamp('paid_at'),
  },
  (t) => [
    uniqueIndex('idx_managed_payouts_number').on(t.payoutNumber),
    uniqueIndex('idx_managed_payouts_request').on(t.requestId),
    index('idx_managed_payouts_status').on(t.status, t.scheduledFor),
    check('managed_payout_positive', sql`${t.amountPaisa}>0`),
  ],
);

export const managedPayoutEntries = sqliteTable(
  'managed_payout_entries',
  {
    payoutId: text('payout_id')
      .notNull()
      .references(() => managedPayouts.id, { onDelete: 'restrict' }),
    settlementEntryId: text('settlement_entry_id')
      .notNull()
      .references(() => managedSettlementEntries.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.payoutId, t.settlementEntryId] }),
    uniqueIndex('idx_managed_payout_entry_unique').on(t.settlementEntryId),
  ],
);

export const managedInvoiceGroups = sqliteTable(
  'managed_invoice_groups',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    issuerReference: text('issuer_reference').notNull(),
    invoiceNumber: text('invoice_number').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    barcodePayload: text('barcode_payload').notNull(),
    qrPayload: text('qr_payload').notNull(),
    simulationLabel: text('simulation_label').notNull(),
    status: text('status', { enum: ['issued', 'voided'] })
      .notNull()
      .default('issued'),
    requestId: text('request_id').notNull(),
    issuedAt: timestamp('issued_at').notNull(),
    voidedAt: timestamp('voided_at'),
  },
  (t) => [
    uniqueIndex('idx_managed_invoice_number').on(t.invoiceNumber),
    uniqueIndex('idx_managed_invoice_request').on(t.requestId),
    uniqueIndex('idx_managed_invoice_order_issuer').on(
      t.orderId,
      t.issuerReference,
    ),
  ],
);

export const managedInvoiceAdjustments = sqliteTable(
  'managed_invoice_adjustments',
  {
    id: id(),
    invoiceGroupId: text('invoice_group_id').notNull().references(() => managedInvoiceGroups.id, { onDelete: 'restrict' }),
    adjustmentNumber: text('adjustment_number').notNull(),
    kind: text('kind', { enum: ['credit_note', 'debit_note'] }).notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    reasonCode: text('reason_code').notNull(),
    note: text('note').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    simulationLabel: text('simulation_label').notNull(),
    requestId: text('request_id').notNull(),
    createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    issuedAt: timestamp('issued_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_managed_invoice_adjustments_number').on(t.adjustmentNumber),
    uniqueIndex('idx_managed_invoice_adjustments_request').on(t.requestId),
    index('idx_managed_invoice_adjustments_invoice').on(t.invoiceGroupId, t.issuedAt),
    check('managed_invoice_adjustments_kind', sql`${t.kind} IN ('credit_note','debit_note')`),
    check('managed_invoice_adjustments_amount', sql`${t.amountPaisa}>0`),
  ],
);

export const trafficSessions = sqliteTable(
  'traffic_sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull(),
    firstSeenAt: timestamp('first_seen_at').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_traffic_sessions_token').on(table.tokenHash),
    index('idx_traffic_sessions_expiry').on(table.expiresAt),
  ],
);

export const trafficEvents = sqliteTable(
  'traffic_events',
  {
    id: id(),
    sessionId: text('session_id')
      .notNull()
      .references(() => trafficSessions.id, { onDelete: 'cascade' }),
    eventType: text('event_type', {
      enum: [
        'page_view',
        'product_view',
        'add_to_cart',
        'checkout_started',
        'order_completed',
      ],
    }).notNull(),
    path: text('path').notNull(),
    entityKey: text('entity_key'),
    eventKey: text('event_key').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_traffic_events_key').on(table.eventKey),
    index('idx_traffic_events_created').on(table.createdAt),
    index('idx_traffic_events_type_created').on(
      table.eventType,
      table.createdAt,
    ),
    index('idx_traffic_events_session_created').on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

// The registry owns form identity and field capabilities. Storage keeps immutable
// published definitions and the answer snapshot used at submission time.
export const formConfigVersions = sqliteTable(
  'form_config_versions',
  {
    id: id(),
    formId: text('form_id').notNull(),
    version: integer('version').notNull(),
    revision: integer('revision').notNull().default(1),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    configJson: text('config_json').notNull(),
    reason: text('reason').notNull(),
    createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').notNull(),
    updatedBy: text('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    updatedAt: timestamp('updated_at').notNull(),
    publishedBy: text('published_by').references(() => users.id, { onDelete: 'restrict' }),
    publishedAt: timestamp('published_at'),
    lastRequestId: text('last_request_id').notNull(),
  },
  (table) => [
    uniqueIndex('idx_form_config_versions_form_version').on(table.formId, table.version),
    uniqueIndex('idx_form_config_versions_form_id').on(table.formId, table.id),
    uniqueIndex('idx_form_config_versions_request').on(table.lastRequestId),
    index('idx_form_config_versions_current').on(table.formId, table.status, table.version),
    check('form_config_versions_form_id_length', sql`length(${table.formId}) BETWEEN 1 AND 191`),
    check('form_config_versions_version', sql`${table.version} >= 1`),
    check('form_config_versions_revision', sql`${table.revision} >= 1`),
    check('form_config_versions_status', sql`${table.status} IN ('draft','published')`),
    check('form_config_versions_json', sql`json_valid(${table.configJson}) AND json_type(${table.configJson}) = 'object' AND length(CAST(${table.configJson} AS BLOB)) <= 65536`),
    check('form_config_versions_reason', sql`length(trim(${table.reason})) BETWEEN 1 AND 2000`),
    check('form_config_versions_request_length', sql`length(${table.lastRequestId}) BETWEEN 1 AND 191`),
    check('form_config_versions_publication', sql`(${table.status} = 'draft' AND ${table.publishedBy} IS NULL AND ${table.publishedAt} IS NULL) OR (${table.status} = 'published' AND ${table.publishedBy} IS NOT NULL AND ${table.publishedAt} IS NOT NULL)`),
  ],
);

export const formAnswerSets = sqliteTable(
  'form_answer_sets',
  {
    id: id(),
    formId: text('form_id').notNull(),
    requestId: text('request_id').notNull(),
    configVersionId: text('config_version_id').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    answersJson: text('answers_json').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.formId, table.configVersionId],
      foreignColumns: [formConfigVersions.formId, formConfigVersions.id],
      name: 'form_answer_sets_version_fk',
    }).onDelete('restrict'),
    uniqueIndex('idx_form_answer_sets_form_request').on(table.formId, table.requestId),
    index('idx_form_answer_sets_owner').on(table.subjectType, table.subjectId, table.createdAt),
    index('idx_form_answer_sets_version').on(table.configVersionId, table.createdAt),
    check('form_answer_sets_form_id_length', sql`length(${table.formId}) BETWEEN 1 AND 191`),
    check('form_answer_sets_request_length', sql`length(${table.requestId}) BETWEEN 1 AND 191`),
    check('form_answer_sets_subject_type_length', sql`length(${table.subjectType}) BETWEEN 1 AND 64`),
    check('form_answer_sets_subject_id_length', sql`length(${table.subjectId}) BETWEEN 1 AND 191`),
    check('form_answer_sets_json', sql`json_valid(${table.answersJson}) AND json_type(${table.answersJson}) = 'object' AND length(CAST(${table.answersJson} AS BLOB)) <= 131072`),
  ],
);

export const dataRightsLegalHolds = sqliteTable(
  'data_rights_legal_holds',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    placedBy: text('placed_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    placedAt: timestamp('placed_at').notNull(),
    releasedBy: text('released_by').references(() => users.id, { onDelete: 'restrict' }),
    releasedAt: timestamp('released_at'),
  },
  (table) => [
    index('idx_data_rights_legal_holds_user_active').on(table.userId, table.releasedAt),
    uniqueIndex('idx_data_rights_legal_holds_one_active').on(table.userId)
      .where(sql`${table.releasedAt} IS NULL`),
    check('data_rights_legal_holds_reason', sql`length(trim(${table.reason})) BETWEEN 8 AND 2000`),
    check('data_rights_legal_holds_release', sql`(${table.releasedBy} IS NULL AND ${table.releasedAt} IS NULL) OR (${table.releasedBy} IS NOT NULL AND ${table.releasedAt} IS NOT NULL AND ${table.releasedAt} >= ${table.placedAt})`),
  ],
);

export const feedbackDeliveryJobs = sqliteTable(
  'feedback_delivery_jobs',
  {
    id: id(),
    requestId: text('request_id').notNull().unique(),
    formId: text('form_id').notNull(),
    configVersionId: text('config_version_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    feedbackJson: text('feedback_json').notNull(),
    status: text('status').notNull(),
    leaseToken: text('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at'),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    sentAt: timestamp('sent_at'),
  },
  (table) => [
    foreignKey({ columns: [table.formId, table.configVersionId],
      foreignColumns: [formConfigVersions.formId, formConfigVersions.id],
      name: 'feedback_delivery_jobs_version_fk' }).onDelete('restrict'),
    index('idx_feedback_delivery_jobs_status_lease').on(table.status, table.leaseExpiresAt, table.updatedAt),
    index('idx_feedback_delivery_jobs_created').on(table.createdAt, table.id),
    check('feedback_delivery_jobs_request_length', sql`length(${table.requestId}) BETWEEN 8 AND 191`),
    check('feedback_delivery_jobs_form', sql`${table.formId} IN ('public.contact','public.feedback','public.footer-feedback')`),
    check('feedback_delivery_jobs_hash_length', sql`length(${table.payloadHash}) = 64`),
    check('feedback_delivery_jobs_json', sql`json_valid(${table.feedbackJson}) AND json_type(${table.feedbackJson}) = 'object' AND length(CAST(${table.feedbackJson} AS BLOB)) <= 8192`),
    check('feedback_delivery_jobs_status', sql`${table.status} IN ('pending','leased','sending','failed','sent')`),
    check('feedback_delivery_jobs_attempts', sql`${table.attemptCount} BETWEEN 0 AND 5`),
    check('feedback_delivery_jobs_times', sql`${table.createdAt} >= 0 AND ${table.updatedAt} >= ${table.createdAt}`),
    check('feedback_delivery_jobs_lease', sql`(${table.status} IN ('leased','sending') AND ${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL) OR (${table.status} IN ('pending','failed','sent') AND ${table.leaseToken} IS NULL AND ${table.leaseExpiresAt} IS NULL)`),
    check('feedback_delivery_jobs_sent', sql`(${table.status} = 'sent' AND ${table.sentAt} IS NOT NULL) OR (${table.status} != 'sent' AND ${table.sentAt} IS NULL)`),
  ],
);

export const firstCodReviews = sqliteTable('first_cod_reviews', {
 orderId:text('order_id').primaryKey().references(()=>orders.id), customerId:text('customer_id').notNull().references(()=>users.id),
 totalPaisa:integer('total_paisa').notNull(), status:text('status',{enum:['pending','confirmed']}).notNull().default('pending'),
 createdAt:timestamp('created_at').notNull(), confirmedBy:text('confirmed_by').references(()=>users.id), confirmedAt:timestamp('confirmed_at'), reason:text('reason'), requestId:text('request_id').unique(),
},table=>[index('idx_first_cod_reviews_status').on(table.status,table.createdAt),check('first_cod_review_total',sql`${table.totalPaisa} BETWEEN 500000 AND 9007199254740991`),check('first_cod_review_status',sql`${table.status} IN ('pending','confirmed')`)]);

export const managedMakerApplicationDetails = sqliteTable('managed_maker_application_details', {
  id: id(), sellerId: text('seller_id').notNull().references(()=>sellerProfiles.id),
  governmentIdType: text('government_id_type').notNull(), governmentIdDescription: text('government_id_description').notNull().default(''),
  personalPan: text('personal_pan'), identityDocumentId: text('identity_document_id').notNull().references(()=>sellerDocuments.id),
  agreementVersion: text('agreement_version').notNull(), agreementAcceptedAt: timestamp('agreement_accepted_at').notNull(),
  agreementAcceptedBy: text('agreement_accepted_by').notNull().references(()=>users.id), agreementSnapshotJson: text('agreement_snapshot_json').notNull(),
  createdAt: timestamp('created_at').notNull(),
}, table => [index('managed_maker_details_seller').on(table.sellerId,table.createdAt),
  check('managed_maker_details_id_type',sql`${table.governmentIdType} IN ('citizenship','national_id','passport','driving_licence','other_government_id')`),
  check('managed_maker_details_personal_pan',sql`${table.personalPan} IS NULL OR (length(${table.personalPan})=9 AND ${table.personalPan} NOT GLOB '*[^0-9]*')`),
  check('managed_maker_details_accepted_at',sql`${table.agreementAcceptedAt}>0`),
  check('managed_maker_details_snapshot_json',sql`json_valid(${table.agreementSnapshotJson})`)]);
