import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { setMarketplaceCommission } from '@/lib/db/repositories/marketplace-settings';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('commercial_policy.manage');
    const body = (await request.json()) as {
      percent?: unknown;
      reason?: unknown;
      requestId?: unknown;
    };
    const percent =
      typeof body.percent === 'number' ? body.percent : Number(body.percent);
    const basisPoints = Math.round(percent * 100);
    if (
      !Number.isFinite(percent) ||
      basisPoints / 100 !== percent ||
      percent !== 9
    ) {
      return Response.json(
        {
          error:
            'The current Seller Marketplace Agreement requires a 9% commission.',
        },
        { status: 400 },
      );
    }
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const requestId =
      typeof body.requestId === 'string' && body.requestId
        ? body.requestId
        : crypto.randomUUID();
    await setMarketplaceCommission(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        basisPoints,
        actorId: staff.id,
        requestId,
        reason,
        now: Date.now(),
      },
    );
    return Response.json({ ok: true, basisPoints, percent });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof RangeError)
      return Response.json({ error: error.message }, { status: 400 });
    return Response.json(
      { error: 'The commission setting could not be updated.' },
      { status: 500 },
    );
  }
}
