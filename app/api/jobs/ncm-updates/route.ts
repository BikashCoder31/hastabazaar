import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { runNcmUpdateCheck } from '@/lib/delivery/ncm-events';
import { authorizedEmailJob } from '@/lib/email/job-auth';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const bindings = env as unknown as { DB?: D1Database; ORDER_EMAIL_JOB_SECRET?: string };
  if (!await authorizedEmailJob(request, bindings.ORDER_EMAIL_JOB_SECRET))
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const result = await runNcmUpdateCheck(requireDatabase(bindings), bindings);
    return Response.json(result, { status: result.ok ? 200 : 503, headers });
  } catch {
    return Response.json({ error: 'NCM updates are unavailable. Saved receipts are retained.' }, { status: 503, headers });
  }
}
