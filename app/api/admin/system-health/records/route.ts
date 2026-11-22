import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { searchSystemRecords } from '@/lib/operations/system-records';
import { formHealthRuntimeScope, FormHealthAccessError } from '@/lib/operations/form-health';
import { readEmailHealthRuntimeConfig } from '@/lib/operations/email-delivery-overview';
import { readSystemHealthWorkspace } from '@/lib/operations/system-health-workspace';
import { overviewHealthChecks } from '@/components/admin/overview-health-model';

export async function GET(request: Request) {
  const headers = { 'cache-control': 'private, no-store', Vary: 'Cookie' };
  try {
    const actor = await requireStaffApi('system.health.view');
    const params = new URL(request.url).searchParams;
    const bindings = env as unknown as Record<string, string | undefined>;
    const scope = formHealthRuntimeScope(bindings);
    if (params.size === 1 && params.get('view') === 'today-checks') {
      if (request.headers.get('X-Hastabazaar-Actor') !== actor.id) {
        return Response.json({ error: 'The staff account changed.' }, { status: 403, headers });
      }
      const email = readEmailHealthRuntimeConfig(bindings, scope.now);
      const raw = bindings.SYSTEM_HEALTH_EXPECTED_SINCE;
      const expected = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
      const health = await readSystemHealthWorkspace(requireDatabase(env as unknown as { DB?: D1Database }), actor.id, {
        ...scope, expectedSince: email.expectedSince,
        systemExpectedSince: Number.isSafeInteger(expected) && expected > 0 && expected <= scope.now ? expected : null,
      });
      return Response.json({ checks: overviewHealthChecks(health) }, { headers });
    }
    if ([...params.keys()].some(key => !['reference', 'type', 'actor', 'from', 'to', 'status', 'action'].includes(key))) {
      return Response.json({ error: 'Use the scoped record filters.' }, { status: 400, headers });
    }
    const filters = Object.fromEntries(params);
    return Response.json(await searchSystemRecords(requireDatabase(env as unknown as { DB?: D1Database }), actor.id, {
      ...filters, environment: scope.environment,
    }), { headers });
  } catch (error) {
    const denied = error instanceof StaffAuthorizationError || error instanceof FormHealthAccessError;
    return Response.json({ error: denied ? error.message : 'The scoped records could not be read. Check the filters and current access.' }, {
      status: denied ? error.status : 400, headers,
    });
  }
}
