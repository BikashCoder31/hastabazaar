import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  operateShippingJob,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const seller = await requireSellerApi();
    const body = (await request.json()) as {
      action?: string;
      note?: string;
      requestId?: string;
    };
    const { id } = await context.params;
    if (!body.requestId)
      return Response.json(
        { error: 'Request identifier is required.' },
        { status: 400 },
      );
    await operateShippingJob(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        jobId: id,
        actorId: seller.userId,
        actorRole: 'seller',
        sellerId: seller.sellerId,
        action: body.action ?? '',
        note: body.note ?? '',
        requestId: body.requestId,
        now: Date.now(),
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SellerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Shipping job could not be updated.' },
      { status: 500 },
    );
  }
}
