import { env } from 'cloudflare:workers';

import {
  requireStaffApi,
  StaffAuthorizationError,
} from '@/lib/auth/staff';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { getSellerProfileMediaForStaff } from '@/lib/db/repositories/seller-applications';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireStaffApi('seller.application.review');
    const { id } = await context.params;
    const bindings = env as unknown as {
      DB?: D1Database;
      MEDIA?: R2Bucket;
    };
    const media = await getSellerProfileMediaForStaff(
      requireDatabase(bindings),
      id,
    );
    if (!media) return json({ error: 'Maker profile media not found.' }, 404);

    const object = await requireMediaBucket(bindings).get(media.objectKey);
    if (!object) return json({ error: 'Maker profile media file not found.' }, 404);

    const safeName = media.originalName
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/[\r\n"\\]/g, '_');
    const safeMimeType = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ]).has(media.mimeType)
      ? media.mimeType
      : 'application/octet-stream';

    return new Response(object.body, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Type': safeMimeType,
        'Content-Disposition': `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(media.originalName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'The maker profile media could not be opened.' }, 500);
  }
}
