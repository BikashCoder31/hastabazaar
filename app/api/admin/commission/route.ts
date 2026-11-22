import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  CommissionConflictError,
} from '@/lib/db/repositories/commission-rates';
import {
  percentToBasisPoints,
} from '@/lib/commission/rates';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BusinessSettingConflictError, initializeLocalLaunchCommission } from '@/lib/db/repositories/business-settings';

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
    if (body.action === 'initialize_launch') {
      const bindings = env as unknown as Record<string, string | undefined>;
      if (staff.role !== 'super_admin' || process.env.NODE_ENV !== 'development' ||
        bindings.HASTABAZAAR_RUNTIME_ENV !== 'local_staging' || bindings.APP_ORIGIN !== 'http://localhost:3018' ||
        new URL(request.url).origin !== bindings.APP_ORIGIN)
        return json({ error: 'Initial commission setup is restricted to the local development Super Admin.' }, 403);
      if (!body.expectedVersions || typeof body.expectedVersions !== 'object' || Array.isArray(body.expectedVersions))
        return json({ error: 'Refresh the initial commission versions before saving.' }, 400);
      const receipt = await initializeLocalLaunchCommission(db, { ...common,
        basisPoints: percentToBasisPoints(body.percent), expectedVersions: body.expectedVersions as Record<string, unknown>,
        environment: { runtimeEnvironment: bindings.HASTABAZAAR_RUNTIME_ENV, nodeEnvironment: process.env.NODE_ENV, appOrigin: bindings.APP_ORIGIN } });
      return json({ ok: true, ...receipt }, 201);
    }
    if (body.action === 'schedule' && typeof body.effectiveAt === 'string') {
      if(staff.role!=='super_admin')return json({error:'A current Super Admin must publish fee policies.'},403);
      percentToBasisPoints(body.percent);
      return json({error:'Publish both covered routes together in Commission.',href:'/admin/commission#rate-management'},409);
    }
    if (body.action === 'cancel' && typeof body.rateId === 'string') {
      return json({error:'Review cancellation of the exact paired schedule in Commission.',href:'/admin/commission#rate-management'},409);
    }
    return json({ error: 'Choose a valid commission action.' }, 400);
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof CommissionConflictError || error instanceof BusinessSettingConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof RangeError) return json({ error: error.message }, 400);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    return json({ error: 'The commission change could not be saved.' }, 500);
  }
}
