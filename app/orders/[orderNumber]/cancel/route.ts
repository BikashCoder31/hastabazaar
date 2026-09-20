import { env } from 'cloudflare:workers';
import {
  RECEIPT_COOKIE,
  hashOpaqueToken,
  readCookie,
} from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { getCustomerUser } from '@/lib/auth/customer';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import {
  cancellationChoices,
  cancellationPreview,
  cancelSelectedParcels,
  CancellationConflictError,
} from '@/lib/cancellation/repository';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function access(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  const token = readCookie(request, RECEIPT_COOKIE),
    customer = await getCustomerUser();
  if (!token && !customer)
    throw new CancellationConflictError('Order access could not be verified.');
  return {
    orderNumber: (await context.params).orderNumber,
    receiptTokenHash: token ? await hashOpaqueToken(token) : null,
    customerId: customer?.userId ?? null,
  };
}
export async function GET(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  try {
    return json({
      choices: await cancellationChoices(
        requireDatabase(env as unknown as { DB?: D1Database }),
        await access(request, context),
      ),
    });
  } catch {
    return json({ error: 'Order access could not be verified.' }, 404);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const a = await access(request, context),
      db = requireDatabase(env as unknown as { DB?: D1Database }),
      body = JSON.parse(
        new TextDecoder().decode(await readBoundedBody(request, 4096)),
      ) as Record<string, unknown>;
    if (
      !Array.isArray(body.sellerIds) ||
      body.sellerIds.length > 50 ||
      body.sellerIds.some((v) => typeof v !== 'string')
    )
      return json({ error: 'Choose seller parcels.' }, 400);
    const sellerIds = body.sellerIds as string[];
    if (body.action === 'preview') {
      const p = await cancellationPreview(db, a, sellerIds);
      return json({
        fingerprint: p.fingerprint,
        reviewRequired: p.reviewRequired,
        walletRestored: p.walletRestored,
        discountRemoved: p.discountRemoved,
        delivery: p.next.delivery,
        deliveryPricingPolicy:p.deliveryPricingPolicy,
        total: p.next.total,
        collected: p.parcels.reduce((n, r) => n + r.collected, 0),
      });
    }
    if (
      body.action !== 'confirm' ||
      typeof body.fingerprint !== 'string' ||
      typeof body.requestId !== 'string' ||
      typeof body.reason !== 'string'
    )
      return json(
        { error: 'Review the current amounts before confirming.' },
        400,
      );
    return json(
      await cancelSelectedParcels(db, a, {
        sellerIds,
        fingerprint: body.fingerprint,
        requestId: body.requestId,
        note: body.reason,
        now: Date.now(),
      }),
    );
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Request too large.' }, 413);
    return json(
      {
        error:
          error instanceof CancellationConflictError
            ? error.message
            : 'Cancellation could not be completed. Refresh and review the current order.',
      },
      409,
    );
  }
}
