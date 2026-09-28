import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { BodyTooLargeError } from '@/lib/http/bounded-body';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  CustomerDataConflictError,
  moderateProductReview,
} from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let db: D1Database | undefined, validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const [staff, { id }] = await Promise.all([
      requireStaffApi('product.review'),
      params,
    ]);
    let parsed: unknown;
    try { parsed = await readBoundedJsonObject(request); }
    catch (error) {
      if (error instanceof BodyTooLargeError) throw error;
      return Response.json({error:'Invalid request.'},{status:400});
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return Response.json({error:'Invalid request.'},{status:400});
    const body = parsed as Record<string, unknown>;
    if (
      !body || typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(body.idempotencyKey) ||
      typeof body.action !== 'string' || !['publish', 'reject', 'hide'].includes(body.action)
    )
      return Response.json(
        { error: 'Valid action and idempotency key are required.' },
        { status: 400 },
      );
    if (typeof body.note !== 'string' || body.note.trim().length < 8 || body.note.trim().length > 1000)
      return Response.json({ error: 'Add a moderation note of 8–1,000 characters.' }, { status: 400 });
    if (!Number.isSafeInteger(body.formVersion) || Number(body.formVersion) < 1)
      return Response.json({ error: 'This form changed. Refresh it and review your answers.' }, { status: 409 });
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    db = database;
    const form = await validateSellerFormSubmission(database, 'staff.review-moderation',
      body.formVersion, body.customAnswers, body.idempotencyKey);
    validatedVersionId = form.versionId;
    await moderateProductReview(
      database,
      {
        reviewId: id,
        actorId: staff.id,
        action: body.action as 'publish' | 'reject' | 'hide',
        note: body.note,
        requestId: body.idempotencyKey,
        now: Date.now(),
        form: { requestId: body.idempotencyKey, versionId: form.versionId, answers: form.answers },
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof BodyTooLargeError) return Response.json({error:'Request too large.'},{status:413});
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof FormRuntimeError)
      return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError)
      return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (db && validatedVersionId && await isValidatedFormVersionStale(db, 'staff.review-moderation', validatedVersionId))
      return Response.json({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},{status:409});
    if (error instanceof CustomerDataConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'The review could not be moderated.' },
      { status: 500 },
    );
  }
}
