import { env } from 'cloudflare:workers';
import {
  RECEIPT_COOKIE,
  hashOpaqueToken,
  readCookie,
} from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import {
  complaintCategories,
  createCustomerComplaint,
  ComplaintConflictError,
  type ComplaintCategory,
} from '@/lib/db/repositories/complaints';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { getCustomerUser } from '@/lib/auth/customer';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  const token = readCookie(request, RECEIPT_COOKIE);
  const customer = await getCustomerUser();
  if (!token && !customer)
    return json({ error: 'Order access could not be verified.' }, 404);
  try {
    const { orderNumber } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const orderItemId =
      typeof body.orderItemId === 'string' && body.orderItemId
        ? body.orderItemId
        : null;
    const category = body.category as ComplaintCategory;
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const detail = typeof body.detail === 'string' ? body.detail.trim() : '';
    const locale = body.locale === 'ne-NP' ? 'ne-NP' : 'en-NP';
    const requestId =
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (!complaintCategories.includes(category))
      return json({ error: 'Select a valid complaint category.' }, 400);
    if (subject.length < 5 || subject.length > 120)
      return json({ error: 'Add a subject of 5–120 characters.' }, 400);
    if (detail.length < 20 || detail.length > 3_000)
      return json(
        { error: 'Add complaint details of 20–3,000 characters.' },
        400,
      );
    if (requestId.length < 8 || requestId.length > 100)
      return json({ error: 'The request identifier is invalid.' }, 400);
    const result = await createCustomerComplaint(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        orderNumber,
        receiptTokenHash: token ? await hashOpaqueToken(token) : null,
        customerId: customer?.userId ?? null,
        orderItemId,
        category,
        subject,
        detail,
        locale,
        requestId,
        now: Date.now(),
      },
    );
    return json(
      {
        ...result,
        message: result.duplicate
          ? 'This complaint was already received.'
          : 'Your complaint has been received.',
      },
      result.duplicate ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof ComplaintConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    console.error('Complaint creation failed', error);
    return json({ error: 'The complaint could not be saved.' }, 500);
  }
}
