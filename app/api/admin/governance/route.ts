import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  OperationsConflictError,
  performGovernanceAction,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('catalog.manage');
    const body = (await request.json()) as {
      action?: string;
      requestId?: string;
      data?: Record<string, unknown>;
    };
    if (!body.action || !body.requestId || !body.data)
      return Response.json(
        { error: 'Action, data and request identifier are required.' },
        { status: 400 },
      );
    await performGovernanceAction(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        actorId: staff.id,
        actorRole: staff.role,
        action: body.action,
        requestId: body.requestId,
        data: body.data,
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
      { error: 'Governance operation failed.' },
      { status: 500 },
    );
  }
}
