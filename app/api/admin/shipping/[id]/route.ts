import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  operateShippingJob,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('order.manage');
    const raw = await readBoundedJsonObject(request) as unknown;
    const { id } = await context.params;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some((key) => !['action', 'note', 'labelReference', 'trackingCode',
        'claimReference', 'reconciliationStatus', 'requestId', 'formVersion', 'customAnswers'].includes(key)))
      return Response.json({ error: 'Invalid shipping action.' }, { status: 400 });
    const body = raw as Record<string, unknown>;
    if (
      typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId) ||
      ![
        'record_label',
        'schedule_pickup',
        'picked_up',
        'in_transit',
        'delivered',
        'open_claim',
        'resolve_claim',
        'reconcile',
      ].includes(typeof body.action === 'string' ? body.action : '') ||
      typeof body.note !== 'string' || body.note.length > 1000 ||
      ['labelReference', 'trackingCode', 'claimReference', 'reconciliationStatus'].some((key) =>
        body[key] !== undefined && typeof body[key] !== 'string')
    )
      return Response.json(
        { error: 'Valid action and request identifier are required.' },
        { status: 400 },
      );
    if (
      body.reconciliationStatus &&
      !['matched', 'variance', 'resolved'].includes(typeof body.reconciliationStatus === 'string' ? body.reconciliationStatus : '')
    )
      return Response.json(
        { error: 'Invalid reconciliation state.' },
        { status: 400 },
      );
    if (!Number.isSafeInteger(body.formVersion))
      throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(database, 'shipping.console-action-staff',
      body.formVersion, body.customAnswers, body.requestId);
    await operateShippingJob(
      database,
      {
        jobId: id,
        actorId: staff.id,
        actorRole: staff.role,
        action: body.action as string,
        note: body.note as string,
        labelReference: body.labelReference as string | undefined,
        trackingCode: body.trackingCode as string | undefined,
        claimReference: body.claimReference as string | undefined,
        reconciliationStatus: body.reconciliationStatus as string | undefined,
        requestId: body.requestId,
        now: Date.now(),
        form: { formId: 'shipping.console-action-staff', requestId: body.requestId,
          versionId: form.versionId, answers: form.answers },
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRequestConflictError)
      return Response.json({ error: error.message, code: 'request_id_conflict' }, { status: 409 });
    if (error instanceof FormRuntimeError)
      return Response.json({ error: error.message, code: error.code },
        { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError)
      return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (error instanceof BodyTooLargeError)
      return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError)
      return Response.json({ error: 'Invalid shipping action.' }, { status: 400 });
    return Response.json(
      { error: 'Shipping job could not be updated.' },
      { status: 500 },
    );
  }
}
