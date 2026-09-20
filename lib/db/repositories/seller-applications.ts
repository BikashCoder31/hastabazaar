import { businessNotificationStatements } from '../../operations/business-notifications';
import type {
  SellerApplicationDocument,
  SellerApplicationInput,
} from '@/lib/sellers/application';
import { sellerAgreementVersion, sellerDocumentsForApplication } from '@/lib/sellers/application';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';
import { sellerTransitions } from '@/lib/marketplace/workflows';
import type { SellerStatus } from '@/lib/marketplace/types';

interface CreateSellerApplicationOptions {
  userId: string;
  existingAccount?: boolean;
  sellerId: string;
  applicationReference: string;
  input: SellerApplicationInput;
  documents: readonly SellerApplicationDocument[];
  now: number;
}

export async function createSellerApplication(
  database: D1Database,
  options: CreateSellerApplicationOptions,
): Promise<void> {
  const { userId, sellerId, applicationReference, input, documents, now } =
    options;
  if (!['individual','company'].includes(input.applicantType) || !['PAN','VAT','BOTH'].includes(input.taxMode)) throw new Error('Choose a valid applicant and tax document type.');
  const definitions=sellerDocumentsForApplication(input);
  for(const definition of definitions.filter(d=>d.required))if(documents.filter(d=>d.kind===definition.kind).length!==1)throw new Error(definition.label+' is required exactly once.');
  if(documents.some(d=>!definitions.some(f=>f.kind===d.kind)||!d.objectKey.startsWith('private/seller-documents/'+sellerId+'/')))throw new Error('Unexpected or non-private application document.');
  if(input.applicantType==='company'&&(!input.registrationAuthority||!input.registrationNumber))throw new Error('Company registration details are required.');
  if(input.applicantType==='individual'&&(input.registrationAuthority||input.registrationNumber))throw new Error('Individual applications do not use company registration details.');
  if (options.existingAccount) {
    const account = await database.prepare(
      `SELECT id FROM users WHERE id = ? AND lower(email) = ? AND status = 'active'`,
    ).bind(userId, input.email.trim().toLowerCase()).first();
    if (!account) throw new Error('The signed-in seller application account is unavailable.');
  }
  const accountStatements: D1PreparedStatement[] = options.existingAccount ? [] : [
    database
      .prepare(
        `INSERT INTO users (
          id, auth_subject, email, phone, display_name, locale, status, created_at, updated_at
        ) VALUES (?, NULL, ?, ?, ?, 'en-NP', 'active', ?, ?)`,
      )
      .bind(
        userId,
        input.email,
        input.phone,
        input.representativeName,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO user_roles (user_id, role, assigned_by, assigned_at)
         VALUES (?, 'customer', NULL, ?)`,
      )
      .bind(userId, now),
  ];
  const statements: D1PreparedStatement[] = [
    ...accountStatements,
    database
      .prepare(
        `INSERT INTO seller_profiles (
          id, application_reference, user_id, legal_name, trading_name, applicant_type,
          registration_authority, registration_number, tax_mode,
          tax_registration_number, representative_name, business_description,
          product_categories, support_phone, support_email, province, district,
          municipality, ward, locality, payout_account_reference, status,
          seller_agreement_version, seller_agreement_accepted_at, review_note,
          reviewed_by, approved_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL,
          'submitted', ?, ?, NULL, NULL, NULL, ?, ?
        )`,
      )
      .bind(
        sellerId,
        applicationReference,
        userId,
        input.legalName,
        input.tradingName,
        input.applicantType,
        input.registrationAuthority,
        input.registrationNumber,
        input.taxMode,
        input.taxRegistrationNumber,
        input.representativeName,
        input.businessDescription,
        input.productCategories,
        input.phone,
        input.email,
        input.province,
        input.district,
        input.municipality,
        input.ward,
        input.locality,
        sellerAgreementVersion,
        now,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) VALUES (?, NULL, 'seller.application.submitted', 'seller', ?,
          'Public seller application submitted', NULL, NULL, NULL, NULL, ?)`,
      )
      .bind(crypto.randomUUID(), sellerId, now),
  ];

  for (const document of documents) {
    statements.push(
      database
        .prepare(
          `INSERT INTO seller_documents (
            id, seller_id, kind, object_key, original_name, mime_type,
            size_bytes, status, uploaded_at, reviewed_at, reviewed_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL)`,
        )
        .bind(
          document.id,
          sellerId,
          document.kind,
          document.objectKey,
          document.originalName,
          document.mimeType,
          document.sizeBytes,
          now,
        ),
    );
  }

  statements.push(...await businessNotificationStatements(database,{eventId:sellerId,sourceType:'seller_application',sourceId:sellerId,status:'submitted',actorId:userId,now,kind:'submitted'}));
  await database.batch(statements);
}

export interface SellerReviewQueueRow {
  id: string;
  applicationReference: string;
  legalName: string;
  tradingName: string;
  representativeName: string;
  supportEmail: string;
  supportPhone: string;
  district: string;
  taxMode: 'PAN' | 'VAT' | 'BOTH';
  applicantType: 'individual' | 'company' | null;
  status: string;
  createdAt: number;
  documentCount: number;
}

export async function listSellerApplicationsForReview(
  database: D1Database,
  limit = 50,
): Promise<readonly SellerReviewQueueRow[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError(
      'Review queue limit must be an integer from 1 through 100.',
    );
  }

  const result = await database
    .prepare(
      `SELECT
        seller_profiles.id,
        seller_profiles.application_reference AS applicationReference,
        seller_profiles.legal_name AS legalName,
        seller_profiles.trading_name AS tradingName,
        seller_profiles.representative_name AS representativeName,
        seller_profiles.support_email AS supportEmail,
        seller_profiles.support_phone AS supportPhone,
        seller_profiles.district,
        seller_profiles.tax_mode AS taxMode,
        seller_profiles.applicant_type AS applicantType,
        seller_profiles.status,
        seller_profiles.created_at AS createdAt,
        COUNT(seller_documents.id) AS documentCount
      FROM seller_profiles
      LEFT JOIN seller_documents ON seller_documents.seller_id = seller_profiles.id
      WHERE seller_profiles.status IN ('submitted', 'under_review', 'needs_changes')
      GROUP BY seller_profiles.id
      ORDER BY seller_profiles.created_at ASC
      LIMIT ?`,
    )
    .bind(limit)
    .all<SellerReviewQueueRow>();

  return result.results;
}

export interface SellerRegistryRow extends SellerReviewQueueRow {
  ownerName: string;
  ownerEmail: string;
  accountStatus: string;
  approvedAt: number | null;
  updatedAt: number;
  productCount: number;
  orderCount: number;
}

export interface SellerRegistryCounts {
  total: number;
  draft: number;
  submitted: number;
  underReview: number;
  needsChanges: number;
  approved: number;
  rejected: number;
  suspended: number;
}

export async function getSellerRegistryCounts(
  database: D1Database,
): Promise<SellerRegistryCounts> {
  const row = await database
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) AS underReview,
        SUM(CASE WHEN status = 'needs_changes' THEN 1 ELSE 0 END) AS needsChanges,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
       FROM seller_profiles`,
    )
    .first<Partial<SellerRegistryCounts>>();

  return {
    total: Number(row?.total ?? 0),
    draft: Number(row?.draft ?? 0),
    submitted: Number(row?.submitted ?? 0),
    underReview: Number(row?.underReview ?? 0),
    needsChanges: Number(row?.needsChanges ?? 0),
    approved: Number(row?.approved ?? 0),
    rejected: Number(row?.rejected ?? 0),
    suspended: Number(row?.suspended ?? 0),
  };
}

export async function listSellerRegistry(
  database: D1Database,
  page = 1,
  pageSize = 50,
): Promise<readonly SellerRegistryRow[]> {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError('Seller registry page must be a positive integer.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new RangeError(
      'Seller registry page size must be an integer from 1 through 100.',
    );
  }

  const result = await database
    .prepare(
      `SELECT
        seller_profiles.id,
        seller_profiles.application_reference AS applicationReference,
        seller_profiles.legal_name AS legalName,
        seller_profiles.trading_name AS tradingName,
        seller_profiles.representative_name AS representativeName,
        seller_profiles.support_email AS supportEmail,
        seller_profiles.support_phone AS supportPhone,
        seller_profiles.district,
        seller_profiles.tax_mode AS taxMode,
        seller_profiles.applicant_type AS applicantType,
        seller_profiles.status,
        seller_profiles.created_at AS createdAt,
        seller_profiles.approved_at AS approvedAt,
        seller_profiles.updated_at AS updatedAt,
        owner.display_name AS ownerName,
        owner.email AS ownerEmail,
        owner.status AS accountStatus,
        (SELECT COUNT(*) FROM seller_documents
          WHERE seller_documents.seller_id = seller_profiles.id) AS documentCount,
        (SELECT COUNT(*) FROM products
          WHERE products.seller_id = seller_profiles.id) AS productCount,
        (SELECT COUNT(DISTINCT order_items.order_id) FROM order_items
          WHERE order_items.seller_id = seller_profiles.id) AS orderCount
       FROM seller_profiles
       INNER JOIN users AS owner ON owner.id = seller_profiles.user_id
       ORDER BY seller_profiles.created_at DESC, seller_profiles.id
       LIMIT ? OFFSET ?`,
    )
    .bind(pageSize, (page - 1) * pageSize)
    .all<SellerRegistryRow>();

  return result.results;
}

export interface SellerApplicationDocumentRow {
  id: string;
  kind: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  uploadedAt: number;
}

export interface SellerModerationEventRow {
  id: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  actorName: string;
  actorEmail: string;
  createdAt: number;
}

export interface SellerApplicationDetail extends SellerReviewQueueRow {
  userId: string;
  registrationAuthority: string;
  registrationNumber: string;
  taxRegistrationNumber: string;
  businessDescription: string | null;
  productCategories: string | null;
  province: string;
  municipality: string;
  ward: string | null;
  locality: string;
  sellerAgreementVersion: string | null;
  sellerAgreementAcceptedAt: number | null;
  payoutAccountReference: string | null;
  settlementTermsReference: string | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  updatedAt: number;
  documents: readonly SellerApplicationDocumentRow[];
  history: readonly SellerModerationEventRow[];
}

type SellerApplicationBaseRow = Omit<
  SellerApplicationDetail,
  'documents' | 'history'
>;

export async function getSellerApplicationForReview(
  database: D1Database,
  sellerId: string,
): Promise<SellerApplicationDetail | null> {
  const application = await database
    .prepare(
      `SELECT
        seller_profiles.id,
        seller_profiles.user_id AS userId,
        seller_profiles.application_reference AS applicationReference,
        seller_profiles.legal_name AS legalName,
        seller_profiles.trading_name AS tradingName,
        seller_profiles.registration_authority AS registrationAuthority,
        seller_profiles.registration_number AS registrationNumber,
        seller_profiles.tax_mode AS taxMode,
        seller_profiles.applicant_type AS applicantType,
        seller_profiles.tax_registration_number AS taxRegistrationNumber,
        seller_profiles.representative_name AS representativeName,
        seller_profiles.business_description AS businessDescription,
        seller_profiles.product_categories AS productCategories,
        seller_profiles.support_email AS supportEmail,
        seller_profiles.support_phone AS supportPhone,
        seller_profiles.province,
        seller_profiles.district,
        seller_profiles.municipality,
        seller_profiles.ward,
        seller_profiles.locality,
        seller_profiles.status,
        seller_profiles.seller_agreement_version AS sellerAgreementVersion,
        seller_profiles.seller_agreement_accepted_at AS sellerAgreementAcceptedAt,
        seller_profiles.payout_account_reference AS payoutAccountReference,
        seller_profiles.settlement_terms_reference AS settlementTermsReference,
        seller_profiles.review_note AS reviewNote,
        reviewer.display_name AS reviewedByName,
        seller_profiles.created_at AS createdAt,
        seller_profiles.updated_at AS updatedAt,
        COUNT(seller_documents.id) AS documentCount
      FROM seller_profiles
      LEFT JOIN seller_documents ON seller_documents.seller_id = seller_profiles.id
      LEFT JOIN users AS reviewer ON reviewer.id = seller_profiles.reviewed_by
      WHERE seller_profiles.id = ?
      GROUP BY seller_profiles.id
      LIMIT 1`,
    )
    .bind(sellerId)
    .first<SellerApplicationBaseRow>();

  if (!application) return null;

  const [documentsResult, historyResult] = await Promise.all([
    database
      .prepare(
        `SELECT id, kind, original_name AS originalName, mime_type AS mimeType,
          size_bytes AS sizeBytes, status, uploaded_at AS uploadedAt
         FROM seller_documents
         WHERE seller_id = ?
         ORDER BY uploaded_at ASC`,
      )
      .bind(sellerId)
      .all<SellerApplicationDocumentRow>(),
    database
      .prepare(
        `SELECT moderation_events.id,
          moderation_events.from_status AS fromStatus,
          moderation_events.to_status AS toStatus,
          moderation_events.reason,
          users.display_name AS actorName,
          users.email AS actorEmail,
          moderation_events.created_at AS createdAt
         FROM moderation_events
         INNER JOIN users ON users.id = moderation_events.actor_id
         WHERE moderation_events.subject_type = 'seller'
           AND moderation_events.subject_id = ?
         ORDER BY moderation_events.created_at DESC`,
      )
      .bind(sellerId)
      .all<SellerModerationEventRow>(),
  ]);

  return {
    ...application,
    documents: documentsResult.results,
    history: historyResult.results,
  };
}

export interface AdminDashboardStats {
  submittedSellers: number;
  sellersUnderReview: number;
  sellersNeedingChanges: number;
  approvedSellers: number;
  pendingProducts: number;
  openComplaints: number;
}

export async function getAdminDashboardStats(
  database: D1Database,
): Promise<AdminDashboardStats> {
  const row = await database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM seller_profiles WHERE status = 'submitted') AS submittedSellers,
        (SELECT COUNT(*) FROM seller_profiles WHERE status = 'under_review') AS sellersUnderReview,
        (SELECT COUNT(*) FROM seller_profiles WHERE status = 'needs_changes') AS sellersNeedingChanges,
        (SELECT COUNT(*) FROM seller_profiles WHERE status = 'approved') AS approvedSellers,
        (SELECT COUNT(*) FROM products WHERE status IN ('submitted', 'under_review')) AS pendingProducts,
        (SELECT COUNT(*) FROM complaints WHERE status IN ('open', 'investigating', 'waiting_customer')) AS openComplaints`,
    )
    .first<AdminDashboardStats>();

  return (
    row ?? {
      submittedSellers: 0,
      sellersUnderReview: 0,
      sellersNeedingChanges: 0,
      approvedSellers: 0,
      pendingProducts: 0,
      openComplaints: 0,
    }
  );
}

export type SellerReviewAction =
  | 'start_review'
  | 'request_changes'
  | 'approve'
  | 'reject';

const reviewTransitions: Record<
  SellerReviewAction,
  { from: SellerStatus; to: SellerStatus; auditAction: string }
> = {
  start_review: {
    from: 'submitted',
    to: 'under_review',
    auditAction: 'seller.application.review_started',
  },
  request_changes: {
    from: 'under_review',
    to: 'needs_changes',
    auditAction: 'seller.application.changes_requested',
  },
  approve: {
    from: 'under_review',
    to: 'approved',
    auditAction: 'seller.application.approved',
  },
  reject: {
    from: 'under_review',
    to: 'rejected',
    auditAction: 'seller.application.rejected',
  },
};

export class SellerReviewConflictError extends Error {}

export async function reviewSellerApplication(
  database: D1Database,
  options: {
    sellerId: string;
    actorId: string;
    action: SellerReviewAction;
    reason: string;
    requestId?: string;
    now: number;
    payoutAccountReference?: string;
    settlementTermsReference?: string;
  },
): Promise<{ from: SellerStatus; to: SellerStatus }> {
  const transition = reviewTransitions[options.action];
  const current = await database
    .prepare(
      `SELECT user_id AS userId, status,
        seller_agreement_version AS sellerAgreementVersion,
        seller_agreement_accepted_at AS sellerAgreementAcceptedAt,
        EXISTS(SELECT 1 FROM seller_documents
          WHERE seller_id = seller_profiles.id AND kind = 'bank_verification') AS bankEvidence
       FROM seller_profiles WHERE id = ?`,
    )
    .bind(options.sellerId)
    .first<{
      userId: string;
      status: SellerStatus;
      sellerAgreementVersion: string | null;
      sellerAgreementAcceptedAt: number | null;
      bankEvidence: number;
    }>();

  if (!current) throw new SellerReviewConflictError('Application not found.');
  if (current.userId === options.actorId) {
    throw new SellerReviewConflictError(
      'Staff members cannot review their own seller application.',
    );
  }
  if (
    current.status !== transition.from ||
    !sellerTransitions[current.status].includes(transition.to)
  ) {
    throw new SellerReviewConflictError(
      `This action is not available while the application is ${current.status}.`,
    );
  }
  const payoutAccountReference = options.payoutAccountReference?.trim() ?? '';
  const settlementTermsReference = options.settlementTermsReference?.trim() ?? '';
  if (options.action === 'approve') {
    if (
      current.sellerAgreementVersion !== SELLER_AGREEMENT_VERSION ||
      !current.sellerAgreementAcceptedAt
    ) {
      throw new SellerReviewConflictError(
        'The seller must accept the current Seller Marketplace Agreement before activation.',
      );
    }
    if (!current.bankEvidence) {
      throw new SellerReviewConflictError(
        'Verified receiving-account evidence is required before activation.',
      );
    }
    if (
      payoutAccountReference.length < 4 ||
      payoutAccountReference.length > 200 ||
      settlementTermsReference.length < 4 ||
      settlementTermsReference.length > 200
    ) {
      throw new SellerReviewConflictError(
        'Record the verified receiving-account reference and written settlement-terms reference before activation.',
      );
    }
  }

  const previousJson = JSON.stringify({ status: transition.from });
  const nextJson = JSON.stringify({
    status: transition.to,
    reviewNote: options.reason,
  });
  const requestId = options.requestId ?? crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE seller_profiles
         SET status = ?, review_note = ?, review_request_id = ?, reviewed_by = ?,
           payout_account_reference = CASE WHEN ? = 'approved' THEN ? ELSE payout_account_reference END,
           settlement_terms_reference = CASE WHEN ? = 'approved' THEN ? ELSE settlement_terms_reference END,
           approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END,
           updated_at = ?
         WHERE id = ? AND status = ?`,
      )
      .bind(
        transition.to,
        options.reason,
        requestId,
        options.actorId,
        transition.to,
        payoutAccountReference || null,
        transition.to,
        settlementTermsReference || null,
        transition.to,
        options.now,
        options.now,
        options.sellerId,
        transition.from,
      ),
    database
      .prepare(
        `INSERT INTO moderation_events (
          id, subject_type, subject_id, from_status, to_status, reason,
          actor_id, created_at
        )
        SELECT ?, 'seller', ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM seller_profiles
          WHERE id = ? AND review_request_id = ?
        )`,
      )
      .bind(
        crypto.randomUUID(),
        options.sellerId,
        transition.from,
        transition.to,
        options.reason,
        options.actorId,
        options.now,
        options.sellerId,
        requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        )
        SELECT ?, ?, ?, 'seller', ?, ?, ?, ?, ?, NULL, ?
        WHERE EXISTS (
          SELECT 1 FROM seller_profiles
          WHERE id = ? AND review_request_id = ?
        )`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        transition.auditAction,
        options.sellerId,
        options.reason,
        previousJson,
        nextJson,
        requestId,
        options.now,
        options.sellerId,
        requestId,
      ),
  ];

  if (options.action === 'approve') {
    statements.push(
      database
        .prepare(
          `UPDATE seller_documents
           SET status = 'verified', reviewed_at = ?, reviewed_by = ?
           WHERE seller_id = ? AND status = 'pending'
             AND EXISTS (
               SELECT 1 FROM seller_profiles
               WHERE id = ? AND review_request_id = ?
             )`,
        )
        .bind(
          options.now,
          options.actorId,
          options.sellerId,
          options.sellerId,
          requestId,
        ),
      database
        .prepare(
          `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_by, assigned_at)
           SELECT user_id, 'seller', ?, ? FROM seller_profiles
           WHERE id = ? AND review_request_id = ?`,
        )
        .bind(options.actorId, options.now, options.sellerId, requestId),
    );
  }

  if(options.action!=='start_review')statements.push(...await businessNotificationStatements(database,{eventId:requestId,sourceType:'seller_application',sourceId:options.sellerId,status:transition.to,reviewRequestId:requestId,actorId:options.actorId,now:options.now,kind:'result'}));
  const results = await database.batch(statements);
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new SellerReviewConflictError(
      'The application changed while it was being reviewed. Refresh and try again.',
    );
  }

  return { from: transition.from, to: transition.to };
}

export async function getSellerDocumentForStaff(
  database: D1Database,
  documentId: string,
): Promise<{
  objectKey: string;
  originalName: string;
  mimeType: string;
} | null> {
  return (
    (await database
      .prepare(
        `SELECT object_key AS objectKey, original_name AS originalName,
          mime_type AS mimeType
         FROM seller_documents
         WHERE id = ?
         LIMIT 1`,
      )
      .bind(documentId)
      .first<{
        objectKey: string;
        originalName: string;
        mimeType: string;
      }>()) ?? null
  );
}
