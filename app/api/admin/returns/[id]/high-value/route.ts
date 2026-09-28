import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  decideHighValueRefund,
  ReturnConflictError,
} from '@/lib/db/repositories/returns';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let db: D1Database | undefined, validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const staff = await requireStaffApi('refund.approve.high_value');
    const { id } = await context.params;
    let parsed: unknown;
    try { parsed = await readBoundedJsonObject(request); }
    catch (error) {
      if (error instanceof BodyTooLargeError) throw error;
      return json({error:'Invalid request.'},400);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({error:'Invalid request.'},400);
    const body = parsed as Record<string, unknown>;
    const decision = body.decision;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const publicMessageEn =
      typeof body.publicMessageEn === 'string'
        ? body.publicMessageEn.trim()
        : '';
    const publicMessageNe =
      typeof body.publicMessageNe === 'string' && body.publicMessageNe.trim()
        ? body.publicMessageNe.trim()
        : publicMessageEn;
    const requestId =
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (!['approve', 'reject'].includes(String(decision)))
      return json({ error: 'Select approve or reject.' }, 400);
    if (note.length < 8 || note.length > 2_000)
      return json(
        { error: 'Add an approval note of 8–2,000 characters.' },
        400,
      );
    if (publicMessageEn.length < 8 || publicMessageEn.length > 1_000)
      return json(
        { error: 'Add a clear customer message of 8–1,000 characters.' },
        400,
      );
    if (requestId.length < 8 || requestId.length > 100)
      return json({ error: 'The request identifier is invalid.' }, 400);
    if (body.sourceFormId !== 'staff.return-case-action')
      return json({ error: 'Return form source does not match this action.' }, 400);
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    db = database;
    const form = await validateSellerFormSubmission(database, 'staff.return-case-action',
      body.formVersion, body.customAnswers, requestId);
    validatedVersionId = form.versionId;
    await decideHighValueRefund(
      database,
      {
        returnRequestId: id,
        actorId: staff.id,
        approve: decision === 'approve',
        note,
        publicMessageEn,
        publicMessageNe,
        requestId,
        now: Date.now(),
        form: { versionId: form.versionId, answers: form.answers },
      },
    );
    return json({ ok: true });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({error:'Request too large.'},413);
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
    if (db && validatedVersionId && await isValidatedFormVersionStale(db, 'staff.return-case-action', validatedVersionId))
      return json({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},409);
    if (error instanceof ReturnConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    console.error('High-value refund decision failed', error);
    return json(
      { error: 'The high-value refund decision could not be saved.' },
      500,
    );
  }
}
