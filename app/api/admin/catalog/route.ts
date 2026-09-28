import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  CatalogManagementConflictError,
  saveTaxonomy,
} from '@/lib/db/repositories/catalog-admin';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('catalog.manage');
    const body = (await readBoundedJsonObject(request)) as Record<
      string,
      unknown
    > | null;
    if (
      !body ||
      typeof body.kind !== 'string' ||
      !['category', 'occasion'].includes(body.kind) ||
      typeof body.idempotencyKey !== 'string'
    )
      return Response.json(
        { error: 'Valid taxonomy and idempotency key are required.' },
        { status: 400 },
      );
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(database, 'staff.catalog',
      body.formVersion, body.customAnswers, body.idempotencyKey);
    validatedVersionId = form.versionId;
    const id = await saveTaxonomy(
      database,
      {
        kind: body.kind as 'category' | 'occasion',
        id: typeof body.id === 'string' && body.id ? body.id : undefined,
        actorId: staff.id,
        input: {
          slug: typeof body.slug === 'string' ? body.slug : '',
          nameEn: typeof body.nameEn === 'string' ? body.nameEn : '',
          nameNe:
            typeof body.nameNe === 'string' && body.nameNe.trim()
              ? body.nameNe
              : typeof body.nameEn === 'string'
                ? body.nameEn
                : '',
          isActive: Boolean(body.isActive),
          sortOrder: Number(body.sortOrder),
        },
        requestId: body.idempotencyKey,
        now: Date.now(),
        form: { requestId: body.idempotencyKey, versionId: form.versionId, answers: form.answers },
      },
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return Response.json({ error: error.message }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CatalogManagementConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError)
      return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError)
      return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }),
      'staff.catalog', validatedVersionId))
      return Response.json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, { status: 409 });
    return Response.json(
      { error: 'Catalogue taxonomy could not be saved.' },
      { status: 500 },
    );
  }
}
