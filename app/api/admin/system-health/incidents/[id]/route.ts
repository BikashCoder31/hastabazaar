import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { readEmailHealthRuntimeConfig } from '@/lib/operations/email-delivery-overview';
import {
  readIncident,
  IncidentConflict,
} from '@/lib/operations/incident-review';
async function requireIncidentReader() {
  try {
    return await requireStaffApi('system.health.view');
  } catch (error) {
    if (!(error instanceof StaffAuthorizationError) || error.status !== 403)
      throw error;
    return requireStaffApi('system.incidents.manage');
  }
}
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = { 'cache-control': 'no-store' };
  try {
    const actor = await requireIncidentReader(),
      db = requireDatabase(env),
      now = Date.now(),
      scope = readEmailHealthRuntimeConfig(
        { ...env, NODE_ENV: process.env.NODE_ENV },
        now,
      );
    if (!scope.environment)
      return Response.json(
        { error: 'Current runtime scope is unavailable.' },
        { status: 503, headers },
      );
    return Response.json(
      {
        environment: scope.environment,
        incident: await readIncident(
          db,
          actor.id,
          (await context.params).id,
          scope.environment,
          now,
        ),
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof StaffAuthorizationError ||
          error instanceof IncidentConflict
            ? error.message
            : 'Incident history is unavailable.',
      },
      {
        status:
          error instanceof StaffAuthorizationError
            ? error.status
            : error instanceof IncidentConflict
              ? 404
              : 503,
        headers,
      },
    );
  }
}
