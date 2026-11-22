import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { emailQueueSummary } from '@/lib/operations/email-queue';
import { readSystemHealthWorkspace } from '@/lib/operations/system-health-workspace';
import {
  inspectCurrentDatabaseReadiness,
  inspectLocalApplicationLiveness,
} from '@/lib/operations/system-health-monitor';
import type { DeliveryMailService } from '@/lib/email/delivery-attempts';
import { healthRequestContext } from '../evidence';
import { systemHealthChecks } from '../check-model';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, X-Hastabazaar-Actor' };
  const intendedActorId = request.headers.get('X-Hastabazaar-Actor');
  if (!intendedActorId) return Response.json({ error: 'Refresh the staff workspace.' }, { status: 403, headers });

  try {
    const actor = await requireStaffApi('system.health.view', { intendedActorId });
    const { bindings, db, scope } = healthRequestContext();
    if (scope.environment === 'unknown') {
      return Response.json({ error: 'Health check scope is unavailable.' }, { status: 503, headers });
    }

    // Operator checks read live readiness and existing evidence. Only the
    // scheduled, secret-protected jobs publish observations and incidents.
    const [overview, website, database, queue] = await Promise.all([
      readSystemHealthWorkspace(db, actor.id, scope),
      inspectLocalApplicationLiveness(db, bindings).catch(() => null),
      inspectCurrentDatabaseReadiness(db, bindings).catch(() => null),
      emailQueueSummary(db, scope.now, (bindings as { EMAIL?: DeliveryMailService }).EMAIL).catch(() => null),
    ]);
    await requireStaffApi('system.health.view', { intendedActorId });
    const orderMail = queue?.pending == null ? null : {
      pending: queue.pending,
      oldestAgeMinutes: queue.oldestAgeMinutes,
      overdueFirstAttempts: queue.overdueFirstAttempts,
      exhausted: queue.exhausted ?? 0,
      uncertain: queue.uncertain ?? 0,
      providerBlockedUntil: queue.providerBlockedUntil,
    };
    return Response.json({
      checks: systemHealthChecks(overview.services, { website, database, orderMail }),
      checkedAt: scope.now,
    }, { headers });
  } catch (error) {
    const status = error instanceof StaffAuthorizationError ? error.status : 503;
    return Response.json({ error: 'The checks could not be completed.' }, { status, headers });
  }
}
