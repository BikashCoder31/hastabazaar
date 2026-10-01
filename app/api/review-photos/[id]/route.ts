import { hasStaffPermissionBySubject } from '@/lib/db/repositories/staff-permissions';
import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { getReviewPhotoAccess } from '@/lib/db/repositories/review-extras';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  };
  const missing = () =>
    Response.json({ error: 'Photo not found.' }, { status: 404, headers });
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
  const db = requireDatabase(bindings);
  const { id } = await params;
  const photo = await getReviewPhotoAccess(db, id);
  if (!photo) return missing();
  if (!photo.isPublic) {
    const identity = await getAuthenticatedUser();
    if (!identity) return missing();
    const allowed = await db
      .prepare(
        `SELECT u.id FROM users u LEFT JOIN user_roles r ON r.user_id=u.id WHERE u.auth_subject=? AND u.status='active' AND u.id=? LIMIT 1`,
      )
      .bind(identity.userId, photo.customerId)
      .first();
    if (!allowed && !(await hasStaffPermissionBySubject(db, identity.userId, 'product.review'))) return missing();
  }
  const object = await requireMediaBucket(bindings).get(photo.objectKey);
  if (!object) return missing();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimeType))
    return missing();
  return new Response(object.body, {
    headers: {
      ...headers,
      'content-type': photo.mimeType,
      'content-disposition': 'inline; filename="customer-photo"',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
