import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  updateComplaintAsAdmin,
  ComplaintConflictError,
  type ComplaintAdminAction,
} from '@/lib/db/repositories/complaints';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const actions: readonly ComplaintAdminAction[] = [
  'assign_to_me',
  'investigate',
  'request_customer',
  'escalate',
  'resolve',
  'close',
  'reopen',
];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let db: D1Database | undefined, validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const staff = await requireStaffApi('support.manage');
    if(hasActorIntentMismatch(request,staff.id))throw new StaffAuthorizationError('The signed-in staff account changed. Open this original care record again.',403);
    const { id } = await context.params;
    let parsed: unknown;
    try { parsed = await readBoundedJsonObject(request); }
    catch (error) {
      if (error instanceof BodyTooLargeError) throw error;
      return json({error:'Invalid request.'},400);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({error:'Invalid request.'},400);
    const body = parsed as Record<string, unknown>;
    const action = body.action as ComplaintAdminAction;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const publicMessageEn =
      typeof body.publicMessageEn === 'string'
        ? body.publicMessageEn.trim()
        : '';
    const publicMessageNe =
      typeof body.publicMessageNe === 'string' && body.publicMessageNe.trim()
        ? body.publicMessageNe.trim()
        : publicMessageEn;
    const resolutionEn =
      typeof body.resolutionEn === 'string'
        ? body.resolutionEn.trim()
        : undefined;
    const resolutionNe =
      typeof body.resolutionNe === 'string' && body.resolutionNe.trim()
        ? body.resolutionNe.trim()
        : resolutionEn;
    const requestId =
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (!actions.includes(action))
      return json({ error: 'Select a valid complaint action.' }, 400);
    if (note.length < 8 || note.length > 2_000)
      return json({ error: 'Add a case note of 8–2,000 characters.' }, 400);
    if (publicMessageEn.length < 8 || publicMessageEn.length > 1_000)
      return json(
        { error: 'Add a clear customer message of 8–1,000 characters.' },
        400,
      );
    if (requestId.length < 8 || requestId.length > 100)
      return json({ error: 'The request identifier is invalid.' }, 400);
    if (body.sourceFormId !== 'staff.complaint-case-action')
      return json({ error: 'Complaint form source does not match this action.' }, 400);
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    db = database;
    const form = await validateSellerFormSubmission(database, 'staff.complaint-case-action',
      body.formVersion, body.customAnswers, requestId);
    validatedVersionId = form.versionId;
    await updateComplaintAsAdmin(
      database,
      {
        complaintId: id,
        actorId: staff.id,
        actorRole: staff.role,
        action,
        note,
        publicMessageEn,
        publicMessageNe,
        resolutionEn,
        resolutionNe,
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
    if (db && validatedVersionId && await isValidatedFormVersionStale(db, 'staff.complaint-case-action', validatedVersionId))
      return json({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},409);
    if (error instanceof ComplaintConflictError)
      return json({ error: error.message }, 409);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof SyntaxError)
      return json({ error: 'Invalid request.' }, 400);
    console.error('Complaint update failed', error);
    return json({ error: 'The complaint could not be updated.' }, 500);
  }
}
