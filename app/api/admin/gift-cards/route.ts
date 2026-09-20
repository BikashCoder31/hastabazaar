import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {
  GiftCardConflictError,
  issueGiftCard,
  parseGiftAmount,
} from '@/lib/db/repositories/gift-cards';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { CustomerAuthorizationError } from '@/lib/auth/customer';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireStaffApi('admin.invite');
    const body = JSON.parse(
      new TextDecoder().decode(await readBoundedBody(request, 2048)),
    );
    if (
      !body ||
      Array.isArray(body) ||
      typeof body !== 'object' ||
      typeof body.requestId !== 'string'
    )
      return json({ error: 'Invalid request.' }, 400);
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    return json(
      await issueGiftCard(db, {
        actorId: actor.id,
        amountPaisa: parseGiftAmount(body.amount),
        requestId: body.requestId,
        now: Date.now(),
      }),
      201,
    );
  } catch (error) {
    if (
      error instanceof StaffAuthorizationError ||
      error instanceof CustomerAuthorizationError
    )
      return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Request is too large.' }, 413);
    if (error instanceof GiftCardConflictError)
      return json({ error: error.message }, 409);
    return json(
      { error: 'The gift card operation could not be completed.' },
      400,
    );
  }
}
