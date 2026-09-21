import { env } from 'cloudflare:workers';
import { runScheduledEmailOutbox } from '@/lib/email/outbox-runner';
import { requireDatabase } from '@/lib/db/d1';
import { applyDueRouteTransitions } from '@/lib/managed-commerce/route-transition';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';

// Scheduler-only endpoint. Never put the bearer credential in a URL.
export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  const secret = (env as unknown as { ORDER_EMAIL_JOB_SECRET?: string })
    .ORDER_EMAIL_JOB_SECRET;
  const supplied = request.headers
    .get('authorization')
    ?.replace(/^Bearer /, '');
  if (!secret || secret.length < 32 || !supplied || supplied.length > 512)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    );
  const [a, b] = await Promise.all([digest(secret), digest(supplied)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const bindings = env as unknown as {
    DB?: D1Database;
    HASTABAZAAR_RUNTIME_ENV?: string;
    APP_ORIGIN?: string;
  };
  const runtime = resolveRuntimeEnvironment({
    runtimeEnvironment: bindings.HASTABAZAAR_RUNTIME_ENV,
    nodeEnvironment: process.env.NODE_ENV,
    appOrigin: bindings.APP_ORIGIN,
  });
  const routeTransitionsApplied = runtime.simulationAllowed
    ? await applyDueRouteTransitions(requireDatabase(bindings), Date.now(), runtime)
    : 0;
  const result = await runScheduledEmailOutbox({ limit: 12 });
  const failed =
    'business' in result
      ? result.business.failed + result.orders.failed
      : 0;
  return Response.json({ ...result, routeTransitionsApplied }, {
    status: 'pending' in result || failed ? 503 : 200,
    headers,
  });
}
