import { env } from 'cloudflare:workers';
import { getSellerUser } from '@/lib/auth/seller';
import { CustomerAuthorizationError, requireCustomerApi } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerParticipationForUser } from '@/lib/db/repositories/seller-applications';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { applicationCapabilities } from '@/lib/sellers/participation';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { renderProductWatermark, ProductWatermarkError, maximumProductWatermarkBytes } from '@/lib/products/watermark';
import { productPhotoHeaders, productPhotoUnavailable } from '@/lib/products/watermark-delivery';
export const dynamic = 'force-dynamic';
const json = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json('Cross-site requests are not allowed.', 403);
  try {
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const seller = await getSellerUser();
    let actorId: string;
    if (seller) actorId = seller.userId;
    else {
      const customer = await requireCustomerApi();
      const participation = await getSellerParticipationForUser(database, customer.userId);
      if (!participation || !applicationCapabilities(participation.applicationStage, 'applications_only').prepareProductDrafts)
        return json('Product draft or approved seller access is required.', 403);
      actorId = customer.userId;
    }
    const limit = await consumePublicRequestRateLimit(database, request, {
      scope: 'product-watermark-preview:' + actorId, limit: 120, windowMs: 60 * 60_000,
    });
    if (!limit.allowed) return rateLimitJson(limit);
    const form = await readBoundedForm(request, maximumProductWatermarkBytes + 64 * 1024);
    const files = form.getAll('file');
    if ([...form.keys()].some(key => key !== 'file') || files.length !== 1 || !(files[0] instanceof File))
      return json('Select exactly one product photo for preview.', 400);
    const file = files[0];
    const setting = await getEffectiveBusinessSetting(database, 'product_photo_watermark', Date.now());
    const rendered = await renderProductWatermark(new Uint8Array(await file.arrayBuffer()), file.type, setting.value);
    // Preview is transient: it cannot publish a product or persist originals/derivatives.
    return new Response(rendered.bytes as BodyInit, {
      headers: { ...productPhotoHeaders, 'X-Watermark-Enabled': String(setting.value.enabled) },
    });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return json(error.message, error.status);
    if (error instanceof BodyTooLargeError) return json('The preview request is too large.', 413);
    if (error instanceof ProductWatermarkError) return json(error.message, error.status);
    return productPhotoUnavailable();
  }
}
