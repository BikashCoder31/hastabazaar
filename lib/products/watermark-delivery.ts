import { createHash } from 'node:crypto';
import { readBoundedBody } from '../http/bounded-body';
import { renderProductWatermark, maximumProductWatermarkBytes, productWatermarkRendererVersion } from './watermark';
import { validateProductWatermarkPolicy, type ProductWatermarkPolicy } from './watermark-policy';

export const productPhotoHeaders = Object.freeze({
  'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
});
export function productPhotoUnavailable(): Response {
  return Response.json({ error: 'Product image processing is unavailable. Try again shortly.' }, {
    status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30', 'X-Content-Type-Options': 'nosniff' },
  });
}
// Called only after the product route has checked eligibility or seller/staff ownership.
// Derived objects remain private and cannot bypass that check on cache hits.
export async function productPhotoResponse(options: {
  bucket: R2Bucket; mediaId: string; objectKey: string; mimeType: string;
  policy: ProductWatermarkPolicy; policyVersion: string;
}): Promise<Response> {
  try {
    const policy = validateProductWatermarkPolicy(options.policy);
    const original = await options.bucket.get(options.objectKey);
    if (!original) return Response.json({ error: 'Image not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    if (original.size > maximumProductWatermarkBytes) return productPhotoUnavailable();
    const bytes = await readBoundedBody(new Request('http://internal.invalid/photo', { method: 'POST', body: original.body, duplex: 'half' } as RequestInit), maximumProductWatermarkBytes);
    const hash = createHash('sha256').update(bytes).update(JSON.stringify([productWatermarkRendererVersion, options.mimeType, policy, options.policyVersion])).digest('hex');
    const key = 'private/product-watermarks/' + encodeURIComponent(options.mediaId) + '/' + hash + '.webp';
    const cached = await options.bucket.get(key);
    if (cached) return new Response(cached.body, { headers: productPhotoHeaders });
    const rendered = await renderProductWatermark(bytes, options.mimeType, policy);
    await options.bucket.put(key, rendered.bytes, {
      httpMetadata: { contentType: rendered.mimeType },
      customMetadata: { purpose: 'product-watermark', mediaId: options.mediaId, renderer: productWatermarkRendererVersion },
    });
    return new Response(rendered.bytes as BodyInit, { headers: productPhotoHeaders });
  } catch { return productPhotoUnavailable(); }
}
