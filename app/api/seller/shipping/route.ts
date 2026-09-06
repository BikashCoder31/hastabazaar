import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  createShippingJob,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
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
      orderId?: string;
      direction?: 'outbound' | 'return';
      note?: string;
      requestId?: string;
    };
    if (
      !body.orderId ||
      !body.requestId ||
      !['outbound', 'return'].includes(body.direction ?? '')
    )
      return Response.json(
        { error: 'Order, direction and request identifier are required.' },
        { status: 400 },
      );
    const id = await createShippingJob(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        orderId: body.orderId,
        sellerId: seller.sellerId,
        actorId: seller.userId,
        direction: body.direction!,
        note: body.note ?? '',
        requestId: body.requestId,
        now: Date.now(),
      },
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof SellerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Shipping request could not be created.' },
      { status: 500 },
    );
  }
}
