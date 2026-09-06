import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { RECEIPT_COOKIE, hashOpaqueToken, readCookie } from '@/lib/cart/session';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { getReturnEvidenceAccess } from '@/lib/db/repositories/returns';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status: number) => Response.json(data, { status, headers: { 'cache-control': 'private, no-store' } });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
  const database = requireDatabase(bindings);
  const { id } = await context.params;
  const evidence = await getReturnEvidenceAccess(database, id);
  if (!evidence) return json({ error: 'Evidence not found.' }, 404);

  let authorised = false;
  const receiptToken = readCookie(request, RECEIPT_COOKIE);
  if (receiptToken && evidence.receiptTokenHash) {
    authorised = (await hashOpaqueToken(receiptToken)) === evidence.receiptTokenHash;
  }
  if (!authorised) {
    const identity = await getChatGPTUser();
    if (identity) {
      authorised = Boolean(
        await database
          .prepare(
            `SELECT 1 FROM users
             LEFT JOIN user_roles ON user_roles.user_id = users.id
             LEFT JOIN seller_profiles ON seller_profiles.user_id = users.id
             WHERE users.auth_subject = ? AND users.status = 'active'
               AND (user_roles.role IN ('admin', 'super_admin') OR seller_profiles.id = ?)
             LIMIT 1`,
          )
          .bind(identity.userId, evidence.sellerId)
          .first(),
      );
    }
  }
  if (!authorised) return json({ error: 'Evidence access is not permitted.' }, 403);
  const object = await requireMediaBucket(bindings).get(evidence.objectKey);
  if (!object) return json({ error: 'Evidence file not found.' }, 404);
  const safeName = evidence.originalName.replace(/[\r\n"\\]/g, '_');
  return new Response(object.body, {
    headers: {
      'content-type': evidence.mimeType,
      'content-disposition': `inline; filename="${safeName}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
