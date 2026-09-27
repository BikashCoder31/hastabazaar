import { businessNotificationStatements } from '../../operations/business-notifications';
import type {
  SellerApplicationDocument,
  SellerApplicationInput,
  SellerProfileMediaUpload,
} from '@/lib/sellers/application';
import { sellerAgreementVersion, sellerDocumentsForApplication } from '@/lib/sellers/application';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';
import { sellerTransitions } from '@/lib/marketplace/workflows';
import type { SellerStatus } from '@/lib/marketplace/types';
import type {
  CraftExperience,
  MakerSocialLinks,
  ParticipationApplicationStage,
  ParticipationRoute,
} from '@/lib/sellers/participation';
import { parseCraftExperience, parseMakerSocialLinks } from '@/lib/sellers/participation';
import { buildFormAnswerInsert } from './form-answers';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { digestFormRequest, formRequestReplay } from '@/lib/forms/submission';

type SellerFormLink = { requestId: string; versionId: string; answers: FormAnswerSnapshot; digest?: string };

interface CreateSellerApplicationOptions {
  userId: string;
  existingAccount?: boolean;
  sellerId: string;
  applicationReference: string;
  input: SellerApplicationInput;
  documents: readonly SellerApplicationDocument[];
  profileMedia?: readonly SellerProfileMediaUpload[];
  now: number;
  form?: SellerFormLink;
}

export async function createSellerApplication(
  database: D1Database,
  options: CreateSellerApplicationOptions,
): Promise<string> {
  const { userId, sellerId, applicationReference, input, documents, now } =
    options;
  const catalogDigest = options.form ? options.form.digest ?? await digestFormRequest({ input,
    documents: options.documents, profileMedia: options.profileMedia ?? [],
    versionId: options.form.versionId, answers: options.form.answers }) : null;
  if (options.form) {
    // The route may have uploaded private media while an identical anonymous
    // request committed under a different generated user ID. Resolve only by
    // the submitted email; formRequestReplay still requires the exact action,
    // answer and payload digest before exposing the winning seller ID.
    const replayActor = options.existingAccount ? userId :
      (await database.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1')
        .bind(input.email.trim().toLowerCase()).first<{ id: string }>())?.id ?? userId;
    const replay = await formRequestReplay(database, { formId: 'seller.application',
      requestId: options.form.requestId, actorId: replayActor, action: 'seller.application.submitted',
      digest: catalogDigest! });
    if (replay) return replay;
  }
  const profileMedia = options.profileMedia ?? [];
  if (!['individual','company'].includes(input.applicantType) || !['PAN','VAT','BOTH','NONE'].includes(input.taxMode)) throw new Error('Choose a valid applicant and tax document type.');
  if (input.participationRoute === 'managed_maker' && (input.taxMode !== 'NONE' || input.taxRegistrationNumber || input.registrationNumber || input.registrationAuthority)) throw new Error('Managed Maker applications cannot store placeholder registration or tax identifiers.');
  if (input.participationRoute === 'registered_seller' && (input.taxMode === 'NONE' || !input.taxRegistrationNumber)) throw new Error('Registered Seller tax details are required.');
  const definitions=sellerDocumentsForApplication(input);
  for(const definition of definitions.filter(d=>d.required))if(documents.filter(d=>d.kind===definition.kind).length!==1)throw new Error(definition.label+' is required exactly once.');
  if(documents.some(d=>!definitions.some(f=>f.kind===d.kind)||!d.objectKey.startsWith('private/seller-documents/'+sellerId+'/')))throw new Error('Unexpected or non-private application document.');
  if (profileMedia.some((media) => !['profile_image', 'maker_video'].includes(media.kind) || !media.objectKey.startsWith(`private/seller-profile/${sellerId}/`))) throw new Error('Unexpected or non-private maker profile media.');
  if(input.participationRoute==='registered_seller'&&input.applicantType==='company'&&(!input.registrationAuthority||!input.registrationNumber))throw new Error('Company registration details are required.');
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
    ...(options.form ? [database.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
      THEN 1 ELSE json_extract('invalid', '$') END`).bind(options.form.requestId)] : []),
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
        input.participationRoute === 'registered_seller' ? sellerAgreementVersion : null,
        input.participationRoute === 'registered_seller' ? now : null,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO seller_participation_profiles (
          seller_id, participation_route, application_stage, tax_status,
          public_name, public_city, craft_experience_json, social_links_json,
          commercial_model, legal_seller_reference, invoice_issuer_reference,
          payout_beneficiary_reference, return_destination_type, version,
          created_at, updated_at
        ) VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL,
          'maker_address', 1, ?, ?)`,
      )
      .bind(
        sellerId,
        input.participationRoute,
        input.taxStatus,
        input.tradingName,
        input.publicCity,
        JSON.stringify(input.craftExperience),
        JSON.stringify(input.socialLinks),
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO seller_operational_addresses (
          id, seller_id, purpose, same_as_address_id, province, district,
          municipality, ward, locality, is_public, created_at, updated_at
        ) VALUES (?, ?, 'verification', NULL, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        sellerId,
        input.province,
        input.district,
        input.municipality,
        input.ward,
        input.locality,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) VALUES (?, ?, 'seller.application.submitted', 'seller', ?,
          'Public seller application submitted', NULL, ?, ?, NULL, ?)`,
      )
      .bind(crypto.randomUUID(), options.form ? userId : null, sellerId,
        catalogDigest ? JSON.stringify({ catalogDigest }) : null, options.form?.requestId ?? null, now),
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

  for (const media of profileMedia) {
    statements.push(
      database.prepare(
        `INSERT INTO seller_profile_media (
          id, seller_id, kind, object_key, original_name, mime_type,
          size_bytes, moderation_status, uploaded_at, reviewed_at, reviewed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL)`,
      ).bind(
        media.id,
        sellerId,
        media.kind,
        media.objectKey,
        media.originalName,
        media.mimeType,
        media.sizeBytes,
        now,
      ),
    );
  }

  statements.push(...await businessNotificationStatements(database,{eventId:sellerId,sourceType:'seller_application',sourceId:sellerId,status:'submitted',actorId:userId,now,kind:'submitted'}));
  if (options.form) statements.push(buildFormAnswerInsert(database, {
    formId: 'seller.application', requestId: options.form.requestId, versionId: options.form.versionId,
    subjectType: 'seller', subjectId: sellerId, actorId: userId, answers: options.form.answers, now,
  }));
  try { await database.batch(statements); }
  catch (error) {
    if (options.form) {
      // Anonymous attempts allocate a new user ID before the batch. A
      // concurrent identical attempt can win with a different generated ID;
      // resolve that actor only through the exact submitted email, then still
      // require the audit action, form answer and digest to match.
      const replayActor = options.existingAccount ? userId :
        (await database.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1')
          .bind(input.email.trim().toLowerCase()).first<{ id: string }>())?.id ?? userId;
      const replay = await formRequestReplay(database, { formId: 'seller.application',
        requestId: options.form.requestId, actorId: replayActor, action: 'seller.application.submitted',
        digest: catalogDigest! });
      if (replay) return replay;
    }
    throw error;
  }
  return sellerId;
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
  taxMode: 'PAN' | 'VAT' | 'BOTH' | 'NONE';
  applicantType: 'individual' | 'company' | null;
  participationRoute?: ParticipationRoute | null;
  applicationStage?: ParticipationApplicationStage | null;
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
        participation.participation_route AS participationRoute,
        participation.application_stage AS applicationStage,
        seller_profiles.status,
        seller_profiles.created_at AS createdAt,
        COUNT(seller_documents.id) AS documentCount
      FROM seller_profiles
      LEFT JOIN seller_documents ON seller_documents.seller_id = seller_profiles.id
      LEFT JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
      WHERE seller_profiles.status IN ('submitted', 'under_review', 'needs_changes')
      GROUP BY seller_profiles.id
      ORDER BY seller_profiles.created_at ASC
      LIMIT ?`,
    )
    .bind(limit)
    .all<SellerReviewQueueRow>();

  return result.results;
}

export interface SellerParticipationProfile {
  sellerId: string;
  participationRoute: ParticipationRoute;
  applicationStage: ParticipationApplicationStage;
  taxStatus: 'business_pan_only' | 'vat_registered' | null;
  publicName: string;
  publicCity: string;
  craftExperience: readonly CraftExperience[];
  socialLinks: MakerSocialLinks;
  commercialModel: 'managed_sale_linked_percentage_v1' | 'managed_fixed_supplier_price_v1' | null;
  legalSellerReference: string | null;
  invoiceIssuerReference: string | null;
  payoutBeneficiaryReference: string | null;
  returnDestinationType: 'maker_address' | 'hastabazaar_collection_point';
  version: number;
}

export async function getSellerParticipationProfile(
  database: D1Database,
  sellerId: string,
): Promise<SellerParticipationProfile | null> {
  const row = await database.prepare(
    `SELECT seller_id AS sellerId, participation_route AS participationRoute,
      application_stage AS applicationStage, tax_status AS taxStatus,
      public_name AS publicName, public_city AS publicCity,
      craft_experience_json AS craftExperienceJson,
      social_links_json AS socialLinksJson, commercial_model AS commercialModel,
      legal_seller_reference AS legalSellerReference,
      invoice_issuer_reference AS invoiceIssuerReference,
      payout_beneficiary_reference AS payoutBeneficiaryReference,
      return_destination_type AS returnDestinationType, version
     FROM seller_participation_profiles WHERE seller_id = ? LIMIT 1`,
  ).bind(sellerId).first<Omit<SellerParticipationProfile, 'craftExperience' | 'socialLinks'> & {
    craftExperienceJson: string;
    socialLinksJson: string;
  }>();
  if (!row) return null;
  let craftExperience: readonly CraftExperience[];
  let socialLinks: MakerSocialLinks;
  try {
    craftExperience = JSON.parse(row.craftExperienceJson) as CraftExperience[];
    socialLinks = JSON.parse(row.socialLinksJson) as MakerSocialLinks;
  } catch {
    throw new Error('Seller participation profile contains invalid structured data.');
  }
  const { craftExperienceJson: _craft, socialLinksJson: _social, ...profile } = row;
  return { ...profile, craftExperience, socialLinks };
}

export async function getSellerParticipationForUser(
  database: D1Database,
  userId: string,
): Promise<SellerParticipationProfile | null> {
  const row = await database.prepare(
    `SELECT seller_profiles.id FROM seller_profiles
     INNER JOIN seller_participation_profiles participation
       ON participation.seller_id = seller_profiles.id
     WHERE seller_profiles.user_id = ? LIMIT 1`,
  ).bind(userId).first<{ id: string }>();
  return row ? getSellerParticipationProfile(database, row.id) : null;
}

export class SellerParticipationConflictError extends Error {}

export async function updateSellerParticipationPublicProfile(
  database: D1Database,
  options: {
    sellerId: string;
    actorId: string;
    expectedVersion: number;
    publicName: string;
    publicCity: string;
    craftExperience: readonly CraftExperience[];
    socialLinks: MakerSocialLinks;
    requestId: string;
    now: number;
    form?: SellerFormLink;
  },
): Promise<void> {
  const publicName = options.publicName.trim();
  const publicCity = options.publicCity.trim();
  if (!publicName || publicName.length > 160 || !publicCity || publicCity.length > 120) {
    throw new SellerParticipationConflictError('Public maker name and city are required and must fit their limits.');
  }
  if (!Number.isInteger(options.expectedVersion) || options.expectedVersion < 1 || !options.requestId || options.requestId.length > 100) {
    throw new SellerParticipationConflictError('The profile version or request reference is invalid.');
  }
  if (options.craftExperience.length > 10) throw new SellerParticipationConflictError('Use no more than ten craft experience entries.');
  const craftExperience = options.craftExperience.flatMap((entry) =>
    parseCraftExperience(entry.craft, entry.band),
  );
  const socialLinks = parseMakerSocialLinks(options.socialLinks);
  const catalogDigest = options.form ? await digestFormRequest({ sellerId: options.sellerId,
    expectedVersion: options.expectedVersion, publicName, publicCity, craftExperience, socialLinks,
    versionId: options.form.versionId, answers: options.form.answers }) : null;
  if (options.form && await formRequestReplay(database, { formId: 'seller.maker-profile',
    requestId: options.form.requestId, actorId: options.actorId, action: 'seller.participation_profile.updated',
    digest: catalogDigest!, subjectId: options.sellerId })) return;
  if (!options.form && await database.prepare(
    `SELECT id FROM audit_logs WHERE request_id = ? AND actor_id = ? LIMIT 1`,
  ).bind(options.requestId, options.actorId).first()) return;

  const owner = await database.prepare(
    `SELECT participation.version FROM seller_profiles
     INNER JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
     WHERE seller_profiles.id = ? AND seller_profiles.user_id = ?
       AND participation.application_stage NOT IN ('rejected','suspended') LIMIT 1`,
  ).bind(options.sellerId, options.actorId).first<{ version: number }>();
  if (!owner || owner.version !== options.expectedVersion) {
    throw new SellerParticipationConflictError('The profile owner or version changed. Refresh and try again.');
  }

  const guardId = crypto.randomUUID();
  try { await database.batch([
    ...(options.form ? [database.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
      THEN 1 ELSE json_extract('invalid', '$') END`).bind(options.form.requestId)] : []),
    database.prepare(
      `INSERT INTO seller_participation_guards(id, valid)
       VALUES (?, CASE WHEN EXISTS(
         SELECT 1 FROM seller_profiles
         INNER JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
         WHERE seller_profiles.id = ? AND seller_profiles.user_id = ?
           AND participation.version = ?
           AND participation.application_stage NOT IN ('rejected','suspended')
       ) THEN 1 ELSE 0 END)`,
    ).bind(guardId, options.sellerId, options.actorId, options.expectedVersion),
    database.prepare(
      `UPDATE seller_participation_profiles
       SET public_name = ?, public_city = ?, craft_experience_json = ?,
         social_links_json = ?, version = version + 1, updated_at = ?
       WHERE seller_id = ? AND version = ?`,
    ).bind(
      publicName,
      publicCity,
      JSON.stringify(craftExperience),
      JSON.stringify(socialLinks),
      options.now,
      options.sellerId,
      options.expectedVersion,
    ),
    database.prepare(
      `UPDATE seller_profiles SET trading_name = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    ).bind(publicName, options.now, options.sellerId, options.actorId),
    database.prepare(
      `INSERT INTO audit_logs (
        id, actor_id, action, subject_type, subject_id, reason,
        previous_json, next_json, request_id, ip_hash, created_at
      ) VALUES (?, ?, 'seller.participation_profile.updated', 'seller_profile', ?,
        'Applicant updated shared public maker profile', NULL, ?, ?, NULL, ?)`,
    ).bind(
      crypto.randomUUID(),
      options.actorId,
      options.sellerId,
      JSON.stringify({ publicName, publicCity, craftExperience, socialLinks,
        ...(catalogDigest ? { catalogDigest } : {}) }),
      options.requestId,
      options.now,
    ),
    ...(options.form ? [buildFormAnswerInsert(database, {
      formId: 'seller.maker-profile', requestId: options.form.requestId, versionId: options.form.versionId,
      subjectType: 'seller', subjectId: options.sellerId, actorId: options.actorId,
      answers: options.form.answers, now: options.now,
    })] : []),
    database.prepare(`DELETE FROM seller_participation_guards WHERE id = ?`).bind(guardId),
  ]); }
  catch (error) {
    if (options.form && await formRequestReplay(database, { formId: 'seller.maker-profile',
      requestId: options.form.requestId, actorId: options.actorId, action: 'seller.participation_profile.updated',
      digest: catalogDigest!, subjectId: options.sellerId })) return;
    throw error;
  }
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
        participation.participation_route AS participationRoute,
        participation.application_stage AS applicationStage,
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
       LEFT JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
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

export interface SellerProfileMediaRow {
  id: string;
  kind: 'profile_image' | 'maker_video';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  moderationStatus: 'pending' | 'approved' | 'rejected';
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
  participationRoute: ParticipationRoute | null;
  applicationStage: ParticipationApplicationStage | null;
  taxStatus: 'business_pan_only' | 'vat_registered' | null;
  publicName: string | null;
  publicCity: string | null;
  commercialModel: 'managed_sale_linked_percentage_v1' | 'managed_fixed_supplier_price_v1' | null;
  legalSellerReference: string | null;
  invoiceIssuerReference: string | null;
  payoutBeneficiaryReference: string | null;
  returnDestinationType: 'maker_address' | 'hastabazaar_collection_point' | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  updatedAt: number;
  documents: readonly SellerApplicationDocumentRow[];
  profileMedia: readonly SellerProfileMediaRow[];
  history: readonly SellerModerationEventRow[];
}

type SellerApplicationBaseRow = Omit<
  SellerApplicationDetail,
  'documents' | 'profileMedia' | 'history'
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
        participation.participation_route AS participationRoute,
        participation.application_stage AS applicationStage,
        participation.tax_status AS taxStatus,
        participation.public_name AS publicName,
        participation.public_city AS publicCity,
        participation.commercial_model AS commercialModel,
        participation.legal_seller_reference AS legalSellerReference,
        participation.invoice_issuer_reference AS invoiceIssuerReference,
        participation.payout_beneficiary_reference AS payoutBeneficiaryReference,
        participation.return_destination_type AS returnDestinationType,
        seller_profiles.review_note AS reviewNote,
        reviewer.display_name AS reviewedByName,
        seller_profiles.created_at AS createdAt,
        seller_profiles.updated_at AS updatedAt,
        COUNT(seller_documents.id) AS documentCount
      FROM seller_profiles
      LEFT JOIN seller_documents ON seller_documents.seller_id = seller_profiles.id
      LEFT JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
      LEFT JOIN users AS reviewer ON reviewer.id = seller_profiles.reviewed_by
      WHERE seller_profiles.id = ?
      GROUP BY seller_profiles.id
      LIMIT 1`,
    )
    .bind(sellerId)
    .first<SellerApplicationBaseRow>();

  if (!application) return null;

  const [documentsResult, profileMediaResult, historyResult] = await Promise.all([
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
        `SELECT id, kind, original_name AS originalName, mime_type AS mimeType,
          size_bytes AS sizeBytes, moderation_status AS moderationStatus,
          uploaded_at AS uploadedAt
         FROM seller_profile_media
         WHERE seller_id = ?
         ORDER BY uploaded_at ASC`,
      )
      .bind(sellerId)
      .all<SellerProfileMediaRow>(),
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
    profileMedia: profileMediaResult.results,
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
  | 'approve_for_activation'
  | 'approve'
  | 'reject';

const reviewTransitions: Partial<Record<
  SellerReviewAction,
  { from: SellerStatus; to: SellerStatus; auditAction: string }
>> = {
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
): Promise<{ from: string; to: string }> {
  const transition = reviewTransitions[options.action];
  const current = await database
    .prepare(
      `SELECT user_id AS userId, status,
        seller_agreement_version AS sellerAgreementVersion,
        seller_agreement_accepted_at AS sellerAgreementAcceptedAt,
        participation.participation_route AS participationRoute,
        participation.application_stage AS applicationStage,
        EXISTS(SELECT 1 FROM seller_documents
          WHERE seller_id = seller_profiles.id AND kind = 'bank_verification') AS bankEvidence
       FROM seller_profiles
       LEFT JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
       WHERE seller_profiles.id = ?`,
    )
    .bind(options.sellerId)
    .first<{
      userId: string;
      status: SellerStatus;
      sellerAgreementVersion: string | null;
      sellerAgreementAcceptedAt: number | null;
      bankEvidence: number;
      participationRoute: ParticipationRoute | null;
      applicationStage: ParticipationApplicationStage | null;
    }>();

  if (!current) throw new SellerReviewConflictError('Application not found.');
  if (current.userId === options.actorId) {
    throw new SellerReviewConflictError(
      'Staff members cannot review their own seller application.',
    );
  }
  if (
    options.action !== 'approve_for_activation' &&
    (current.status !== transition?.from ||
      !transition ||
      !sellerTransitions[current.status].includes(transition.to))
  ) {
    throw new SellerReviewConflictError(
      `This action is not available while the application is ${current.status}.`,
    );
  }
  if (options.action === 'approve_for_activation') {
    if (current.participationRoute !== 'managed_maker' || current.status !== 'under_review' || current.applicationStage !== 'under_review') {
      throw new SellerReviewConflictError('Only a Managed Maker under review can be approved for activation.');
    }
    const requestId = options.requestId ?? crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      database.prepare(
        `UPDATE seller_participation_profiles SET application_stage = 'approved_for_activation',
          version = version + 1, updated_at = ?
         WHERE seller_id = ? AND participation_route = 'managed_maker' AND application_stage = 'under_review'`,
      ).bind(options.now, options.sellerId),
      database.prepare(
        `UPDATE seller_profiles SET review_note = ?, review_request_id = ?, reviewed_by = ?, updated_at = ?
         WHERE id = ? AND status = 'under_review'`,
      ).bind(options.reason, requestId, options.actorId, options.now, options.sellerId),
      database.prepare(
        `INSERT INTO moderation_events(id, subject_type, subject_id, from_status, to_status, reason, actor_id, created_at)
         VALUES (?, 'seller', ?, 'under_review', 'approved_for_activation', ?, ?, ?)`,
      ).bind(crypto.randomUUID(), options.sellerId, options.reason, options.actorId, options.now),
      database.prepare(
        `INSERT INTO audit_logs(id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at)
         VALUES (?, ?, 'seller.application.approved_for_activation', 'seller', ?, ?, ?, ?, ?, NULL, ?)`,
      ).bind(
        crypto.randomUUID(), options.actorId, options.sellerId, options.reason,
        JSON.stringify({ applicationStage: 'under_review' }),
        JSON.stringify({ applicationStage: 'approved_for_activation' }),
        requestId, options.now,
      ),
      ...await businessNotificationStatements(database, {
        eventId: requestId,
        sourceType: 'seller_application',
        sourceId: options.sellerId,
        status: 'approved_for_activation',
        reviewRequestId: requestId,
        actorId: options.actorId,
        now: options.now,
        kind: 'result',
      }),
    ];
    const results = await database.batch(statements);
    if ((results[0].meta.changes ?? 0) !== 1 || (results[1].meta.changes ?? 0) !== 1) {
      throw new SellerReviewConflictError('The application changed while it was being reviewed. Refresh and try again.');
    }
    return { from: 'under_review', to: 'approved_for_activation' };
  }
  if (!transition) throw new SellerReviewConflictError('Choose a supported review action.');
  if (current.participationRoute === 'managed_maker' && options.action === 'approve') {
    throw new SellerReviewConflictError('Managed Makers require approval for activation; Registered Seller approval cannot be used.');
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
    database.prepare(
      `UPDATE seller_participation_profiles SET application_stage = ?, version = version + 1, updated_at = ?
       WHERE seller_id = ?`,
    ).bind(
      options.action === 'request_changes' ? 'changes_requested' : options.action === 'approve' ? 'active' : transition.to,
      options.now,
      options.sellerId,
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

export async function getSellerProfileMediaForStaff(
  database: D1Database,
  mediaId: string,
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
         FROM seller_profile_media
         WHERE id = ?
         LIMIT 1`,
      )
      .bind(mediaId)
      .first<{
        objectKey: string;
        originalName: string;
        mimeType: string;
      }>()) ?? null
  );
}
