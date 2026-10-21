import { hasStaffPermissionBySubject } from '@/lib/db/repositories/staff-permissions';
import { env } from 'cloudflare:workers';

import { getAuthenticatedUser } from '@/app/auth';
import { RECEIPT_COOKIE, hashOpaqueToken, readCookie } from '@/lib/cart/session';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { getReturnEvidenceAccess } from '@/lib/db/repositories/returns';
import { inlineFileDisposition } from '@/lib/http/content-disposition';

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
    const identity = await getAuthenticatedUser();
    if (identity) {
      authorised = (await hasStaffPermissionBySubject(database, identity.userId, 'support.manage')) || Boolean(
        await database
          .prepare(
            `SELECT 1 FROM users
             LEFT JOIN user_roles ON user_roles.user_id = users.id
             LEFT JOIN seller_profiles ON seller_profiles.user_id = users.id
             WHERE users.auth_subject = ? AND users.status = 'active'
               AND seller_profiles.id = ?
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
  return new Response(object.body, {
    headers: {
      'content-type': evidence.mimeType,
      'content-disposition': inlineFileDisposition(evidence.originalName),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
