import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  CommissionConflictError,
  scheduleCommissionRate,
  cancelCommissionRate,
} from '@/lib/db/repositories/commission-rates';
import {
  parseNepalDateTime,
  percentToBasisPoints,
} from '@/lib/commission/rates';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const staff = await requireStaffApi('commercial_policy.manage');
    const body = (await request.json()) as Record<string, unknown>;
    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.requestId !== 'string' ||
      typeof body.reason !== 'string' ||
      typeof body.expectedRevision !== 'number'
    )
      return json(
        { error: 'Reload Commission and complete the change form.' },
        400,
      );
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const common = {
      actorId: staff.id,
      requestId: body.requestId,
      expectedRevision: body.expectedRevision,
      reason: body.reason,
      now: Date.now(),
    };
    if (body.action === 'schedule' && typeof body.effectiveAt === 'string') {
      const result = await scheduleCommissionRate(db, {
        ...common,
        basisPoints: percentToBasisPoints(body.percent),
        effectiveAt: parseNepalDateTime(body.effectiveAt),
      });
      return json({ ok: true, id: result.id });
    }
    if (body.action === 'cancel' && typeof body.rateId === 'string') {
      await cancelCommissionRate(db, { ...common, rateId: body.rateId });
      return json({ ok: true });
    }
    return json({ error: 'Choose a valid commission action.' }, 400);
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof CommissionConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof RangeError) return json({ error: error.message }, 400);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    return json({ error: 'The commission change could not be saved.' }, 500);
  }
}
