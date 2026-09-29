import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { CategoryImageError, uploadCategoryImage } from '@/lib/catalog/category-media';
import { BodyTooLargeError, readBoundedForm } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireStaffApi('catalog.manage');
    const form = await readBoundedForm(request, 9 * 1024 * 1024);
    const file = form.get('file');
    const requestId = form.get('requestId');
    if (!(file instanceof File) || typeof requestId !== 'string') throw new CategoryImageError('Choose a category image and a valid upload request reference.');
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const media = await uploadCategoryImage(requireDatabase(bindings), requireMediaBucket(bindings), { file, actorId: actor.id, requestId, now: Date.now() });
    return json({ media: { id: media.id, originalName: media.originalName, width: media.width, height: media.height, sizeBytes: media.sizeBytes } }, 201);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    if (error instanceof CategoryImageError) return json({ error: error.message }, 400);
    return json({ error: 'Category image could not be uploaded. Try again.' }, 500);
  }
}
