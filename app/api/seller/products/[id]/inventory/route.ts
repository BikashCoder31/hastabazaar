import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  InventoryConflictError,
  setProductInventory,
} from '@/lib/db/repositories/products';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

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
    let body: { quantity?: unknown; reason?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'The inventory request is invalid.' }, 400);
    }
    const quantity = body.quantity;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!Number.isInteger(quantity) || Number(quantity) < 0 || Number(quantity) > 1_000_000) {
      return json({ error: 'Inventory must be a whole number from 0 to 1,000,000.' }, 400);
    }
    if (reason.length < 3 || reason.length > 300) {
      return json({ error: 'Add a short inventory adjustment reason.' }, 400);
    }
    await setProductInventory(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        productId: id,
        sellerId: seller.sellerId,
        actorId: seller.userId,
        quantity: Number(quantity),
        reason,
        now: Date.now(),
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
    return json({ error: 'Inventory could not be updated.' }, 500);
  }
}
