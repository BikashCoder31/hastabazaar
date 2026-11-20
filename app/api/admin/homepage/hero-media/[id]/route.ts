import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  archiveHomepageHeroMedia,
  getHomepageHeroMediaForAdmin,
  homepageHeroStaticAssetPath,
  HomepageHeroMediaAuthorizationError,
  HomepageHeroMediaConflictError,
  HomepageHeroMediaWriteUncertainError,
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
    const actor=await requireStaffApi('business_settings.view');
    if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in staff account changed. Reopen the homepage workspace.',403);
    const current=async()=>{const staff=await requireStaffApi('business_settings.view');if(staff.id!==actor.id||hasActorIntentMismatch(request,staff.id))throw new StaffAuthorizationError('Current homepage access changed.',403);};
    const { id } = await context.params;
    const bindings = env as unknown as HeroBindings;
    const media = await getHomepageHeroMediaForAdmin(requireDatabase(bindings), id);
    await current();
    if (!media) return json({ error: 'Homepage hero media was not found.' }, 404);
    const staticPath = homepageHeroStaticAssetPath(media);
    if (staticPath) return Response.redirect(new URL(staticPath, request.url), 307);
    const object = await requireMediaBucket(bindings).get(media.objectKey);
    await current();
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
    if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in staff account changed. Reopen the homepage workspace.',403);
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
      return json({error:error.message,status:'rejected',code:'access_denied_before_write'},error.status);
    }
    if(error instanceof HomepageHeroMediaAuthorizationError)return json({error:error.message,status:'uncertain',code:'outcome_unconfirmed'},403);
    if(error instanceof HomepageHeroMediaConflictError)return json({error:error.message},409);
    if(error instanceof HomepageHeroMediaWriteUncertainError)return json({error:error.message,status:'uncertain',code:'outcome_unconfirmed'},503);
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
