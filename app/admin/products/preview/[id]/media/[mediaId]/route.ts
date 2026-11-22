import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { CategoryContractError } from '@/lib/products/category-contracts';
import { readProductIntakeMedia } from '@/lib/products/intake-media';
import type { IntakeSnapshot } from '@/lib/products/intake-workspace';
import { previewSource, readProductPreviewSource } from '../../preview-data';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Referrer-Policy': 'no-referrer',
};

const missing = () => new Response(null, { status: 404, headers });

export async function GET(request: Request, context: { params: Promise<{ id: string; mediaId: string }> }) {
  const actor = await getAuthenticatedUser({ readOnly: true });
  if (!actor) return missing();
  const { id, mediaId } = await context.params;
  const query = new URL(request.url).searchParams;
  const source = previewSource(query.get('source'));
  const version = query.get('version');
  if (!source || !version || !/^[A-Za-z0-9_-]{1,160}$/.test(mediaId)) return missing();

  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
  const db = requireDatabase(bindings);
  const readSource = () => readProductPreviewSource(db, actor.userId, id, source);
  const work = await readSource();
  if (!work || work.versionId !== version || !(JSON.parse(work.snapshot) as IntakeSnapshot).mediaIds.includes(mediaId)) return missing();

  try {
    const file = await readProductIntakeMedia(db, requireMediaBucket(bindings), work.actorId, mediaId, work.caseId);
    if ((await readSource())?.versionId !== version) return missing();
    return new Response(file.body, {
      headers: { ...headers, 'Content-Type': file.mimeType, 'Content-Length': String(file.sizeBytes) },
    });
  } catch (error) {
    if (error instanceof CategoryContractError && [403, 404].includes(error.status)) return missing();
    throw error;
  }
}
