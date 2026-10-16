import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  acceptCommissionRate,
  CommissionConflictError,
} from '@/lib/db/repositories/commission-rates';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export async function POST(request: Request) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const seller = await requireSellerApi();
    const body = (await request.json()) as {
      accepted?: unknown;
      rateId?: unknown;
    };
    if (body?.accepted !== true || typeof body.rateId !== 'string')
      return json({ error: 'Review and confirm the fee schedule.' }, 400);
    await acceptCommissionRate(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        sellerId: seller.sellerId,
        userId: seller.userId,
        rateId: body.rateId,
        now: Date.now(),
      },
    );
    return json({ ok: true });
  } catch (error) {
    if (error instanceof SellerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof CommissionConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    return json(
      { error: 'The fee schedule acceptance could not be recorded.' },
      500,
    );
  }
}
