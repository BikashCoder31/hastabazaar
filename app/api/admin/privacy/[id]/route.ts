import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  operateDataRightsRequest,
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
    const staff = await requireStaffApi('support.manage');
    const body = (await request.json()) as {
      action?:
        | 'assign'
        | 'request_information'
        | 'approve'
        | 'reject'
        | 'complete';
      note?: string;
      requestId?: string;
    };
    if (!body.action || !body.requestId || body.requestId.length > 100)
      return Response.json(
        { error: 'Action and request identifier are required.' },
        { status: 400 },
      );
    const { id } = await context.params;
    await operateDataRightsRequest(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        id,
        actorId: staff.id,
        actorRole: staff.role,
        action: body.action,
        note: body.note ?? '',
        requestId: body.requestId,
        now: Date.now(),
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Privacy request could not be updated.' },
      { status: 500 },
    );
  }
}
