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
  unique,
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

export const sellerDocumentChangeRequests = sqliteTable('seller_document_change_requests', {
  id: id(),
  sellerId: text('seller_id').notNull().references(() => sellerProfiles.id),
  documentId: text('document_id').notNull().references(() => sellerDocuments.id),
  requestedBy: text('requested_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  status: text('status', { enum: ['submitted','approved','rejected','completed'] }).notNull().default('submitted'),
  requestedAt: timestamp('requested_at').notNull(),
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  reviewReason: text('review_reason'),
}, table => [index('idx_seller_document_change_requests_seller').on(table.sellerId,table.status),
  check('seller_document_change_requests_status', sql`${table.status} IN ('submitted','approved','rejected','completed')`)]);

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
    index('seller_profile_media_history').on(table.sellerId,table.kind,table.uploadedAt,table.id),
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
    offerReservationId: text('offer_reservation_id').unique().references(():AnySQLiteColumn=>offerStockReservations.id),
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

export const orderItemPricingSnapshots = sqliteTable(
  'order_item_pricing_snapshots',
  {
    orderItemId: text('order_item_id').notNull().primaryKey().references(() => orderItems.id),
    orderId: text('order_id').notNull().references(() => orders.id),
    snapshotJson: text('snapshot_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('order_item_pricing_snapshots_order').on(table.orderId, table.orderItemId),
    check('order_item_pricing_snapshot_json', sql`json_valid(${table.snapshotJson}) AND json_type(${table.snapshotJson})='object'`),
    check('order_item_pricing_snapshot_clock', sql`typeof(${table.createdAt})='integer' AND ${table.createdAt} BETWEEN 0 AND 9007199254740991`),
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
    recordedAt:timestamp('recorded_at'),intakeChannel:text('intake_channel',{enum:['web','email','support']}).notNull().default('web'),intakeRecordedBy:text('intake_recorded_by').references(()=>users.id),receivedEvidenceReference:text('received_evidence_reference'),deliveredAtSnapshot:timestamp('delivered_at_snapshot'),
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
        'recovery_settlement',
        'recovery_absorption',
        'recovery_netting_relief',
        'recovery_netting_withholding',
        'recovery_correction',
        'recovery_source_compensation',
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
    purpose:text('purpose'),firstFinanceDueAt:integer('first_finance_due_at'),calendarVersion:text('calendar_version'),
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
    firstDueAt:integer('first_due_at'),firstActionAt:integer('first_action_at'),nextUpdateAt:integer('next_update_at'),backupId:text('backup_id').references(()=>users.id),waitingFor:text('waiting_for').notNull().default('none'),clarificationAt:integer('clarification_at'),clarificationDueAt:integer('clarification_due_at'),followupRevision:integer('followup_revision').notNull().default(0),recordedAt:integer('recorded_at'),intakeChannel:text('intake_channel').notNull().default('web'),intakeRecordedBy:text('intake_recorded_by').references(()=>users.id),receivedEvidenceReference:text('received_evidence_reference'),
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
    commandKey: text('command_key'),
    commandDigest: text('command_digest'),
    commandResultJson: text('command_result_json'),
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
    uniqueIndex('audit_command_key_unique').on(table.commandKey),
  ],
);

export const reviewTasks = sqliteTable('review_tasks', {
  id: id(), sourceType: text('source_type').notNull(), sourceId: text('source_id').notNull(),
  sourceRevision: text('source_revision').notNull(), startedAt: timestamp('started_at').notNull(),
  dueAt: timestamp('due_at').notNull(), calendarVersion: text('calendar_version').notNull(),
  hasDeadline: integer('has_deadline').notNull().default(1),
  ownerId: text('owner_id').references(() => users.id), revision: integer('revision').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull(),
}, table => [uniqueIndex('review_tasks_source').on(table.sourceType, table.sourceId, table.sourceRevision),
  check('review_tasks_has_deadline',sql`${table.hasDeadline} IN (0,1)`),
  index('review_tasks_due').on(table.dueAt, table.ownerId), check('review_tasks_revision', sql`${table.revision}>=0`),
  check('review_tasks_deadline', sql`${table.dueAt}>=${table.startedAt}`)]);

export const notificationMessages = sqliteTable(
  'notification_messages',
  {
    deliveryTransport: text('delivery_transport', {enum: ['capture','provider']}),
    id: id(),
    recipientUserId: text('recipient_user_id')
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
    sourceEventId: text('source_event_id'),
    sourceRevision: text('source_revision'),
    businessEventKey: text('business_event_key'),
    requiredPermission: text('required_permission'),
    deliveryAttempts: integer('delivery_attempts').notNull().default(0),
    deliveryNextAttemptAt: integer('delivery_next_attempt_at').notNull().default(0),
    deliveryLeaseUntil: integer('delivery_lease_until').notNull().default(0),
    deliveryClaimToken: text('delivery_claim_token'),
    guestEmail: text('guest_email'),
    guestOrderId: text('guest_order_id'),
    createdAt: timestamp('created_at').notNull(),
    sentAt: timestamp('sent_at'),
    readAt: timestamp('read_at'),
  },
  (table) => [
    uniqueIndex('idx_notification_messages_request_unique').on(table.requestId),
    uniqueIndex('notification_source_recipient_channel').on(table.sourceEventId, table.sourceRevision, table.recipientUserId, table.channel),
    check('notification_recipient_shape',sql`${table.recipientUserId} IS NOT NULL OR (${table.audienceRole}='customer' AND ${table.channel}='email' AND ${table.guestEmail} IS NOT NULL AND ${table.guestOrderId} IS NOT NULL AND ${table.businessEventKey} IS NOT NULL)`),
    index('idx_business_notification_queue').on(table.channel,table.status,table.deliveryNextAttemptAt,table.deliveryLeaseUntil),
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
    simulationLabel: text('simulation_label'),
    recordKind: text('record_kind', { enum: ['simulation', 'live'] }).notNull().default('simulation'),
    liveActivationDecisionId: text('live_activation_decision_id').references(() => managedLiveActivationDecisions.id),
    liveClearanceId: text('live_clearance_id').references(() => managedLiveClearances.id),
    liveFinancialScopeId: text('live_financial_scope_id').references(() => managedLiveFinancialScopes.id),
    liveCustomerId: text('live_customer_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    check('managed_commercial_snapshots_record_kind', sql`${t.recordKind} IN ('simulation','live')`),
    check('managed_commercial_snapshots_simulation_label', sql`${t.simulationLabel} IS NULL OR length(trim(${t.simulationLabel}))>0`),
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
    simulationLabel: text('simulation_label'),
    recordKind: text('record_kind', { enum: ['simulation', 'live'] }).notNull().default('simulation'),
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
    check('managed_payouts_record_kind', sql`${t.recordKind} IN ('simulation','live')`),
    check('managed_payouts_simulation_label', sql`${t.simulationLabel} IS NULL OR length(trim(${t.simulationLabel}))>0`),
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
    simulationLabel: text('simulation_label'),
    recordKind: text('record_kind', { enum: ['simulation', 'live'] }).notNull().default('simulation'),
    status: text('status', { enum: ['issued', 'voided'] })
      .notNull()
      .default('issued'),
    requestId: text('request_id').notNull(),
    issuedAt: timestamp('issued_at').notNull(),
    voidedAt: timestamp('voided_at'),
  },
  (t) => [
    check('managed_invoice_groups_record_kind', sql`${t.recordKind} IN ('simulation','live')`),
    check('managed_invoice_groups_simulation_label', sql`${t.simulationLabel} IS NULL OR length(trim(${t.simulationLabel}))>0`),
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
    simulationLabel: text('simulation_label'),
    recordKind: text('record_kind', { enum: ['simulation', 'live'] }).notNull().default('simulation'),
    requestId: text('request_id').notNull(),
    createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    issuedAt: timestamp('issued_at').notNull(),
  },
  (t) => [
    check('managed_invoice_adjustments_record_kind', sql`${t.recordKind} IN ('simulation','live')`),
    check('managed_invoice_adjustments_simulation_label', sql`${t.simulationLabel} IS NULL OR length(trim(${t.simulationLabel}))>0`),
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
    healthEnvironment: text('health_environment'),
    healthReleaseId: text('health_release_id'),
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
    check('form_answer_sets_health_environment', sql`${table.healthEnvironment} IN ('production','development','local_staging','test')`),
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
    configVersionId: text('config_version_id'),
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

// Public-profile immutable history and baseline capture triggers are defined in 0084.
export const sellerPublicProfileStates=sqliteTable('seller_public_profile_states',{
 sellerId:text('seller_id').primaryKey().notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 version:integer('version').notNull().default(0),
 currentJson:text('current_json').notNull(),
 displayName:text('display_name').notNull(),
 publicCity:text('public_city').notNull(),
 about:text('about').notNull(),
 specialties:text('specialties').notNull(),
 legacySourcesJson:text('legacy_sources_json').notNull(),
 provenance:text('provenance').notNull(),
 legacySavedAt:timestamp('legacy_saved_at'),
 legacyClockReviewedAt:timestamp('legacy_clock_reviewed_at'),
 legacyClockValue:integer('legacy_clock_value'),
 legacyClockEvidence:text('legacy_clock_evidence'),
 lastNormalPublicationAt:timestamp('last_normal_publication_at'),
 currentRevisionId:text('current_revision_id'),
 supportRequestId:text('support_request_id'),
 updatedAt:timestamp('updated_at').notNull(),
},_table=>[check('profile_states_check_1',sql.raw("json_valid(current_json)")),
 check('profile_states_check_2',sql.raw("json_valid(legacy_sources_json)")),
 check('profile_states_check_3',sql.raw("provenance IN ('legacy_baseline','initial_minimal','reviewed_publication','reviewed_correction')"))]);

export const sellerPublicProfileDrafts=sqliteTable('seller_public_profile_drafts',{
 sellerId:text('seller_id').primaryKey().notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 ownerId:text('owner_id').notNull().references(():AnySQLiteColumn=>users.id),
 revision:text('revision').notNull(),
 baseVersion:integer('base_version').notNull(),
 valuesJson:text('values_json').notNull(),
 updatedAt:timestamp('updated_at').notNull(),
},_table=>[check('profile_drafts_check_1',sql.raw("json_valid(values_json)"))]);

export const sellerPublicProfileRevisions=sqliteTable('seller_public_profile_revisions',{
 id:text('id').primaryKey().notNull(),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 sequence:integer('sequence').notNull(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerPublicProfileRevisions.id),
 supersedesId:text('supersedes_id').references(():AnySQLiteColumn=>sellerPublicProfileRevisions.id),
 kind:text('kind').notNull().default('normal'),
 correctionCaseId:text('correction_case_id'),
 baseVersion:integer('base_version').notNull(),
 baseJson:text('base_json').notNull(),
 valuesJson:text('values_json').notNull(),
 contentHash:text('content_hash').notNull(),
 draftRevision:text('draft_revision').notNull(),
 submittedBy:text('submitted_by').notNull().references(():AnySQLiteColumn=>users.id),
 ownerId:text('owner_id').notNull().references(():AnySQLiteColumn=>users.id),
 submittedAt:timestamp('submitted_at').notNull(),
 firstSubmittedAt:timestamp('first_submitted_at').notNull(),
 status:text('status').notNull().default('submitted'),
 version:integer('version').notNull().default(0),
 reviewedBy:text('reviewed_by').references(():AnySQLiteColumn=>users.id),
 reviewedAt:timestamp('reviewed_at'),
 reviewReason:text('review_reason'),
 publishedAt:timestamp('published_at'),
 operationRequestId:text('operation_request_id').notNull(),
},table=>[check('profile_revisions_check_1',sql.raw("sequence>0")),
 check('profile_revisions_check_2',sql.raw("kind IN ('normal','correction')")),
 check('profile_revisions_check_3',sql.raw("json_valid(base_json)")),
 check('profile_revisions_check_4',sql.raw("json_valid(values_json)")),
 check('profile_revisions_check_5',sql.raw("status IN ('submitted','changes_requested','rejected','approved','published','withdrawn','needs_rebase')")),
 uniqueIndex('public_profile_one_normal_candidate').on(table.sellerId).where(sql`kind='normal' AND status IN ('submitted','approved')`),
 uniqueIndex('public_profile_revision_history').on(table.sellerId,table.sequence)]);

export const sellerPublicProfileRevisionMedia=sqliteTable('seller_public_profile_revision_media',{
 revisionId:text('revision_id').notNull().references(():AnySQLiteColumn=>sellerPublicProfileRevisions.id),
 mediaId:text('media_id').notNull().references(():AnySQLiteColumn=>sellerProfileMedia.id),
 kind:text('kind').notNull(),
 caption:text('caption').notNull(),
},table=>[check('profile_revision_media_check_1',sql.raw("kind IN ('profile_image','maker_video')")),
 primaryKey({columns:[table.revisionId,table.mediaId]}),
 uniqueIndex('public_profile_revision_media_kind').on(table.revisionId,table.kind)]);

export const sellerPublicProfileEvents=sqliteTable('seller_public_profile_events',{
 id:text('id').primaryKey().notNull(),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 revisionId:text('revision_id').references(():AnySQLiteColumn=>sellerPublicProfileRevisions.id),
 correctionId:text('correction_id').references(():AnySQLiteColumn=>sellerPublicProfileCorrections.id),
 actorId:text('actor_id').references(():AnySQLiteColumn=>users.id),
 action:text('action').notNull(),
 reason:text('reason').notNull(),
 payloadJson:text('payload_json').notNull(),
 createdAt:timestamp('created_at').notNull(),
},_table=>[check('profile_events_check_1',sql.raw("json_valid(payload_json)"))]);

export const sellerPublicProfileCorrections=sqliteTable('seller_public_profile_corrections',{
 id:text('id').primaryKey().notNull(),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 ownerId:text('owner_id').notNull().references(():AnySQLiteColumn=>users.id),
 category:text('category').notNull(),
 fieldsJson:text('fields_json').notNull(),
 scopeHash:text('scope_hash').notNull(),
 originalBaseVersion:integer('original_base_version').notNull(),
 originalJson:text('original_json').notNull(),
 baseVersion:integer('base_version').notNull(),
 desiredJson:text('desired_json'),
 requestedBy:text('requested_by').notNull().references(():AnySQLiteColumn=>users.id),
 requestedAt:timestamp('requested_at').notNull(),
 reason:text('reason').notNull(),
 status:text('status').notNull().default('requested'),
 version:integer('version').notNull().default(0),
 reviewedBy:text('reviewed_by').references(():AnySQLiteColumn=>users.id),
 reviewedAt:timestamp('reviewed_at'),
 reviewReason:text('review_reason'),
 nextUpdateAt:timestamp('next_update_at'),
 operationRequestId:text('operation_request_id').notNull(),
},table=>[check('profile_corrections_check_1',sql.raw("category IN ('wrong_detail','location_correction','privacy','compromised_link','staff_requested')")),
 check('profile_corrections_check_2',sql.raw("json_valid(fields_json)")),
 check('profile_corrections_check_3',sql.raw("json_valid(original_json)")),
 check('profile_corrections_check_4',sql.raw("desired_json IS NULL OR json_valid(desired_json)")),
 check('profile_corrections_check_5',sql.raw("status IN ('requested','clarification','authorized','declined','applied','withdrawn')")),
 uniqueIndex('public_profile_correction_active').on(table.sellerId,table.scopeHash).where(sql`status IN ('requested','clarification','authorized')`)]);

export const companyPaymentAccounts=sqliteTable('company_payment_accounts',{
 id:text('id').primaryKey(),revision:integer('revision').notNull().default(0),latestVersionId:text('latest_version_id'),lastEventId:text('last_event_id').notNull(),
 createdBy:text('created_by').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),updatedAt:timestamp('updated_at').notNull(),
},()=>[check('company_account_revision',sql`revision>=0`)]);
export const companyPaymentAccountIdentities=sqliteTable('company_payment_account_identities',{
 identityHash:text('identity_hash').primaryKey(),accountId:text('account_id').notNull().references(()=>companyPaymentAccounts.id),
},()=>[check('company_account_identity_hash',sql`length(identity_hash)=64`)]);
export const companyPaymentAccountVersions=sqliteTable('company_payment_account_versions',{
 id:text('id').primaryKey(),accountId:text('account_id').notNull().references(()=>companyPaymentAccounts.id),number:integer('number').notNull(),
 supersedesId:text('supersedes_id').references(():AnySQLiteColumn=>companyPaymentAccountVersions.id),identityHash:text('identity_hash').notNull().references(()=>companyPaymentAccountIdentities.identityHash),
 revision:integer('revision').notNull().default(0),status:text('status').notNull().default('draft'),detailsJson:text('details_json').notNull(),evidenceReference:text('evidence_reference').notNull(),conflictsJson:text('conflicts_json').notNull(),
 createdBy:text('created_by').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),submittedAt:timestamp('submitted_at'),
 verifiedBy:text('verified_by').references(()=>users.id),verifiedAt:timestamp('verified_at'),verificationReference:text('verification_reference'),
},table=>[uniqueIndex('company_account_version_number').on(table.accountId,table.number),check('company_account_version_revision',sql`revision>=0 AND number>0`),
 check('company_account_status',sql`status IN ('draft','awaiting_verification','verified','inactive')`),check('company_account_details',sql`json_valid(details_json) AND json_type(details_json)='object'`),
 check('company_account_conflicts',sql`json_valid(conflicts_json) AND json_type(conflicts_json)='array'`),check('company_account_evidence',sql`length(trim(evidence_reference)) BETWEEN 8 AND 500`),
 check('company_account_submission',sql`status NOT IN ('awaiting_verification','verified') OR submitted_at IS NOT NULL`),
 check('company_account_verification',sql`status<>'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND length(trim(verification_reference))>=8)`)]);
export const companyPaymentAccountCurrent=sqliteTable('company_payment_account_current',{
 currency:text('currency').primaryKey(),versionId:text('version_id').references(()=>companyPaymentAccountVersions.id),revision:integer('revision').notNull().default(0),updatedBy:text('updated_by').references(()=>users.id),updatedAt:timestamp('updated_at').notNull(),
},()=>[check('company_receiving_currency',sql`currency='NPR'`),check('company_receiving_revision',sql`revision>=0`)]);
export const companyPaymentAccountEvents=sqliteTable('company_payment_account_events',{
 id:text('id').primaryKey(),accountId:text('account_id').notNull().references(()=>companyPaymentAccounts.id),versionId:text('version_id').notNull().references(()=>companyPaymentAccountVersions.id),
 actorId:text('actor_id').notNull().references(()=>users.id),action:text('action').notNull(),reason:text('reason').notNull(),createdAt:timestamp('created_at').notNull(),
},()=>[check('company_account_event_reason',sql`length(trim(reason)) BETWEEN 10 AND 1000`)]);
export const companyPaymentInstructions=sqliteTable('company_payment_instructions',{
 orderId:text('order_id').primaryKey().references(()=>orders.id),accountVersionId:text('account_version_id').notNull().references(()=>companyPaymentAccountVersions.id),snapshotJson:text('snapshot_json').notNull(),
 amountPaisa:integer('amount_paisa').notNull(),currency:text('currency').notNull(),paymentReference:text('payment_reference').notNull().unique(),issuedAt:timestamp('issued_at').notNull(),deadlineAt:timestamp('deadline_at').notNull(),
 calendarVersion:text('calendar_version').notNull(),issuedBy:text('issued_by').notNull().references(()=>users.id),requestId:text('request_id').notNull().unique(),
},()=>[check('company_instruction_json',sql`json_valid(snapshot_json) AND json_type(snapshot_json)='object'`),check('company_instruction_amount',sql`amount_paisa>0 AND amount_paisa<=9007199254740991`),check('company_instruction_currency',sql`currency='NPR'`),check('company_instruction_deadline',sql`deadline_at=issued_at+86400000`)]);

export const categoryTemplateVersions=sqliteTable('category_template_versions',{
 id:text('id').primaryKey(),categoryId:text('category_id').notNull().references(()=>categories.id),version:integer('version').notNull(),contractJson:text('contract_json').notNull(),
 createdBy:text('created_by').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),reason:text('reason').notNull(),
},table=>[uniqueIndex('category_template_version_number').on(table.categoryId,table.version),check('category_template_number',sql`version>0`),check('category_template_json',sql`json_valid(contract_json)`),check('category_template_reason',sql`length(trim(reason)) BETWEEN 10 AND 1000`)]);
export const categoryTemplateStates=sqliteTable('category_template_states',{
 categoryId:text('category_id').primaryKey().references(()=>categories.id),versionId:text('version_id').notNull().references(()=>categoryTemplateVersions.id),revision:integer('revision').notNull(),
 lastEventId:text('last_event_id').notNull(),updatedBy:text('updated_by').notNull().references(()=>users.id),updatedAt:timestamp('updated_at').notNull(),
},()=>[check('category_template_revision',sql`revision>=0`)]);
export const productIntakeDrafts=sqliteTable('product_intake_drafts',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull().references(()=>users.id),sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),productId:text('product_id').references(()=>products.id),
 revision:integer('revision').notNull().default(0),categoryId:text('category_id'),answersJson:text('answers_json').notNull(),categoryChangeJson:text('category_change_json'),createdAt:timestamp('created_at').notNull(),updatedAt:timestamp('updated_at').notNull(),
},()=>[check('product_intake_revision',sql`revision>=0`),check('product_intake_answers',sql`json_valid(answers_json)`),check('product_intake_category_change',sql`category_change_json IS NULL OR json_valid(category_change_json)`)]);
export const productIntakeVersions=sqliteTable('product_intake_versions',{
 id:text('id').primaryKey(),draftId:text('draft_id').notNull().references(()=>productIntakeDrafts.id),revision:integer('revision').notNull(),categoryId:text('category_id'),answersJson:text('answers_json').notNull(),
 categoryContractVersionId:text('category_contract_version_id').references(()=>categoryTemplateVersions.id),createdAt:timestamp('created_at').notNull(),requestId:text('request_id').notNull().unique(),
},table=>[uniqueIndex('product_intake_saved_revision').on(table.draftId,table.revision),check('product_intake_version_revision',sql`revision>=0`),check('product_intake_version_answers',sql`json_valid(answers_json)`)]);

export const productOfferVersions=sqliteTable('product_offer_versions',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),matrixJson:text('matrix_json').notNull(),createdBy:text('created_by').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),
});
export const productOfferHeads=sqliteTable('product_offer_heads',{
 productId:text('product_id').primaryKey().references(()=>products.id),revision:integer('revision').notNull(),candidateVersionId:text('candidate_version_id').references(()=>productOfferVersions.id),currentVersionId:text('current_version_id').references(()=>productOfferVersions.id),inventoryMapped:integer('inventory_mapped').notNull().default(0),updatedAt:timestamp('updated_at').notNull(),
},()=>[check('product_offer_head_revision',sql`revision>=0`),check('product_offer_mapped_boolean',sql`inventory_mapped IN (0,1)`)]);
export const productOfferIdentities=sqliteTable('product_offer_identities',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),platformSku:text('platform_sku').notNull().unique(),physicalJson:text('physical_json').notNull(),stockFamilyKey:text('stock_family_key').notNull(),baseUnit:text('base_unit').notNull(),unitsPerOffer:integer('units_per_offer').notNull(),createdAt:timestamp('created_at').notNull(),
},table=>[index('product_offer_identity_product').on(table.productId),check('product_offer_base_unit',sql`base_unit IN ('piece','gram','millilitre')`),check('product_offer_units_positive',sql`units_per_offer>0`)]);
export const productOfferCurrent=sqliteTable('product_offer_current',{
 offerId:text('offer_id').primaryKey().references(()=>productOfferIdentities.id),productId:text('product_id').notNull().references(()=>products.id),versionId:text('version_id').notNull().references(()=>productOfferVersions.id),offerJson:text('offer_json').notNull(),
},table=>[index('product_offer_current_product').on(table.productId)]);
export const productOfferDecisions=sqliteTable('product_offer_decisions',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),versionId:text('version_id').notNull().references(()=>productOfferVersions.id),action:text('action').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),reason:text('reason').notNull(),createdAt:timestamp('created_at').notNull(),
});
export const offerStock=sqliteTable('offer_stock',{
 offerId:text('offer_id').primaryKey().references(()=>productOfferIdentities.id),available:integer('available').notNull(),reserved:integer('reserved').notNull(),revision:integer('revision').notNull(),paused:integer('paused').notNull().default(0),needsReconfirmation:integer('needs_reconfirmation').notNull().default(0),confirmedAt:timestamp('confirmed_at').notNull(),updatedAt:timestamp('updated_at').notNull(),
},()=>[check('offer_stock_counts',sql`available>=0 AND reserved>=0 AND revision>=0`),check('offer_stock_flags',sql`paused IN (0,1) AND needs_reconfirmation IN (0,1)`)]);
export const offerStockEvents=sqliteTable('offer_stock_events',{
 id:text('id').primaryKey(),offerId:text('offer_id').notNull().references(()=>productOfferIdentities.id),kind:text('kind').notNull(),availableDelta:integer('available_delta').notNull(),reservedDelta:integer('reserved_delta').notNull(),relatedOfferId:text('related_offer_id').references(()=>productOfferIdentities.id),reason:text('reason').notNull(),actorId:text('actor_id').references(()=>users.id),requestId:text('request_id').notNull(),createdAt:timestamp('created_at').notNull(),
},table=>[index('offer_stock_events_history').on(table.offerId,table.createdAt)]);
export const offerStockReservations=sqliteTable('offer_stock_reservations',{
 id:text('id').primaryKey(),offerId:text('offer_id').notNull().references(()=>productOfferIdentities.id),versionId:text('version_id').notNull().references(()=>productOfferVersions.id),customerId:text('customer_id').references(()=>users.id),quantity:integer('quantity').notNull(),snapshotJson:text('snapshot_json').notNull(),state:text('state',{enum:['reserved','released','consumed']}).notNull(),revision:integer('revision').notNull(),createdAt:timestamp('created_at').notNull(),updatedAt:timestamp('updated_at').notNull(),
},table=>[index('offer_reservation_offer').on(table.offerId,table.state),check('offer_reservation_values',sql`quantity>0 AND revision>=0`),check('offer_reservation_state',sql`state IN ('reserved','released','consumed')`)]);
export const orderItemOfferSnapshots=sqliteTable('order_item_offer_snapshots',{
 orderItemId:text('order_item_id').primaryKey().references(()=>orderItems.id),offerId:text('offer_id').notNull().references(()=>productOfferIdentities.id),versionId:text('version_id').notNull().references(()=>productOfferVersions.id),reservationId:text('reservation_id').unique().references(()=>offerStockReservations.id),snapshotJson:text('snapshot_json').notNull(),legacyMapping:integer('legacy_mapping').notNull(),createdAt:timestamp('created_at').notNull(),
},()=>[check('order_offer_legacy_boolean',sql`legacy_mapping IN (0,1)`)]);

export const commissionCommonPolicies=sqliteTable('commission_common_policies',{
 id:text('id').primaryKey(),registeredSettingId:text('registered_setting_id').notNull().unique().references(()=>businessSettingVersions.id),managedSettingId:text('managed_setting_id').notNull().unique().references(()=>businessSettingVersions.id),basisPoints:integer('basis_points').notNull(),effectiveAt:timestamp('effective_at').notNull(),publishedAt:timestamp('published_at').notNull(),publishedBy:text('published_by').notNull().references(()=>users.id),reason:text('reason').notNull(),termsText:text('terms_text').notNull(),replacesId:text('replaces_id').references(():AnySQLiteColumn=>commissionCommonPolicies.id),
},()=>[check('common_fee_rate',sql`basis_points BETWEEN 0 AND 10000`),check('common_fee_notice',sql`effective_at>=published_at+1296000000`)]);
export const commissionCommonCancellations=sqliteTable('commission_common_cancellations',{
 policyId:text('policy_id').primaryKey().references(()=>commissionCommonPolicies.id),replacementId:text('replacement_id').references(()=>commissionCommonPolicies.id),actorId:text('actor_id').notNull().references(()=>users.id),reason:text('reason').notNull(),createdAt:timestamp('created_at').notNull(),eventId:text('event_id').notNull().unique(),
});
export const commissionTermsCases=sqliteTable('commission_terms_cases',{
 id:text('id').primaryKey(),sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),sourceVersionId:text('source_version_id').notNull().references(()=>businessSettingVersions.id),offerKey:text('offer_key').notNull(),route:text('route',{enum:['registered_seller','managed_maker']}).notNull(),state:text('state',{enum:['open','accepted','replaced']}).notNull(),revision:integer('revision').notNull().default(1),publishedAt:timestamp('published_at').notNull(),effectiveAt:timestamp('effective_at').notNull(),createdAt:timestamp('created_at').notNull(),observedAt:timestamp('observed_at').notNull(),lastNoticeEventId:text('last_notice_event_id'),lastStaffEventId:text('last_staff_event_id'),lastContactAt:timestamp('last_contact_at'),lastReplyAt:timestamp('last_reply_at'),holdReviewedAt:timestamp('hold_reviewed_at'),superAdminReviewedAt:timestamp('super_admin_reviewed_at'),nextReviewAt:timestamp('next_review_at'),technicalIssueAt:timestamp('technical_issue_at'),technicalOwnerId:text('technical_owner_id').references(()=>users.id),technicalResolvedAt:timestamp('technical_resolved_at'),deliveryIssueAt:timestamp('delivery_issue_at'),deliveryResolvedAt:timestamp('delivery_resolved_at'),
},table=>[uniqueIndex('commission_terms_case_offer').on(table.sellerId,table.offerKey),check('commission_terms_route',sql`route IN ('registered_seller','managed_maker')`),check('commission_terms_state',sql`state IN ('open','accepted','replaced')`)]);
export const commissionTermsEvents=sqliteTable('commission_terms_events',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(()=>commissionTermsCases.id),eventKey:text('event_key').notNull().unique(),kind:text('kind').notNull(),dueAt:timestamp('due_at').notNull(),createdAt:timestamp('created_at').notNull(),routine:integer('routine').notNull(),actorId:text('actor_id').references(()=>users.id),detailJson:text('detail_json').notNull(),
},()=>[check('commission_terms_routine_boolean',sql`routine IN (0,1)`)]);
export const commissionTermsEmailControls=sqliteTable('commission_terms_email_controls',{
 sellerId:text('seller_id').primaryKey().references(()=>sellerProfiles.id),revision:integer('revision').notNull().default(0),lastRoutineQueuedAt:timestamp('last_routine_queued_at'),lastRoutineSentAt:timestamp('last_routine_sent_at'),lastPersonalContactAt:timestamp('last_personal_contact_at'),lastRoutineMessageId:text('last_routine_message_id'),routineClaimToken:text('routine_claim_token'),routineClaimMessageId:text('routine_claim_message_id'),routineClaimUntil:timestamp('routine_claim_until').notNull().default(sql`0`),
});
export const commissionTermsHoldBatches=sqliteTable('commission_terms_hold_batches',{id:text('id').primaryKey(),createdAt:timestamp('created_at').notNull()});
export const commissionTermsHoldBatchEvents=sqliteTable('commission_terms_hold_batch_events',{eventId:text('event_id').primaryKey().references(()=>commissionTermsEvents.id),batchId:text('batch_id').notNull().references(()=>commissionTermsHoldBatches.id)});
export const commissionTermsScanState=sqliteTable('commission_terms_scan_state',{id:text('id').primaryKey(),cursor:text('cursor').notNull().default(''),revision:integer('revision').notNull().default(0)},()=>[check('fee_terms_scan_singleton',sql`id='default'`)]);

export const productPrivatePriceInputs=sqliteTable('product_private_price_inputs',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull().references(()=>users.id),subjectKind:text('subject_kind',{enum:['product','intake']}).notNull(),subjectId:text('subject_id').notNull(),offerKey:text('offer_key').notNull(),revision:integer('revision').notNull(),costText:text('cost_text').notNull(),targetText:text('target_text').notNull(),updatedAt:timestamp('updated_at').notNull(),
},table=>[uniqueIndex('private_price_subject').on(table.ownerId,table.subjectKind,table.subjectId,table.offerKey),check('private_price_revision',sql`revision>=0`),check('private_price_kind',sql`subject_kind IN ('product','intake')`)]);
export const productPrivatePriceRequests=sqliteTable('product_private_price_requests',{
 ownerId:text('owner_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),payloadDigest:text('payload_digest').notNull(),revision:integer('revision').notNull(),createdAt:timestamp('created_at').notNull(),
},table=>[primaryKey({columns:[table.ownerId,table.requestId]}),check('private_price_request_revision',sql`revision>=0`)]);

export const productPriceReferenceReviews=sqliteTable('product_price_reference_reviews',{
 sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),offerId:text('offer_id').notNull(),versionId:text('version_id').notNull().references(()=>productOfferVersions.id),reviewRevision:integer('review_revision').notNull(),physicalJson:text('physical_json').notNull(),sellingPaisa:integer('selling_paisa').notNull(),comparePaisa:integer('compare_paisa').notNull(),decision:text('decision',{enum:['approved','suppressed']}).notNull(),evidenceKind:text('evidence_kind',{enum:['historical_order','external_offer','review_finding','platform_orderable']}).notNull(),evidenceReference:text('evidence_reference').notNull(),historyBasis:text('history_basis'),offeredFrom:timestamp('offered_from'),offeredTo:timestamp('offered_to'),reason:text('reason').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),
},table=>[uniqueIndex('price_reference_review').on(table.productId,table.offerId,table.versionId,table.reviewRevision),check('price_reference_pair',sql`selling_paisa>0 AND compare_paisa>selling_paisa`),check('price_reference_history_basis',sql`(evidence_kind='platform_orderable' AND history_basis IS NOT NULL AND length(trim(history_basis))>=10) OR (evidence_kind<>'platform_orderable' AND history_basis IS NULL)`),check('price_reference_evidence_kind',sql`evidence_kind IN ('historical_order','external_offer','review_finding','platform_orderable')`),check('price_reference_dates',sql`(evidence_kind='review_finding' AND decision='suppressed' AND offered_from IS NULL AND offered_to IS NULL) OR (evidence_kind<>'review_finding' AND offered_from IS NOT NULL AND offered_to IS NOT NULL AND offered_from>=0 AND offered_to>=offered_from AND offered_to<=created_at)`)]);
export const productDiscountCycles=sqliteTable('product_discount_cycles',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),offerId:text('offer_id').notNull().references(()=>productOfferIdentities.id),versionId:text('version_id').notNull().references(()=>productOfferVersions.id),referenceId:text('reference_id').notNull().references(()=>productPriceReferenceReviews.id),sellingPaisa:integer('selling_paisa').notNull(),comparePaisa:integer('compare_paisa').notNull(),priceText:text('price_text').notNull(),compareText:text('compare_text').notNull(),firstPublishedAt:timestamp('first_published_at').notNull(),visibleSince:timestamp('visible_since'),dismissedAt:timestamp('dismissed_at'),day23:text('day23',{enum:['pending','sent','skipped']}).notNull().default('pending'),day29:text('day29',{enum:['pending','sent','skipped']}).notNull().default('pending'),revision:integer('revision').notNull().default(0),
},table=>[uniqueIndex('discount_cycle_pair').on(table.productId,table.offerId,table.sellingPaisa,table.comparePaisa),index('product_discount_pending').on(table.productId,table.firstPublishedAt),check('discount_cycle_values',sql`selling_paisa>0 AND compare_paisa>selling_paisa AND revision>=0`)]);
export const productDiscountAdvisories=sqliteTable('product_discount_advisories',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),windowDay:integer('window_day').notNull(),suggestedAt:timestamp('suggested_at').notNull(),createdAt:timestamp('created_at').notNull(),
},table=>[uniqueIndex('discount_advisory_window').on(table.productId,table.windowDay,table.suggestedAt),check('discount_advisory_day',sql`window_day IN (23,29)`)]);
export const productDiscountAdvisoryItems=sqliteTable('product_discount_advisory_items',{
 advisoryId:text('advisory_id').notNull().references(()=>productDiscountAdvisories.id),cycleId:text('cycle_id').notNull().references(()=>productDiscountCycles.id),
},table=>[primaryKey({columns:[table.advisoryId,table.cycleId]})]);

export const productIntakeWorkspaceVersions=sqliteTable('product_intake_workspace_versions',{
 id:text('id').primaryKey(),draftId:text('draft_id').notNull().references(()=>productIntakeDrafts.id),revision:integer('revision').notNull(),kind:text('kind',{enum:['private','review_only']}).notNull().default('private'),basePublicVersionId:text('base_public_version_id'),snapshotJson:text('snapshot_json').notNull(),createdBy:text('created_by').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),
},table=>[uniqueIndex('intake_workspace_revision').on(table.draftId,table.revision).where(sql`kind='private'`),check('intake_workspace_json',sql`json_valid(snapshot_json)`)]);
export const productIntakeWorkspaceHeads=sqliteTable('product_intake_workspace_heads',{
 draftId:text('draft_id').primaryKey().references(()=>productIntakeDrafts.id),versionId:text('version_id').notNull().references(()=>productIntakeWorkspaceVersions.id),
});
export const productIntakeMedia=sqliteTable('product_intake_media',{
 id:text('id').primaryKey(),draftId:text('draft_id').notNull().references(()=>productIntakeDrafts.id),ownerId:text('owner_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),objectKey:text('object_key').notNull().unique(),mimeType:text('mime_type').notNull(),sizeBytes:integer('size_bytes').notNull(),originalName:text('original_name').notNull(),contentDigest:text('content_digest').notNull(),state:text('state',{enum:['uploading','ready']}).notNull(),createdAt:timestamp('created_at').notNull(),completedAt:timestamp('completed_at'),
},table=>[uniqueIndex('intake_media_request').on(table.ownerId,table.requestId),index('product_intake_media_draft').on(table.draftId,table.createdAt,table.id),check('intake_media_size',sql`size_bytes>0`),check('intake_media_state',sql`state IN ('uploading','ready')`)]);
export const productIntakeCases=sqliteTable('product_intake_cases',{
 id:text('id').primaryKey(),draftId:text('draft_id').notNull().references(()=>productIntakeDrafts.id),cycleNumber:integer('cycle_number').notNull().default(0),versionId:text('version_id').notNull().references(()=>productIntakeWorkspaceVersions.id),revision:integer('revision').notNull().default(0),state:text('state',{enum:['details_needed','submitted','in_review','waiting_seller','ready_for_decision','resolved']}).notNull(),firstRequestedAt:timestamp('first_requested_at').notNull(),triageDueAt:timestamp('triage_due_at').notNull(),triagedAt:timestamp('triaged_at'),firstCompleteAt:timestamp('first_complete_at'),reviewDueAt:timestamp('review_due_at'),firstReviewedAt:timestamp('first_reviewed_at'),lastEventId:text('last_event_id').notNull(),activeProposalId:text('active_proposal_id'),
},table=>[uniqueIndex('intake_case_cycle').on(table.draftId,table.cycleNumber),uniqueIndex('intake_case_active').on(table.draftId).where(sql`state<>'resolved'`),check('intake_case_clock',sql`revision>=0 AND triage_due_at>=first_requested_at`),check('intake_case_state',sql`state IN ('details_needed','submitted','in_review','waiting_seller','ready_for_decision','resolved')`)]);
export const productIntakeEvents=sqliteTable('product_intake_events',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(()=>productIntakeCases.id),versionId:text('version_id').notNull().references(()=>productIntakeWorkspaceVersions.id),eventKey:text('event_key').notNull().unique(),kind:text('kind').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),detailJson:text('detail_json').notNull(),createdAt:timestamp('created_at').notNull(),
},table=>[index('product_intake_event_history').on(table.caseId,table.createdAt,table.id),check('intake_event_json',sql`json_valid(detail_json)`)]);
export const productIntakeProposals=sqliteTable('product_intake_proposals',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(()=>productIntakeCases.id),baseVersionId:text('base_version_id').notNull().references(()=>productIntakeWorkspaceVersions.id),patchJson:text('patch_json').notNull(),sourceNote:text('source_note').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),state:text('state',{enum:['pending','accepted','declined','superseded']}).notNull(),decidedBy:text('decided_by').references(()=>users.id),decidedAt:timestamp('decided_at'),acceptedVersionId:text('accepted_version_id').references(()=>productIntakeWorkspaceVersions.id),
},table=>[index('product_intake_proposal_history').on(table.caseId,table.createdAt,table.id),check('intake_proposal_json',sql`json_valid(patch_json)`),check('intake_proposal_state',sql`state IN ('pending','accepted','declined','superseded')`)]);


export const productPublicationCandidates=sqliteTable('product_publication_candidates',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),caseId:text('case_id').notNull().references(()=>productIntakeCases.id),workspaceVersionId:text('workspace_version_id').notNull().references(()=>productIntakeWorkspaceVersions.id),offerVersionId:text('offer_version_id').notNull().unique().references(()=>productOfferVersions.id),categoryVersionId:text('category_version_id').notNull().references(()=>categoryTemplateVersions.id),baseVersionId:text('base_version_id').references(():AnySQLiteColumn=>productPublicationCandidates.id),createdBy:text('created_by').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),
},table=>[index('product_publication_candidates_case').on(table.caseId,table.createdAt)]);
export const productPublicationLinks=sqliteTable('product_publication_links',{
 draftId:text('draft_id').primaryKey().references(()=>productIntakeDrafts.id),productId:text('product_id').notNull().unique().references(()=>products.id),baseVersionId:text('base_version_id').references(()=>productPublicationCandidates.id),revision:integer('revision').notNull().default(0),
});
export const productPublicationDecisions=sqliteTable('product_publication_decisions',{
 id:text('id').primaryKey(),versionId:text('version_id').notNull().references(()=>productPublicationCandidates.id),action:text('action',{enum:['approve_only','approve_and_publish','publish_approved','request_changes','reject']}).notNull(),reviewJson:text('review_json').notNull(),publicJson:text('public_json'),orderingFactsReady:integer('ordering_facts_ready',{mode:'boolean'}).notNull().default(false),actorId:text('actor_id').notNull().references(()=>users.id),reason:text('reason').notNull(),createdAt:timestamp('created_at').notNull(),
});
export const productOrderablePriceObservations=sqliteTable('product_orderable_price_observations',{
 id:text('id').primaryKey(),
 productId:text('product_id').notNull().references(()=>products.id),
 sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),
 offerId:text('offer_id').notNull().references(()=>productOfferIdentities.id),
 offerVersionId:text('offer_version_id').notNull().references(()=>productOfferVersions.id),
 publicVersionId:text('public_version_id').notNull().references(()=>productPublicationCandidates.id),
 publicationId:text('publication_id').notNull().references(()=>productPublicationDecisions.id),
 physicalJson:text('physical_json').notNull(),scopeJson:text('scope_json').notNull(),
 sellingPaisa:integer('selling_paisa').notNull(),currency:text('currency',{enum:['NPR']}).notNull(),
 observedAt:timestamp('observed_at').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),reason:text('reason').notNull(),
},table=>[index('product_orderable_price_history').on(table.productId,table.sellerId,table.observedAt),check('orderable_price_positive',sql`selling_paisa>0`),check('orderable_price_currency',sql`currency='NPR'`),check('orderable_price_time',sql`observed_at>=0`)]);

export const productPublicationHeads=sqliteTable('product_publication_heads',{
 productId:text('product_id').primaryKey().references(()=>products.id),revision:integer('revision').notNull().default(0),pendingVersionId:text('pending_version_id').references(()=>productPublicationCandidates.id),currentVersionId:text('current_version_id').references(()=>productPublicationCandidates.id),approvedDecisionId:text('approved_decision_id').references(()=>productPublicationDecisions.id),currentPublicationId:text('current_publication_id').references(()=>productPublicationDecisions.id),lastEventId:text('last_event_id').notNull(),updatedAt:timestamp('updated_at').notNull(),
});
export const productPublicationMedia=sqliteTable('product_publication_media',{
 versionId:text('version_id').notNull().references(()=>productPublicationCandidates.id),mediaId:text('media_id').notNull().references(()=>productMedia.id),sortOrder:integer('sort_order').notNull(),
},table=>[primaryKey({columns:[table.versionId,table.mediaId]}),uniqueIndex('product_publication_media_order').on(table.versionId,table.sortOrder)]);

export const productAvailabilityEvents=sqliteTable('product_availability_events',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),revision:integer('revision').notNull(),kind:text('kind',{enum:['owner_pause','owner_resume','owner_stop','owner_restore','staff_withdraw','staff_restore']}).notNull(),ownerPaused:integer('owner_paused',{mode:'boolean'}).notNull(),ownerWithdrawn:integer('owner_withdrawn',{mode:'boolean'}).notNull(),staffWithdrawn:integer('staff_withdrawn',{mode:'boolean'}).notNull(),publicVersionId:text('public_version_id').references(()=>productPublicationCandidates.id),previousEventId:text('previous_event_id').references(():AnySQLiteColumn=>productAvailabilityEvents.id),actorId:text('actor_id').notNull().references(()=>users.id),reason:text('reason').notNull(),requestId:text('request_id').notNull(),createdAt:timestamp('created_at').notNull(),
},table=>[uniqueIndex('product_availability_event_revision').on(table.productId,table.revision),uniqueIndex('product_availability_event_request').on(table.actorId,table.requestId)]);
export const productAvailabilityStates=sqliteTable('product_availability_states',{
 productId:text('product_id').primaryKey().references(()=>products.id),revision:integer('revision').notNull(),ownerPaused:integer('owner_paused',{mode:'boolean'}).notNull(),ownerWithdrawn:integer('owner_withdrawn',{mode:'boolean'}).notNull(),staffWithdrawn:integer('staff_withdrawn',{mode:'boolean'}).notNull(),lastEventId:text('last_event_id').notNull().references(()=>productAvailabilityEvents.id),updatedAt:timestamp('updated_at').notNull(),
});

export const productLegacyObservations=sqliteTable('product_legacy_observations',{
 productId:text('product_id').primaryKey().references(()=>products.id),draftId:text('draft_id').notNull().unique().references(()=>productIntakeDrafts.id),sourceFingerprint:text('source_fingerprint').notNull(),observedJson:text('observed_json').notNull(),createdBy:text('created_by').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),
});

export const productLegacyMediaCopies=sqliteTable('product_legacy_media_copies',{
 draftId:text('draft_id').notNull().references(()=>productIntakeDrafts.id),sourceMediaId:text('source_media_id').notNull().references(()=>productMedia.id),sourceObjectKey:text('source_object_key').notNull(),intakeMediaId:text('intake_media_id').notNull().unique().references(()=>productIntakeMedia.id),createdBy:text('created_by').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),
},table=>[primaryKey({columns:[table.draftId,table.sourceMediaId]})]);

export const productPriorityEvents=sqliteTable('product_priority_events',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull(),productId:text('product_id').notNull().references(()=>products.id),revision:integer('revision').notNull(),kind:text('kind').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),detailJson:text('detail_json').notNull(),createdAt:timestamp('created_at').notNull(),
},table=>[uniqueIndex('product_priority_event_revision').on(table.caseId,table.revision)]);
export const productPriorityCases=sqliteTable('product_priority_cases',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),kind:text('kind').notNull(),publicVersionId:text('public_version_id').references(()=>productPublicationCandidates.id),reportedBy:text('reported_by').notNull().references(()=>users.id),state:text('state').notNull(),activeSlot:integer('active_slot'),revision:integer('revision').notNull(),backupId:text('backup_id').references(()=>users.id),backupUnavailableReason:text('backup_unavailable_reason').notNull().default(''),nextUpdateAt:timestamp('next_update_at'),triagedAt:timestamp('triaged_at'),lastEventId:text('last_event_id').notNull().references(()=>productPriorityEvents.id),createdAt:timestamp('created_at').notNull(),updatedAt:timestamp('updated_at').notNull(),
},table=>[uniqueIndex('product_priority_active_kind').on(table.productId,table.kind,table.activeSlot)]);

export const productPriorityReportMedia=sqliteTable('product_priority_report_media',{
 eventId:text('event_id').notNull().references(()=>productPriorityEvents.id),mediaId:text('media_id').notNull().references(()=>productMedia.id),
},table=>[primaryKey({columns:[table.eventId,table.mediaId]})]);

export const cartOfferLines=sqliteTable('cart_offer_lines',{
 id:text('id').primaryKey(),cartId:text('cart_id').notNull().references(()=>carts.id),productId:text('product_id').notNull().references(()=>products.id),offerId:text('offer_id').notNull().references(()=>productOfferIdentities.id),versionId:text('version_id').notNull().references(()=>productOfferVersions.id),publicVersionId:text('public_version_id').references(()=>productPublicationCandidates.id),quantity:integer('quantity').notNull(),revision:integer('revision').notNull(),snapshotJson:text('snapshot_json').notNull(),createdAt:timestamp('created_at').notNull(),updatedAt:timestamp('updated_at').notNull(),
},table=>[uniqueIndex('cart_selected_offer_unique').on(table.cartId,table.offerId)]);
export const cartOfferCommands=sqliteTable('cart_offer_commands',{
 cartId:text('cart_id').notNull().references(()=>carts.id),requestId:text('request_id').notNull(),payloadJson:text('payload_json').notNull(),createdAt:timestamp('created_at').notNull(),
},table=>[primaryKey({columns:[table.cartId,table.requestId]})]);

// T21 original payment windows, independently verified receipts, claims and allocations.
export const manualPaymentWindows=sqliteTable('manual_payment_windows',{
 orderId:text('order_id').primaryKey().references(()=>orders.id),
 amountPaisa:integer('amount_paisa').notNull(),
 issuedAt:timestamp('issued_at').notNull(),
 deadlineAt:timestamp('deadline_at').notNull(),
 bufferEndAt:timestamp('buffer_end_at').notNull(),
 calendarVersion:text('calendar_version').notNull(),
 lastEventId:text('last_event_id').notNull(),
 revision:integer('revision').notNull().default(0),
 paidAt:timestamp('paid_at'),
 closedAt:timestamp('closed_at'),
 releasedAt:timestamp('released_at'),
 closureReason:text('closure_reason')
},_t=>[check('manual_payment_windows_check_0',sql`deadline_at=issued_at+86400000`),check('manual_payment_windows_check_1',sql`buffer_end_at>deadline_at`),check('manual_payment_windows_check_2',sql`paid_at IS NULL OR closed_at IS NULL`),check('manual_payment_windows_check_3',sql`released_at IS NULL OR paid_at IS NOT NULL`)]);

export const manualPaymentClaims=sqliteTable('manual_payment_claims',{
 id:text('id').primaryKey(),
 orderId:text('order_id').notNull().unique().references(()=>manualPaymentWindows.orderId),
 customerId:text('customer_id').notNull().references(()=>users.id),
 claimedAmountPaisa:integer('claimed_amount_paisa').notNull(),
 paymentDate:text('payment_date').notNull(),
 bankReference:text('bank_reference'),
 note:text('note').notNull(),
 evidenceIdsJson:text('evidence_ids_json').notNull(),
 firstSubmittedAt:timestamp('first_submitted_at').notNull(),
 currentState:text('current_state').notNull(),
 revision:integer('revision').notNull().default(0),
 updatedAt:timestamp('updated_at').notNull()
});

export const manualPaymentClaimEvents=sqliteTable('manual_payment_claim_events',{
 id:text('id').primaryKey(),
 claimId:text('claim_id').notNull().references(()=>manualPaymentClaims.id),
 orderId:text('order_id').notNull().references(()=>manualPaymentWindows.orderId),
 revision:integer('revision').notNull(),
 state:text('state').notNull(),
 snapshotJson:text('snapshot_json').notNull(),
 actorId:text('actor_id').notNull().references(()=>users.id),
 occurredAt:timestamp('occurred_at').notNull(),
 requestId:text('request_id').notNull()
},t=>[uniqueIndex('manual_payment_claim_events_unique').on(t.claimId,t.revision)]);

export const manualPaymentClaimFiles=sqliteTable('manual_payment_claim_files',{
 id:text('id').primaryKey(),
 orderId:text('order_id').notNull().references(()=>manualPaymentWindows.orderId),
 uploadedBy:text('uploaded_by').notNull().references(()=>users.id),
 objectKey:text('object_key').notNull().unique(),
 originalName:text('original_name').notNull(),
 mimeType:text('mime_type').notNull(),
 sizeBytes:integer('size_bytes').notNull(),
 createdAt:timestamp('created_at').notNull()
});

export const companyMoneyReceipts=sqliteTable('company_money_receipts',{
 id:text('id').primaryKey(),
 kind:text('kind').notNull(),
 accountVersionId:text('account_version_id').references(()=>companyPaymentAccountVersions.id),
 sourceIdentityHash:text('source_identity_hash').notNull().unique(),
 transactionIdentity:text('transaction_identity').notNull(),
 bankAt:timestamp('bank_at').notNull(),
 confirmedAt:timestamp('confirmed_at').notNull(),
 amountMinor:integer('amount_minor').notNull(),
 currency:text('currency').notNull(),
 payerReference:text('payer_reference').notNull(),
 payerUserId:text('payer_user_id').references(()=>users.id),
 collectorUserId:text('collector_user_id').references(()=>users.id),
 evidenceReference:text('evidence_reference').notNull(),
 verificationReason:text('verification_reason').notNull(),
 status:text('status').notNull(),
 revision:integer('revision').notNull().default(0),
 createdBy:text('created_by').notNull().references(()=>users.id)
},_t=>[check('company_money_receipts_check_0',sql`kind<>'bank_credit' OR account_version_id IS NOT NULL`),check('company_money_receipts_check_1',sql`kind<>'cash_handover' OR account_version_id IS NULL`)]);

export const companyReceiptConflicts=sqliteTable('company_receipt_conflicts',{
 receiptId:text('receipt_id').notNull().references(()=>companyMoneyReceipts.id),
 userId:text('user_id').notNull().references(()=>users.id),
 recordedBy:text('recorded_by').notNull().references(()=>users.id),
 recordedAt:timestamp('recorded_at').notNull()
},t=>[primaryKey({columns:[t.receiptId,t.userId]})]);

export const manualReceiptUses=sqliteTable('manual_receipt_uses',{
 id:text('id').primaryKey(),
 receiptId:text('receipt_id').notNull().references(()=>companyMoneyReceipts.id),
 kind:text('kind').notNull(),
 targetId:text('target_id').notNull(),
 amountMinor:integer('amount_minor').notNull(),
 state:text('state').notNull(),
 createdBy:text('created_by').notNull().references(()=>users.id),
 createdAt:timestamp('created_at').notNull(),
 revision:integer('revision').notNull().default(0)
});

export const manualPaymentAllocations=sqliteTable('manual_payment_allocations',{
 id:text('id').primaryKey(),
 receiptUseId:text('receipt_use_id').notNull().unique().references(()=>manualReceiptUses.id),
 receiptId:text('receipt_id').notNull().references(()=>companyMoneyReceipts.id),
 orderId:text('order_id').notNull().references(()=>manualPaymentWindows.orderId),
 amountPaisa:integer('amount_paisa').notNull(),
 allocatedAt:timestamp('allocated_at').notNull(),
 actorId:text('actor_id').notNull().references(()=>users.id),
 matchingBasis:text('matching_basis').notNull(),
 exceptionJson:text('exception_json')
});

export const companyReceiptReversals=sqliteTable('company_receipt_reversals',{
 id:text('id').primaryKey(),
 receiptId:text('receipt_id').notNull().references(()=>companyMoneyReceipts.id),
 sourceIdentityHash:text('source_identity_hash').notNull().unique(),
 transactionIdentity:text('transaction_identity').notNull(),
 amountMinor:integer('amount_minor').notNull(),
 actorId:text('actor_id').notNull().references(()=>users.id),
 evidenceReference:text('evidence_reference').notNull(),
 reason:text('reason').notNull(),
 bankAt:timestamp('bank_at').notNull(),
 recordedAt:timestamp('recorded_at').notNull()
});

export const manualPaymentExceptions=sqliteTable('manual_payment_exceptions',{
 id:text('id').primaryKey(),
 sourceKey:text('source_key').notNull().unique(),
 orderId:text('order_id').references(()=>orders.id),
 receiptId:text('receipt_id').references(()=>companyMoneyReceipts.id),
 kind:text('kind').notNull(),
 lastEventId:text('last_event_id').notNull(),
 state:text('state').notNull(),
 revision:integer('revision').notNull().default(0),
 reason:text('reason').notNull(),
 ownerId:text('owner_id').references(()=>users.id),
 backupId:text('backup_id').references(()=>users.id),
 createdAt:timestamp('created_at').notNull(),
 triagedAt:timestamp('triaged_at'),
 nextUpdateAt:timestamp('next_update_at').notNull(),
 updatedAt:timestamp('updated_at').notNull()
});

export const companyReceiptControls=sqliteTable('company_receipt_controls',{
 receiptId:text('receipt_id').primaryKey().references(()=>companyMoneyReceipts.id),
 revision:integer('revision').notNull().default(0)
});

export const manualPaymentReminders=sqliteTable('manual_payment_reminders',{orderId:text('order_id').primaryKey().references(()=>manualPaymentWindows.orderId),eventId:text('event_id').notNull().unique(),createdAt:timestamp('created_at').notNull()});

export const codCompanyReceiptAllocations=sqliteTable('cod_company_receipt_allocations',{
 id:text('id').primaryKey(),receiptUseId:text('receipt_use_id').notNull().unique().references(()=>manualReceiptUses.id),receiptId:text('receipt_id').notNull().references(()=>companyMoneyReceipts.id),shippingJobId:text('shipping_job_id').notNull().references(()=>shippingJobs.id),cashRecordId:text('cash_record_id').notNull(),amountPaisa:integer('amount_paisa').notNull(),approvedBy:text('approved_by').notNull().references(()=>users.id),evidenceReference:text('evidence_reference').notNull(),createdAt:timestamp('created_at').notNull()
});
export const codApprovedDeductions=sqliteTable('cod_approved_deductions',{
 id:text('id').primaryKey(),shippingJobId:text('shipping_job_id').notNull().references(()=>shippingJobs.id),courierCostId:text('courier_cost_id').notNull(),amountPaisa:integer('amount_paisa').notNull(),approvedBy:text('approved_by').notNull().references(()=>users.id),termsEvidence:text('terms_evidence').notNull(),partyAllocationJson:text('party_allocation_json').notNull(),createdAt:timestamp('created_at').notNull()
});

export const manualPaymentExceptionEvents=sqliteTable('manual_payment_exception_events',{
 id:text('id').primaryKey(),exceptionId:text('exception_id').notNull().references(()=>manualPaymentExceptions.id),revision:integer('revision').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),ownerId:text('owner_id').references(()=>users.id),backupId:text('backup_id').references(()=>users.id),state:text('state').notNull(),note:text('note').notNull(),nextUpdateAt:timestamp('next_update_at').notNull(),createdAt:timestamp('created_at').notNull()
});


// Actual release, scoped holds and immutable preparation follow-up.
export const orderResponsePortions=sqliteTable('order_response_portions',{
 id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),operatorMode:text('operator_mode',{enum:['seller','company']}).notNull(),createdAt:integer('created_at').notNull(),
});
export const orderResponseCases=sqliteTable('order_response_cases',{
 id:text('id').primaryKey(),portionId:text('portion_id').notNull().references(()=>orderResponsePortions.id),sourceKey:text('source_key').notNull().unique(),kind:text('kind',{enum:['no_response','delay','cannot_fulfill','hold','promise_missed']}).notNull(),state:text('state',{enum:['open','waiting','resolved']}).notNull().default('open'),scopeJson:text('scope_json').notNull(),privateDetail:text('private_detail').notNull(),publicMessage:text('public_message'),proposedReadyAt:integer('proposed_ready_at'),ownerId:text('owner_id').references(()=>users.id),backupId:text('backup_id').references(()=>users.id),reportedBy:text('reported_by').references(()=>users.id),createdAt:integer('created_at').notNull(),firstActionAt:integer('first_action_at'),firstDueAt:integer('first_due_at').notNull(),nextUpdateAt:integer('next_update_at'),commitmentMissing:integer('commitment_missing',{mode:'boolean'}).notNull().default(true),revision:integer('revision').notNull().default(0),lastEventId:text('last_event_id').notNull(),
});
export const orderResponseItems=sqliteTable('order_response_items',{
 orderItemId:text('order_item_id').primaryKey().references(()=>orderItems.id),portionId:text('portion_id').notNull().references(()=>orderResponsePortions.id),releasedAt:integer('released_at').notNull(),progressAt:integer('progress_at'),exceptionCaseId:text('exception_case_id').references(()=>orderResponseCases.id),revision:integer('revision').notNull().default(0),
});
export const orderFulfillmentHolds=sqliteTable('order_fulfillment_holds',{
 id:text('id').primaryKey(),orderItemId:text('order_item_id').notNull().references(()=>orderItems.id),reason:text('reason').notNull(),sourceType:text('source_type').notNull(),sourceId:text('source_id').notNull(),imposedBy:text('imposed_by').references(()=>users.id),ownerId:text('owner_id').references(()=>users.id),preventsPreparation:integer('prevents_preparation',{mode:'boolean'}).notNull(),preventsHandoff:integer('prevents_handoff',{mode:'boolean'}).notNull(),startedAt:integer('started_at').notNull(),reviewDueAt:integer('review_due_at').notNull(),endedAt:integer('ended_at'),endedBy:text('ended_by').references(()=>users.id),releaseReason:text('release_reason'),revision:integer('revision').notNull().default(0),
});
export const orderResponseEvents=sqliteTable('order_response_events',{
 caseState:text('case_state'),caseRevision:integer('case_revision'),dueAt:integer('due_at'),expiresAt:integer('expires_at'),
 id:text('id').primaryKey(),portionId:text('portion_id').references(()=>orderResponsePortions.id),caseId:text('case_id').references(()=>orderResponseCases.id),orderId:text('order_id').notNull().references(()=>orders.id),kind:text('kind').notNull(),scopeJson:text('scope_json').notNull(),sourceKey:text('source_key').notNull().unique(),actorId:text('actor_id').references(()=>users.id),note:text('note').notNull(),createdAt:integer('created_at').notNull(),
});
export const orderResponseMilestones=sqliteTable('order_response_milestones',{
 orderItemId:text('order_item_id').notNull().references(()=>orderResponseItems.orderItemId),milestone:text('milestone').notNull(),eventId:text('event_id').notNull().references(()=>orderResponseEvents.id),createdAt:integer('created_at').notNull(),
},table=>[primaryKey({columns:[table.orderItemId,table.milestone]})]);

export const orderResponseCustomerState=sqliteTable('order_response_customer_state',{
 orderId:text('order_id').primaryKey().references(()=>orders.id),currentEventId:text('current_event_id').notNull().references(()=>orderResponseEvents.id),revision:integer('revision').notNull().default(0),
});

export const orderCancellationReviews=sqliteTable('order_cancellation_reviews',{
 id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),sellerIdsJson:text('seller_ids_json').notNull(),note:text('note').notNull(),status:text('status',{enum:['pending','approved','rejected']}).notNull().default('pending'),requestedBy:text('requested_by'),reviewedBy:text('reviewed_by'),reviewNote:text('review_note'),createdAt:integer('created_at').notNull(),reviewedAt:integer('reviewed_at'),revision:integer('revision').notNull().default(0),ownerId:text('owner_id').references(()=>users.id),backupId:text('backup_id').references(()=>users.id),firstActionAt:integer('first_action_at'),firstDueAt:integer('first_due_at'),nextUpdateAt:integer('next_update_at'),originalFactsJson:text('original_facts_json'),
});

export const returnHandling=sqliteTable('return_handling',{
 caseId:text('case_id').primaryKey().references(()=>returnRequests.id),revision:integer('revision').notNull().default(0),ownerId:text('owner_id').references(()=>users.id),backupId:text('backup_id').references(()=>users.id),
 firstReceivedAt:integer('first_received_at').notNull(),firstDueAt:integer('first_due_at').notNull(),firstActionAt:integer('first_action_at'),nextUpdateAt:integer('next_update_at'),phase:text('phase').notNull().default('requested'),calendarVersion:text('calendar_version'),enoughInformationAt:integer('enough_information_at'),instructionsDueAt:integer('instructions_due_at'),instructionsJson:text('instructions_json'),instructionsAt:integer('instructions_at'),handoffDueAt:integer('handoff_due_at'),handedAt:integer('handed_at'),receivedAt:integer('received_at'),sufficientEvidenceAt:integer('sufficient_evidence_at'),inspectionDueAt:integer('inspection_due_at'),
 receivedQuantity:integer('received_quantity').notNull().default(0),inspectedQuantity:integer('inspected_quantity').notNull().default(0),restockedQuantity:integer('restocked_quantity').notNull().default(0),waivedQuantity:integer('waived_quantity').notNull().default(0),waitingFor:text('waiting_for').notNull().default('none'),clarificationAt:integer('clarification_at'),clarificationDueAt:integer('clarification_due_at'),lastEventId:text('last_event_id'),createdAt:integer('created_at').notNull(),
});
export const returnHandlingEvents=sqliteTable('return_handling_events',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(()=>returnRequests.id),revision:integer('revision').notNull(),action:text('action').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),occurredAt:integer('occurred_at').notNull(),recordedAt:integer('recorded_at').notNull(),publicMessage:text('public_message').notNull(),privateNote:text('private_note').notNull(),evidenceReference:text('evidence_reference').notNull(),detailsJson:text('details_json').notNull(),requestId:text('request_id').notNull(),
},table=>[uniqueIndex('return_handling_case_revision').on(table.caseId,table.revision),uniqueIndex('return_handling_actor_request').on(table.actorId,table.requestId)]);
export const returnReplacementShipments=sqliteTable('return_replacement_shipments',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(()=>returnRequests.id),quantity:integer('quantity').notNull(),offerId:text('offer_id').references(()=>productOfferIdentities.id),state:text('state').notNull(),revision:integer('revision').notNull().default(0),customerAgreementReference:text('customer_agreement_reference').notNull(),promisedAt:integer('promised_at').notNull(),carrierReference:text('carrier_reference'),dispatchedAt:integer('dispatched_at'),deliveredAt:integer('delivered_at'),closedAt:integer('closed_at'),createdAt:integer('created_at').notNull(),
});
export const returnStockActions=sqliteTable('return_stock_actions',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(()=>returnRequests.id),shipmentId:text('shipment_id').references(()=>returnReplacementShipments.id),offerId:text('offer_id').references(()=>productOfferIdentities.id),productId:text('product_id').references(()=>products.id),kind:text('kind').notNull(),quantity:integer('quantity').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),createdAt:integer('created_at').notNull(),
},table=>[uniqueIndex('return_stock_case_request_kind').on(table.caseId,table.requestId,table.kind)]);

export const aftercareFollowupEvents=sqliteTable('aftercare_followup_events',{
 id:text('id').primaryKey(),sourceType:text('source_type').notNull(),sourceId:text('source_id').notNull(),revision:integer('revision').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),ownerId:text('owner_id').references(()=>users.id),backupId:text('backup_id').references(()=>users.id),waitingFor:text('waiting_for').notNull(),nextUpdateAt:integer('next_update_at').notNull(),nextAction:text('next_action').notNull(),publicMessage:text('public_message').notNull(),privateNote:text('private_note').notNull(),requestId:text('request_id').notNull(),createdAt:integer('created_at').notNull(),
},table=>[uniqueIndex('aftercare_event_request').on(table.actorId,table.requestId),uniqueIndex('aftercare_event_revision').on(table.sourceType,table.sourceId,table.revision)]);
export const aftercareFollowupMilestones=sqliteTable('aftercare_followup_milestones',{
 sourceType:text('source_type').notNull(),sourceId:text('source_id').notNull(),cycle:text('cycle').notNull(),kind:text('kind').notNull(),eventId:text('event_id').notNull(),createdAt:integer('created_at').notNull(),
},table=>[primaryKey({columns:[table.sourceType,table.sourceId,table.cycle,table.kind]})]);

export const refundObligations=sqliteTable('refund_obligations',{
 id:text('id').primaryKey(),
 sourceKind:text('source_kind').notNull(),
 sourceId:text('source_id').notNull(),
 orderId:text('order_id').references(():AnySQLiteColumn=>orders.id),
 receiptId:text('receipt_id').references(():AnySQLiteColumn=>companyMoneyReceipts.id),
 receiptUseId:text('receipt_use_id').references(():AnySQLiteColumn=>manualReceiptUses.id),
 customerId:text('customer_id').notNull().references(():AnySQLiteColumn=>users.id),
 cashPaisa:integer('cash_paisa').notNull(),
 walletPaisa:integer('wallet_paisa').notNull(),
 currency:text('currency').notNull(),
 sourceSnapshotJson:text('source_snapshot_json').notNull(),
 state:text('state').notNull().default('open'),
 revision:integer('revision').notNull().default(0),
 ownerId:text('owner_id').notNull().references(():AnySQLiteColumn=>users.id),
 backupId:text('backup_id').references(():AnySQLiteColumn=>users.id),
 authorizedAt:integer('authorized_at').notNull(),
 firstFinanceDueAt:integer('first_finance_due_at').notNull(),
 firstFinanceAt:integer('first_finance_at'),
 nextUpdateAt:integer('next_update_at').notNull(),
 calendarVersion:text('calendar_version').notNull(),
 createdAt:integer('created_at').notNull()
});

export const refundObligationEvents=sqliteTable('refund_obligation_events',{
 id:text('id').primaryKey(),
 obligationId:text('obligation_id').notNull().references(():AnySQLiteColumn=>refundObligations.id),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 action:text('action').notNull(),
 publicMessage:text('public_message').notNull(),
 privateDetailsJson:text('private_details_json').notNull(),
 requestId:text('request_id').notNull(),
 createdAt:integer('created_at').notNull()
});

export const refundDestinationHeads=sqliteTable('refund_destination_heads',{
 obligationId:text('obligation_id').primaryKey().references(():AnySQLiteColumn=>refundObligations.id),
 versionId:text('version_id'),
 revision:integer('revision').notNull().default(0)
});

export const refundDestinationVersions=sqliteTable('refund_destination_versions',{
 id:text('id').primaryKey(),
 obligationId:text('obligation_id').notNull().references(():AnySQLiteColumn=>refundObligations.id),
 number:integer('number').notNull(),
 revision:integer('revision').notNull().default(0),
 detailsJson:text('details_json').notNull(),
 relationship:text('relationship').notNull(),
 customerAuthorization:text('customer_authorization').notNull(),
 evidenceReference:text('evidence_reference').notNull(),
 submittedBy:text('submitted_by').notNull().references(():AnySQLiteColumn=>users.id),
 sessionHash:text('session_hash').notNull(),
 authenticatedAt:integer('authenticated_at').notNull(),
 createdAt:integer('created_at').notNull(),
 status:text('status').notNull(),
 verifiedBy:text('verified_by').references(():AnySQLiteColumn=>users.id),
 verifiedAt:integer('verified_at'),
 verificationReference:text('verification_reference')
});

export const companyFundingAccounts=sqliteTable('company_funding_accounts',{
 accountId:text('account_id').primaryKey().references(():AnySQLiteColumn=>companyPaymentAccounts.id),
 statementId:text('statement_id'),
 revision:integer('revision').notNull().default(0)
});

export const companyFundingStatements=sqliteTable('company_funding_statements',{
 id:text('id').primaryKey(),
 accountId:text('account_id').notNull().references(():AnySQLiteColumn=>companyPaymentAccounts.id),
 accountVersionId:text('account_version_id').notNull().references(():AnySQLiteColumn=>companyPaymentAccountVersions.id),
 statementIdentity:text('statement_identity').notNull(),
 asOf:integer('as_of').notNull(),
 cashPaisa:integer('cash_paisa').notNull(),
 restrictedPaisa:integer('restricted_paisa').notNull(),
 evidenceReference:text('evidence_reference').notNull(),
 restrictionsReference:text('restrictions_reference').notNull(),
 verifiedBy:text('verified_by').notNull().references(():AnySQLiteColumn=>users.id),
 recordedAt:integer('recorded_at').notNull()
});

export const outgoingPaymentPackets=sqliteTable('outgoing_payment_packets',{
 id:text('id').primaryKey(),
 obligationId:text('obligation_id').notNull().references(():AnySQLiteColumn=>refundObligations.id),
 fundingStatementId:text('funding_statement_id').references(():AnySQLiteColumn=>companyFundingStatements.id),
 accountVersionId:text('account_version_id').references(():AnySQLiteColumn=>companyPaymentAccountVersions.id),
 destinationVersionId:text('destination_version_id').references(():AnySQLiteColumn=>refundDestinationVersions.id),
 amountPaisa:integer('amount_paisa').notNull(),
 currency:text('currency').notNull(),
 state:text('state').notNull(),
 revision:integer('revision').notNull().default(0),
 preparedBy:text('prepared_by').notNull().references(():AnySQLiteColumn=>users.id),
 approvedBy:text('approved_by').references(():AnySQLiteColumn=>users.id),
 startedBy:text('started_by').references(():AnySQLiteColumn=>users.id),
 recordedBy:text('recorded_by').references(():AnySQLiteColumn=>users.id),
 preparedAt:integer('prepared_at').notNull(),
 approvedAt:integer('approved_at'),
 startedAt:integer('started_at'),
 recordedAt:integer('recorded_at'),
 bankAt:integer('bank_at'),
 transactionIdentity:text('transaction_identity'),
 transactionIdentityHash:text('transaction_identity_hash'),
 evidenceReference:text('evidence_reference')
});

export const refundRouteSimulationCaptures = sqliteTable(
  'refund_route_simulation_captures',
  {
    id: text('id').notNull().primaryKey(),
    orderId: text('order_id').notNull().references(() => orders.id),
    transactionId: text('transaction_id').notNull(),
    sessionNumber: text('session_number').notNull(),
    capturedPaisa: integer('captured_paisa').notNull(),
    currency: text('currency', { enum: ['NPR'] }).notNull(),
  },
  (table) => [
    unique().on(table.transactionId, table.sessionNumber),
    check('refund_route_capture_id_valid', sql`length(${table.id})=64 AND ${table.id} NOT GLOB '*[^0-9a-f]*'`),
    check('refund_route_capture_transaction_valid', sql`length(${table.transactionId}) BETWEEN 1 AND 191`),
    check('refund_route_capture_session_valid', sql`length(${table.sessionNumber}) BETWEEN 1 AND 191`),
    check('refund_route_capture_amount_valid', sql`typeof(${table.capturedPaisa})='integer' AND ${table.capturedPaisa} BETWEEN 1 AND 9007199254740991`),
    check('refund_route_capture_currency_valid', sql`${table.currency}='NPR'`),
  ],
);

export const refundRouteSimulationAttempts = sqliteTable(
  'refund_route_simulation_attempts',
  {
    id: text('id').notNull().primaryKey(),
    obligationId: text('obligation_id').notNull().references(() => refundObligations.id),
    captureId: text('capture_id').notNull().references(() => refundRouteSimulationCaptures.id),
    route: text('route', { enum: ['fonepay', 'bank', 'pickup'] }).notNull(),
    requestId: text('request_id').notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    unique().on(table.obligationId, table.requestId),
    index('refund_route_capture_attempts').on(table.captureId),
    check('refund_route_attempt_route_valid', sql`${table.route} IN ('fonepay','bank','pickup')`),
    check('refund_route_attempt_request_valid', sql`length(${table.requestId}) BETWEEN 1 AND 191`),
    check('refund_route_attempt_amount_valid', sql`typeof(${table.amountPaisa})='integer' AND ${table.amountPaisa} BETWEEN 1 AND 9007199254740991`),
    check('refund_route_attempt_clock_valid', sql`typeof(${table.createdAt})='integer' AND ${table.createdAt} BETWEEN 1 AND 9007199254740991`),
  ],
);

export const refundRouteSimulationEvents = sqliteTable(
  'refund_route_simulation_events',
  {
    attemptId: text('attempt_id').notNull().references(() => refundRouteSimulationAttempts.id),
    sequence: integer('sequence').notNull(),
    route: text('route', { enum: ['fonepay', 'bank', 'pickup'] }).notNull(),
    providerReference: text('provider_reference').notNull(),
    eventReference: text('event_reference').notNull(),
    status: text('status', { enum: ['submitted', 'uncertain', 'partial', 'settled', 'closed'] }).notNull(),
    settledPaisa: integer('settled_paisa').notNull(),
    confirmedUnsentPaisa: integer('confirmed_unsent_paisa').notNull(),
    proofReference: text('proof_reference'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.attemptId, table.sequence] }),
    unique().on(table.route, table.eventReference),
    unique().on(table.route, table.proofReference),
    uniqueIndex('refund_route_original_provider_reference')
      .on(table.route, table.providerReference)
      .where(sql`${table.sequence}=1`),
    check('refund_route_event_sequence_valid', sql`typeof(${table.sequence})='integer' AND ${table.sequence} BETWEEN 1 AND 9007199254740991`),
    check('refund_route_event_route_valid', sql`${table.route} IN ('fonepay','bank','pickup')`),
    check('refund_route_event_provider_valid', sql`length(${table.providerReference}) BETWEEN 1 AND 191`),
    check('refund_route_event_reference_valid', sql`length(${table.eventReference}) BETWEEN 1 AND 191`),
    check('refund_route_event_status_valid', sql`${table.status} IN ('submitted','uncertain','partial','settled','closed')`),
    check('refund_route_event_settled_valid', sql`typeof(${table.settledPaisa})='integer' AND ${table.settledPaisa} BETWEEN 0 AND 9007199254740991`),
    check('refund_route_event_unsent_valid', sql`typeof(${table.confirmedUnsentPaisa})='integer' AND ${table.confirmedUnsentPaisa} BETWEEN 0 AND 9007199254740991`),
    check('refund_route_event_reference_proof_valid', sql`length(${table.proofReference}) BETWEEN 1 AND 191`),
    check('refund_route_event_clock_valid', sql`typeof(${table.createdAt})='integer' AND ${table.createdAt} BETWEEN 1 AND 9007199254740991`),
    check('refund_route_event_terminal_proof_valid', sql`
      (${table.status} IN ('settled','closed') AND ${table.proofReference} IS NOT NULL)
      OR (${table.status} NOT IN ('settled','closed') AND ${table.confirmedUnsentPaisa}=0)
    `),
  ],
);

export const refundRouteReservations = sqliteTable(
  'refund_route_reservations',
  {
    obligationId: text('obligation_id').notNull().primaryKey().references(() => refundObligations.id),
    bankPacketId: text('bank_packet_id').unique().references(() => outgoingPaymentPackets.id),
    simulationAttemptId: text('simulation_attempt_id').unique().references(() => refundRouteSimulationAttempts.id),
  },
  (table) => [
    check('refund_route_reservation_source_valid', sql`(${table.bankPacketId} IS NULL)<>(${table.simulationAttemptId} IS NULL)`),
  ],
);

export const orderDeliveryAllocations=sqliteTable('order_delivery_allocations',{
 orderItemId:text('order_item_id').primaryKey().references(():AnySQLiteColumn=>orderItems.id),
 orderId:text('order_id').notNull().references(():AnySQLiteColumn=>orders.id),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 amountPaisa:integer('amount_paisa').notNull(),
 originalQuantity:integer('original_quantity').notNull(),
 policyVersion:text('policy_version').notNull(),
 createdAt:integer('created_at').notNull()
});

export const lawfulFeeRefundAuthorizations=sqliteTable('lawful_fee_refund_authorizations',{
 id:text('id').primaryKey(),
 orderId:text('order_id').notNull().references(():AnySQLiteColumn=>orders.id),
 customerId:text('customer_id').notNull().references(():AnySQLiteColumn=>users.id),
 amountPaisa:integer('amount_paisa').notNull(),
 legalBasis:text('legal_basis').notNull(),
 caseReference:text('case_reference').notNull(),
 evidenceReference:text('evidence_reference').notNull(),
 sourceSnapshotJson:text('source_snapshot_json').notNull(),
 authorizedBy:text('authorized_by').notNull().references(():AnySQLiteColumn=>users.id),
 authorizedAt:integer('authorized_at').notNull(),
 state:text('state').notNull().default('authorized')
});

export const financeEvidenceIntents=sqliteTable('finance_evidence_intents',{
 id:text('id').primaryKey(),
 scopeKind:text('scope_kind').notNull(),
 scopeId:text('scope_id').notNull(),
 uploadedBy:text('uploaded_by').notNull().references(():AnySQLiteColumn=>users.id),
 objectKey:text('object_key').notNull(),
 originalName:text('original_name').notNull(),
 mimeType:text('mime_type').notNull(),
 sizeBytes:integer('size_bytes').notNull(),
 contentHash:text('content_hash').notNull(),
 createdAt:integer('created_at').notNull()
});

export const financeEvidenceFiles=sqliteTable('finance_evidence_files',{
 id:text('id').primaryKey().references(():AnySQLiteColumn=>financeEvidenceIntents.id),
 retainedAt:integer('retained_at').notNull()
});

export const refundCostAllocations=sqliteTable('refund_cost_allocations',{
 refundId:text('refund_id').notNull().references(():AnySQLiteColumn=>refunds.id),
 component:text('component').notNull(),
 party:text('party').notNull(),
 sellerId:text('seller_id').references(():AnySQLiteColumn=>sellerProfiles.id),
 amountPaisa:integer('amount_paisa').notNull(),
 policyVersion:text('policy_version').notNull(),
 createdBy:text('created_by').notNull().references(():AnySQLiteColumn=>users.id),
 createdAt:integer('created_at').notNull()
},table=>[primaryKey({columns:[table.refundId,table.component]})]);

export const refundVariantPricingEffects = sqliteTable(
  'refund_variant_pricing_effects',
  {
    refundId: text('refund_id').notNull().primaryKey().references(() => refunds.id, { onDelete: 'restrict' }),
    orderItemId: text('order_item_id').notNull().references(() => orderItemPricingSnapshots.orderItemId),
    policyVersion: text('policy_version', { enum: ['saved_variant_return_v1'] }).notNull(),
    quantity: integer('quantity').notNull(),
    unitOrdinalsJson: text('unit_ordinals_json').notNull(),
    grossItemPaisa: integer('gross_item_paisa').notNull(),
    sellerPrincipalPaisa: integer('seller_principal_paisa').notNull(),
    platformAdditionPaisa: integer('platform_addition_paisa').notNull(),
    taxPaisa: integer('tax_paisa').notNull(),
    unallocatedMerchandisePaisa: integer('unallocated_merchandise_paisa').notNull(),
    savedDeliverySharePaisa: integer('saved_delivery_share_paisa').notNull(),
    retainedOutboundPaisa: integer('retained_outbound_paisa').notNull(),
    voluntaryPolicyVersion: text('voluntary_policy_version', { enum: ['disclosed_voluntary_delivery_v1'] }),
    decisionEvidenceReference: text('decision_evidence_reference').notNull(),
    correctSellerFulfillment: integer('correct_seller_fulfillment', { mode: 'boolean' }).notNull(),
    approvedBy: text('approved_by').notNull().references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('refund_variant_pricing_effects_item').on(table.orderItemId, table.refundId),
    check('priced_return_effect_policy_valid', sql`${table.policyVersion}='saved_variant_return_v1'`),
    check('priced_return_effect_quantity_valid', sql`typeof(${table.quantity})='integer' AND ${table.quantity} BETWEEN 1 AND 9007199254740991`),
    check('priced_return_effect_ordinals_valid', sql`json_valid(${table.unitOrdinalsJson}) AND json_type(${table.unitOrdinalsJson})='array'`),
    check('priced_return_effect_gross_valid', sql`typeof(${table.grossItemPaisa})='integer' AND ${table.grossItemPaisa} BETWEEN 0 AND 9007199254740991`),
    check('priced_return_effect_seller_valid', sql`typeof(${table.sellerPrincipalPaisa})='integer' AND ${table.sellerPrincipalPaisa} BETWEEN 0 AND ${table.grossItemPaisa}`),
    check('priced_return_effect_addition_valid', sql`typeof(${table.platformAdditionPaisa})='integer' AND ${table.platformAdditionPaisa} BETWEEN 0 AND ${table.grossItemPaisa}`),
    check('priced_return_effect_tax_valid', sql`typeof(${table.taxPaisa})='integer' AND ${table.taxPaisa} BETWEEN 0 AND ${table.grossItemPaisa}-${table.platformAdditionPaisa}`),
    check('priced_return_effect_remainder_valid', sql`typeof(${table.unallocatedMerchandisePaisa})='integer' AND ${table.unallocatedMerchandisePaisa}=
      CASE WHEN ${table.sellerPrincipalPaisa}>0 THEN ${table.grossItemPaisa}-${table.sellerPrincipalPaisa} ELSE 0 END`),
    check('priced_return_effect_delivery_valid', sql`typeof(${table.savedDeliverySharePaisa})='integer' AND ${table.savedDeliverySharePaisa} BETWEEN 0 AND 9007199254740991`),
    check('priced_return_effect_retention_valid', sql`typeof(${table.retainedOutboundPaisa})='integer' AND ${table.retainedOutboundPaisa} BETWEEN 0 AND ${table.savedDeliverySharePaisa}`),
    check('priced_return_effect_voluntary_policy_valid', sql`${table.voluntaryPolicyVersion} IS NULL OR ${table.voluntaryPolicyVersion}='disclosed_voluntary_delivery_v1'`),
    check('priced_return_effect_evidence_valid', sql`length(trim(${table.decisionEvidenceReference}))>0 AND length(${table.decisionEvidenceReference})<=191`),
    check('priced_return_effect_fulfillment_valid', sql`typeof(${table.correctSellerFulfillment})='integer' AND ${table.correctSellerFulfillment} IN (0,1)`),
    check('priced_return_effect_clock_valid', sql`typeof(${table.createdAt})='integer' AND ${table.createdAt} BETWEEN 0 AND 9007199254740991`),
  ],
);

export const refundObligationDeadlines=sqliteTable('refund_obligation_deadlines',{
 obligationId:text('obligation_id').primaryKey().references(():AnySQLiteColumn=>refundObligations.id),
 revision:integer('revision').notNull().default(0),
 initiationDueAt:integer('initiation_due_at'),
 bindingDueAt:integer('binding_due_at'),
 calendarVersion:text('calendar_version'),
 policySnapshotJson:text('policy_snapshot_json').notNull(),
 createdAt:integer('created_at').notNull()
});

export const orderCancellationEvents=sqliteTable('order_cancellation_events',{
 id:text('id').primaryKey(),orderId:text('order_id').notNull().references(():AnySQLiteColumn=>orders.id),actorId:text('actor_id').references(():AnySQLiteColumn=>users.id),version:integer('version').notNull(),sellerIdsJson:text('seller_ids_json').notNull(),originalAllocationsJson:text('original_allocations_json').notNull(),previousJson:text('previous_json').notNull(),nextJson:text('next_json').notNull(),note:text('note').notNull(),walletRestoredPaisa:integer('wallet_restored_paisa').notNull(),discountRemovedPaisa:integer('discount_removed_paisa').notNull(),itemRemovedPaisa:integer('item_removed_paisa').notNull(),createdAt:integer('created_at').notNull()
});

export const cancellationRefundSources=sqliteTable('cancellation_refund_sources',{
 id:text('id').primaryKey().references(():AnySQLiteColumn=>orderCancellationEvents.id),
 orderId:text('order_id').notNull().references(():AnySQLiteColumn=>orders.id),
 customerId:text('customer_id').references(():AnySQLiteColumn=>users.id),
 cashPaisa:integer('cash_paisa').notNull(),
 walletRestoredPaisa:integer('wallet_restored_paisa').notNull(),
 revisedPayablePaisa:integer('revised_payable_paisa').notNull(),
 actualCollectedPaisa:integer('actual_collected_paisa').notNull(),
 sourceSnapshotJson:text('source_snapshot_json').notNull(),
 state:text('state').notNull().default('authorized'),
 authorizedAt:integer('authorized_at').notNull()
});

export const orderDeliveryAdjustments=sqliteTable('order_delivery_adjustments',{
 eventId:text('event_id').notNull().references(():AnySQLiteColumn=>orderCancellationEvents.id),
 orderItemId:text('order_item_id').notNull().references(():AnySQLiteColumn=>orderItems.id),
 orderId:text('order_id').notNull().references(():AnySQLiteColumn=>orders.id),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 amountPaisa:integer('amount_paisa').notNull(),
 originalQuantity:integer('original_quantity').notNull(),
 policyVersion:text('policy_version').notNull(),
 createdAt:integer('created_at').notNull()
},table=>[primaryKey({columns:[table.eventId,table.orderItemId]})]);

export const sellerDispatchEvidence = sqliteTable(
  'seller_dispatch_evidence',
  {
    id: text('id').notNull().primaryKey(),
    orderId: text('order_id').notNull().references(() => orders.id),
    orderItemId: text('order_item_id').notNull().references(() => orderItems.id),
    sellerId: text('seller_id').notNull().references(() => sellerProfiles.id),
    actorId: text('actor_id').notNull().references(() => users.id),
    requestId: text('request_id').notNull(),
    objectKey: text('object_key').notNull().unique(),
    mimeType: text('mime_type', { enum: ['image/jpeg', 'image/png', 'image/webp'] }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    unique().on(table.actorId, table.requestId),
    index('seller_dispatch_evidence_item').on(table.orderItemId, table.createdAt, table.id),
    check('seller_dispatch_evidence_request_valid', sql`length(${table.requestId}) BETWEEN 8 AND 150`),
    check('seller_dispatch_evidence_key_valid', sql`${table.objectKey}='private/seller-dispatch-evidence/'||${table.id}`),
    check('seller_dispatch_evidence_type_valid', sql`${table.mimeType} IN ('image/jpeg','image/png','image/webp')`),
    check('seller_dispatch_evidence_size_valid', sql`typeof(${table.sizeBytes})='integer' AND ${table.sizeBytes} BETWEEN 1 AND 5242880`),
    check('seller_dispatch_evidence_hash_valid', sql`length(${table.sha256})=64 AND ${table.sha256} NOT GLOB '*[^0-9a-f]*'`),
    check('seller_dispatch_evidence_clock_valid', sql`typeof(${table.createdAt})='integer' AND ${table.createdAt} BETWEEN 1 AND 9007199254740991`),
  ],
);

export const orderDeliveryShipmentAllocations = sqliteTable(
  'order_delivery_shipment_allocations',
  {
    id: text('id').notNull().primaryKey(),
    orderId: text('order_id').notNull().references(() => orders.id),
    sellerId: text('seller_id').notNull().references(() => sellerProfiles.id),
    shipmentOrdinal: integer('shipment_ordinal').notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    unitCount: integer('unit_count').notNull(),
    policyVersion: text('policy_version', { enum: ['seller_shipment_equal_units_v2'] }).notNull(),
    allocationSource: text('allocation_source').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('delivery_shipment_order_seller').on(table.orderId, table.sellerId),
    uniqueIndex('delivery_shipment_order_ordinal').on(table.orderId, table.shipmentOrdinal),
    check('delivery_shipment_ordinal_valid', sql`typeof(${table.shipmentOrdinal})='integer' AND ${table.shipmentOrdinal} BETWEEN 1 AND 9007199254740991`),
    check('delivery_shipment_amount_valid', sql`typeof(${table.amountPaisa})='integer' AND ${table.amountPaisa} BETWEEN 0 AND 9007199254740991`),
    check('delivery_shipment_count_valid', sql`typeof(${table.unitCount})='integer' AND ${table.unitCount} BETWEEN 1 AND 9007199254740991`),
    check('delivery_shipment_policy_valid', sql`${table.policyVersion}='seller_shipment_equal_units_v2'`),
    check('delivery_shipment_source_valid', sql`length(trim(${table.allocationSource}))>0 AND length(${table.allocationSource})<=191`),
    check('delivery_shipment_clock_valid', sql`typeof(${table.createdAt})='integer' AND ${table.createdAt} BETWEEN 0 AND 9007199254740991`),
  ],
);

export const orderDeliveryUnitAllocations = sqliteTable(
  'order_delivery_unit_allocations',
  {
    shipmentId: text('shipment_id').notNull().references(() => orderDeliveryShipmentAllocations.id),
    orderId: text('order_id').notNull().references(() => orders.id),
    orderItemId: text('order_item_id').notNull().references(() => orderItems.id),
    lineOrdinal: integer('line_ordinal').notNull(),
    unitOrdinal: integer('unit_ordinal').notNull(),
    shipmentUnitOrdinal: integer('shipment_unit_ordinal').notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.orderItemId, table.unitOrdinal] }),
    uniqueIndex('delivery_unit_shipment_ordinal').on(table.shipmentId, table.shipmentUnitOrdinal),
    index('delivery_unit_order_shipment').on(table.orderId, table.shipmentId, table.shipmentUnitOrdinal),
    check('delivery_unit_line_ordinal_valid', sql`typeof(${table.lineOrdinal})='integer' AND ${table.lineOrdinal} BETWEEN 1 AND 9007199254740991`),
    check('delivery_unit_ordinal_valid', sql`typeof(${table.unitOrdinal})='integer' AND ${table.unitOrdinal} BETWEEN 1 AND 9007199254740991`),
    check('delivery_unit_shipment_ordinal_valid', sql`typeof(${table.shipmentUnitOrdinal})='integer' AND ${table.shipmentUnitOrdinal} BETWEEN 1 AND 9007199254740991`),
    check('delivery_unit_amount_valid', sql`typeof(${table.amountPaisa})='integer' AND ${table.amountPaisa} BETWEEN 0 AND 9007199254740991`),
  ],
);

export const orderDeliveryUnitClaims = sqliteTable(
  'order_delivery_unit_claims',
  {
    orderItemId: text('order_item_id').notNull(),
    unitOrdinal: integer('unit_ordinal').notNull(),
    refundId: text('refund_id').references(() => refunds.id),
    cancellationEventId: text('cancellation_event_id').references(() => orderCancellationEvents.id),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.orderItemId, table.unitOrdinal] }),
    foreignKey({
      columns: [table.orderItemId, table.unitOrdinal],
      foreignColumns: [orderDeliveryUnitAllocations.orderItemId, orderDeliveryUnitAllocations.unitOrdinal],
    }),
    index('delivery_unit_claim_refund').on(table.refundId),
    index('delivery_unit_claim_cancellation').on(table.cancellationEventId),
    check('delivery_unit_claim_source_valid', sql`(${table.refundId} IS NULL)<>(${table.cancellationEventId} IS NULL)`),
    check('delivery_unit_claim_clock_valid', sql`typeof(${table.createdAt})='integer' AND ${table.createdAt} BETWEEN 0 AND 9007199254740991`),
  ],
);

export const orderDeliveryUnitParcels = sqliteTable(
  'order_delivery_unit_parcels',
  {
    orderItemId: text('order_item_id').notNull(),
    unitOrdinal: integer('unit_ordinal').notNull(),
    shippingJobId: text('shipping_job_id').notNull().references(() => shippingJobs.id),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.orderItemId, table.unitOrdinal] }),
    foreignKey({
      columns: [table.orderItemId, table.unitOrdinal],
      foreignColumns: [orderDeliveryUnitAllocations.orderItemId, orderDeliveryUnitAllocations.unitOrdinal],
    }),
    index('delivery_unit_parcel_job').on(table.shippingJobId),
    check('delivery_unit_parcel_clock_valid', sql`typeof(${table.createdAt})='integer' AND ${table.createdAt} BETWEEN 0 AND 9007199254740991`),
  ],
);

export const payoutTransferPackets=sqliteTable('payout_transfer_packets',{
 id:text('id').primaryKey(),
 payoutModel:text('payout_model').notNull(),
 registeredPayoutId:text('registered_payout_id').references(():AnySQLiteColumn=>payouts.id),
 managedPayoutId:text('managed_payout_id').references(():AnySQLiteColumn=>managedPayouts.id),
 supplierPaymentId:text('supplier_payment_id'),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 beneficiaryVersionId:text('beneficiary_version_id').notNull(),
 identityRevision:integer('identity_revision').notNull(),
 bankRevision:integer('bank_revision').notNull(),
 sourceSnapshotJson:text('source_snapshot_json').notNull(),
 accountVersionId:text('account_version_id').notNull().references(():AnySQLiteColumn=>companyPaymentAccountVersions.id),
 fundingStatementId:text('funding_statement_id').notNull().references(():AnySQLiteColumn=>companyFundingStatements.id),
 amountPaisa:integer('amount_paisa').notNull(),
 state:text('state').notNull().default('prepared'),
 revision:integer('revision').notNull().default(0),
 preparedBy:text('prepared_by').notNull().references(():AnySQLiteColumn=>users.id),
 preparedAt:integer('prepared_at').notNull(),
 approvedBy:text('approved_by').references(():AnySQLiteColumn=>users.id),
 approvedAt:integer('approved_at'),
 startedBy:text('started_by').references(():AnySQLiteColumn=>users.id),
 startedAt:integer('started_at'),
 recordedBy:text('recorded_by').references(():AnySQLiteColumn=>users.id),
 recordedAt:integer('recorded_at'),
 bankAt:integer('bank_at'),
 transactionIdentity:text('transaction_identity'),
 transactionIdentityHash:text('transaction_identity_hash'),
 evidenceReference:text('evidence_reference'),
 failureBasis:text('failure_basis')
});

export const companyOutgoingBankIdentities=sqliteTable('company_outgoing_bank_identities',{
 identityHash:text('identity_hash').primaryKey(),
 packetKind:text('packet_kind').notNull(),
 packetId:text('packet_id').notNull(),
 accountVersionId:text('account_version_id').notNull().references(():AnySQLiteColumn=>companyPaymentAccountVersions.id),
 transactionIdentity:text('transaction_identity').notNull(),
 amountPaisa:integer('amount_paisa').notNull(),
 bankAt:integer('bank_at').notNull(),
 recordedAt:integer('recorded_at').notNull()
});

export const sellerRecoveryCases=sqliteTable('seller_recovery_cases',{
 liabilityReducedPaisa:integer('liability_reduced_paisa').notNull().default(0),
 restoredPaisa:integer('restored_paisa').notNull().default(0),
 id:text('id').primaryKey(),
 sourceKind:text('source_kind').notNull(),
 sourceId:text('source_id').notNull(),
 refundId:text('refund_id').references(():AnySQLiteColumn=>refunds.id),
 supplierAdjustmentId:text('supplier_adjustment_id'),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 payoutModel:text('payout_model').notNull(),
 currency:text('currency').notNull().default('NPR'),
 originalSourceJson:text('original_source_json').notNull(),
 exposurePaisa:integer('exposure_paisa').notNull(),
 confirmedPaisa:integer('confirmed_paisa').notNull().default(0),
 approvedCapPaisa:integer('approved_cap_paisa').notNull().default(0),
 absorbedPaisa:integer('absorbed_paisa').notNull().default(0),
 disputedPaisa:integer('disputed_paisa').notNull().default(0),
 historicalRecoveredPaisa:integer('historical_recovered_paisa').notNull().default(0),
 state:text('state').notNull(),
 blocker:text('blocker'),
 approvedBy:text('approved_by').references(():AnySQLiteColumn=>users.id),
 approvedAt:integer('approved_at'),
 planJson:text('plan_json'),
 ownerId:text('owner_id').notNull().references(():AnySQLiteColumn=>users.id),
 backupId:text('backup_id').references(():AnySQLiteColumn=>users.id),
 revision:integer('revision').notNull().default(0),
 firstReviewDueAt:integer('first_review_due_at').notNull(),
 nextActionAt:integer('next_action_at').notNull(),
 createdBy:text('created_by').notNull().references(():AnySQLiteColumn=>users.id),
 createdAt:integer('created_at').notNull(),
 updatedAt:integer('updated_at').notNull()
});

export const sellerRecoveryEvents=sqliteTable('seller_recovery_events',{
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 revision:integer('revision').notNull(),
 action:text('action').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 reason:text('reason').notNull(),
 detailsJson:text('details_json').notNull(),
 requestId:text('request_id').notNull(),
 createdAt:integer('created_at').notNull()
});

export const sellerRecoveryAllocations=sqliteTable('seller_recovery_allocations',{
 managedDebitId:text('managed_debit_id'), // Native source FK targets the retained managed ledger.
 fixedDebitId:text('fixed_debit_id').references(():AnySQLiteColumn=>managedSupplierRecoveryCredits.id),
 fixedCreditId:text('fixed_credit_id').references(():AnySQLiteColumn=>managedSupplierRecoveryCredits.id),
 registeredDebitId:text('registered_debit_id').references(():AnySQLiteColumn=>sellerLedgerEntries.id),
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 method:text('method').notNull(),
 amountPaisa:integer('amount_paisa').notNull(),
 receiptId:text('receipt_id').references(():AnySQLiteColumn=>companyMoneyReceipts.id),
 registeredCreditId:text('registered_credit_id').references(():AnySQLiteColumn=>sellerLedgerEntries.id),
 managedCreditId:text('managed_credit_id').references(():AnySQLiteColumn=>managedSettlementEntries.id),
 evidenceReference:text('evidence_reference').notNull(),
 reason:text('reason').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 requestId:text('request_id').notNull(),
 createdAt:integer('created_at').notNull()
});

export const sellerRecoveryReductions=sqliteTable('seller_recovery_reductions',{
 fixedCreditId:text('fixed_credit_id').references(():AnySQLiteColumn=>managedSupplierRecoveryCredits.id),
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 amountPaisa:integer('amount_paisa').notNull(),
 registeredCreditId:text('registered_credit_id').references(():AnySQLiteColumn=>sellerLedgerEntries.id),
 managedCreditId:text('managed_credit_id').references(():AnySQLiteColumn=>managedSettlementEntries.id),
 evidenceReference:text('evidence_reference').notNull(),
 reason:text('reason').notNull(),
 collectionAttempts:text('collection_attempts').notNull(),
 approvedBy:text('approved_by').notNull().references(():AnySQLiteColumn=>users.id),
 requestId:text('request_id').notNull(),
 createdAt:integer('created_at').notNull()
});

export const sellerRecoveryProposals=sqliteTable('seller_recovery_proposals',{
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 caseRevision:integer('case_revision').notNull(),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 payoutModel:text('payout_model').notNull(),
 currency:text('currency').notNull(),
 amountPaisa:integer('amount_paisa').notNull(),
 identityRevision:integer('identity_revision').notNull(),
 sourceJson:text('source_json').notNull(),
 installmentsJson:text('installments_json').notNull(),
 nettingAuthorized:integer('netting_authorized').notNull(),
 acceptedTermsJson:text('accepted_terms_json').notNull(),
 termsDigest:text('terms_digest').notNull(),
 contactDetails:text('contact_details').notNull(),
 nextReviewAt:integer('next_review_at').notNull(),
 acceptedBy:text('accepted_by').notNull().references(():AnySQLiteColumn=>users.id),
 acceptedAt:integer('accepted_at').notNull(),
 requestId:text('request_id').notNull()
});

export const managedSupplierRecoveryCredits=sqliteTable('managed_supplier_recovery_credits',{
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 obligationId:text('obligation_id').notNull(),
 kind:text('kind').notNull(),
 amountPaisa:integer('amount_paisa').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 requestId:text('request_id').notNull(),
 createdAt:integer('created_at').notNull()
});

export const sellerRecoveryContacts=sqliteTable('seller_recovery_contacts',{
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 noticeRequestId:text('notice_request_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryEvents.requestId),
 inboxMessageId:text('inbox_message_id').notNull().references(():AnySQLiteColumn=>notificationMessages.id),
 emailMessageId:text('email_message_id').references(():AnySQLiteColumn=>notificationMessages.id),
 method:text('method').notNull(),
 actorId:text('actor_id').references(():AnySQLiteColumn=>users.id),
 actualAt:integer('actual_at').notNull(),
 evidenceReference:text('evidence_reference').notNull(),
 reason:text('reason').notNull(),
 requestId:text('request_id').notNull(),
 recordedAt:integer('recorded_at').notNull()
});

export const sellerRecoveryContactWindows=sqliteTable('seller_recovery_contact_windows',{
 caseId:text('case_id').primaryKey().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 contactId:text('contact_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryContacts.id),
 startedAt:integer('started_at').notNull(),
 reminderAt:integer('reminder_at').notNull(),
 responseDueAt:integer('response_due_at').notNull(),
 reviewDueAt:integer('review_due_at').notNull(),
 calendarVersion:text('calendar_version').notNull()
});

export const sellerRecoveryRepaymentClaims=sqliteTable('seller_recovery_repayment_claims',{
 id:text('id').primaryKey(),
 caseRevision:integer('case_revision'),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 submittedBy:text('submitted_by').notNull().references(():AnySQLiteColumn=>users.id),
 amountPaisa:integer('amount_paisa').notNull(),
 paymentReference:text('payment_reference').notNull(),
 claimedAt:integer('claimed_at').notNull(),
 accountVersionId:text('account_version_id').references(():AnySQLiteColumn=>companyPaymentAccountVersions.id),
 evidenceReference:text('evidence_reference'),
 note:text('note').notNull(),
 fingerprint:text('fingerprint').notNull(),
 status:text('status').notNull(),
 revision:integer('revision').notNull().default(0),
 createdAt:integer('created_at').notNull(),
 firstReviewDueAt:integer('first_review_due_at').notNull(),
 nextReviewAt:integer('next_review_at'),
 receiptId:text('receipt_id').references(():AnySQLiteColumn=>companyMoneyReceipts.id),
 receiptRevision:integer('receipt_revision'),
 publicMessage:text('public_message'),
 reviewedBy:text('reviewed_by').references(():AnySQLiteColumn=>users.id),
 reviewedAt:integer('reviewed_at'),
 operationRequestId:text('operation_request_id').notNull()
});

export const sellerRecoveryClaimEvents=sqliteTable('seller_recovery_claim_events',{
 id:text('id').primaryKey(),
 caseRevision:integer('case_revision'),
 claimId:text('claim_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryRepaymentClaims.id),
 revision:integer('revision').notNull(),
 action:text('action').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 reason:text('reason').notNull(),
 detailsJson:text('details_json').notNull(),
 requestId:text('request_id').notNull(),
 createdAt:integer('created_at').notNull()
});

export const sellerRecoveryLiabilityCorrections=sqliteTable('seller_recovery_liability_corrections',{
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 caseRevision:integer('case_revision').notNull(),
 oldConfirmedPaisa:integer('old_confirmed_paisa').notNull(),
 newConfirmedPaisa:integer('new_confirmed_paisa').notNull(),
 oldAbsorbedPaisa:integer('old_absorbed_paisa').notNull(),
 newAbsorbedPaisa:integer('new_absorbed_paisa').notNull(),
 nativeCreditPaisa:integer('native_credit_paisa').notNull(),
 restoredPaisa:integer('restored_paisa').notNull(),
 registeredCreditId:text('registered_credit_id').references(():AnySQLiteColumn=>sellerLedgerEntries.id),
 managedCreditId:text('managed_credit_id').references(():AnySQLiteColumn=>managedSettlementEntries.id),
 fixedObligationId:text('fixed_obligation_id'),
 evidenceReference:text('evidence_reference').notNull(),
 reason:text('reason').notNull(),
 publicMessage:text('public_message').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 requestId:text('request_id').notNull(),
 createdAt:integer('created_at').notNull(),
 reviewDueAt:integer('review_due_at').notNull()
});

export const sellerRecoveryRestorations=sqliteTable('seller_recovery_restorations',{
 id:text('id').primaryKey(),
 correctionId:text('correction_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryLiabilityCorrections.id),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 allocationId:text('allocation_id').references(():AnySQLiteColumn=>sellerRecoveryAllocations.id),
 method:text('method').notNull(),
 amountPaisa:integer('amount_paisa').notNull()
});

export const sellerRecoveryResponseWindows=sqliteTable('seller_recovery_response_windows',{
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 approvalEventId:text('approval_event_id').notNull().unique().references(():AnySQLiteColumn=>sellerRecoveryEvents.id),
 contactId:text('contact_id').notNull().unique().references(():AnySQLiteColumn=>sellerRecoveryContacts.id),
 startedAt:integer('started_at').notNull(),
 reminderAt:integer('reminder_at').notNull(),
 responseDueAt:integer('response_due_at').notNull(),
 reviewDueAt:integer('review_due_at').notNull(),
 calendarVersion:text('calendar_version').notNull()
});

export const sellerRecoveryHistoricalAttributions=sqliteTable('seller_recovery_historical_attributions',{
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 caseRevision:integer('case_revision').notNull(),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 refundId:text('refund_id').notNull().references(():AnySQLiteColumn=>refunds.id),
 kind:text('kind').notNull(),payoutId:text('payout_id').notNull(),scopeId:text('scope_id').notNull(),
 nativeDeductionPaisa:integer('native_deduction_paisa').notNull(),amountPaisa:integer('amount_paisa').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),
 evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});

export const sellerRecoveryCompanyDeductions=sqliteTable('seller_recovery_company_deductions',{
 id:text('id').primaryKey(),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 caseRevision:integer('case_revision').notNull(),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 refundId:text('refund_id').notNull().references(():AnySQLiteColumn=>refunds.id),
 kind:text('kind').notNull(),payoutId:text('payout_id').notNull(),scopeId:text('scope_id').notNull(),
 nativeDeductionPaisa:integer('native_deduction_paisa').notNull(),amountPaisa:integer('amount_paisa').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),
 sourceJson:text('source_json').notNull(),
 evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});

export const sellerRecoveryOriginalUnpaidPools=sqliteTable('seller_recovery_original_unpaid_pools',{
 payoutModel:text('payout_model').notNull(),sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),scopeId:text('scope_id').notNull(),usedPaisa:integer('used_paisa').notNull(),
},table=>[primaryKey({columns:[table.payoutModel,table.sellerId,table.scopeId]})]);

export const sellerRecoveryHistoricalPools=sqliteTable('seller_recovery_historical_pools',{
 kind:text('kind').notNull(),payoutId:text('payout_id').notNull(),scopeId:text('scope_id').notNull(),
 principalPaisa:integer('principal_paisa').notNull(),usedPaisa:integer('used_paisa').notNull()
},t=>[primaryKey({columns:[t.kind,t.payoutId,t.scopeId]})]);

export const sellerRecoverySourceReviews=sqliteTable('seller_recovery_source_reviews',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().unique().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 caseRevision:integer('case_revision').notNull(),kind:text('kind').notNull(),amountPaisa:integer('amount_paisa').notNull(),
 registeredCreditId:text('registered_credit_id').unique().references(():AnySQLiteColumn=>sellerLedgerEntries.id),
 managedCreditId:text('managed_credit_id').unique().references(():AnySQLiteColumn=>managedSettlementEntries.id),
 sourceJson:text('source_json').notNull(),actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),
 evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});

export const sellerRecoveryUnpaidSources=sqliteTable('seller_recovery_unpaid_sources',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().unique().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 caseRevision:integer('case_revision').notNull(),sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 refundId:text('refund_id').notNull().unique().references(():AnySQLiteColumn=>refunds.id),orderItemId:text('order_item_id').notNull().references(():AnySQLiteColumn=>orderItems.id),
 scopeId:text('scope_id').notNull(),basisPaisa:integer('basis_paisa').notNull(),amountPaisa:integer('amount_paisa').notNull(),remainingPaisa:integer('remaining_paisa').notNull(),
 sourceJson:text('source_json').notNull(),actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),
 evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});

export const sellerRecoveryPayoutRetirements=sqliteTable('seller_recovery_payout_retirements',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),
 sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),payoutModel:text('payout_model').notNull(),payoutId:text('payout_id').notNull(),
 originalStatus:text('original_status').notNull(),originalAmountPaisa:integer('original_amount_paisa').notNull(),originalDestination:text('original_destination').notNull(),originalUpdatedAt:integer('original_updated_at').notNull(),
 sourceJson:text('source_json').notNull(),actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),
 evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
},t=>[uniqueIndex('recovery_retirement_payout').on(t.payoutModel,t.payoutId)]);

export const sellerRecoveryUnpaidCorrections=sqliteTable('seller_recovery_unpaid_corrections',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),
 originalChargePaisa:integer('original_charge_paisa').notNull(),previousRestoredPaisa:integer('previous_restored_paisa').notNull(),amountPaisa:integer('amount_paisa').notNull(),
 registeredCreditId:text('registered_credit_id').unique().references(():AnySQLiteColumn=>sellerLedgerEntries.id),managedCreditId:text('managed_credit_id').unique().references(():AnySQLiteColumn=>managedSettlementEntries.id),
 fixedObligationId:text('fixed_obligation_id'),sourceJson:text('source_json').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),
 evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});

export const sellerRecoveryCarrierReviews=sqliteTable('seller_recovery_carrier_reviews',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),
 receiptId:text('receipt_id').notNull().references(():AnySQLiteColumn=>companyMoneyReceipts.id),receiptRevision:integer('receipt_revision').notNull(),allocationId:text('allocation_id').notNull().unique(),
 amountPaisa:integer('amount_paisa').notNull(),restoredPaisa:integer('restored_paisa').notNull(),resolvedDisputedPaisa:integer('resolved_disputed_paisa').notNull(),sourceJson:text('source_json').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),
 evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});
export const sellerRecoveryCarrierRestorations=sqliteTable('seller_recovery_carrier_restorations',{
 id:text('id').primaryKey(),reviewId:text('review_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCarrierReviews.id),caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 allocationId:text('allocation_id').references(():AnySQLiteColumn=>sellerRecoveryAllocations.id),method:text('method').notNull(),amountPaisa:integer('amount_paisa').notNull()
});


export const sellerRecoveryPartialSources=sqliteTable('seller_recovery_partial_sources',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().unique().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 caseRevision:integer('case_revision').notNull(),sellerId:text('seller_id').notNull().references(():AnySQLiteColumn=>sellerProfiles.id),
 refundId:text('refund_id').notNull().unique().references(():AnySQLiteColumn=>refunds.id),orderItemId:text('order_item_id').notNull().references(():AnySQLiteColumn=>orderItems.id),
 scopeId:text('scope_id').notNull(),basisPaisa:integer('basis_paisa').notNull(),nativeChargePaisa:integer('native_charge_paisa').notNull(),
 capacityPaisa:integer('capacity_paisa').notNull(),usedPaisa:integer('used_paisa').notNull(),amountPaisa:integer('amount_paisa').notNull(),
 sourceJson:text('source_json').notNull(),actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),
 requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),
 evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});


export const sellerRecoveryCalculationReviews=sqliteTable('seller_recovery_calculation_reviews',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),
 submittedBy:text('submitted_by').notNull().references(():AnySQLiteColumn=>users.id),reason:text('reason').notNull(),evidenceReference:text('evidence_reference'),
 sourceJson:text('source_json').notNull(),requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),dueAt:integer('due_at').notNull()
});
export const sellerRecoveryCalculationAnswers=sqliteTable('seller_recovery_calculation_answers',{
 id:text('id').primaryKey(),reviewId:text('review_id').notNull().unique().references(():AnySQLiteColumn=>sellerRecoveryCalculationReviews.id),
 caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),
 actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),reason:text('reason').notNull(),publicMessage:text('public_message').notNull(),
 sourceJson:text('source_json').notNull(),requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull()
});


export const sellerRecoveryPayoutReturnReviews=sqliteTable('seller_recovery_payout_return_reviews',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),
 payoutModel:text('payout_model').notNull(),payoutId:text('payout_id').notNull(),scopeId:text('scope_id').notNull(),originalPayoutPaisa:integer('original_payout_paisa').notNull(),scopePaisa:integer('scope_paisa').notNull(),
 receiptId:text('receipt_id').notNull().references(():AnySQLiteColumn=>companyMoneyReceipts.id),receiptRevision:integer('receipt_revision').notNull(),allocationId:text('allocation_id').notNull().unique(),
 amountPaisa:integer('amount_paisa').notNull(),restoredPaisa:integer('restored_paisa').notNull(),principalExcessPaisa:integer('principal_excess_paisa').notNull(),resolvedDisputedPaisa:integer('resolved_disputed_paisa').notNull(),
 sourceJson:text('source_json').notNull(),actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),
 evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});
export const sellerRecoveryPayoutReturnPools=sqliteTable('seller_recovery_payout_return_pools',{
 payoutModel:text('payout_model').notNull(),payoutId:text('payout_id').notNull(),scopeId:text('scope_id').notNull(),principalPaisa:integer('principal_paisa').notNull(),usedPaisa:integer('used_paisa').notNull()
},table=>[primaryKey({columns:[table.payoutModel,table.payoutId,table.scopeId]})]);
export const sellerRecoveryPayoutReturnRestorations=sqliteTable('seller_recovery_payout_return_restorations',{
 id:text('id').primaryKey(),reviewId:text('review_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryPayoutReturnReviews.id),caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),
 allocationId:text('allocation_id').references(():AnySQLiteColumn=>sellerRecoveryAllocations.id),method:text('method').notNull(),kind:text('kind').notNull(),amountPaisa:integer('amount_paisa').notNull()
});


export const sellerRecoveryCarrierUnpaidReviews=sqliteTable('seller_recovery_carrier_unpaid_reviews',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(():AnySQLiteColumn=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),
 receiptId:text('receipt_id').notNull().references(():AnySQLiteColumn=>companyMoneyReceipts.id),receiptRevision:integer('receipt_revision').notNull(),allocationId:text('allocation_id').notNull().unique(),amountPaisa:integer('amount_paisa').notNull(),
 sourceJson:text('source_json').notNull(),actorId:text('actor_id').notNull().references(():AnySQLiteColumn=>users.id),requestId:text('request_id').notNull().unique(),createdAt:integer('created_at').notNull(),evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});


export const sellerRecoveryReceiptReversalReviews=sqliteTable('seller_recovery_receipt_reversal_reviews',{
 id:text('id').primaryKey(),reversalId:text('reversal_id').notNull().unique().references(()=>companyReceiptReversals.id),receiptId:text('receipt_id').notNull().references(()=>companyMoneyReceipts.id),
 receiptRevision:integer('receipt_revision').notNull(),state:text('state').notNull(),amountPaisa:integer('amount_paisa').notNull(),unallocatedPaisa:integer('unallocated_paisa').notNull(),
 sourceJson:text('source_json').notNull(),planJson:text('plan_json').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),requestId:text('request_id').notNull().unique(),
 createdAt:integer('created_at').notNull(),completedAt:integer('completed_at'),evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull()
});
export const sellerRecoveryReceiptReversalParts=sqliteTable('seller_recovery_receipt_reversal_parts',{
 id:text('id').primaryKey(),reviewId:text('review_id').notNull().references(()=>sellerRecoveryReceiptReversalReviews.id),caseId:text('case_id').notNull().references(()=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),
 allocationId:text('allocation_id').notNull().references(()=>sellerRecoveryAllocations.id),amountPaisa:integer('amount_paisa').notNull(),companyLossPaisa:integer('company_loss_paisa').notNull(),
 registeredDebitId:text('registered_debit_id').unique().references(()=>sellerLedgerEntries.id),managedDebitId:text('managed_debit_id').unique().references(()=>managedSettlementEntries.id),fixedObligationId:text('fixed_obligation_id'),
 registeredCompanyCreditId:text('registered_company_credit_id').unique().references(()=>sellerLedgerEntries.id),managedCompanyCreditId:text('managed_company_credit_id').unique().references(()=>managedSettlementEntries.id)
},table=>[uniqueIndex('recovery_receipt_part_allocation').on(table.reviewId,table.allocationId)]);
export const sellerRecoveryRestorationReclassifications=sqliteTable('seller_recovery_restoration_reclassifications',{
 id:text('id').primaryKey(),partId:text('part_id').notNull().references(()=>sellerRecoveryReceiptReversalParts.id),restorationId:text('restoration_id').notNull(),amountPaisa:integer('amount_paisa').notNull()
},table=>[uniqueIndex('recovery_restoration_reclassification').on(table.partId,table.restorationId)]);


export const customerRefundReversals=sqliteTable('customer_refund_reversals',{
 id:text('id').primaryKey(),packetId:text('packet_id').notNull().references(()=>outgoingPaymentPackets.id),obligationId:text('obligation_id').notNull().references(()=>refundObligations.id),receiptId:text('receipt_id').notNull().unique().references(()=>companyMoneyReceipts.id),
 amountPaisa:integer('amount_paisa').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),requestId:text('request_id').notNull().unique(),evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),createdAt:integer('created_at').notNull()
});
export const customerRefundReversalDispositions=sqliteTable('customer_refund_reversal_dispositions',{
 id:text('id').primaryKey(),reversalId:text('reversal_id').notNull().unique().references(()=>customerRefundReversals.id),caseId:text('case_id').notNull().references(()=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),kind:text('kind').notNull(),
 retryObligationId:text('retry_obligation_id').unique().references(()=>refundObligations.id),correctionId:text('correction_id').references(()=>sellerRecoveryLiabilityCorrections.id),actorId:text('actor_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull(),createdAt:integer('created_at').notNull()
});
export const sellerRecoveryRepaymentAttributions=sqliteTable('seller_recovery_repayment_attributions',{
 id:text('id').primaryKey(),caseId:text('case_id').notNull().references(()=>sellerRecoveryCases.id),caseRevision:integer('case_revision').notNull(),receiptId:text('receipt_id').notNull().unique().references(()=>companyMoneyReceipts.id),receiptRevision:integer('receipt_revision').notNull(),
 payerUserId:text('payer_user_id').notNull().references(()=>users.id),ownerUserId:text('owner_user_id').notNull().references(()=>users.id),amountPaisa:integer('amount_paisa').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),requestId:text('request_id').notNull().unique(),evidenceReference:text('evidence_reference').notNull(),reason:text('reason').notNull(),publicMessage:text('public_message').notNull(),createdAt:integer('created_at').notNull()
});

export const customerRefundReturnPools=sqliteTable('customer_refund_return_pools',{
 packetId:text('packet_id').primaryKey().references(()=>outgoingPaymentPackets.id),usedPaisa:integer('used_paisa').notNull()
});

export const receiptReturnBankLosses=sqliteTable('receipt_return_bank_losses',{
 id:text('id').primaryKey(),reviewId:text('review_id').notNull().references(()=>sellerRecoveryReceiptReversalReviews.id),reversalId:text('reversal_id').notNull().references(()=>companyReceiptReversals.id),receiptId:text('receipt_id').notNull().references(()=>companyMoneyReceipts.id),
 receiptUseId:text('receipt_use_id').notNull().references(()=>manualReceiptUses.id),useRevision:integer('use_revision').notNull(),packetId:text('packet_id').notNull().references(()=>outgoingPaymentPackets.id),obligationId:text('obligation_id').notNull().references(()=>refundObligations.id),
 amountPaisa:integer('amount_paisa').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),createdAt:integer('created_at').notNull()
},table=>[uniqueIndex('receipt_return_bank_loss_review_use').on(table.reviewId,table.receiptUseId)]);
export const receiptReturnBankLossPools=sqliteTable('receipt_return_bank_loss_pools',{
 receiptUseId:text('receipt_use_id').primaryKey().references(()=>manualReceiptUses.id),usedPaisa:integer('used_paisa').notNull()
});

export const receiptReturnBankSatisfactions=sqliteTable('receipt_return_bank_satisfactions',{
 id:text('id').primaryKey(),reviewId:text('review_id').notNull().references(()=>sellerRecoveryReceiptReversalReviews.id),reversalId:text('reversal_id').notNull().references(()=>companyReceiptReversals.id),receiptId:text('receipt_id').notNull().references(()=>companyMoneyReceipts.id),
 receiptUseId:text('receipt_use_id').notNull().references(()=>manualReceiptUses.id),useRevision:integer('use_revision').notNull(),obligationId:text('obligation_id').notNull().references(()=>refundObligations.id),obligationRevision:integer('obligation_revision').notNull(),customerId:text('customer_id').notNull().references(()=>users.id),
 amountPaisa:integer('amount_paisa').notNull(),originalPayerReturnedConfirmed:integer('original_payer_returned_confirmed').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),createdAt:integer('created_at').notNull()
},table=>[uniqueIndex('receipt_return_bank_satisfaction_review_use').on(table.reviewId,table.receiptUseId)]);
export const receiptReturnBankSatisfactionPools=sqliteTable('receipt_return_bank_satisfaction_pools',{
 receiptUseId:text('receipt_use_id').primaryKey().references(()=>manualReceiptUses.id),usedPaisa:integer('used_paisa').notNull()
});

export const managedClearanceEvidenceIntents=sqliteTable('managed_clearance_evidence_intents',{
 id:id(),sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),materialScopeDigest:text('material_scope_digest').notNull(),uploadedBy:text('uploaded_by').notNull().references(()=>users.id),objectKey:text('object_key').notNull().unique(),originalName:text('original_name').notNull(),mimeType:text('mime_type',{enum:['application/pdf','image/jpeg','image/png']}).notNull(),sizeBytes:integer('size_bytes').notNull(),contentHash:text('content_hash').notNull(),requestId:text('request_id').notNull(),createdAt:timestamp('created_at').notNull()
},t=>[uniqueIndex('managed_clearance_evidence_request').on(t.uploadedBy,t.sellerId,t.requestId),check('managed_clearance_material_digest',sql`length(${t.materialScopeDigest})=64`),check('managed_clearance_content_hash',sql`length(${t.contentHash})=64`),check('managed_clearance_mime',sql`${t.mimeType} IN('application/pdf','image/jpeg','image/png')`),check('managed_clearance_size',sql`${t.sizeBytes}>0 AND ${t.sizeBytes}<=5242880`)]);
export const managedClearanceEvidenceFiles=sqliteTable('managed_clearance_evidence_files',{
 id:text('id').primaryKey().references(()=>managedClearanceEvidenceIntents.id),retainedAt:timestamp('retained_at').notNull()
});
export const managedLiveClearances=sqliteTable('managed_live_clearances',{
 id:id(),sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),ownerId:text('owner_id').notNull().references(()=>users.id),model:text('model',{enum:['managed_sale_linked_percentage_v1']}).notNull(),materialScopeDigest:text('material_scope_digest').notNull(),companyScopeDigest:text('company_scope_digest').notNull(),financialScopeId:text('financial_scope_id').notNull(),issuerModel:text('issuer_model',{enum:['company_commercial_invoice_v1']}).notNull(),issuerScopeDigest:text('issuer_scope_digest').notNull(),scopeJson:text('scope_json').notNull(),evidenceIdsJson:text('evidence_ids_json').notNull(),issuer:text('issuer').notNull(),externalReference:text('external_reference').notNull(),issuedAt:timestamp('issued_at').notNull(),effectiveFrom:timestamp('effective_from').notNull(),validUntil:timestamp('valid_until'),reviewedBy:text('reviewed_by').notNull().references(()=>users.id),reviewedAt:timestamp('reviewed_at').notNull(),revision:integer('revision').notNull().default(0),state:text('state',{enum:['active','revoked']}).notNull().default('active'),requestId:text('request_id').notNull().unique(),reason:text('reason').notNull(),revokedBy:text('revoked_by').references(()=>users.id),revokedAt:timestamp('revoked_at'),revocationReason:text('revocation_reason')
},t=>[index('managed_live_clearance_scope').on(t.sellerId,t.materialScopeDigest,t.state),check('managed_live_clearance_model',sql`${t.model}='managed_sale_linked_percentage_v1'`),check('managed_live_clearance_material_digest',sql`length(${t.materialScopeDigest})=64`),check('managed_live_clearance_company_digest',sql`length(${t.companyScopeDigest})=64`),check('managed_live_clearance_issuer_model',sql`${t.issuerModel}='company_commercial_invoice_v1'`),check('managed_live_clearance_issuer_digest',sql`length(${t.issuerScopeDigest})=64`),check('managed_live_clearance_scope_json',sql`json_valid(${t.scopeJson})`),check('managed_live_clearance_evidence_json',sql`json_valid(${t.evidenceIdsJson}) AND json_array_length(${t.evidenceIdsJson})>0`),check('managed_live_clearance_clock',sql`${t.issuedAt}>0 AND ${t.effectiveFrom}>=${t.issuedAt} AND ${t.reviewedAt}>=${t.effectiveFrom} AND (${t.validUntil} IS NULL OR ${t.validUntil}>${t.reviewedAt})`),check('managed_live_clearance_state',sql`${t.state} IN('active','revoked')`)]);
export const managedLiveActivationDecisions=sqliteTable('managed_live_activation_decisions',{
 id:id(),sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),ownerId:text('owner_id').notNull().references(()=>users.id),model:text('model',{enum:['managed_sale_linked_percentage_v1']}).notNull(),clearanceId:text('clearance_id').notNull().references(()=>managedLiveClearances.id),materialScopeDigest:text('material_scope_digest').notNull(),companyScopeDigest:text('company_scope_digest').notNull(),financialScopeId:text('financial_scope_id').notNull(),issuerModel:text('issuer_model',{enum:['company_commercial_invoice_v1']}).notNull(),issuerScopeDigest:text('issuer_scope_digest').notNull(),sourceJson:text('source_json').notNull(),revision:integer('revision').notNull(),previousDecisionId:text('previous_decision_id').references(():AnySQLiteColumn=>managedLiveActivationDecisions.id),actorId:text('actor_id').notNull().references(()=>users.id),createdAt:timestamp('created_at').notNull(),requestId:text('request_id').notNull().unique(),reason:text('reason').notNull()
},t=>[uniqueIndex('managed_live_decision_revision').on(t.sellerId,t.revision),index('managed_live_decision_seller').on(t.sellerId,t.revision),check('managed_live_decision_model',sql`${t.model}='managed_sale_linked_percentage_v1'`),check('managed_live_decision_issuer_model',sql`${t.issuerModel}='company_commercial_invoice_v1'`),check('managed_live_decision_source_json',sql`json_valid(${t.sourceJson})`),check('managed_live_decision_revision',sql`${t.revision}>=1`)]);
export const managedLiveFinancialScopes=sqliteTable('managed_live_financial_scopes',{
 id:id(),companyEntityReference:text('company_entity_reference').notNull(),companyScopeDigest:text('company_scope_digest').notNull(),issuerModel:text('issuer_model',{enum:['company_commercial_invoice_v1']}).notNull(),issuerScopeDigest:text('issuer_scope_digest').notNull(),issuerSnapshotJson:text('issuer_snapshot_json').notNull(),seriesPrefix:text('series_prefix').notNull().unique(),seriesVersion:text('series_version').notNull(),openingNumber:integer('opening_number').notNull(),evidenceReference:text('evidence_reference').notNull(),reviewedBy:text('reviewed_by').notNull().references(()=>users.id),reviewedAt:timestamp('reviewed_at').notNull(),requestId:text('request_id').notNull().unique(),reason:text('reason').notNull()
},t=>[check('managed_live_financial_issuer_model',sql`${t.issuerModel}='company_commercial_invoice_v1'`),check('managed_live_financial_issuer_json',sql`json_valid(${t.issuerSnapshotJson})`),check('managed_live_financial_opening',sql`${t.openingNumber}>0`)]);
export const managedLiveInvoiceSeries=sqliteTable('managed_live_invoice_series',{
 financialScopeId:text('financial_scope_id').primaryKey().references(()=>managedLiveFinancialScopes.id),nextNumber:integer('next_number').notNull(),revision:integer('revision').notNull().default(0)
},t=>[check('managed_live_series_next',sql`${t.nextNumber}>0`)]);
export const managedLiveInvoiceNumbers=sqliteTable('managed_live_invoice_numbers',{
 id:id(),financialScopeId:text('financial_scope_id').notNull().references(()=>managedLiveFinancialScopes.id),invoiceGroupId:text('invoice_group_id').references(()=>managedInvoiceGroups.id),adjustmentId:text('adjustment_id').references(()=>managedInvoiceAdjustments.id),sequence:integer('sequence').notNull(),invoiceNumber:text('invoice_number').notNull().unique(),requestId:text('request_id').notNull().unique(),createdAt:timestamp('created_at').notNull()
},t=>[uniqueIndex('managed_live_invoice_sequence').on(t.financialScopeId,t.sequence),uniqueIndex('managed_live_invoice_group').on(t.invoiceGroupId),uniqueIndex('managed_live_invoice_adjustment').on(t.adjustmentId),check('managed_live_invoice_sequence',sql`${t.sequence}>0`),check('managed_live_invoice_one_source',sql`(${t.invoiceGroupId} IS NULL)<>(${t.adjustmentId} IS NULL)`)]);
export const managedLiveInvoiceAdjustmentSources=sqliteTable('managed_live_invoice_adjustment_sources',{
 adjustmentId:text('adjustment_id').primaryKey().references(()=>managedInvoiceAdjustments.id),invoiceGroupId:text('invoice_group_id').notNull().references(()=>managedInvoiceGroups.id),sourceKind:text('source_kind',{enum:['refund','cancellation']}).notNull(),sourceId:text('source_id').notNull()
},t=>[uniqueIndex('managed_live_invoice_adjustment_source').on(t.invoiceGroupId,t.sourceKind,t.sourceId),check('managed_live_invoice_adjustment_source_kind',sql`${t.sourceKind} IN('refund','cancellation')`)]);

// T29 durable delivery and health schema; additive migrations0147/0148.
export const emailDeliveryAttempts=sqliteTable('email_delivery_attempts',{
 id:text('id').primaryKey().notNull(),
 queueKind:text('queue_kind').notNull(),
 queueId:text('queue_id').notNull(),
 claimToken:text('claim_token').notNull().unique(),
 attemptNumber:integer('attempt_number').notNull(),
 phase:text('phase').notNull(),
 messageId:text('message_id').notNull(),
 startedAt:integer('started_at').notNull(),
 transport:text('transport'),
 transportKey:text('transport_key'),
 providerReceipt:text('provider_receipt'),
 failureCategory:text('failure_category'),
 failureCode:text('failure_code'),
 configFingerprint:text('config_fingerprint'),
 recipientFingerprint:text('recipient_fingerprint'),
 handoffAt:integer('handoff_at'),
 completedAt:integer('completed_at'),
 retryAt:integer('retry_at'),
},t=>[
 uniqueIndex('email_delivery_attempts_unique_0').on(t.queueKind,t.queueId,t.attemptNumber),
 check('email_delivery_attempts_check_1',sql`${t.queueKind} IN('order','business')`),
 check('email_delivery_attempts_check_2',sql`${t.attemptNumber}>0`),
 check('email_delivery_attempts_check_3',sql`${t.phase} IN('claimed','handoff_started','accepted','captured','uncertain','not_accepted','cancelled')`),
 check('email_delivery_attempts_check_4',sql`${t.failureCategory} IN('temporary','permanent_recipient','configuration','unknown')`),
 index('email_delivery_attempt_queue').on(t.queueKind,t.queueId,t.startedAt),
 index('email_delivery_attempt_fence').on(t.queueKind,t.queueId,t.phase)
]);
export const emailTransportBackoff=sqliteTable('email_transport_backoff',{
 transportKey:text('transport_key').primaryKey().notNull(),
 blockedUntil:integer('blocked_until').notNull(),
 updatedAt:integer('updated_at').notNull(),
 configFingerprint:text('config_fingerprint'),
 failureCategory:text('failure_category'),
 failureCode:text('failure_code'),
},t=>[
 check('email_transport_backoff_check_0',sql`${t.failureCategory} IN('temporary','permanent_recipient','configuration','unknown')`)
]);
export const operationalReminderCursors=sqliteTable('operational_reminder_cursors',{
 family:text('family').primaryKey().notNull(),
 cursor:text('cursor').notNull().default(''),
 revision:integer('revision').notNull().default(0),
 leaseToken:text('lease_token'),
 leaseUntil:integer('lease_until'),
});
export const operationalNoticeStates=sqliteTable('operational_notice_states',{
 family:text('family').notNull(),
 sourceId:text('source_id').notNull(),
 currentEventId:text('current_event_id').notNull(),
 currentStatus:text('current_status').notNull(),
 revision:integer('revision').notNull().default(0),
},t=>[
 primaryKey({columns:[t.family,t.sourceId]})
]);
export const operationalReminderMilestones=sqliteTable('operational_reminder_milestones',{
 id:text('id').primaryKey().notNull(),
 family:text('family').notNull(),
 sourceId:text('source_id').notNull(),
 milestone:text('milestone').notNull(),
 sourceRevision:text('source_revision').notNull(),
 dueAt:integer('due_at').notNull(),
 createdAt:integer('created_at').notNull(),
},t=>[
 uniqueIndex('operational_reminder_milestones_unique_0').on(t.family,t.sourceId,t.milestone,t.sourceRevision,t.dueAt),
 index('operational_reminder_milestone_due').on(t.family,t.dueAt,t.id)
]);
export const serviceHealthObservations=sqliteTable('service_health_observations',{
 id:text('id').primaryKey().notNull(),
 environment:text('environment').notNull(),
 serviceKey:text('service_key').notNull(),
 runKey:text('run_key').notNull(),
 observedAt:integer('observed_at').notNull(),
 successful:integer('successful').notNull(),
 functionalSuccess:integer('functional_success').notNull().default(0),
 eligibleBacklog:integer('eligible_backlog').notNull(),
 oldestEligibleAt:integer('oldest_eligible_at'),
 progressCount:integer('progress_count').notNull().default(0),
 failureCategory:text('failure_category'),
 sourceKind:text('source_kind').notNull(),
 evidenceScope:text('evidence_scope'),
},t=>[
 uniqueIndex('service_health_observations_unique_0').on(t.environment,t.serviceKey,t.runKey),
 check('service_health_observations_check_1',sql`${t.environment} IN('production','development','local_staging','test')`),
 check('service_health_observations_check_2',sql`${t.successful} IN(0,1)`),
 check('service_health_observations_functional',sql`${t.functionalSuccess} IN(0,1)`),
 check('service_health_observations_check_3',sql`${t.eligibleBacklog}>=0`),
 check('service_health_observations_check_4',sql`${t.progressCount}>=0`),
 check('service_health_observations_check_5',sql`${t.failureCategory} IN('provider','recipient','configuration','unknown','worker')`),
 check('service_health_observations_check_6',sql`${t.sourceKind} IN('sender','evaluator','watchdog')`),
 index('service_health_observation_clock').on(t.environment,t.serviceKey,t.observedAt,t.id)
]);
export const serviceHealthIncidents=sqliteTable('service_health_incidents',{
 id:text('id').primaryKey().notNull(),
 environment:text('environment').notNull(),
 serviceKey:text('service_key').notNull(),
 episode:integer('episode').notNull(),
 state:text('state').notNull(),
 severity:text('severity').notNull().default('high'),
 firstSeenAt:integer('first_seen_at').notNull(),
 lastSeenAt:integer('last_seen_at').notNull(),
 resolvedAt:integer('resolved_at'),
 failureCategory:text('failure_category'),
 revision:integer('revision').notNull().default(0),
},t=>[
 uniqueIndex('service_health_incidents_unique_0').on(t.environment,t.serviceKey,t.episode),
 check('service_health_incidents_check_1',sql`${t.environment} IN('production','development','local_staging','test')`),
 check('service_health_incidents_check_2',sql`${t.episode}>0`),
 check('service_health_incidents_check_3',sql`${t.state} IN('detected','assigned','working','monitoring','resolved')`),
 check('service_health_incidents_check_4',sql`${t.severity} IN('critical','high','routine')`),
 check('service_health_incidents_check_5',sql`${t.failureCategory} IN('provider','recipient','configuration','unknown','worker')`),
 uniqueIndex('service_health_one_open').on(t.environment,t.serviceKey).where(sql`${t.state}<>'resolved'`)
]);
export const serviceHealthGuards=sqliteTable('service_health_guards',{
 id:text('id').primaryKey().notNull(),
 valid:integer('valid').notNull(),
},t=>[
 check('service_health_guards_check_0',sql`${t.valid}=1`)
]);

// BEGIN T30 GOVERNANCE ORM
export const staffInvitationGrants=sqliteTable("staff_invitation_grants",{
 invitationId:text("invitation_id").primaryKey().notNull().references(()=>staffInvitations.id),
 permissionsJson:text("permissions_json").notNull(),
 grantVersion:integer("grant_version").notNull().default(1),
 createdBy:text("created_by").notNull().references(()=>users.id),
 createdAt:integer("created_at").notNull(),
},_t=>[
 check("staff_invitation_grants_check_0",sql.raw("json_valid(permissions_json) AND json_type(permissions_json)='array'")),
 check("staff_invitation_grants_check_1",sql.raw("grant_version>0"))
]);
export const teamDuties=sqliteTable("team_duties",{
 id:text("id").primaryKey().notNull(),
 department:text("department").notNull(),
 label:text("label").notNull(),
 requiredPermission:text("required_permission").notNull(),
 reservedSuperAdmin:integer("reserved_super_admin").notNull(),
 primaryUserId:text("primary_user_id").references(()=>users.id),
 revision:integer("revision").notNull().default(0),
 updatedAt:integer("updated_at").notNull(),
 updatedBy:text("updated_by").notNull().references(()=>users.id),
},_t=>[
 check("team_duties_check_0",sql.raw("reserved_super_admin IN (0,1)")),
 check("team_duties_check_1",sql.raw("revision>=0"))
]);
export const teamDutyBackups=sqliteTable("team_duty_backups",{
 dutyId:text("duty_id").notNull().references(()=>teamDuties.id),
 userId:text("user_id").notNull().references(()=>users.id),
 position:integer("position").notNull(),
},t=>[
 primaryKey({columns:[t.dutyId,t.userId]}),
 uniqueIndex("team_duty_backups_unique_0").on(t.dutyId,t.position),
 check("team_duty_backups_check_0",sql.raw("position>=0"))
]);
export const teamAvailability=sqliteTable("team_availability",{
 id:text("id").primaryKey().notNull(),
 userId:text("user_id").notNull().references(()=>users.id),
 startsAt:integer("starts_at").notNull(),
 endsAt:integer("ends_at").notNull(),
 available:integer("available").notNull(),
 reason:text("reason").notNull(),
 revision:integer("revision").notNull().default(0),
 actorId:text("actor_id").notNull().references(()=>users.id),
 createdAt:integer("created_at").notNull(),
},t=>[
 uniqueIndex("team_availability_unique_0").on(t.userId,t.revision),
 check("team_availability_check_0",sql.raw("available IN(0,1)")),
 check("team_availability_check_1",sql.raw("ends_at>starts_at"))
]);
export const teamHandoffs=sqliteTable("team_handoffs",{
 id:text("id").primaryKey().notNull(),
 dutyId:text("duty_id").notNull().references(()=>teamDuties.id),
 fromUserId:text("from_user_id").references(()=>users.id),
 toUserId:text("to_user_id").notNull().references(()=>users.id),
 startsAt:integer("starts_at").notNull(),
 endsAt:integer("ends_at").notNull(),
 state:text("state").notNull(),
 revision:integer("revision").notNull().default(0),
 actorId:text("actor_id").notNull().references(()=>users.id),
 createdAt:integer("created_at").notNull(),
 acceptedAt:integer("accepted_at"),
},t=>[
 index("team_handoffs_current").on(t.dutyId,t.state,t.startsAt,t.endsAt),
 check("team_handoffs_check_0",sql.raw("state IN('pending','accepted','cancelled')")),
 check("team_handoffs_check_1",sql.raw("ends_at>starts_at")),
 check("team_handoffs_check_2",sql.raw("from_user_id IS NULL OR from_user_id<>to_user_id"))
]);
export const teamAccessReviews=sqliteTable("team_access_reviews",{
 id:text("id").primaryKey().notNull(),
 userId:text("user_id").notNull().references(()=>users.id),
 grantVersion:integer("grant_version").notNull(),
 completedAt:integer("completed_at").notNull(),
 reviewerId:text("reviewer_id").notNull().references(()=>users.id),
 reason:text("reason").notNull(),
 requestId:text("request_id").notNull(),
},t=>[
 uniqueIndex("team_access_reviews_unique_0").on(t.reviewerId,t.requestId)
]);
export const teamCheckpoints=sqliteTable("team_checkpoints",{
 id:text("id").primaryKey().notNull(),
 dutyId:text("duty_id").notNull().references(()=>teamDuties.id),
 nepalDate:text("nepal_date").notNull(),
 kind:text("kind").notNull(),
 dueAt:integer("due_at").notNull(),
 completedAt:integer("completed_at"),
 completedBy:text("completed_by").references(()=>users.id),
 nextAction:text("next_action"),
 revision:integer("revision").notNull().default(0),
},t=>[
 uniqueIndex("team_checkpoints_unique_0").on(t.nepalDate,t.kind),
 check("team_checkpoints_check_0",sql.raw("kind IN('payout_queue','reconciliation')"))
]);
export const teamProcedures=sqliteTable("team_procedures",{
 id:text("id").primaryKey().notNull(),
 family:text("family").notNull(),
 version:integer("version").notNull(),
 title:text("title").notNull(),
 body:text("body").notNull(),
 ownerId:text("owner_id").references(()=>users.id),
 publishedAt:integer("published_at").notNull(),
 retiredAt:integer("retired_at"),
 nativeSourceType:text("native_source_type"),
 nativeSourceId:text("native_source_id").references(()=>auditLogs.id),
 nativeSourceSha256:text("native_source_sha256"),
},t=>[
 uniqueIndex("team_procedures_unique_0").on(t.family,t.version),
 check("team_procedures_check_0",sql.raw("version>0")),
 check("team_procedures_check_1",sql.raw("native_source_type IS NULL OR native_source_type='internal_legal_procedure'")),
 check("team_procedures_check_2",sql.raw("(native_source_type IS NULL AND native_source_id IS NULL AND native_source_sha256 IS NULL) OR (native_source_type='internal_legal_procedure' AND native_source_id IS NOT NULL AND native_source_sha256 IS NOT NULL AND length(native_source_sha256)=64 AND body='')"))
]);
export const teamProcedureAssignments=sqliteTable("team_procedure_assignments",{
 procedureId:text("procedure_id").notNull().references(()=>teamProcedures.id),
 userId:text("user_id").notNull().references(()=>users.id),
 assignedAt:integer("assigned_at").notNull(),
 acknowledgedAt:integer("acknowledged_at"),
},t=>[
 primaryKey({columns:[t.procedureId,t.userId]})
]);
export const teamGovernanceTasks=sqliteTable("team_governance_tasks",{
 id:text("id").primaryKey().notNull(),
 kind:text("kind").notNull(),
 sourceId:text("source_id").notNull(),
 dutyId:text("duty_id").references(()=>teamDuties.id),
 subjectUserId:text("subject_user_id").references(()=>users.id),
 createdAt:integer("created_at").notNull(),
 dueAt:integer("due_at").notNull(),
 state:text("state").notNull(),
 revision:integer("revision").notNull().default(0),
 completedAt:integer("completed_at"),
 sourceReferenceJson:text("source_reference_json").notNull().default("{}"),
},t=>[
 index("team_governance_tasks_subject").on(t.kind,t.subjectUserId,t.state),
 index("team_governance_tasks_scan").on(t.state,t.id),
 uniqueIndex("team_governance_tasks_unique_2").on(t.kind,t.sourceId),
 check("team_governance_tasks_check_0",sql.raw("state IN('open','completed','superseded')")),
 check("team_governance_tasks_check_1",sql.raw("json_valid(source_reference_json)"))
]);
export const teamGovernanceEvents=sqliteTable("team_governance_events",{
 id:text("id").primaryKey().notNull(),
 sourceType:text("source_type").notNull(),
 sourceId:text("source_id").notNull(),
 action:text("action").notNull(),
 actorId:text("actor_id").notNull().references(()=>users.id),
 createdAt:integer("created_at").notNull(),
 reason:text("reason").notNull(),
 detailsJson:text("details_json").notNull(),
 requestId:text("request_id").notNull(),
},t=>[
 uniqueIndex("team_governance_events_unique_0").on(t.actorId,t.requestId),
 check("team_governance_events_check_0",sql.raw("json_valid(details_json)"))
]);
export const serviceIncidentGovernance=sqliteTable("service_incident_governance",{
 incidentId:text("incident_id").primaryKey().notNull().references(()=>serviceHealthIncidents.id),
 title:text("title").notNull().default("Service incident"),
 impactClass:text("impact_class").notNull().default("ordinary"),
 impactSummary:text("impact_summary").notNull().default("Impact not yet assessed"),
 failureSignature:text("failure_signature").notNull(),
 releaseReference:text("release_reference"),
 configurationReference:text("configuration_reference"),
 ownerId:text("owner_id").references(()=>users.id),
 backupId:text("backup_id").references(()=>users.id),
 acknowledgedAt:integer("acknowledged_at"),
 acknowledgedBy:text("acknowledged_by").references(()=>users.id),
 planText:text("plan_text"),
 planAt:integer("plan_at"),
 firstReviewAt:integer("first_review_at"),
 nextAction:text("next_action"),
 nextUpdateAt:integer("next_update_at"),
 acknowledgeDueAt:integer("acknowledge_due_at").notNull(),
 planDueAt:integer("plan_due_at").notNull(),
 updateIntervalMs:integer("update_interval_ms").notNull(),
 closureRequired:integer("closure_required").notNull().default(1),
 closureAuthorizedRevision:integer("closure_authorized_revision"),
 closedBy:text("closed_by").references(()=>users.id),
 resolutionCause:text("resolution_cause"),
 recoveryFirstObservationId:text("recovery_first_observation_id").references(()=>serviceHealthObservations.id),
 recoveryLastObservationId:text("recovery_last_observation_id").references(()=>serviceHealthObservations.id),
 mergedInto:text("merged_into").references(()=>serviceHealthIncidents.id),
 legacyIncidentId:text("legacy_incident_id").references(()=>operationalIncidents.id),
 priorIncidentId:text("prior_incident_id").references(()=>serviceHealthIncidents.id),
 revision:integer("revision").notNull().default(0),
 updatedAt:integer("updated_at").notNull(),
},t=>[
 index("service_incident_due").on(t.acknowledgeDueAt,t.nextUpdateAt,t.incidentId),
 uniqueIndex("service_incident_governance_unique_1").on(t.legacyIncidentId),
 check("service_incident_governance_check_0",sql.raw("impact_class IN('ordinary','privacy','security','financial_integrity')")),
 check("service_incident_governance_check_1",sql.raw("update_interval_ms>0")),
 check("service_incident_governance_check_2",sql.raw("closure_required IN(0,1)")),
 check("service_incident_governance_check_3",sql.raw("owner_id IS NULL OR backup_id IS NULL OR owner_id<>backup_id"))
]);
export const serviceIncidentEvents=sqliteTable("service_incident_events",{
 id:text("id").primaryKey().notNull(),
 incidentId:text("incident_id").notNull().references(()=>serviceHealthIncidents.id),
 requestId:text("request_id").notNull(),
 actorId:text("actor_id").references(()=>users.id),
 action:text("action").notNull(),
 fromRevision:text("from_revision"),
 toRevision:text("to_revision").notNull(),
 governanceRevision:integer("governance_revision").notNull(),
 factsJson:text("facts_json").notNull(),
 occurredAt:integer("occurred_at").notNull(),
},t=>[
 index("service_incident_event_history").on(t.incidentId,t.occurredAt,t.id),
 uniqueIndex("service_incident_events_unique_1").on(t.requestId)
]);
export const serviceIncidentLinks=sqliteTable("service_incident_links",{
 incidentId:text("incident_id").notNull().references(()=>serviceHealthIncidents.id),
 sourceType:text("source_type").notNull(),
 sourceId:text("source_id").notNull(),
 linkedBy:text("linked_by").notNull().references(()=>users.id),
 linkedAt:integer("linked_at").notNull(),
},t=>[
 primaryKey({columns:[t.incidentId,t.sourceType,t.sourceId]}),
 check("service_incident_links_check_0",sql.raw("source_type IN('order','seller','payment','refund','return_request','complaint','incident')"))
]);
export const serviceIncidentLegacyLinks=sqliteTable("service_incident_legacy_links",{
 legacyIncidentId:text("legacy_incident_id").primaryKey().notNull().references(()=>operationalIncidents.id),
 incidentId:text("incident_id").notNull().references(()=>serviceHealthIncidents.id),
 mappedBy:text("mapped_by").notNull().references(()=>users.id),
 mappedAt:integer("mapped_at").notNull(),
 legacyStatus:text("legacy_status").notNull(),
 legacyUpdatedAt:integer("legacy_updated_at").notNull(),
});
export const formHealthObservations=sqliteTable("form_health_observations",{
 id:text("id").primaryKey().notNull(),
 supportReference:text("support_reference").notNull(),
 environment:text("environment").notNull(),
 releaseId:text("release_id").notNull(),
 formId:text("form_id").notNull(),
 formVersion:integer("form_version"),
 journey:text("journey").notNull(),
 phase:text("phase").notNull(),
 outcome:text("outcome").notNull(),
 category:text("category"),
 evidenceKind:text("evidence_kind").notNull(),
 evidenceId:text("evidence_id"),
 observedAt:integer("observed_at").notNull(),
},t=>[
 index("form_health_scope_clock").on(t.environment,t.releaseId,t.formId,t.observedAt,t.id),
 uniqueIndex("form_health_observations_unique_1").on(t.evidenceKind,t.evidenceId),
 uniqueIndex("form_health_observations_unique_2").on(t.supportReference),
 check("form_health_observations_check_0",sql.raw("environment IN('production','development','local_staging','test','unknown')")),
 check("form_health_observations_check_1",sql.raw("phase IN('load','save')")),
 check("form_health_observations_check_2",sql.raw("outcome IN('compatible','fallback','blocked','saved')")),
 check("form_health_observations_check_3",sql.raw("category IN('definition_unavailable','definition_invalid','read_unavailable','durable_submission')")),
 check("form_health_observations_check_4",sql.raw("evidence_kind IN('runtime','form_answer_set','core_receipt','native_command')")),
 check("form_health_observations_check_5",sql.raw("observed_at>=0")),
 check("form_health_observations_check_6",sql.raw("(phase='load' AND outcome IN('compatible','fallback','blocked') AND evidence_kind='runtime' AND evidence_id IS NULL) OR (phase='save' AND outcome='saved' AND evidence_kind IN('form_answer_set','core_receipt','native_command') AND evidence_id IS NOT NULL)"))
]);
export const formHealthIncidentLinks=sqliteTable("form_health_incident_links",{
 observationId:text("observation_id").notNull().references(()=>formHealthObservations.id),
 incidentId:text("incident_id").notNull().references(()=>serviceHealthIncidents.id),
 retainedAt:integer("retained_at").notNull(),
},t=>[
 primaryKey({columns:[t.observationId,t.incidentId]})
]);
export const fileHealthObservations=sqliteTable("file_health_observations",{
 id:text("id").primaryKey().notNull(),
 supportReference:text("support_reference").notNull(),
 environment:text("environment").notNull(),
 releaseId:text("release_id").notNull(),
 accessKind:text("access_kind").notNull(),
 outcome:text("outcome").notNull(),
 category:text("category"),
 observedAt:integer("observed_at").notNull(),
},t=>[
 index("file_health_scope_clock").on(t.environment,t.releaseId,t.accessKind,t.observedAt,t.id),
 uniqueIndex("file_health_observations_unique_1").on(t.supportReference),
 check("file_health_observations_check_0",sql.raw("environment IN('production','development','local_staging','test','unknown')")),
 check("file_health_observations_check_1",sql.raw("access_kind IN('public','private')")),
 check("file_health_observations_check_2",sql.raw("outcome IN('read','blocked')")),
 check("file_health_observations_check_3",sql.raw("category='storage_read_failed'")),
 check("file_health_observations_check_4",sql.raw("observed_at>=0"))
]);
export const fileHealthIncidentLinks=sqliteTable("file_health_incident_links",{
 observationId:text("observation_id").notNull().references(()=>fileHealthObservations.id),
 incidentId:text("incident_id").notNull().references(()=>serviceHealthIncidents.id),
 retainedAt:integer("retained_at").notNull(),
},t=>[
 primaryKey({columns:[t.observationId,t.incidentId]})
]);
// END T30 GOVERNANCE ORM

// Bounded complete0152 case shape for FK tooling; physical cross-permission FK remains in the authoritative raw source.
const legacyProtectedCaseReference=sqliteTable('seller_protected_change_cases',{
 id:text('id').primaryKey().notNull(),sellerId:text('seller_id').notNull().references(()=>sellerProfiles.id),kind:text('kind').notNull(),classification:text('classification').notNull(),status:text('status').notNull().default('open'),
 sourceRequestId:text('source_request_id').unique().references(()=>sellerDocumentChangeRequests.id),sourceDocumentId:text('source_document_id').references(()=>sellerDocuments.id),originalIdentityRevision:integer('original_identity_revision').notNull(),originalBankReference:text('original_bank_reference'),
 scopeJson:text('scope_json').notNull(),proposedJson:text('proposed_json'),replacementDocumentId:text('replacement_document_id').references(()=>sellerDocuments.id),invalidCurrent:integer('invalid_current').notNull().default(0),version:integer('version').notNull().default(0),
 requestedBy:text('requested_by').references(()=>users.id),reason:text('reason').notNull(),requestedAt:integer('requested_at').notNull(),updatedAt:integer('updated_at').notNull(),reviewedBy:text('reviewed_by').references(()=>users.id),reviewedAt:integer('reviewed_at'),reviewReason:text('review_reason'),evidenceReference:text('evidence_reference'),operationRequestId:text('operation_request_id').notNull(),activePermissionId:text('active_permission_id'),
},t=>[index('seller_protected_cases_seller').on(t.sellerId,t.status),check('protected_case_kind',sql.raw("kind IN('identity','bank')")),check('protected_case_classification',sql.raw("classification IN('unclassified','material','identity_evidence_only','bank')")),check('protected_case_status',sql.raw("status IN('open','verified','rejected','withdrawn','closed')")),check('protected_case_current_invalid',sql.raw('invalid_current IN(0,1)')),check('protected_case_source_identity',sql.raw('source_request_id IS NULL OR id=source_request_id'))]);
export const completeVersionLegacyTransitions=sqliteTable('complete_version_legacy_transitions',{
 sourceRequestId:text('source_request_id').primaryKey().notNull().references(()=>sellerDocumentChangeRequests.id),
 caseId:text('case_id').notNull().unique().references(()=>legacyProtectedCaseReference.id),
 cutoverKey:text('cutover_key').notNull(),transitionOperationId:text('transition_operation_id').notNull().unique(),
 sourceFingerprint:text('source_fingerprint').notNull(),sourceSnapshotJson:text('source_snapshot_json').notNull(),originalOperationId:text('original_operation_id'),
 historicalRequestIdentityRevision:integer('historical_request_identity_revision'),historicalRequestBankReference:text('historical_request_bank_reference'),baselineBasis:text('baseline_basis').notNull(),observedIdentityRevision:integer('observed_identity_revision').notNull(),observedBankReference:text('observed_bank_reference'),observedAt:integer('observed_at').notNull(),
 originalRequestedAt:integer('original_requested_at').notNull(),reviewTaskId:text('review_task_id').notNull().references(()=>reviewTasks.id),existingTaskPreserved:integer('existing_task_preserved').notNull(),
 deadlineStartedAt:integer('deadline_started_at').notNull(),firstReviewDueAt:integer('first_review_due_at').notNull(),cutoverAt:integer('cutover_at').notNull(),initiatedBy:text('initiated_by').notNull().references(()=>users.id),
},_t=>[check('legacy_transition_fingerprint',sql.raw("length(source_fingerprint)=64 AND source_fingerprint NOT GLOB '*[^0-9a-f]*'")),check('legacy_transition_snapshot',sql.raw('json_valid(source_snapshot_json)')),check('legacy_transition_unknown_history',sql.raw('historical_request_identity_revision IS NULL AND historical_request_bank_reference IS NULL')),check('legacy_transition_observed_basis',sql.raw("hex(baseline_basis)=hex('cutover_observation') AND observed_identity_revision>=0 AND observed_at>=0 AND deadline_started_at>=0")),check('legacy_transition_original_clock',sql.raw('original_requested_at>=0')),check('legacy_transition_task_preservation',sql.raw('existing_task_preserved IN(0,1)')),check('legacy_transition_link_identity',sql.raw('hex(case_id)=hex(source_request_id)')),check('legacy_transition_cutover_clock',sql.raw('cutover_at>=0 AND (existing_task_preserved=1 OR first_review_due_at>=cutover_at)'))]);
