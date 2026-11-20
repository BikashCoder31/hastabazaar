import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { hasActorIntentMismatch } from '@/lib/http/actor-intent';
import { BodyTooLargeError, readBoundedForm } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {
  DispatchEvidenceError,
  saveSellerDispatchPhoto,
  sellerDispatchPhotoUploadEnabled,
  validDispatchEvidenceId,
} from '@/lib/orders/seller-dispatch-evidence';
import { maximumProductImageBytes } from '@/lib/products/submission';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status: number) =>
  Response.json(data, { status, headers: { 'cache-control': 'private, no-store' } });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const db = requireDatabase(bindings);
    if (!sellerDispatchPhotoUploadEnabled(db)) return json({ error: 'Dispatch evidence is unavailable.' }, 404);
    const seller = await requireSellerApi();
    if (hasActorIntentMismatch(request, seller.userId)) {
      return json({ error: 'The signed-in seller changed. Reopen this order.' }, 403);
    }
    const { id: orderId } = await context.params;
    if (!validDispatchEvidenceId(orderId)) return json({ error: 'Order item not found.' }, 404);
    let form: FormData;
    try {
      form = await readBoundedForm(request, maximumProductImageBytes + 64 * 1024);
    } catch (error) {
      if (error instanceof BodyTooLargeError) return json({ error: 'The photo upload is too large.' }, 413);
      return json({ error: 'The photo upload could not be read.' }, 400);
    }
    const orderItemId = form.get('orderItemId');
    const requestId = form.get('requestId');
    const file = form.get('file');
    if (Array.from(form.keys()).length !== 3 || !validDispatchEvidenceId(orderItemId) ||
        !validDispatchEvidenceId(requestId) || !(file instanceof File)) {
      return json({ error: 'Provide the exact order item, upload reference and one photo.' }, 400);
    }
    const result = await saveSellerDispatchPhoto(db, requireMediaBucket(bindings), seller,
      { orderId, orderItemId, requestId, now: Date.now() }, file);
    return json(result, result.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof DispatchEvidenceError || error instanceof SellerAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Dispatch evidence could not be recorded. Retry the same photo and request.' }, 503);
  }
}
