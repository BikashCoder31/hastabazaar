import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  HomepageVisibilityConflictError,
  setHomepageProductVisibility,
} from '@/lib/db/repositories/products';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const staff = await requireStaffApi('admin.invite');
    if (staff.role !== 'super_admin')
      return json({ error: 'Only Super Admin can control homepage products.' }, 403);
    const { id } = await context.params;
    let body: {
      hidden?: unknown;
      expectedVersion?: unknown;
      reason?: unknown;
      requestId?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'The homepage-control request is invalid.' }, 400);
    }
    if (typeof body.hidden !== 'boolean')
      return json({ error: 'Select whether the product is hidden.' }, 400);
    if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 0)
      return json({ error: 'Refresh the product and try again.' }, 400);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 8 || reason.length > 500)
      return json({ error: 'Add a clear reason from 8 through 500 characters.' }, 400);
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!/^[a-zA-Z0-9:_-]{8,191}$/.test(requestId))
      return json({ error: 'The homepage-control request identifier is invalid.' }, 400);

    const result = await setHomepageProductVisibility(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        productId: id,
        actorId: staff.id,
        hidden: body.hidden,
        expectedVersion: Number(body.expectedVersion),
        reason,
        requestId,
        now: Date.now(),
      },
    );
    return json({ ...result, message: 'Homepage visibility updated.' }, 200);
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof HomepageVisibilityConflictError)
      return json({ error: error.message }, 409);
    return json({ error: 'Homepage visibility could not be updated.' }, 500);
  }
}
