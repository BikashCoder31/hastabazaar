import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { archiveSellerProduct, ProductArchiveConflictError } from '@/lib/db/repositories/products';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
export async function POST(request: Request, context: {params: Promise<{id: string}>}): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({error: 'Cross-site requests are not allowed.'}, 403);
  try {
    const seller = await requireSellerApi();
    const {id} = await context.params;
    await archiveSellerProduct(requireDatabase(env as unknown as {DB?: D1Database}), {
      productId: id, sellerId: seller.sellerId, actorId: seller.userId, now: Date.now(),
    });
    return json({status: 'archived', message: 'Product archived. Existing orders are unchanged.'}, 200);
  } catch (error) {
    if (error instanceof SellerAuthorizationError) return json({error: error.message}, error.status);
    if (error instanceof ProductArchiveConflictError) return json({error: error.message}, 409);
    return json({error: 'The product could not be archived. Please try again.'}, 500);
  }
}
