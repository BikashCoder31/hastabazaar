import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { CatalogManagementConflictError, classifyProduct } from '@/lib/db/repositories/catalog-admin';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const [staff, { id }] = await Promise.all([requireStaffApi('catalog.manage'), params]); const body = await request.json().catch(() => null) as { categoryId?: string; occasionIds?: string[]; idempotencyKey?: string } | null;
    if (!body?.categoryId || !Array.isArray(body.occasionIds) || !body.idempotencyKey) return Response.json({ error: 'Category, occasions and idempotency key are required.' }, { status: 400 });
    await classifyProduct(requireDatabase(env as unknown as { DB?: D1Database }), { productId: id, categoryId: body.categoryId, occasionIds: body.occasionIds, actorId: staff.id, requestId: body.idempotencyKey, now: Date.now() });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CatalogManagementConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'Product classification could not be updated.' }, { status: 500 });
  }
}
