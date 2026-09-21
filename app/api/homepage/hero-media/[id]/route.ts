import { env } from 'cloudflare:workers';

import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  getPublishedHomepageHeroMedia,
  homepageHeroStaticAssetPath,
} from '@/lib/db/repositories/homepage-hero';

export const dynamic = 'force-dynamic';

const notFound = () =>
  Response.json(
    { error: 'Homepage hero media was not found.' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );

type HeroBindings = { DB?: D1Database; MEDIA?: R2Bucket };

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const bindings = env as unknown as HeroBindings;
    const media = await getPublishedHomepageHeroMedia(
      requireDatabase(bindings),
      id,
      Date.now(),
    );
    if (!media) return notFound();
    const staticPath = homepageHeroStaticAssetPath(media);
    if (staticPath) return Response.redirect(new URL(staticPath, request.url), 307);
    const object = await requireMediaBucket(bindings).get(media.objectKey);
    if (!object) return notFound();
    return new Response(object.body, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'Content-Type': media.mimeType,
        'X-Content-Type-Options': 'nosniff',
        ETag: object.httpEtag,
      },
    });
  } catch {
    return notFound();
  }
}
