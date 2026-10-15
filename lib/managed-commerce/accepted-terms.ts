import { getEffectiveBusinessSetting } from '../db/repositories/business-settings';
import { buildFormAnswerInsert } from '../db/repositories/form-answers';
import { digestFormRequest, FormRequestConflictError } from '../forms/submission';
import type { FormAnswerSnapshot } from '../forms/types';
import { managedMakerAgreementContext, managedMakerAgreementSnapshot } from '../sellers/managed-identity';

const accountKey = 'managed_maker_company_account';
const retentionKey = 'managed_sale_linked_platform_retention_bps';
export const managedTermsFormId = 'seller.managed-terms-acceptance';
type Agreement = ReturnType<typeof managedMakerAgreementSnapshot>;
export type ManagedTermsOffer = Readonly<{
  id: string; context: string; snapshot: Agreement; retentionBps: number;
  agreementVersion: string; language: 'en'; effectiveFrom: number;
  settingVersionIds: { account: string | null; retention: string | null };
}>;
export type AcceptedManagedTerms = ManagedTermsOffer & Readonly<{
  detailId: string; sellerId: string; acceptedBy: string; acceptedAt: number; formVersionId: string | null;
}>;

async function offerAt(db: D1Database, at: number): Promise<ManagedTermsOffer> {
  const [account, retention] = await Promise.all([
    getEffectiveBusinessSetting(db, accountKey, at), getEffectiveBusinessSetting(db, retentionKey, at),
  ]);
  const snapshot = managedMakerAgreementSnapshot(account.value, retention.value);
  const context = await managedMakerAgreementContext(snapshot);
  const settingVersionIds = { account: account.versionId, retention: retention.versionId };
  return { id: await digestFormRequest({ context, settingVersionIds }), context, snapshot,
    retentionBps: retention.value, agreementVersion: snapshot.version, language: 'en',
    effectiveFrom: Math.max(account.effectiveFrom ?? 0, retention.effectiveFrom ?? 0), settingVersionIds };
}

/** Commercial evidence only. Private government ID data never enters this projection. */
export async function getManagedTermsOffers(db: D1Database, _sellerId: string, now: number) {
  if (!Number.isSafeInteger(now) || now <= 0) throw new RangeError('A valid terms lookup time is required.');
  const current = await offerAt(db, now);
  const boundaries = await db.prepare(`SELECT DISTINCT effective_from AS at FROM business_setting_versions
    WHERE setting_key IN (?,?) AND status='published' AND effective_from>?
    UNION SELECT DISTINCT effective_until AS at FROM business_setting_versions
    WHERE setting_key IN (?,?) AND status='published' AND effective_until>?
    ORDER BY at LIMIT 32`).bind(accountKey, retentionKey, now, accountKey, retentionKey, now).all<{ at: number }>();
  const upcoming: ManagedTermsOffer[] = [];
  let previous = current.id;
  for (const { at } of boundaries.results) {
    const offer = await offerAt(db, at);
    if (offer.id !== previous) { upcoming.push({ ...offer, effectiveFrom: at }); previous = offer.id; }
  }
  return { current, upcoming };
}

export async function getAcceptedManagedTerms(db: D1Database, sellerId: string, now: number): Promise<AcceptedManagedTerms | null> {
  const offer = await offerAt(db, now);
  const rows = await db.prepare(`SELECT d.id,d.agreement_snapshot_json AS snapshotJson,
      d.agreement_accepted_by AS acceptedBy,d.agreement_accepted_at AS acceptedAt,
      d.agreement_language AS language,d.agreement_form_version_id AS formVersionId
    FROM managed_maker_application_details d JOIN seller_documents document ON document.id=d.identity_document_id
    JOIN seller_profiles seller ON seller.id=d.seller_id
    WHERE d.seller_id=? AND document.seller_id=d.seller_id AND document.status<>'rejected'
      AND document.object_key LIKE 'private/seller-documents/'||d.seller_id||'/%'
      AND d.agreement_accepted_by=seller.user_id AND d.agreement_accepted_at<=?
    ORDER BY d.agreement_accepted_at DESC,d.id DESC`).bind(sellerId, now).all<{
      id: string; snapshotJson: string; acceptedBy: string; acceptedAt: number; language: string | null; formVersionId: string | null;
    }>();
  for (const row of rows.results) {
    const stored = JSON.parse(row.snapshotJson) as Agreement & { settingVersionIds?: ManagedTermsOffer['settingVersionIds'] };
    const base: Agreement = { version: stored.version, company: stored.company, companyAccount: stored.companyAccount,
      commercialModel: stored.commercialModel, platformRetentionBps: stored.platformRetentionBps, terms: stored.terms };
    const sources = stored.settingVersionIds ?? { account: null, retention: null };
    if (await managedMakerAgreementContext(base) === offer.context &&
      sources.account === offer.settingVersionIds.account && sources.retention === offer.settingVersionIds.retention) {
      return { ...offer, detailId: row.id, sellerId, acceptedBy: row.acceptedBy,
        acceptedAt: row.acceptedAt, language: 'en', formVersionId: row.formVersionId };
    }
  }
  return null;
}

type Acceptance = {
  sellerId: string; actorId: string; offerId: string; context: string; language: 'en'; requestId: string; now: number;
  form: { versionId: string; answers: FormAnswerSnapshot };
};
const ownerSql = `EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
  JOIN seller_participation_profiles p ON p.seller_id=s.id
  WHERE s.id=? AND u.id=? AND u.status='active' AND p.participation_route='managed_maker'
    AND p.application_stage NOT IN ('rejected','suspended')
    AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer'))`;

export async function acceptManagedTerms(db: D1Database, input: Acceptance): Promise<{ detailId: string; offerId: string }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/.test(input.requestId) || input.language !== 'en' ||
    input.form.answers.formId !== managedTermsFormId || !Number.isSafeInteger(input.now) || input.now <= 0)
    throw new FormRequestConflictError('Review and explicitly accept the displayed English terms with a valid request reference.');
  if (!await db.prepare(`SELECT 1 WHERE ${ownerSql}`).bind(input.sellerId, input.actorId).first())
    throw new FormRequestConflictError('An active, eligible maker owner is required.');
  const catalogDigest = await digestFormRequest({ sellerId: input.sellerId, offerId: input.offerId,
    context: input.context, language: input.language, versionId: input.form.versionId, answers: input.form.answers });
  const prior = await db.prepare(`SELECT a.actor_id AS actorId,a.subject_id AS sellerId,a.next_json AS nextJson,
      f.config_version_id AS versionId,f.answers_json AS answersJson
    FROM audit_logs a LEFT JOIN form_answer_sets f ON f.form_id=? AND f.request_id=a.request_id
      AND f.actor_id=a.actor_id AND f.subject_type='seller' AND f.subject_id=a.subject_id
    WHERE a.request_id=? AND a.action='managed_maker.terms_accepted' AND a.subject_type='seller'`)
    .bind(managedTermsFormId, input.requestId).first<{ actorId: string; sellerId: string; nextJson: string; versionId: string; answersJson: string }>();
  if (prior) {
    const receipt = JSON.parse(prior.nextJson) as { catalogDigest: string; detailId: string; offerId: string };
    if (prior.actorId !== input.actorId || prior.sellerId !== input.sellerId || receipt.catalogDigest !== catalogDigest ||
      prior.versionId !== input.form.versionId || prior.answersJson !== JSON.stringify(input.form.answers))
      throw new FormRequestConflictError('Request reference is already used for different content.');
    return { detailId: receipt.detailId, offerId: receipt.offerId };
  }
  const offers = await getManagedTermsOffers(db, input.sellerId, input.now);
  const offer = [offers.current, ...offers.upcoming].find(candidate => candidate.id === input.offerId && candidate.context === input.context);
  if (!offer) throw new FormRequestConflictError('This offer changed or was cancelled. Reload and review the current terms.');
  const evidence = await db.prepare(`SELECT d.government_id_type AS idType,d.government_id_description AS description,
      d.personal_pan AS pan,d.identity_document_id AS documentId
    FROM managed_maker_application_details d JOIN seller_documents document ON document.id=d.identity_document_id
    WHERE d.seller_id=? AND document.seller_id=d.seller_id AND document.status<>'rejected'
    ORDER BY d.created_at DESC,d.id DESC LIMIT 1`).bind(input.sellerId)
    .first<{ idType: string; description: string; pan: string | null; documentId: string }>();
  if (!evidence) throw new FormRequestConflictError('Provide valid private identity evidence before accepting renewed terms.');
  const detailId = crypto.randomUUID(), guardId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO operation_transaction_guards(id,valid)
    SELECT ?,CASE WHEN ${ownerSql} AND EXISTS(SELECT 1 FROM seller_documents WHERE id=? AND seller_id=?
      AND status<>'rejected' AND object_key LIKE 'private/seller-documents/'||seller_id||'/%') THEN 1 ELSE 0 END`)
    .bind(guardId, input.sellerId, input.actorId, evidence.documentId, input.sellerId)];
  for (const [key, versionId] of [[accountKey, offer.settingVersionIds.account], [retentionKey, offer.settingVersionIds.retention]]) {
    statements.push(db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN
      COALESCE((SELECT id FROM business_setting_versions WHERE setting_key=? AND status='published'
      AND effective_from<=? AND (effective_until IS NULL OR effective_until>?)
      ORDER BY effective_from DESC,version DESC LIMIT 1),'')=? THEN 1 ELSE 0 END`)
      .bind(`${guardId}:${key}`, key, Math.max(input.now, offer.effectiveFrom), Math.max(input.now, offer.effectiveFrom), versionId ?? ''));
    statements.push(db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(`${guardId}:${key}`));
  }
  statements.push(db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN
    EXISTS(SELECT 1 FROM form_config_versions WHERE id=? AND form_id=? AND status='published'
      AND id=(SELECT id FROM form_config_versions WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1))
    THEN 1 ELSE 0 END`).bind(`${guardId}:form`, input.form.versionId, managedTermsFormId, managedTermsFormId),
    db.prepare(`INSERT INTO managed_maker_application_details(id,seller_id,government_id_type,government_id_description,
      personal_pan,identity_document_id,agreement_version,agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,
      created_at,agreement_language,agreement_form_version_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(detailId, input.sellerId, evidence.idType, evidence.description, evidence.pan, evidence.documentId,
        offer.agreementVersion, input.now, input.actorId, JSON.stringify({ ...offer.snapshot, settingVersionIds: offer.settingVersionIds }),
        input.now, input.language, input.form.versionId),
    buildFormAnswerInsert(db, { formId: managedTermsFormId, requestId: input.requestId, versionId: input.form.versionId,
      subjectType: 'seller', subjectId: input.sellerId, actorId: input.actorId, answers: input.form.answers, now: input.now }),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
      VALUES(?,?,'managed_maker.terms_accepted','seller',?,'Maker explicitly accepted displayed company-store terms',?,?,?)`)
      .bind(crypto.randomUUID(), input.actorId, input.sellerId, JSON.stringify({ catalogDigest, detailId, offerId: offer.id }), input.requestId, input.now),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id IN (?,?)').bind(guardId, `${guardId}:form`));
  try { await db.batch(statements); }
  catch { throw new FormRequestConflictError('The offer, account, identity or form changed. Reload before trying again.'); }
  return { detailId, offerId: offer.id };
}
