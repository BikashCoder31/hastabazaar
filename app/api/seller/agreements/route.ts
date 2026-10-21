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
  let checked: {database:D1Database;context:string;sellerId:string;actorId:string;language:'en'|'ne';versionId:string|null} | undefined;
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
    checked={database,context:body.termsContext,sellerId:seller.sellerId,actorId:seller.userId,language,versionId:commission.versionId};
    if (seller.sellerAgreementVersion === SELLER_AGREEMENT_VERSION && await sellerAcceptedCommissionVersion(database,seller.sellerId,commission.versionId))
      return json({ status: 'already_accepted' }, 200);
    await database.batch([
      database
        .prepare(
          `UPDATE seller_profiles
           SET seller_agreement_version = ?, seller_agreement_accepted_at = ?, updated_at = ?
           WHERE id = ? AND status = 'approved'`,
        )
        .bind(SELLER_AGREEMENT_VERSION, now, now, seller.sellerId),
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
        if ((await getRegisteredSellerTerms(checked.database)).context!==checked.context)
          return json({error:'Seller commission terms have changed. Reload and review the current terms.'},409);
        // A competing identical renewal may have won the unique acceptance row.
        // Recheck current authorization and the exact snapshot before reporting success.
        const seller=await requireSellerApi();
        const recorded=await checked.database.prepare(`SELECT 1 FROM seller_agreement_acceptance_history
          WHERE seller_id=? AND accepted_by=? AND agreement_version=? AND language_presented=?
            AND COALESCE(commission_setting_version_id,'')=? LIMIT 1`)
          .bind(checked.sellerId,checked.actorId,SELLER_AGREEMENT_VERSION,checked.language,checked.versionId??'').first();
        if (seller.sellerId===checked.sellerId && seller.userId===checked.actorId && recorded)
          return json({status:'already_accepted'},200);
      } catch { /* Preserve the controlled error when current authorization or storage is unavailable. */ }
    }
    return json({ error: 'Acceptance could not be recorded.' }, 500);
  }
}
