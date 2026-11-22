import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { BodyTooLargeError, readBoundedForm } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {
  CategoryImageError, publishedTaxonomyMedia, taxonomyImageNotFound, taxonomyImageResponse,
  taxonomyMediaForAdmin, uploadTaxonomyImage,
} from './category-media';
import type { TaxonomyKind } from './taxonomy-image-storage';

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function uploadTaxonomyImageRequest(request: Request, kind: TaxonomyKind) {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireStaffApi('catalog.manage');
    const form = await readBoundedForm(request, 9 * 1024 * 1024);
    const file = form.get('file');
    const requestId = form.get('requestId');
    if (!(file instanceof File) || typeof requestId !== 'string')
      throw new CategoryImageError(`Choose a ${kind} image and a valid upload request reference.`);
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const media = await uploadTaxonomyImage(requireDatabase(bindings), requireMediaBucket(bindings), { kind, file, actorId: actor.id, requestId, now: Date.now() });
    return json({ media: { id: media.id, originalName: media.originalName, width: media.width, height: media.height, sizeBytes: media.sizeBytes } }, 201);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    if (error instanceof CategoryImageError) return json({ error: error.message }, 400);
    const label = kind === 'category' ? 'Category' : 'Occasion';
    return json({ error: `${label} image could not be uploaded. Try again.` }, 500);
  }
}

export async function previewTaxonomyImageRequest(kind: TaxonomyKind, params: Promise<{ id: string }>) {
  try {
    const actor = await requireStaffApi('catalog.manage');
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const { id } = await params;
    const media = await taxonomyMediaForAdmin(requireDatabase(bindings), kind, id, actor.id);
    return await taxonomyImageResponse(media, requireMediaBucket(bindings), kind);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    return taxonomyImageNotFound(kind);
  }
}

export async function publishedTaxonomyImageRequest(kind: TaxonomyKind, params: Promise<{ id: string }>) {
  try {
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const { id } = await params;
    const media = await publishedTaxonomyMedia(requireDatabase(bindings), kind, id);
    return await taxonomyImageResponse(media, requireMediaBucket(bindings), kind);
  } catch {
    return taxonomyImageNotFound(kind);
  }
}
