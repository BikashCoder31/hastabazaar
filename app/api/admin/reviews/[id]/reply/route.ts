import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { moderateSellerReply } from '@/lib/db/repositories/review-extras';
import { CustomerDataConflictError } from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('product.review');
    const { id } = await params;
    const body = (await request.json()) as {
      action: 'publish' | 'reject' | 'hide';
      note: string;
      idempotencyKey: string;
      version: number;
    } | null;
    if (
      !body || !['publish', 'reject', 'hide'].includes(body.action) ||
      typeof body.note !== 'string' ||
      typeof body.idempotencyKey !== 'string' ||
      !body.idempotencyKey ||
      body.idempotencyKey.length > 100 ||
      !Number.isInteger(body.version)
    )
      return Response.json(
        { error: 'Invalid moderation request.' },
        { status: 400 },
      );
    await moderateSellerReply(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        reviewId: id,
        actorId: staff.id,
        action: body.action,
        note: body.note,
        version: body.version,
        requestId: body.idempotencyKey,
        now: Date.now(),
      },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof CustomerDataConflictError ||
          e instanceof StaffAuthorizationError
            ? e.message
            : 'Reply could not be moderated.',
      },
      {
        status:
          e instanceof StaffAuthorizationError
            ? e.status
            : e instanceof CustomerDataConflictError
              ? 409
              : 500,
      },
    );
  }
}
