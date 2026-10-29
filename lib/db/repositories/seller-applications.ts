import { sellerQueueWhere, type AdminQueueFilters } from '../../admin/queue-filters';
import { prepareSellerCommissionAcceptance } from './marketplace-settings';
import { buildManagedMakerDetailStatements, requireManagedMakerSuperAdmin, ManagedMakerAuthorityError, managedAgreementVersionForSeller } from './managed-maker-details';
import { validateManagedMakerIdentity, MANAGED_MAKER_AGREEMENT_VERSION } from '../../sellers/managed-identity';
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
import { staffMutationGuard } from './staff-mutation-guard';
import { validateCurrentApplicationEvidence, pendingPayoutReference, isPendingPayoutReference, validateSellerOnboarding, hasDeferredBankDetails, type SellerOnboarding } from '../../sellers/onboarding';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '../../sellers/managed-identity';
import { getManagedMakerAuthority, makerMutationGuards } from '../../managed-commerce/maker-authority';
import { publicProfileEditableAt, publicProfileCooldownMs } from '../../sellers/public-profile';

type SellerFormLink = { requestId: string; versionId: string; answers: FormAnswerSnapshot; digest?: string };

interface CreateSellerApplicationOptions {
  userId: string;
  existingAccount?: boolean;
  registeredAgreementContext?: string;
  sellerId: string;
  applicationReference: string;
  input: SellerApplicationInput;
  documents: readonly SellerApplicationDocument[];
  profileMedia?: readonly SellerProfileMediaUpload[];
  now: number;
  form?: SellerFormLink;
  intake?: { ready: boolean; answersJson: string; documentsJson: string };
}

/** New intake entry point. Retained legacy repository calls keep their original contract. */
export async function createCurrentSellerApplication(database: D1Database, options: CreateSellerApplicationOptions) {
  if (!options.input.onboarding || !options.existingAccount) throw new Error('Current onboarding and a verified signed-in account are required.');
  if (options.input.participationRoute==='registered_seller' && !options.registeredAgreementContext)
    throw new Error('Explicit current business seller agreement acceptance is required.');
  return createSellerApplication(database,options);
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
  const partialIntake = options.intake && !options.intake.ready;
  if (!partialIntake) validateCurrentApplicationEvidence(input);
  const managedIdentity = input.participationRoute === 'managed_maker' && !partialIntake ? validateManagedMakerIdentity(input.managedIdentity) : null;
  if (!['individual','company'].includes(input.applicantType) || !['PAN','VAT','BOTH','NONE'].includes(input.taxMode)) throw new Error('Choose a valid applicant and tax document type.');
  if (input.participationRoute === 'managed_maker' && (input.taxMode !== 'NONE' || input.taxRegistrationNumber || input.registrationNumber || input.registrationAuthority)) throw new Error('Managed Maker applications cannot store placeholder registration or tax identifiers.');
  if (!partialIntake && input.participationRoute === 'registered_seller' && (input.taxMode === 'NONE' || !input.taxRegistrationNumber)) throw new Error('Registered Seller tax details are required.');
  const definitions=sellerDocumentsForApplication(input);
  if (!partialIntake) for(const definition of definitions.filter(d=>d.required))if(documents.filter(d=>d.kind===definition.kind).length!==1)throw new Error(definition.label+' is required exactly once.');
  if(documents.some(d=>!definitions.some(f=>f.kind===d.kind)||!d.objectKey.startsWith('private/seller-documents/'+sellerId+'/')))throw new Error('Unexpected or non-private application document.');
  if (profileMedia.some((media) => !['profile_image', 'maker_video'].includes(media.kind) || !media.objectKey.startsWith(`private/seller-profile/${sellerId}/`))) throw new Error('Unexpected or non-private maker profile media.');
  if(!partialIntake&&input.participationRoute==='registered_seller'&&input.applicantType==='company'&&(!input.registrationAuthority||!input.registrationNumber))throw new Error('Company registration details are required.');
  if(input.applicantType==='individual'&&!input.onboarding&&(input.registrationAuthority||input.registrationNumber))throw new Error('Legacy individual applications do not use company registration details.');
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
  const registeredAcceptance = !partialIntake && input.participationRoute === 'registered_seller' && options.registeredAgreementContext
    ? await prepareSellerCommissionAcceptance(database, { sellerId, actorId: userId, mode: 'application',
      context: options.registeredAgreementContext, requestId: options.form?.requestId ?? sellerId, now, language: 'en' })
    : null;
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
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
        input.onboarding && !input.onboarding.bankDetailsDeferred ? pendingPayoutReference(input.onboarding) : null,
        input.participationRoute === 'registered_seller' && !partialIntake ? sellerAgreementVersion : null,
        input.participationRoute === 'registered_seller' && !partialIntake ? now : null,
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
        input.tradingName || (options.intake ? 'Seller application' : ''),
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
        catalogDigest || registeredAcceptance || input.onboarding ? JSON.stringify({ ...(catalogDigest ? { catalogDigest } : {}),
          ...(input.onboarding ? { onboardingVersion: input.onboarding.version, bankDetailsDeferred: Boolean(input.onboarding.bankDetailsDeferred), contactPhoneCountry: input.phoneCountry ?? 'NP', contactPhoneVerified: false } : {}),
          ...(options.intake ? { registrationIntake: true } : {}),
          ...(registeredAcceptance ? { registeredTermsSnapshot: registeredAcceptance.snapshot } : {}) }) : null,
        options.form?.requestId ?? null, now),
  ];

  if (options.intake) statements.push(database.prepare(`INSERT INTO seller_registration_intakes(seller_id,user_id,version,answers_json,documents_json,review_ready,updated_at) VALUES (?,?,1,?,?,?,?)`)
    .bind(sellerId, userId, options.intake.answersJson, options.intake.documentsJson, options.intake.ready ? 1 : 0, now));
  if (input.onboarding) {
    const accountSnapshot = await database.prepare(`SELECT phone,auth_subject AS authSubject FROM users WHERE id=?
      AND status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=users.id AND role='customer')`).bind(userId)
      .first<{phone:string|null;authSubject:string|null}>();
    if (!accountSnapshot) throw new Error('Use an active account with a verified email.');
    const contactGuard = crypto.randomUUID();
    statements.push(database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM users u JOIN account_email_verifications e ON e.user_id=u.id AND e.email=lower(u.email)
      WHERE u.id=? AND u.status='active' AND lower(u.email)=? AND e.verified_at>0
        AND (u.auth_subject=? OR (u.auth_subject IS NULL AND ? IS NULL))
        AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')) THEN 1 ELSE 0 END`)
      .bind(contactGuard, userId, input.email.toLowerCase(), accountSnapshot.authSubject, accountSnapshot.authSubject),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(contactGuard));
    for (const [purpose, address] of [['pickup', input.onboarding.pickupAddress], ['returns', input.onboarding.returnAddress]] as const) {
      statements.push(database.prepare(`INSERT INTO seller_operational_addresses
        (id,seller_id,purpose,same_as_address_id,province,district,municipality,ward,locality,is_public,created_at,updated_at)
        VALUES (?,?,?,NULL,'','','',NULL,?,0,?,?)`).bind(crypto.randomUUID(),sellerId,purpose,address,now,now));
    }
  }

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

  if (registeredAcceptance) {
    statements.push(...registeredAcceptance.statements);
  }

  if (managedIdentity) statements.push(...await buildManagedMakerDetailStatements(database, { sellerId, actorId: userId,
    identityDocumentId: documents.find(document => document.kind === 'representative_identity')!.id, identity: managedIdentity, now }));

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
    subjectType: 'seller', subjectId: sellerId, actorId: userId, answers: options.form.answers, now, optionalRegistration: Boolean(options.intake),
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
    managedCorrection?: { identity: import('../../sellers/managed-identity').ManagedMakerIdentity; documents: readonly SellerApplicationDocument[]; onboarding?:SellerOnboarding };
    profileMedia?: readonly SellerProfileMediaUpload[];
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
  const catalogDigest = options.form ? options.form.digest ?? await digestFormRequest({ sellerId: options.sellerId,
    expectedVersion: options.expectedVersion, publicName, publicCity, craftExperience, socialLinks,
    ...(options.managedCorrection ? { managedCorrection: options.managedCorrection } : {}),
    ...(options.profileMedia ? { profileMedia: options.profileMedia } : {}),
    versionId: options.form.versionId, answers: options.form.answers }) : null;
  if (options.form && await formRequestReplay(database, { formId: 'seller.maker-profile',
    requestId: options.form.requestId, actorId: options.actorId, action: 'seller.participation_profile.updated',
    digest: catalogDigest!, subjectId: options.sellerId })) return;
  if (!options.form && await database.prepare(
    `SELECT id FROM audit_logs WHERE request_id = ? AND actor_id = ? LIMIT 1`,
  ).bind(options.requestId, options.actorId).first()) return;

  const owner = await database.prepare(
    `SELECT participation.version,participation.participation_route AS route,participation.application_stage AS stage,seller_profiles.status FROM seller_profiles
     INNER JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
     WHERE seller_profiles.id = ? AND seller_profiles.user_id = ?
       AND participation.application_stage NOT IN ('rejected','suspended') LIMIT 1`,
  ).bind(options.sellerId, options.actorId).first<{ version: number; route: string; stage: string; status: string }>();
  if (!owner || owner.version !== options.expectedVersion) {
    throw new SellerParticipationConflictError('The profile owner or version changed. Refresh and try again.');
  }

  const currentProfile = await getSellerParticipationProfile(database, options.sellerId);
  const publicEdit = !options.managedCorrection || !currentProfile || publicName !== currentProfile.publicName || publicCity !== currentProfile.publicCity ||
    JSON.stringify(craftExperience) !== JSON.stringify(currentProfile.craftExperience) || JSON.stringify(socialLinks) !== JSON.stringify(currentProfile.socialLinks);
  if (publicEdit && options.now < await publicProfileEditableAt(database, options.sellerId))
    throw new SellerParticipationConflictError('Your public maker profile can be edited again 7 days after its last save.');
  if ((options.profileMedia?.length ?? 0) > 2 || new Set(options.profileMedia?.map(media => media.kind)).size !== (options.profileMedia?.length ?? 0) ||
    options.profileMedia?.some(media => !['profile_image', 'maker_video'].includes(media.kind) || !media.objectKey.startsWith(`private/seller-profile/${options.sellerId}/`)))
    throw new SellerParticipationConflictError('Invalid private public-profile media.');

  const correctionStatements: D1PreparedStatement[] = [];
  for (const media of options.profileMedia ?? []) correctionStatements.push(
    database.prepare('DELETE FROM seller_profile_media WHERE seller_id=? AND kind=?').bind(options.sellerId, media.kind),
    database.prepare(`INSERT INTO seller_profile_media(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,moderation_status,uploaded_at)
      VALUES (?,?,?,?,?,?,?,'pending',?)`).bind(media.id, options.sellerId, media.kind, media.objectKey, media.originalName, media.mimeType, media.sizeBytes, options.now));
  if (options.managedCorrection) {
    const maker=await getManagedMakerAuthority(database,options.actorId,options.now);
    if(maker.sellerId!==options.sellerId)throw new SellerParticipationConflictError('Current unrestricted maker ownership is required.');
    correctionStatements.push(...makerMutationGuards(database,options));
    if (owner.route !== 'managed_maker' || owner.stage !== 'changes_requested' || owner.status !== 'needs_changes')
      throw new SellerParticipationConflictError('Managed Maker evidence corrections require a changes-requested application.');
    const { identity, documents, onboarding } = options.managedCorrection;
    const bankDeferred = await hasDeferredBankDetails(database, options.sellerId);
    if (Boolean(onboarding?.bankDetailsDeferred) !== bankDeferred) throw new SellerParticipationConflictError('Keep the recorded bank-detail submission policy when correcting an application.');
    const prospective = await managedAgreementVersionForSeller(database,options.sellerId)===MANAGED_SUPPLIER_AGREEMENT_VERSION;
    if (prospective && (!onboarding || identity.managedAgreementVersion!==MANAGED_SUPPLIER_AGREEMENT_VERSION || !/^\d{9}$/.test(identity.personalPan) ||
      documents.filter(document=>document.kind==='pan_certificate').length!==1 || !bankDeferred && documents.filter(document=>document.kind==='bank_verification').length!==1))
      throw new SellerParticipationConflictError('Keep the current supplier contract, personal PAN, certificate and bank evidence when correcting this application.');
    if (onboarding) validateSellerOnboarding(onboarding);
    validateManagedMakerIdentity(identity);
    if (documents.filter(document => document.kind === 'representative_identity').length !== 1 ||
      documents.some(document => !(prospective ? ['representative_identity','pan_certificate','bank_verification'] : ['representative_identity','pan_certificate']).includes(document.kind) ||
        !document.objectKey.startsWith(`private/seller-documents/${options.sellerId}/`)) ||
      documents.filter(document => document.kind === 'pan_certificate').length > 1)
      throw new SellerParticipationConflictError('Supply one private government identity document and optional personal PAN certificate.');
    const correctionGuard = crypto.randomUUID();
    correctionStatements.push(database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM seller_profiles p JOIN seller_participation_profiles s ON s.seller_id=p.id
        WHERE p.id=? AND p.user_id=? AND p.status='needs_changes' AND s.participation_route='managed_maker'
          AND s.application_stage='changes_requested') THEN 1 ELSE 0 END`).bind(correctionGuard,options.sellerId,options.actorId),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(correctionGuard));
    for (const document of documents) correctionStatements.push(database.prepare(`INSERT INTO seller_documents
      (id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_at,reviewed_by)
      VALUES (?,?,?,?,?,?,?,'pending',?,NULL,NULL)`).bind(document.id,options.sellerId,document.kind,document.objectKey,
        document.originalName,document.mimeType,document.sizeBytes,options.now));
    if (onboarding) {
      if (!onboarding.bankDetailsDeferred) correctionStatements.push(database.prepare('UPDATE seller_profiles SET payout_account_reference=? WHERE id=?')
        .bind(pendingPayoutReference(onboarding),options.sellerId));
      for (const [purpose,address] of [['pickup',onboarding.pickupAddress],['returns',onboarding.returnAddress]] as const) {
        correctionStatements.push(database.prepare(`UPDATE seller_operational_addresses SET province='',district='',municipality='',ward=NULL,locality=?,updated_at=? WHERE seller_id=? AND purpose=?`)
          .bind(address,options.now,options.sellerId,purpose));
      }
    }
    correctionStatements.push(...await buildManagedMakerDetailStatements(database, { sellerId: options.sellerId, actorId: options.actorId,
      identityDocumentId: documents.find(document => document.kind === 'representative_identity')!.id, identity, now: options.now }),
      database.prepare("UPDATE seller_profiles SET status='submitted',review_note=NULL,updated_at=? WHERE id=? AND status='needs_changes'")
        .bind(options.now,options.sellerId),
      database.prepare("UPDATE seller_participation_profiles SET application_stage='submitted' WHERE seller_id=? AND application_stage='changes_requested'")
        .bind(options.sellerId),
      ...await businessNotificationStatements(database,{eventId:options.requestId,sourceType:'seller_application',sourceId:options.sellerId,
        status:'submitted',actorId:options.actorId,now:options.now,kind:'submitted'}));
  }

  const guardId = crypto.randomUUID();
  try { await database.batch([
    // Match checkout and route-transition lock order on the native runtime.
    database.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=? AND user_id=?')
      .bind(options.sellerId,options.actorId),
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
           ${publicEdit ? "AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE subject_type='seller_profile' AND subject_id=seller_profiles.id AND action='seller.public_profile.saved' AND created_at>?)" : ''}
       ) THEN 1 ELSE 0 END)`,
    ).bind(guardId, options.sellerId, options.actorId, options.expectedVersion, ...(publicEdit ? [options.now - publicProfileCooldownMs] : [])),
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
    ...correctionStatements,
    ...(publicEdit ? [database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES (?,?,'seller.public_profile.saved','seller_profile',?,'Public maker profile saved; seven-day edit cooldown begins',?,?)`)
      .bind(crypto.randomUUID(), options.actorId, options.sellerId, JSON.stringify({ editableAt: options.now + publicProfileCooldownMs, mediaIds: options.profileMedia?.map(media => media.id) ?? [] }), options.now)] : []),
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
  filters: AdminQueueFilters = {},
): Promise<SellerRegistryCounts> {
  const where = sellerQueueWhere(filters);
  const row = await database
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN seller_profiles.status = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN seller_profiles.status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN seller_profiles.status = 'under_review' THEN 1 ELSE 0 END) AS underReview,
        SUM(CASE WHEN seller_profiles.status = 'needs_changes' THEN 1 ELSE 0 END) AS needsChanges,
        SUM(CASE WHEN seller_profiles.status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN seller_profiles.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN seller_profiles.status = 'suspended' THEN 1 ELSE 0 END) AS suspended
       FROM seller_profiles INNER JOIN users AS owner ON owner.id = seller_profiles.user_id ${where.sql}`,
    )
    .bind(...where.values)
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
  filters: AdminQueueFilters = {},
): Promise<readonly SellerRegistryRow[]> {
  const where = sellerQueueWhere(filters);
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
       ${where.sql}
       ORDER BY seller_profiles.created_at DESC, seller_profiles.id
       LIMIT ? OFFSET ?`,
    )
    .bind(...where.values, pageSize, (page - 1) * pageSize)
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
  actorId?: string,
): Promise<SellerApplicationDetail | null> {
  const route = await database.prepare(`SELECT
    (SELECT participation_route FROM seller_participation_profiles WHERE seller_id=?) AS route,
    CASE WHEN EXISTS(SELECT 1 FROM managed_maker_application_details WHERE seller_id=?)
      OR EXISTS(SELECT 1 FROM seller_route_transition_applications WHERE seller_id=? AND from_route='managed_maker')
      THEN 1 ELSE 0 END AS managedHistory`).bind(sellerId,sellerId,sellerId)
    .first<{ route: string | null; managedHistory: number }>();
  let canReadManagedEvidence = false;
  if (route?.route === 'managed_maker') {
    await requireManagedMakerSuperAdmin(database, actorId ?? '');
    canReadManagedEvidence = true;
  } else if (route?.managedHistory && actorId) {
    const authority = await staffMutationGuard(database,actorId,'seller.application.review',ManagedMakerAuthorityError);
    canReadManagedEvidence = authority.role === 'super_admin';
  }
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

  // Historical maker ID/PAN evidence stays private even after the active route changes.
  const documents = route?.managedHistory && !canReadManagedEvidence
    ? documentsResult.results.filter(document => !['representative_identity','pan_certificate'].includes(document.kind))
    : documentsResult.results;
  return {
    ...application,
    documentCount: documents.length,
    documents,
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
    form?: { versionId: string; answers: FormAnswerSnapshot };
  },
): Promise<{ from: string; to: string }> {
  const transition = reviewTransitions[options.action];
  if (!transition && options.action !== 'approve_for_activation')
    throw new SellerReviewConflictError('Choose a supported review action.');
  const replayTransition = transition ?? { from: 'under_review', to: 'approved_for_activation',
    auditAction: 'seller.application.approved_for_activation' };
  const authority = await staffMutationGuard(database, options.actorId,
    'seller.application.review', SellerReviewConflictError);
  const route = await database.prepare('SELECT participation_route AS route FROM seller_participation_profiles WHERE seller_id=?').bind(options.sellerId).first<{ route: string }>();
  if (route?.route === 'managed_maker' && authority.role !== 'super_admin') throw new SellerReviewConflictError('Current Super Admin authority is required for Managed Maker review.');
  const requestId = options.requestId ?? crypto.randomUUID();
  const payoutAccountReference = options.payoutAccountReference?.trim() ?? '';
  const settlementTermsReference = options.settlementTermsReference?.trim() ?? '';
  const catalogDigest = options.form ? await digestFormRequest({ sellerId: options.sellerId,
    actorId: options.actorId, action: options.action, reason: options.reason,
    payoutAccountReference, settlementTermsReference, versionId: options.form.versionId,
    answers: options.form.answers }) : null;
  if (options.form) {
    try {
      const replay = await formRequestReplay(database, { formId: 'staff.seller-review-action',
        requestId, actorId: options.actorId, action: replayTransition.auditAction,
        subjectId: options.sellerId, digest: catalogDigest! });
      if (replay) return { from: replayTransition.from, to: replayTransition.to };
    } catch {
      throw new SellerReviewConflictError('This request reference was already used for different review details.');
    }
  }
  const current = await database
    .prepare(
      `SELECT user_id AS userId, status,
        seller_agreement_version AS sellerAgreementVersion,
        seller_agreement_accepted_at AS sellerAgreementAcceptedAt,
        participation.participation_route AS participationRoute,
        participation.application_stage AS applicationStage,
        EXISTS(SELECT 1 FROM seller_documents
          WHERE seller_id = seller_profiles.id AND kind = 'bank_verification' AND status<>'rejected') AS bankEvidence
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
  const bankDeferred = await hasDeferredBankDetails(database, options.sellerId);
  const intakeApprovalGuards: D1PreparedStatement[] = [];
  if (options.action === 'approve' || options.action === 'approve_for_activation') {
    const intake = await database.prepare(`SELECT 1 FROM audit_logs WHERE subject_id=? AND subject_type='seller' AND action='seller.application.submitted'
      AND json_extract(next_json,'$.registrationIntake')=true LIMIT 1`).bind(options.sellerId).first();
    if (intake) {
      if (authority.role !== 'super_admin') throw new SellerReviewConflictError('Super Admin approval is required for this registration.');
      intakeApprovalGuards.push(...(await staffMutationGuard(database, options.actorId, 'seller.application.review', SellerReviewConflictError, 'super_admin')).statements);
      const snapshot = await database.prepare('SELECT version,review_ready AS ready,documents_json AS documents FROM seller_registration_intakes WHERE seller_id=?')
        .bind(options.sellerId).first<{ version: number; ready: number; documents: string }>();
      if (!snapshot?.ready) throw new SellerReviewConflictError('The seller must complete the missing registration details and review the current agreement in their dashboard before approval.');
      const id = crypto.randomUUID();
      intakeApprovalGuards.push(database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
        SELECT 1 FROM seller_registration_intakes WHERE seller_id=? AND version=? AND review_ready=1) THEN 1 ELSE 0 END`).bind(id, options.sellerId, snapshot.version),
        database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id));
      for (const document of Object.values(JSON.parse(snapshot.documents)) as SellerApplicationDocument[]) {
        const proof = crypto.randomUUID();
        intakeApprovalGuards.push(database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
          SELECT 1 FROM seller_documents WHERE id=? AND seller_id=? AND kind=? AND status IN ('pending','verified')) THEN 1 ELSE 0 END`).bind(proof, document.id, options.sellerId, document.kind),
          database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(proof));
      }
    }
  }
  if (options.action === 'approve_for_activation') {
    if (current.participationRoute !== 'managed_maker' || current.status !== 'under_review' || current.applicationStage !== 'under_review') {
      throw new SellerReviewConflictError('Only a Managed Maker under review can be approved for activation.');
    }
    const evidence = await database.prepare(`SELECT d.id,d.agreement_version AS agreementVersion,d.personal_pan AS personalPan FROM managed_maker_application_details d
      JOIN seller_documents document ON document.id=d.identity_document_id AND document.seller_id=d.seller_id
      JOIN seller_profiles profile ON profile.id=d.seller_id
      WHERE d.seller_id=? AND d.agreement_version IN (?,?) AND d.agreement_accepted_at>0
        AND d.agreement_accepted_by=profile.user_id AND d.id=(SELECT latest.id FROM managed_maker_application_details latest WHERE latest.seller_id=d.seller_id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) AND document.kind='representative_identity'
        AND document.status<>'rejected' ORDER BY d.created_at DESC,d.id DESC LIMIT 1`)
      .bind(options.sellerId, MANAGED_MAKER_AGREEMENT_VERSION, MANAGED_SUPPLIER_AGREEMENT_VERSION).first<{ id: string; agreementVersion:string;personalPan:string|null }>();
    if (!evidence) throw new SellerReviewConflictError('Government identity evidence and current accepted Managed Maker agreement are required before approval.');
    if (evidence.agreementVersion===MANAGED_SUPPLIER_AGREEMENT_VERSION) {
      const privateEvidence=await database.prepare(`SELECT COUNT(DISTINCT kind) AS count FROM seller_documents WHERE seller_id=? AND status<>'rejected'
        AND kind IN (${bankDeferred ? "'pan_certificate'" : "'pan_certificate','bank_verification'"}) AND instr(object_key,'private/seller-documents/'||seller_id||'/')=1`).bind(options.sellerId).first<{count:number}>();
      if (!/^\d{9}$/.test(evidence.personalPan??'') || privateEvidence?.count!==(bankDeferred ? 1 : 2)) throw new SellerReviewConflictError('Current personal PAN and required application evidence need review.');
    }
    const statements: D1PreparedStatement[] = [
      database.prepare(
        `UPDATE seller_participation_profiles SET application_stage = 'approved_for_activation',
          version = version + 1, updated_at = ?
         WHERE seller_id = ? AND participation_route = 'managed_maker' AND application_stage = 'under_review'
           AND EXISTS(SELECT 1 FROM managed_maker_application_details d JOIN seller_documents document
             ON document.id=d.identity_document_id AND document.seller_id=d.seller_id
             WHERE d.id=? AND document.kind='representative_identity' AND document.status<>'rejected')`,
      ).bind(options.now, options.sellerId, evidence.id),
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
        JSON.stringify({ applicationStage: 'approved_for_activation', ...(catalogDigest ? { catalogDigest } : {}) }),
        requestId, options.now,
      ),
      ...(options.form ? [buildFormAnswerInsert(database, { formId: 'staff.seller-review-action',
        requestId, versionId: options.form.versionId, subjectType: 'seller',
        subjectId: options.sellerId, actorId: options.actorId, answers: options.form.answers,
        now: options.now })] : []),
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
      ...authority.statements,
    ];
    const managedGuardId = crypto.randomUUID();
    statements.splice(2, 0,
      database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
        SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM seller_profiles WHERE id=?
          AND review_request_id=? AND status='under_review')
          AND EXISTS(SELECT 1 FROM seller_participation_profiles WHERE seller_id=?
            AND application_stage='approved_for_activation') THEN 1 ELSE 0 END`)
        .bind(managedGuardId, options.sellerId, requestId, options.sellerId),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(managedGuardId));
    if (evidence.agreementVersion===MANAGED_SUPPLIER_AGREEMENT_VERSION) {
      const proofGuard=crypto.randomUUID();
      statements.push(database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN
        (SELECT COUNT(DISTINCT kind) FROM seller_documents WHERE seller_id=? AND status<>'rejected'
          AND kind IN (${bankDeferred ? "'pan_certificate'" : "'pan_certificate','bank_verification'"}) AND instr(object_key,'private/seller-documents/'||seller_id||'/')=1)=${bankDeferred ? 1 : 2} THEN 1 ELSE 0 END`)
        .bind(proofGuard,options.sellerId),database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(proofGuard));
    }
    statements.push(...intakeApprovalGuards);
    let results;
    try { results = await database.batch(statements); }
    catch (error) {
      if (error instanceof Error && error.message.includes('operation_transaction_guards'))
        throw new SellerReviewConflictError('The application changed while it was being reviewed. Refresh and try again.');
      throw error;
    }
    if ((results[0].meta.changes ?? 0) !== 1 || (results[1].meta.changes ?? 0) !== 1) {
      throw new SellerReviewConflictError('The application changed while it was being reviewed. Refresh and try again.');
    }
    return { from: 'under_review', to: 'approved_for_activation' };
  }
  if (!transition) throw new SellerReviewConflictError('Choose a supported review action.');
  if (current.participationRoute === 'managed_maker' && options.action === 'approve') {
    throw new SellerReviewConflictError('Managed Makers require approval for activation; Registered Seller approval cannot be used.');
  }
  const prospectiveApprovalGuards: D1PreparedStatement[] = [...intakeApprovalGuards];
  if (options.action === 'approve') {
    if (isPendingPayoutReference(payoutAccountReference)) throw new SellerReviewConflictError('Record an independently verified payout reference, not pending applicant bank details.');
    const prospective = await database.prepare(`SELECT 1 FROM audit_logs WHERE subject_type='seller' AND subject_id=?
      AND action='seller.application.submitted' AND json_extract(next_json,'$.onboardingVersion') IS NOT NULL LIMIT 1`).bind(options.sellerId).first();
    if (prospective) {
      if (authority.role !== 'super_admin') throw new SellerReviewConflictError('Super Admin approval is required for new business seller activation.');
      const evidence = await database.prepare(`SELECT s.registration_authority AS authority,s.registration_number AS number,s.tax_mode AS taxMode,
        (SELECT COUNT(DISTINCT kind) FROM seller_documents d WHERE d.seller_id=s.id AND d.status<>'rejected'
          AND kind IN ('business_registration','pan_certificate','representative_identity'${bankDeferred ? '' : ",'bank_verification'"})) AS requiredCount,
        EXISTS(SELECT 1 FROM seller_documents d WHERE d.seller_id=s.id AND d.kind='vat_certificate' AND d.status<>'rejected') AS vat
        FROM seller_profiles s WHERE s.id=?`).bind(options.sellerId).first<{authority:string;number:string;taxMode:string;requiredCount:number;vat:number}>();
      if (!evidence?.authority || !evidence.number || evidence.requiredCount!==(bankDeferred ? 3 : 4) || (evidence.taxMode!=='PAN'&&!evidence.vat))
        throw new SellerReviewConflictError('Review the business registration, business PAN, representative ID and applicable application evidence first.');
      const superAuthority = await staffMutationGuard(database,options.actorId,'seller.application.review',SellerReviewConflictError,'super_admin');
      const guardId = crypto.randomUUID();
      prospectiveApprovalGuards.push(...superAuthority.statements,
        database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
          SELECT 1 FROM seller_profiles s WHERE s.id=? AND s.registration_authority<>'' AND s.registration_number<>''
          AND (SELECT COUNT(DISTINCT kind) FROM seller_documents d WHERE d.seller_id=s.id AND d.status<>'rejected'
            AND instr(d.object_key,'private/seller-documents/'||d.seller_id||'/')=1
            AND kind IN ('business_registration','pan_certificate','representative_identity'${bankDeferred ? '' : ",'bank_verification'"}))=${bankDeferred ? 3 : 4}
          AND (s.tax_mode='PAN' OR EXISTS(SELECT 1 FROM seller_documents d WHERE d.seller_id=s.id AND d.kind='vat_certificate'
            AND d.status<>'rejected' AND instr(d.object_key,'private/seller-documents/'||d.seller_id||'/')=1))) THEN 1 ELSE 0 END`).bind(guardId,options.sellerId),
        database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId));
    }
    if (
      current.sellerAgreementVersion !== SELLER_AGREEMENT_VERSION ||
      !current.sellerAgreementAcceptedAt
    ) {
      throw new SellerReviewConflictError(
        'The seller must accept the current Seller Marketplace Agreement before activation.',
      );
    }
    if ((!bankDeferred || payoutAccountReference) && !current.bankEvidence) {
      throw new SellerReviewConflictError(
        'Verified receiving-account evidence is required before activation.',
      );
    }
    if (
      (!bankDeferred || payoutAccountReference) && payoutAccountReference.length < 4 ||
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
    ...(catalogDigest ? { catalogDigest } : {}),
  });
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE seller_profiles
         SET status = ?, review_note = ?, review_request_id = ?, reviewed_by = ?,
           payout_account_reference = CASE WHEN ? = 'approved' THEN COALESCE(?,payout_account_reference) ELSE payout_account_reference END,
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

  const reviewGuardId = crypto.randomUUID();
  statements.splice(1, 0,
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM seller_profiles WHERE id=?
        AND review_request_id=? AND status=?) THEN 1 ELSE 0 END`)
      .bind(reviewGuardId, options.sellerId, requestId, transition.to),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(reviewGuardId));

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
  if (options.form) statements.push(buildFormAnswerInsert(database, {
    formId: 'staff.seller-review-action', requestId, versionId: options.form.versionId,
    subjectType: 'seller', subjectId: options.sellerId, actorId: options.actorId,
    answers: options.form.answers, now: options.now,
  }));
  statements.push(...prospectiveApprovalGuards, ...authority.statements);
  let results;
  try { results = await database.batch(statements); }
  catch (error) {
    if (error instanceof Error && error.message.includes('operation_transaction_guards'))
      throw new SellerReviewConflictError('The application changed while it was being reviewed. Refresh and try again.');
    throw error;
  }
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new SellerReviewConflictError(
      'The application changed while it was being reviewed. Refresh and try again.',
    );
  }

  return { from: transition.from, to: transition.to };
}

export async function getSellerDocumentForStaff(database: D1Database, documentId: string, actorId: string): Promise<{
  objectKey: string; originalName: string; mimeType: string;
} | null> {
  const authority = await staffMutationGuard(database, actorId, 'seller.application.review', ManagedMakerAuthorityError);
  const document = await database.prepare(`SELECT d.object_key AS objectKey,d.original_name AS originalName,d.mime_type AS mimeType,
    CASE WHEN p.participation_route='managed_maker' OR (d.kind IN ('representative_identity','pan_certificate')
      AND (EXISTS(SELECT 1 FROM managed_maker_application_details details WHERE details.seller_id=d.seller_id)
        OR EXISTS(SELECT 1 FROM seller_route_transition_applications transition WHERE transition.seller_id=d.seller_id AND transition.from_route='managed_maker')))
      THEN 1 ELSE 0 END AS managedPrivateEvidence
    FROM seller_documents d LEFT JOIN seller_participation_profiles p ON p.seller_id=d.seller_id WHERE d.id=? LIMIT 1`)
    .bind(documentId).first<{ objectKey: string; originalName: string; mimeType: string; managedPrivateEvidence: number }>();
  if (!document) return null;
  if (document.managedPrivateEvidence && authority.role !== 'super_admin') throw new ManagedMakerAuthorityError('Current Super Admin authority is required for Managed Maker private documents, including historical identity evidence.');
  const { managedPrivateEvidence: _privateEvidence, ...result } = document;
  return result;
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
