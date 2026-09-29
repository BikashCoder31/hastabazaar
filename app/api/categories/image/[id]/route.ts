import { env } from 'cloudflare:workers';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { publishedCategoryMedia, categoryImageResponse } from '@/lib/catalog/category-media';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const { id } = await params;
    return await categoryImageResponse(await publishedCategoryMedia(requireDatabase(bindings), id), requireMediaBucket(bindings));
  } catch {
    return Response.json({ error: 'Category image was not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}
