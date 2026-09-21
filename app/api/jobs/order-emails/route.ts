import { env } from 'cloudflare:workers';
import { runScheduledEmailOutbox } from '@/lib/email/outbox-runner';

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
  const result = await runScheduledEmailOutbox({ limit: 12 });
  const failed =
    'business' in result
      ? result.business.failed + result.orders.failed
      : 0;
  return Response.json(result, {
    status: 'pending' in result || failed ? 503 : 200,
    headers,
  });
}
