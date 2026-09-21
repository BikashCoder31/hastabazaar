import { env } from 'cloudflare:workers';

import {
  requireSellerApi,
  SellerAuthorizationError,
} from '@/lib/auth/seller';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { getCommissionSetting, sellerAcceptedCommissionVersion } from '@/lib/db/repositories/marketplace-settings';

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
  try {
    const body = (await request.json()) as { accepted?: unknown; language?: unknown };
    if (body.accepted !== true)
      return json({ error: 'Confirm the current seller agreement.' }, 400);
    const seller = await requireSellerApi();
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const now = Date.now();
    const commission = await getCommissionSetting(database, now);
    if (seller.sellerAgreementVersion === SELLER_AGREEMENT_VERSION && await sellerAcceptedCommissionVersion(database,seller.sellerId,commission.versionId))
      return json({ status: 'already_accepted' }, 200);
    const language = body.language === 'en' ? 'en' : 'ne';
    const requestId =
      request.headers.get('cf-ray') ??
      request.headers.get('x-request-id') ??
      crypto.randomUUID();
    await database.batch([
      database
        .prepare(
          `UPDATE seller_profiles
           SET seller_agreement_version = ?, seller_agreement_accepted_at = ?, updated_at = ?
           WHERE id = ? AND status = 'approved'`,
        )
        .bind(SELLER_AGREEMENT_VERSION, now, now, seller.sellerId),
      database.prepare(`INSERT OR IGNORE INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at,simulation_label) VALUES (?,?,?,?,?,?,?,?,?,NULL)`).bind(
        crypto.randomUUID(),seller.sellerId,SELLER_AGREEMENT_VERSION,language,commission.versionId,commission.basisPoints,requestId,seller.userId,now,
      ),
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
          JSON.stringify({ version: SELLER_AGREEMENT_VERSION, languagePresented:language, commissionBps:commission.basisPoints, commissionSettingVersionId:commission.versionId, acceptedAt: now }),
          requestId,
          now,
        ),
    ]);
    return json({ status: 'accepted' }, 200);
  } catch (error) {
    if (error instanceof SellerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    return json({ error: 'Acceptance could not be recorded.' }, 500);
  }
}
