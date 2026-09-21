import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  createHomepageHeroMedia,
  listHomepageHeroMediaForAdmin,
} from '@/lib/db/repositories/homepage-hero';
import {
  HomepageHeroMediaError,
  prepareHomepageHeroUpload,
} from '@/lib/homepage/hero-media';
import { BodyTooLargeError, readBoundedForm } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

type HeroBindings = { DB?: D1Database; MEDIA?: R2Bucket };

export async function GET(): Promise<Response> {
  try {
    await requireStaffApi('business_settings.view');
    const database = requireDatabase(env as unknown as HeroBindings);
    return json({ media: await listHomepageHeroMediaForAdmin(database) }, 200);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Homepage hero media could not be loaded.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }
  try {
    const actor = await requireStaffApi('business_settings.manage');
    const form = await readBoundedForm(request, 22 * 1024 * 1024);
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new HomepageHeroMediaError('Choose an image or MP4 file to upload.');
    }
    const prepared = await prepareHomepageHeroUpload(file);
    const id = crypto.randomUUID();
    const objectKey = `private/homepage-hero/${id}`;
    const bindings = env as unknown as HeroBindings;
    const bucket = requireMediaBucket(bindings);
    await bucket.put(objectKey, prepared.bytes, {
      httpMetadata: { contentType: prepared.mimeType },
      customMetadata: { purpose: 'homepage-hero', mediaId: id },
    });
    try {
      const media = await createHomepageHeroMedia(requireDatabase(bindings), {
        id,
        objectKey,
        originalName: prepared.originalName,
        mimeType: prepared.mimeType,
        sizeBytes: prepared.bytes.byteLength,
        width: prepared.width,
        height: prepared.height,
        durationSeconds: prepared.durationSeconds,
        createdBy: actor.id,
        createdAt: Date.now(),
      });
      return json({ media }, 201);
    } catch (error) {
      await bucket.delete(objectKey);
      throw error;
    }
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof BodyTooLargeError) {
      return json({ error: error.message }, 413);
    }
    if (error instanceof HomepageHeroMediaError || error instanceof RangeError) {
      return json({ error: error.message }, 400);
    }
    return json({ error: 'Homepage hero media could not be uploaded.' }, 400);
  }
}
