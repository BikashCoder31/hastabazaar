import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  archiveHomepageHeroMedia,
  getHomepageHeroMediaForAdmin,
  homepageHeroStaticAssetPath,
} from '@/lib/db/repositories/homepage-hero';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

type HeroBindings = { DB?: D1Database; MEDIA?: R2Bucket };

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireStaffApi('business_settings.view');
    const { id } = await context.params;
    const bindings = env as unknown as HeroBindings;
    const media = await getHomepageHeroMediaForAdmin(requireDatabase(bindings), id);
    if (!media) return json({ error: 'Homepage hero media was not found.' }, 404);
    const staticPath = homepageHeroStaticAssetPath(media);
    if (staticPath) return Response.redirect(new URL(staticPath, request.url), 307);
    const object = await requireMediaBucket(bindings).get(media.objectKey);
    if (!object) return json({ error: 'Homepage hero media was not found.' }, 404);
    return new Response(object.body, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Type': media.mimeType,
        'X-Content-Type-Options': 'nosniff',
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof RangeError) {
      return json({ error: 'Homepage hero media was not found.' }, 404);
    }
    return json({ error: 'Homepage hero media could not be opened.' }, 500);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }
  try {
    const actor = await requireStaffApi('business_settings.manage');
    const { id } = await context.params;
    const bytes = await readBoundedBody(request, 16 * 1024);
    const body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new TypeError('Invalid archive request.');
    }
    const values = body as Record<string, unknown>;
    await archiveHomepageHeroMedia(
      requireDatabase(env as unknown as HeroBindings),
      {
        id,
        actorId: actor.id,
        reason: typeof values.reason === 'string' ? values.reason : '',
        requestId:
          typeof values.requestId === 'string'
            ? values.requestId
            : request.headers.get('x-request-id') ?? crypto.randomUUID(),
        now: Date.now(),
      },
    );
    return json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof BodyTooLargeError) {
      return json({ error: error.message }, 413);
    }
    if (error instanceof RangeError || error instanceof TypeError) {
      return json({ error: error.message }, 400);
    }
    const message = error instanceof Error ? error.message : '';
    if (/retained version|built-in/i.test(message)) {
      return json({ error: message }, 409);
    }
    if (/not found/i.test(message)) {
      return json({ error: 'Homepage hero media was not found.' }, 404);
    }
    return json({ error: 'Homepage hero media could not be archived.' }, 400);
  }
}
