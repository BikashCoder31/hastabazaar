import { env } from 'cloudflare:workers';

import {
  requireSellerApi,
  SellerAuthorizationError,
} from '@/lib/auth/seller';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { getRegisteredSellerTerms, prepareSellerCommissionAcceptance, SellerCommissionTermsChangedError, sellerAcceptedCommissionVersion } from '@/lib/db/repositories/marketplace-settings';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  let checked: { database: D1Database; context: string; sellerId: string; actorId: string } | undefined;
  try {
    const body = (await request.json()) as { accepted?: unknown; language?: unknown; termsContext?: unknown };
    if (body.accepted !== true)
      return json({ error: 'Confirm the current seller agreement.' }, 400);
    if (body.language !== 'en')
      return json({ error: 'Review and accept the current English seller agreement.' }, 400);
    const seller = await requireSellerApi();
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const now = Date.now();
    if (typeof body.termsContext!=='string' || !/^[a-f0-9]{64}$/.test(body.termsContext)) return json({error:'Reload and review the current seller terms.'},400);
    const language = body.language;
    const requestId = request.headers.get('cf-ray') ?? request.headers.get('x-request-id') ?? crypto.randomUUID();
    const {terms:commission,snapshot:registeredTermsSnapshot,statements:acceptance}=await prepareSellerCommissionAcceptance(database,{sellerId:seller.sellerId,actorId:seller.userId,context:body.termsContext,requestId,now,language});
    checked = { database, context: body.termsContext, sellerId: seller.sellerId, actorId: seller.userId };
    if (seller.sellerAgreementVersion === SELLER_AGREEMENT_VERSION && await sellerAcceptedCommissionVersion(database,seller.sellerId,commission,now))
      return json({ status: 'already_accepted' }, 200);
    // An earlier affirmative submission can leave exact evidence while the profile
    // marker is stale. Restore that marker from its original owner-audited record.
    const prior = await database.prepare(`SELECT h.id AS historyId, h.accepted_at AS acceptedAt, a.id AS auditId, a.next_json AS audit
      FROM seller_agreement_acceptance_history h JOIN audit_logs a
        ON a.request_id=h.acceptance_request_id AND a.actor_id=h.accepted_by
        AND a.subject_type='seller' AND a.subject_id=h.seller_id
        AND a.action IN ('seller.agreement.accepted','seller.application.submitted','seller.registration.updated')
        AND a.created_at=h.accepted_at
      WHERE h.seller_id=? AND h.accepted_by=? AND HEX(h.agreement_version)=HEX(?)
        AND h.language_presented=? AND h.commission_setting_version_id=? AND h.commission_bps=?
        AND h.simulation_label IS NULL AND h.accepted_at<=?`)
      .bind(seller.sellerId, seller.userId, SELLER_AGREEMENT_VERSION, language,
        commission.versionId, commission.basisPoints, now)
      .first<{ historyId: string; acceptedAt: number; auditId: string; audit: string }>();
    const savedSnapshot = prior ? JSON.parse(prior.audit)?.registeredTermsSnapshot : null;
    const canRestore = prior && savedSnapshot &&
      Object.entries({ ...registeredTermsSnapshot, acceptedAt: prior.acceptedAt })
        .every(([key, value]) => savedSnapshot[key] === value);
    const update = database.prepare(`UPDATE seller_profiles
      SET seller_agreement_version=?, seller_agreement_accepted_at=?, updated_at=?
      WHERE id=? AND user_id=? AND status='approved'`)
      .bind(SELLER_AGREEMENT_VERSION, canRestore ? prior.acceptedAt : now, now, seller.sellerId, seller.userId);
    if (canRestore) {
      const [lock, assertCurrentOwnerAndTerms, , clearGuard] = acceptance;
      const evidenceGuardId = crypto.randomUUID();
      const assertRecordedEvidence = database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
        SELECT ?,CASE WHEN EXISTS(SELECT 1
          FROM seller_agreement_acceptance_history h JOIN audit_logs a ON a.request_id=h.acceptance_request_id
          WHERE h.id=? AND h.seller_id=? AND h.accepted_by=? AND HEX(h.agreement_version)=HEX(?)
            AND h.language_presented=? AND h.commission_setting_version_id=? AND h.commission_bps=?
            AND h.simulation_label IS NULL AND h.accepted_at=?
            AND a.id=? AND a.actor_id=h.accepted_by AND a.subject_type='seller' AND a.subject_id=h.seller_id
            AND a.action IN ('seller.agreement.accepted','seller.application.submitted','seller.registration.updated')
            AND a.created_at=h.accepted_at AND HEX(a.next_json)=HEX(?))
          THEN 1 ELSE 0 END`)
        .bind(evidenceGuardId, prior.historyId, seller.sellerId, seller.userId, SELLER_AGREEMENT_VERSION, language,
          commission.versionId, commission.basisPoints, prior.acceptedAt, prior.auditId, prior.audit);
      await database.batch([lock, assertCurrentOwnerAndTerms, assertRecordedEvidence, update, clearGuard,
        database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(evidenceGuardId)]);
      return json({ status: 'already_accepted' }, 200);
    }
    await database.batch([
      update,
      ...acceptance,
      database
        .prepare(
          `INSERT INTO audit_logs (
            id, actor_id, action, subject_type, subject_id, reason,
            previous_json, next_json, request_id, ip_hash, created_at
          ) VALUES (?, ?, 'seller.agreement.accepted', 'seller', ?,
            'Seller affirmatively accepted the current marketplace agreement',
            ?, ?, ?, NULL, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          seller.userId,
          seller.sellerId,
          JSON.stringify({ version: seller.sellerAgreementVersion }),
          JSON.stringify({ version: SELLER_AGREEMENT_VERSION, languagePresented:language, commissionBps:commission.basisPoints, commissionSettingVersionId:commission.versionId, termsContext:body.termsContext, acceptedAt: now, registeredTermsSnapshot }),
          requestId,
          now,
        ),
    ]);
    return json({ status: 'accepted' }, 200);
  } catch (error) {
    if (error instanceof SellerCommissionTermsChangedError) return json({error:error.message},409);
    if (error instanceof SellerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    if (checked) {
      try {
        const now = Date.now();
        const terms = await getRegisteredSellerTerms(checked.database, now);
        if (terms.context !== checked.context)
          return json({ error: 'Seller commission terms have changed. Reload and review the current terms.' }, 409);
        // A competing renewal may have committed while this request ran.
        // Success requires the current authorized owner and the dashboard's saved proof.
        const seller = await requireSellerApi();
        if (seller.sellerId === checked.sellerId && seller.userId === checked.actorId &&
            await sellerAcceptedCommissionVersion(checked.database, seller.sellerId, terms, now))
          return json({ status: 'already_accepted' }, 200);
      } catch { /* Preserve the controlled error when current authorization or storage is unavailable. */ }
    }
    return json({ error: 'Acceptance could not be recorded.' }, 500);
  }
}
