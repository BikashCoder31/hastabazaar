import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { getProductMediaObject } from '@/lib/db/repositories/products';

export const dynamic = 'force-dynamic';

function notFound(): Response {
  return Response.json(
    { error: 'Image not found.' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

async function canViewPrivateMedia(
  database: D1Database,
  authSubject: string,
  sellerId: string,
): Promise<boolean> {
  return Boolean(
    await database
      .prepare(
        `SELECT 1
         FROM users
         LEFT JOIN user_roles ON user_roles.user_id = users.id
         LEFT JOIN seller_profiles ON seller_profiles.user_id = users.id
         WHERE users.auth_subject = ? AND users.status = 'active'
           AND (
             user_roles.role IN ('admin', 'super_admin')
             OR (user_roles.role = 'seller' AND seller_profiles.id = ? AND seller_profiles.status = 'approved')
           )
         LIMIT 1`,
      )
      .bind(authSubject, sellerId)
      .first(),
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
  const database = requireDatabase(bindings);
  const media = await getProductMediaObject(database, id);
  if (!media) return notFound();

  const isPublic = media.productStatus === 'published';
  if (!isPublic) {
    const identity = await getChatGPTUser();
    if (!identity || !(await canViewPrivateMedia(database, identity.userId, media.sellerId))) {
      return notFound();
    }
  }

  const object = await requireMediaBucket(bindings).get(media.objectKey);
  if (!object) return notFound();
  const mimeType = new Set(['image/jpeg', 'image/png', 'image/webp']).has(media.mimeType)
    ? media.mimeType
    : 'application/octet-stream';
  return new Response(object.body, {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': isPublic ? 'public, max-age=86400' : 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ETag: object.httpEtag,
    },
  });
}
