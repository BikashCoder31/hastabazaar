import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  PayoutConflictError,
  requestSellerPayout,
} from '@/lib/db/repositories/payouts';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const seller = await requireSellerApi();
    const body = (await request.json()) as {
      note?: string;
      requestId?: string;
    };
    if (!body.requestId)
      return Response.json(
        { error: 'Request identifier is required.' },
        { status: 400 },
      );
    const id = await requestSellerPayout(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        sellerId: seller.sellerId,
        actorId: seller.userId,
        note: body.note ?? '',
        requestId: body.requestId,
        now: Date.now(),
      },
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof SellerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof PayoutConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Payout request could not be submitted.' },
      { status: 500 },
    );
  }
}
