import {
  homepageHeroStaticAssetPath,
  homepageHeroStaticAssets,
} from '../homepage/hero-static-assets';
import type { ApplicationMedia } from './d1-source';

const MAX_BYTES = 2 * 1024 * 1024;
type MediaRow = {
  id: string;
  objectKey: string;
  mimeType: 'image/webp';
  sizeBytes: number;
};

/** Paths come only from the rendering registry; neither database URLs nor
 * request/archive input can select a remote file or bypass upload checks. */
export async function homepageHeroApplicationMedia(
  db: D1Database,
  origin: string | undefined,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ApplicationMedia[]> {
  let trusted: URL;
  try {
    trusted = new URL(origin ?? '');
    if (
      trusted.username ||
      trusted.password ||
      trusted.pathname !== '/' ||
      trusted.search ||
      trusted.hash ||
      (trusted.protocol !== 'https:' &&
        !(
          trusted.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(trusted.hostname)
        ))
    )
      throw Error();
  } catch {
    throw new Error(
      'The configured application origin is not safe for built-in media backup.',
    );
  }
  const assets = homepageHeroStaticAssets();
  const result = await db
    .prepare(
      `SELECT id,object_key AS objectKey,mime_type AS mimeType,size_bytes AS sizeBytes FROM homepage_hero_media WHERE id IN (${assets.map(() => '?').join(',')})`,
    )
    .bind(...assets.map((asset) => asset.id))
    .all<MediaRow>();
  if (!result.success)
    throw new Error('Built-in homepage media inventory could not be read.');
  const rows = new Map(result.results.map((row) => [row.id, row]));
  return assets.flatMap((asset) => {
    const row = rows.get(asset.id);
    if (!row) return [];
    const path = homepageHeroStaticAssetPath(row);
    if (!path || path !== asset.path)
      throw new Error(
        'A built-in homepage media identity does not match its trusted registry.',
      );
    if (
      !Number.isSafeInteger(row.sizeBytes) ||
      row.sizeBytes < 1 ||
      row.sizeBytes > MAX_BYTES
    )
      throw new Error('Built-in homepage media size is invalid.');
    const metadata = {
      namespace: 'public',
      key: asset.objectKey,
      size: row.sizeBytes,
      contentType: 'image/webp',
      httpMetadata: { contentType: 'image/webp' },
      customMetadata: { portabilitySource: 'application-static' },
    };
    return [
      {
        metadata,
        async open() {
          const timeout = AbortSignal.timeout(15000),
            readSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
          const response = await fetcher(new URL(path, trusted.origin).href, {
            redirect: 'manual',
            cache: 'no-store',
            credentials: 'omit',
            signal: readSignal,
          });
          if (
            response.status !== 200 ||
            response.headers
              .get('content-type')
              ?.split(';')[0]
              .trim()
              .toLowerCase() !== 'image/webp' ||
            !response.body
          ) {
            await response.body?.cancel();
            throw new Error(
              'A built-in homepage file is missing, redirected or has the wrong type.',
            );
          }
          const reader = response.body.getReader(),
            chunks: Uint8Array[] = [];
          let size = 0;
          try {
            for (;;) {
              readSignal.throwIfAborted();
              const value = await reader.read();
              if (value.done) break;
              size += value.value.byteLength;
              if (size > MAX_BYTES || size > metadata.size)
                throw new Error(
                  'A built-in homepage file exceeds its recorded size.',
                );
              chunks.push(value.value);
            }
          } finally {
            try {
              await reader.cancel();
            } finally {
              reader.releaseLock();
            }
          }
          if (size !== metadata.size)
            throw new Error(
              'A built-in homepage file differs from its recorded size.',
            );
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          return {
            ...metadata,
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes);
                controller.close();
              },
            }),
          };
        },
      },
    ];
  });
}
