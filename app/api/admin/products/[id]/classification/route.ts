import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { CatalogManagementConflictError, classifyProduct } from '@/lib/db/repositories/catalog-admin';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const [staff, { id }] = await Promise.all([requireStaffApi('catalog.manage'), params]); const body = await request.json().catch(() => null) as { categoryId?: string; occasionIds?: string[]; idempotencyKey?: string; formVersion?: unknown; customAnswers?: unknown } | null;
    if (!body?.categoryId || !Array.isArray(body.occasionIds) || !body.idempotencyKey) return Response.json({ error: 'Category, occasions and idempotency key are required.' }, { status: 400 });
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(database, 'staff.product-classification', body.formVersion,
      body.customAnswers, body.idempotencyKey);
    validatedVersionId = form.versionId;
    await classifyProduct(database, { productId: id, categoryId: body.categoryId, occasionIds: body.occasionIds,
      actorId: staff.id, requestId: body.idempotencyKey, now: Date.now(),
      form: { requestId: body.idempotencyKey, versionId: form.versionId, answers: form.answers } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CatalogManagementConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }),
      'staff.product-classification', validatedVersionId))
      return Response.json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, { status: 409 });
    return Response.json({ error: 'Product classification could not be updated.' }, { status: 500 });
  }
}
