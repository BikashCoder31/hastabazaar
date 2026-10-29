import { createSellerApplication } from '@/lib/db/repositories/seller-applications';
import { prepareSellerCommissionAcceptance, getRegisteredSellerTerms } from '@/lib/db/repositories/marketplace-settings';
import { buildManagedMakerDetailStatements, getManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import { createSellerApplicationReference, sellerDocumentsForApplication, type SellerApplicationDocument } from './application';
import { optionalRegistrationInput, completeRegistrationInput } from './registration-intake';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from './managed-identity';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';
import { type DraftAnswers } from './draft-contract';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import { formRequestReplay } from '@/lib/forms/submission';
import type { FormAnswerSnapshot } from '@/lib/forms/types';

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
    if (definition.required && !documents[definition.field]) missing.push(`${definition.label} is needed before approval.`);
  }
  if (complete.input && !missing.length) {
    try {
      if (input.participationRoute === 'registered_seller') {
        if (answers.sellerAgreementContext?.[0] !== (await getRegisteredSellerTerms(db, now)).context) missing.push('Review and accept the current Seller Marketplace Agreement.');
      } else if (input.managedIdentity?.managedAgreementContext !== (await getManagedMakerApplicationTerms(db, now, MANAGED_SUPPLIER_AGREEMENT_VERSION)).context) missing.push('Review and accept the current Managed Maker agreement.');
    } catch { missing.push('Current agreement terms are unavailable; review them later from your dashboard.'); }
  }
  return { input, missing, ready: missing.length === 0 };
}
export async function saveRegistration(db: D1Database, options: { userId: string; email: string; sellerId: string; previous: RegistrationRecord | null;
  answers: DraftAnswers; documents: RegistrationDocuments; newDocuments: SellerApplicationDocument[]; now: number;
  requestId: string; digest: string; form: { versionId: string; answers: FormAnswerSnapshot } }) {
  const { userId, email, sellerId, previous, answers, documents, now, requestId } = options;
  const action = previous ? 'seller.registration.updated' : 'seller.application.submitted';
  const replay = await formRequestReplay(db, { formId: 'seller.application', requestId, actorId: userId, action, digest: options.digest, ...(previous ? { subjectId: sellerId } : {}) });
  if (replay) return { reference: (await db.prepare('SELECT application_reference AS reference FROM seller_profiles WHERE id=? AND user_id=?').bind(replay, userId).first<{ reference: string }>())!.reference, missing: [] };
  const readiness = await registrationReadiness(db, answers, email, documents, now);
  const input = readiness.ready ? readiness.input : optionalRegistrationInput(answers, email);
  if (!previous) {
    const reference = createSellerApplicationReference();
    const savedId = await createSellerApplication(db, { sellerId, userId, existingAccount: true, applicationReference: reference, input, documents: options.newDocuments, now,
      ...(readiness.ready && input.participationRoute === 'registered_seller' ? { registeredAgreementContext: answers.sellerAgreementContext?.[0] } : {}),
      form: { ...options.form, requestId, digest: options.digest }, intake: { ready: readiness.ready, answersJson: JSON.stringify(answers), documentsJson: JSON.stringify(documents) } });
    if (savedId !== sellerId) {
      const winner = await db.prepare('SELECT application_reference AS reference FROM seller_profiles WHERE id=? AND user_id=?').bind(savedId, userId).first<{ reference: string }>();
      if (!winner) throw new RegistrationError('Submission could not be confirmed. Check your dashboard before retrying.', 503);
      return { reference: winner.reference, missing: readiness.missing };
    }
    return { reference, missing: readiness.missing };
  }
  const profile = await db.prepare(`SELECT status,application_reference AS reference FROM seller_profiles WHERE id=? AND user_id=?`).bind(sellerId, userId).first<{ status: string; reference: string }>();
  if (!profile || !['submitted', 'under_review', 'needs_changes'].includes(profile.status)) throw new RegistrationError('This application is no longer open for direct edits. Contact support for reviewed identity changes.');
  if ((previous.answers.hasBusinessTaxRegistration?.[0] === 'yes') !== (answers.hasBusinessTaxRegistration?.[0] === 'yes')) throw new RegistrationError('Keep your submitted application route. Contact support if the route needs changing.');
  const acceptance = readiness.ready && input.participationRoute === 'registered_seller'
    ? await prepareSellerCommissionAcceptance(db, { sellerId, actorId: userId, context: answers.sellerAgreementContext![0], requestId, now, mode: 'application' }) : null;
  const guard = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE seller_registration_intakes SET version=version+1,answers_json=?,documents_json=?,review_ready=?,updated_at=? WHERE seller_id=? AND user_id=? AND version=?`)
      .bind(JSON.stringify(answers), JSON.stringify(documents), readiness.ready ? 1 : 0, now, sellerId, userId, previous.version),
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
      JOIN account_email_verifications e ON e.user_id=u.id AND e.email=lower(u.email) WHERE s.id=? AND u.id=? AND u.status='active' AND s.status IN ('submitted','under_review','needs_changes')) THEN 1 ELSE 0 END`).bind(guard, sellerId, userId),
    db.prepare(`UPDATE seller_profiles SET legal_name=?,applicant_type=?,registration_authority=?,registration_number=?,tax_mode=?,tax_registration_number=?,representative_name=?,support_phone=?,
      province=?,district=?,municipality=?,ward=?,locality=?,status='submitted',review_note=NULL,updated_at=?,seller_agreement_version=?,seller_agreement_accepted_at=? WHERE id=? AND user_id=?`)
      .bind(input.legalName, input.applicantType, input.registrationAuthority, input.registrationNumber, input.taxMode, input.taxRegistrationNumber, input.representativeName, input.phone,
        input.province, input.district, input.municipality, input.ward, input.locality, now, acceptance ? SELLER_AGREEMENT_VERSION : null, acceptance ? now : null, sellerId, userId),
    db.prepare(`UPDATE seller_participation_profiles SET application_stage='submitted',tax_status=?,version=version+1,updated_at=? WHERE seller_id=?`).bind(input.taxStatus, now, sellerId),
  ];
  for (const document of options.newDocuments) statements.push(db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES (?,?,?,?,?,?,?,'pending',?)`)
    .bind(document.id, sellerId, document.kind, document.objectKey, document.originalName, document.mimeType, document.sizeBytes, now));
  for (const [purpose, address] of [['pickup', input.onboarding!.pickupAddress], ['returns', input.onboarding!.returnAddress]] as const)
    statements.push(db.prepare('UPDATE seller_operational_addresses SET locality=?,updated_at=? WHERE seller_id=? AND purpose=?').bind(address, now, sellerId, purpose));
  if (acceptance) statements.push(...acceptance.statements);
  if (readiness.ready && input.managedIdentity) statements.push(...await buildManagedMakerDetailStatements(db, { sellerId, actorId: userId,
    identityDocumentId: documents.representativeIdentity.id, identity: input.managedIdentity, now }));
  statements.push(db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
    VALUES (?,?,'seller.registration.updated','seller',?,'Applicant updated private registration details for Super Admin review',?,?,?)`)
    .bind(crypto.randomUUID(), userId, sellerId, JSON.stringify({ catalogDigest: options.digest, reviewReady: readiness.ready, version: previous.version + 1 }), requestId, now),
    buildFormAnswerInsert(db, { formId: 'seller.application', requestId, versionId: options.form.versionId, subjectType: 'seller', subjectId: sellerId, actorId: userId, answers: options.form.answers, now, optionalRegistration: true }),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard));
  await db.batch(statements);
  return { reference: profile.reference, missing: readiness.missing };
}
