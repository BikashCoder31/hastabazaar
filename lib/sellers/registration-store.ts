import { createSellerApplication } from '@/lib/db/repositories/seller-applications';
import { prepareSellerCommissionAcceptance, getRegisteredSellerTerms, type RegisteredSellerTerms } from '@/lib/db/repositories/marketplace-settings';
import { buildManagedMakerDetailStatements, getManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import { createSellerApplicationReference, sellerDocumentsForApplication, type SellerApplicationDocument } from './application';
import { optionalRegistrationInput, completeRegistrationInput } from './registration-intake';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from './managed-identity';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';
import { type DraftAnswers } from './draft-contract';
import { verifiedDocumentChangeGuards } from './document-review';
import { registrationChangedEvidence } from './registration-protection';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import { formRequestReplay } from '@/lib/forms/submission';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { registrationEmailCheck, savedSellerRegistrationEmail } from './registration-email';

export type RegistrationDocuments = Record<string, SellerApplicationDocument>;
export type RegistrationRecord = { sellerId: string; version: number; answers: DraftAnswers; documents: RegistrationDocuments; ready: boolean };
export class RegistrationError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
export async function readRegistration(db: D1Database, userId: string): Promise<RegistrationRecord | null> {
  const row = await db.prepare(`SELECT seller_id AS sellerId,version,answers_json AS answersJson,documents_json AS documentsJson,review_ready AS ready
    FROM seller_registration_intakes WHERE user_id=?`).bind(userId).first<{ sellerId: string; version: number; answersJson: string; documentsJson: string; ready: number }>();
  return row ? { sellerId: row.sellerId, version: row.version, answers: JSON.parse(row.answersJson), documents: JSON.parse(row.documentsJson), ready: Boolean(row.ready) } : null;
}
export async function registrationReadiness(db: D1Database, answers: DraftAnswers, email: string, documents: RegistrationDocuments, now: number) {
  const complete = completeRegistrationInput(answers, email);
  const input = complete.input ?? optionalRegistrationInput(answers, email);
  const missing = [...complete.errors];
  for (const definition of sellerDocumentsForApplication(input)) {
    if (definition.required && !documents[definition.field]) missing.push(`Upload ${definition.label}.`);
  }
  let registeredTerms: RegisteredSellerTerms | null = null;
  try {
    if (input.participationRoute === 'registered_seller') {
      const terms = await getRegisteredSellerTerms(db, now);
      if (answers.acceptedTerms?.[0] === 'yes' && answers.sellerAgreementContext?.[0] === terms.context) registeredTerms = terms;
      else {
        const oldMessage = missing.indexOf('You must accept the seller application terms.');
        if (oldMessage >= 0) missing.splice(oldMessage, 1);
        missing.push('Review and accept the current Seller Marketplace Agreement.');
      }
    } else if (answers.managedAgreementAccepted?.[0] !== 'yes' || answers.managedAgreementContext?.[0] !== (await getManagedMakerApplicationTerms(db, now, MANAGED_SUPPLIER_AGREEMENT_VERSION)).context) {
      missing.push('Review and accept the current Managed Maker agreement.');
    }
  } catch { missing.push('Current agreement terms are unavailable; review them later from your dashboard.'); }
  return { input, missing, ready: missing.length === 0, registeredTerms };
}

export async function readRegistrationOwnerState(db: D1Database, sellerId: string, userId: string) {
  const profile = await db.prepare(`SELECT s.status,s.application_reference AS reference,s.settlement_terms_reference AS settlementReference,
    p.participation_route AS route,p.application_stage AS stage,
    EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=s.user_id AND r.role='seller') AS sellerRole
    FROM seller_profiles s JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=? AND s.user_id=?`)
    .bind(sellerId, userId).first<{ status: string; reference: string; settlementReference: string | null; route: string; stage: string; sellerRole: number }>();
  if (!profile) return null;
  const approved = profile.status === 'approved' && profile.route === 'registered_seller' && profile.stage === 'active' && Number(profile.sellerRole) === 1;
  const approvedManaged = profile.route === 'managed_maker' && profile.status === 'under_review' &&
    ['approved_for_activation', 'active'].includes(profile.stage);
  return { ...profile, approved, approvedManaged, editable: approved || ['submitted', 'under_review', 'needs_changes'].includes(profile.status) };
}

export async function readRegistrationProgress(db: D1Database, record: RegistrationRecord, email: string, now: number) {
  const [readiness, evidence] = await Promise.all([
    registrationReadiness(db, record.answers, email, record.documents, now),
    db.prepare(`SELECT id,kind,status,valid_until AS validUntil FROM seller_documents WHERE seller_id=? ORDER BY uploaded_at DESC,id DESC`)
      .bind(record.sellerId).all<{ id: string; kind: string; status: string; validUntil: number | null }>(),
  ]);
  const missing = [...readiness.missing];
  for (const definition of sellerDocumentsForApplication(readiness.input)) {
    if (!definition.required || !record.documents[definition.field]) continue;
    const document = evidence.results.find(row => row.id === record.documents[definition.field].id && row.kind === definition.kind);
    if (!document) missing.push(`Upload ${definition.label}.`);
    else if (document.status === 'verified' && document.validUntil !== null && document.validUntil <= now) missing.push(`${definition.label} has expired. Request a reviewed replacement.`);
    else if (document.status !== 'verified') missing.push(document.status === 'pending'
      ? `${definition.label} is awaiting review.` : `${definition.label} needs attention in the document history.`);
  }
  return { missing, lockedKinds: [...new Set(evidence.results.filter(row => row.status === 'verified').map(row => row.kind))] };
}
export async function saveRegistration(db: D1Database, options: { userId: string; email: string; sellerId: string; previous: RegistrationRecord | null;
  verificationEmail?: string;
  answers: DraftAnswers; documents: RegistrationDocuments; newDocuments: SellerApplicationDocument[]; now: number;
  requestId: string; digest: string; form: { versionId: string; answers: FormAnswerSnapshot } }) {
  const { userId, email, sellerId, previous, documents, now, requestId, verificationEmail } = options;
  const answers = verificationEmail ? { ...options.answers, registrationEmail: [verificationEmail] } : options.answers;
  const action = previous ? 'seller.registration.updated' : 'seller.application.submitted';
  const replay = await formRequestReplay(db, { formId: 'seller.application', requestId, actorId: userId, action, digest: options.digest, ...(previous ? { subjectId: sellerId } : {}) });
  if (replay) return { reference: (await db.prepare('SELECT application_reference AS reference FROM seller_profiles WHERE id=? AND user_id=?').bind(replay, userId).first<{ reference: string }>())!.reference, missing: [] };
  const readiness = await registrationReadiness(db, answers, email, documents, now);
  const input = readiness.ready ? readiness.input : optionalRegistrationInput(answers, email);
  if (!previous) {
    const reference = createSellerApplicationReference();
    const savedId = await createSellerApplication(db, { sellerId, userId, existingAccount: true, applicationReference: reference, input, documents: options.newDocuments, now,
      ...(readiness.registeredTerms && (readiness.ready || answers.applicationAcknowledgement?.[0] === 'yes')
        ? { registeredAgreementContext: readiness.registeredTerms.context } : {}),
      form: { ...options.form, requestId, digest: options.digest },
      intake: { ready: readiness.ready, answersJson: JSON.stringify(answers), documentsJson: JSON.stringify(documents), verificationEmail } });
    if (savedId !== sellerId) {
      const winner = await db.prepare('SELECT application_reference AS reference FROM seller_profiles WHERE id=? AND user_id=?').bind(savedId, userId).first<{ reference: string }>();
      if (!winner) throw new RegistrationError('Submission could not be confirmed. Check your dashboard before retrying.', 503);
      return { reference: winner.reference, missing: readiness.missing };
    }
    return { reference, missing: readiness.missing };
  }
  const profile = await readRegistrationOwnerState(db, sellerId, userId);
  if (!profile?.editable) throw new RegistrationError('This application is no longer open for direct edits. Contact support for reviewed identity changes.');
  if ((previous.answers.hasBusinessTaxRegistration?.[0] === 'yes') !== (answers.hasBusinessTaxRegistration?.[0] === 'yes')) throw new RegistrationError('Keep your submitted application route. Contact support if the route needs changing.');
  if (input.participationRoute !== profile.route) throw new RegistrationError('The registration route changed. Reload your registration before saving.');
  const changedEvidence = registrationChangedEvidence(previous.answers, answers, options.newDocuments.map(document => document.kind));
  async function checkProtectedChanges() {
    if (!changedEvidence.length) return;
    const locked = await db.prepare(`SELECT kind FROM seller_documents WHERE seller_id=? AND status='verified' AND kind IN (${changedEvidence.map(() => '?').join(',')}) LIMIT 1`)
      .bind(sellerId,...changedEvidence).first();
    if (locked) throw new RegistrationError('Verified documents and their identity details are locked. Request a reviewed change from Registration & documents; your other entries are retained.');
  }
  await checkProtectedChanges();
  const approvedCompletion = profile.approved || profile.approvedManaged;
  const terms = readiness.registeredTerms;
  const recordedAcceptance = terms ? await db.prepare(`SELECT id,accepted_at AS acceptedAt FROM seller_agreement_acceptance_history
    WHERE seller_id=? AND accepted_by=? AND accepted_at<=? AND HEX(agreement_version)=HEX(?) AND language_presented='en'
      AND commission_bps=? AND COALESCE(commission_setting_version_id,'')=? AND simulation_label IS NULL LIMIT 1`)
    .bind(sellerId, userId, now, terms.agreementVersion, terms.basisPoints, terms.versionId ?? '')
    .first<{ id: string; acceptedAt: number }>() : null;
  const acceptance = terms && !recordedAcceptance && (profile.approved || readiness.ready)
    ? await prepareSellerCommissionAcceptance(db, { sellerId, actorId: userId, context: terms.context, requestId, now,
      mode: profile.approved ? 'approved_seller' : 'application' }) : null;
  const acceptedAt = acceptance ? now : recordedAcceptance?.acceptedAt;
  const settlementReference = profile.approved && terms && acceptedAt !== undefined ? `registered-seller-agreement:${terms.context}` : null;
  const guard = crypto.randomUUID();
  const emailProof = registrationEmailCheck(email, verificationEmail ?? email.toLowerCase(), savedSellerRegistrationEmail(previous.answers));
  const statements: D1PreparedStatement[] = [
    db.prepare('/* seller-commission-lock */ SELECT id FROM seller_profiles WHERE user_id=? AND id=?').bind(userId, sellerId),
    ...verifiedDocumentChangeGuards(db, sellerId, changedEvidence),
    db.prepare(`UPDATE seller_registration_intakes SET version=version+1,answers_json=?,documents_json=?,review_ready=?,updated_at=? WHERE seller_id=? AND user_id=? AND version=?`)
      .bind(JSON.stringify(answers), JSON.stringify(documents), readiness.ready ? 1 : 0, now, sellerId, userId, previous.version),
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
      JOIN seller_participation_profiles p ON p.seller_id=s.id
      WHERE s.id=? AND u.id=? AND u.status='active' AND lower(u.email)=lower(?) AND s.status=?
        AND p.participation_route=? AND p.application_stage=?
        AND ${emailProof.sql}
        AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='customer')
        AND (s.status<>'approved' OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller'))) THEN 1 ELSE 0 END`)
      .bind(guard, sellerId, userId, email, profile.status, profile.route, profile.stage, ...emailProof.bindings),
    ...(recordedAcceptance ? [db.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM seller_agreement_acceptance_history WHERE id=? AND seller_id=? AND accepted_by=?
        AND accepted_at=? AND commission_bps=? AND COALESCE(commission_setting_version_id,'')=? AND HEX(agreement_version)=HEX(?)
        AND language_presented='en' AND simulation_label IS NULL) THEN 1 ELSE 0 END`)
      .bind(guard + ':terms', recordedAcceptance.id, sellerId, userId, recordedAcceptance.acceptedAt,
        terms!.basisPoints, terms!.versionId ?? '', terms!.agreementVersion),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard + ':terms')] : []),
    db.prepare(`UPDATE seller_profiles SET legal_name=?,applicant_type=?,registration_authority=?,registration_number=?,tax_mode=?,tax_registration_number=?,representative_name=?,support_phone=?,
      province=?,district=?,municipality=?,ward=?,locality=?,status=?,review_note=CASE WHEN ?=1 THEN review_note ELSE NULL END,updated_at=?,
      seller_agreement_version=COALESCE(?,seller_agreement_version),seller_agreement_accepted_at=COALESCE(?,seller_agreement_accepted_at),
      settlement_terms_reference=CASE WHEN TRIM(COALESCE(settlement_terms_reference,''))='' THEN COALESCE(?,settlement_terms_reference) ELSE settlement_terms_reference END
      WHERE id=? AND user_id=?`)
      .bind(input.legalName, input.applicantType, input.registrationAuthority, input.registrationNumber, input.taxMode, input.taxRegistrationNumber, input.representativeName, input.phone,
        input.province, input.district, input.municipality, input.ward, input.locality, approvedCompletion ? profile.status : 'submitted', approvedCompletion ? 1 : 0,
        now, acceptedAt !== undefined ? SELLER_AGREEMENT_VERSION : null, acceptedAt ?? null, settlementReference, sellerId, userId),
    db.prepare(`UPDATE seller_participation_profiles SET application_stage=?,tax_status=?,version=version+1,updated_at=? WHERE seller_id=?`)
      .bind(approvedCompletion ? profile.stage : 'submitted', input.taxStatus, now, sellerId),
  ];
  for (const document of options.newDocuments) statements.push(db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES (?,?,?,?,?,?,?,'pending',?)`)
    .bind(document.id, sellerId, document.kind, document.objectKey, document.originalName, document.mimeType, document.sizeBytes, now));
  for (const [purpose, address] of [['pickup', input.onboarding!.pickupAddress], ['returns', input.onboarding!.returnAddress]] as const)
    statements.push(db.prepare('UPDATE seller_operational_addresses SET locality=?,updated_at=? WHERE seller_id=? AND purpose=?').bind(address, now, sellerId, purpose));
  if (acceptance) statements.push(...acceptance.statements);
  const changedManagedDetails = !previous.ready || changedEvidence.some(kind => ['representative_identity','pan_certificate'].includes(kind))
    || previous.answers.managedAgreementContext?.[0] !== answers.managedAgreementContext?.[0];
  if (readiness.ready && input.managedIdentity && changedManagedDetails) statements.push(...await buildManagedMakerDetailStatements(db, { sellerId, actorId: userId,
    identityDocumentId: documents.representativeIdentity.id, identity: input.managedIdentity, now }));
  statements.push(db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
    VALUES (?,?,'seller.registration.updated','seller',?,'Applicant updated private registration details for Super Admin review',?,?,?)`)
    .bind(crypto.randomUUID(), userId, sellerId, JSON.stringify({ catalogDigest: options.digest, reviewReady: readiness.ready, version: previous.version + 1,
      ...(acceptance ? { registeredTermsSnapshot: acceptance.snapshot } : {}) }), requestId, now),
    buildFormAnswerInsert(db, { formId: 'seller.application', requestId, versionId: options.form.versionId, subjectType: 'seller', subjectId: sellerId, actorId: userId, answers: options.form.answers, now, optionalRegistration: true }),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard));
  try { await db.batch(statements); } catch (error) { await checkProtectedChanges(); throw error; }
  return { reference: profile.reference, missing: readiness.missing };
}
