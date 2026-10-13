import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { canViewRiderEvidence } from '@/lib/riders/media-access';
export const dynamic = 'force-dynamic';
const missing = () =>
  Response.json(
    { error: 'Evidence not found.' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const identity = await getAuthenticatedUser();
  if (!identity) return missing();
  const { id } = await context.params,
    bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket },
    db = requireDatabase(bindings),
    isIdentity = new URL(request.url).searchParams.get('kind') === 'identity';
  if (!(await canViewRiderEvidence(db, identity.userId, '', id, isIdentity)))
    return missing();
  const row = await db
    .prepare(
      isIdentity
        ? 'SELECT a.object_key AS objectKey,a.mime_type AS mime,a.user_id AS owner FROM rider_applications a WHERE a.id=?'
        : 'SELECT r.object_key AS objectKey,r.mime_type AS mime,r.rider_user_id AS owner FROM rider_reports r WHERE r.id=?',
    )
    .bind(id)
    .first<{ objectKey: string | null; mime: string; owner: string }>();
  if (!row?.objectKey) return missing();
  if (
    !row.objectKey.startsWith(
      isIdentity ? 'private/rider-identity/' : 'private/rider-proof/',
    )
  )
    return missing();
  const object = await requireMediaBucket(bindings).get(row.objectKey);
  if (!object) return missing();
  return new Response(object.body, {
    headers: {
      'Content-Type': [
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
      ].includes(row.mime)
        ? row.mime
        : 'application/octet-stream',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self'; media-src 'self'",
      ETag: object.httpEtag,
    },
  });
}
