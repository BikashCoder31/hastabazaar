import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  InventoryConflictError,
  setProductInventory,
} from '@/lib/db/repositories/products';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }
  try {
    const seller = await requireSellerApi();
    const { id } = await context.params;
    let body: { quantity?: unknown; reason?: unknown; requestId?: unknown;
      formVersion?: unknown; customAnswers?: unknown };
    try {
      body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 131_072))) as typeof body;
    } catch {
      return json({ error: 'The inventory request is invalid.' }, 400);
    }
    if (!body || Array.isArray(body) || Object.keys(body).some((key) =>
      !['quantity', 'reason', 'requestId', 'formVersion', 'customAnswers'].includes(key)) ||
      typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId) ||
      !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers))
      return json({ error: 'The inventory form request is invalid.' }, 400);
    const quantity = body.quantity;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!Number.isInteger(quantity) || Number(quantity) < 0 || Number(quantity) > 1_000_000) {
      return json({ error: 'Inventory must be a whole number from 0 to 1,000,000.' }, 400);
    }
    if (reason.length < 3 || reason.length > 300) {
      return json({ error: 'Add a short inventory adjustment reason.' }, 400);
    }
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(database, 'seller.inventory', body.formVersion, body.customAnswers, body.requestId);
    await setProductInventory(
      database,
      {
        productId: id,
        sellerId: seller.sellerId,
        actorId: seller.userId,
        quantity: Number(quantity),
        reason,
        now: Date.now(),
        form: { requestId: body.requestId, versionId: form.versionId, answers: form.answers },
      },
    );
    return json({ quantity, message: 'Inventory updated.' }, 200);
  } catch (error) {
    if (error instanceof SellerAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof InventoryConflictError) {
      return json({ error: error.message }, 409);
    }
    if (error instanceof FormRequestConflictError) return json({ error: error.message, code: 'request_id_conflict' }, 409);
    if (error instanceof FormRuntimeError) return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    return json({ error: 'Inventory could not be updated.' }, 500);
  }
}
