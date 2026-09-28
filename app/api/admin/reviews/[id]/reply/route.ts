import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { moderateSellerReply } from '@/lib/db/repositories/review-extras';
import { CustomerDataConflictError } from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let db: D1Database | undefined, validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('product.review');
    const { id } = await params;
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
      !body || typeof body.action !== 'string' || !['publish', 'reject', 'hide'].includes(body.action) ||
      typeof body.note !== 'string' ||
      typeof body.idempotencyKey !== 'string' ||
      !/^[a-zA-Z0-9:_-]{1,100}$/.test(body.idempotencyKey) ||
      !Number.isSafeInteger(body.version)
    )
      return Response.json(
        { error: 'Invalid moderation request.' },
        { status: 400 },
      );
    if (!Number.isSafeInteger(body.formVersion) || Number(body.formVersion) < 1)
      return Response.json({ error: 'This form changed. Refresh it and review your answers.' }, { status: 409 });
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    db = database;
    const form = await validateSellerFormSubmission(database, 'staff.review-moderation',
      body.formVersion, body.customAnswers, body.idempotencyKey);
    validatedVersionId = form.versionId;
    await moderateSellerReply(
      database,
      {
        reviewId: id,
        actorId: staff.id,
        action: body.action as 'publish' | 'reject' | 'hide',
        note: body.note,
        version: body.version as number,
        requestId: body.idempotencyKey,
        now: Date.now(),
        form: { requestId: body.idempotencyKey, versionId: form.versionId, answers: form.answers },
      },
    );
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (e instanceof BodyTooLargeError) return Response.json({error:'Request too large.'},{status:413});
    if (e instanceof FormRuntimeError)
      return Response.json({ error: e.message, code: e.code }, { status: e.code === 'stale_version' ? 409 : 503 });
    if (e instanceof FormValidationError)
      return Response.json({ error: e.message, fieldId: e.fieldId }, { status: 400 });
    if (db && validatedVersionId && await isValidatedFormVersionStale(db, 'staff.review-moderation', validatedVersionId))
      return Response.json({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},{status:409});
    return Response.json(
      {
        error:
          e instanceof CustomerDataConflictError ||
          e instanceof StaffAuthorizationError
            ? e.message
            : 'Reply could not be moderated.',
      },
      {
        status:
          e instanceof StaffAuthorizationError
            ? e.status
            : e instanceof CustomerDataConflictError
              ? 409
              : 500,
      },
    );
  }
}
