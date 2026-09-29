import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { productPhotoResponse, productPhotoUnavailable } from '@/lib/products/watermark-delivery';
import { hasStaffPermissionBySubject } from '@/lib/db/repositories/staff-permissions';
import { env } from 'cloudflare:workers';

import { getAuthenticatedUser } from '@/app/auth';
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
  if (await hasStaffPermissionBySubject(database, authSubject, 'product.review')) return true;
  return Boolean(
    await database
      .prepare(
        `SELECT 1
         FROM users
         LEFT JOIN user_roles ON user_roles.user_id = users.id
         LEFT JOIN seller_profiles ON seller_profiles.user_id = users.id
         WHERE users.auth_subject = ? AND users.status = 'active'
           AND (
             (user_roles.role = 'seller' AND seller_profiles.id = ? AND seller_profiles.status = 'approved')
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
    const identity = await getAuthenticatedUser();
    if (!identity || !(await canViewPrivateMedia(database, identity.userId, media.sellerId))) {
      return notFound();
    }
  }

  if (['image/jpeg', 'image/png', 'image/webp'].includes(media.mimeType)) {
    try {
      const setting = await getEffectiveBusinessSetting(database, 'product_photo_watermark', Date.now());
      return productPhotoResponse({ bucket: requireMediaBucket(bindings), mediaId: id,
        objectKey: media.objectKey, mimeType: media.mimeType, policy: setting.value,
        policyVersion: setting.versionId ?? 'default' });
    } catch { return productPhotoUnavailable(); }
  }
  const object = await requireMediaBucket(bindings).get(media.objectKey);
  if (!object) return notFound();
  const mimeType = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']).has(media.mimeType)
    ? media.mimeType
    : 'application/octet-stream';
  return new Response(object.body, {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ETag: object.httpEtag,
    },
  });
}
