import { env } from 'cloudflare:workers';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { cleanupSellerDrafts } from '@/lib/sellers/draft-store';

/** Scheduler credential shared with the existing private maintenance scheduler. */
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket; ORDER_EMAIL_JOB_SECRET?: string };
  const secret = bindings.ORDER_EMAIL_JOB_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!secret || secret.length < 32 || !supplied || supplied.length > 512)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [left, right] = await Promise.all([digest(secret), digest(supplied)]);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  if (difference) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const deleted = await cleanupSellerDrafts(requireDatabase(bindings), requireMediaBucket(bindings));
  return Response.json({ deleted, batchLimit: 20 }, { headers });
}
