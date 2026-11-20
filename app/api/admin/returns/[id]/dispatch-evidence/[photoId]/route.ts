import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { hasActorIntentMismatch } from '@/lib/http/actor-intent';
import { evidenceFileDisposition } from '@/lib/http/content-disposition';
import { getSellerDispatchPhotoForCase, sellerDispatchPhotoReadEnabled } from '@/lib/orders/seller-dispatch-evidence';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status: number) =>
  Response.json(data, { status, headers: { 'cache-control': 'private, no-store' } });

export async function GET(request: Request, context: { params: Promise<{ id: string; photoId: string }> }) {
  try {
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const db = requireDatabase(bindings);
    if (!sellerDispatchPhotoReadEnabled(db)) return json({ error: 'Dispatch photo not found.' }, 404);
    const staff = await requireStaffApi('support.manage');
    if (hasActorIntentMismatch(request, staff.id)) return json({ error: 'Evidence access changed.' }, 403);
    const { id: caseId, photoId } = await context.params;
    const photo = await getSellerDispatchPhotoForCase(db, caseId, photoId, staff.id);
    if (!photo || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimeType)) {
      return json({ error: 'Dispatch photo not found.' }, 404);
    }
    const object = await requireMediaBucket(bindings).get(photo.objectKey);
    if (!object) return json({ error: 'Dispatch photo not found.' }, 404);
    const current = await requireStaffApi('support.manage');
    if (current.id !== staff.id || hasActorIntentMismatch(request, current.id)) {
      return json({ error: 'Evidence access changed.' }, 403);
    }
    return new Response(object.body, {
      headers: {
        'content-type': photo.mimeType,
        'content-disposition': evidenceFileDisposition('dispatch-photo', photo.mimeType),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
      },
    });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    return json({ error: 'Dispatch evidence could not be read.' }, 503);
  }
}
