import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { sendPendingOrderUpdates } from '@/lib/email/send-order-updates';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  FulfillmentConflictError,
  transitionAdminFulfillment,
  transitionCompanyPreparation,
  type AdminFulfillmentAction,
} from '@/lib/db/repositories/fulfillment';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  let db: D1Database | null = null;
  let validatedVersionId: string | undefined;
  try {
    const intendedActorId = request.headers.get(ACTOR_INTENT_HEADER);
    const staff = await requireStaffApi('order.manage', intendedActorId ? { intendedActorId } : undefined);
    const { id } = await context.params;
    const parsed = await readBoundedJsonObject(request) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).some((key) => !['action','note','trackingCode','sellerId','requestId',
        'formVersion','customAnswers','codNotConfirmed','cause'].includes(key)))
      return json({ error: 'Invalid fulfilment request.' }, 400);
    const body = parsed as Record<string, unknown>;
    const companyPreparation = body.action === 'start_packing' || body.action === 'ready_for_pickup';
    const action = body.action as AdminFulfillmentAction;
    if (!companyPreparation && !['dispatch', 'deliver', 'cancel'].includes(action)) return json({ error: 'Invalid fulfilment action.' }, 400);
    if (body.cause !== undefined && (typeof body.cause !== 'string' || action !== 'cancel' || !intendedActorId))
      return json({ error: 'Reopen this order and choose a cancellation cause.' }, 400);
    if (body.codNotConfirmed !== undefined && (body.codNotConfirmed !== true || action !== 'cancel' || !intendedActorId))
      return json({ error: 'Refresh the current cash-on-delivery confirmation.' }, 400);
    if (companyPreparation && staff.role !== 'super_admin') throw new StaffAuthorizationError('Super Admin access is required for company-store preparation.',403);
    if (companyPreparation ? typeof body.sellerId !== 'string' || !body.sellerId.trim() : body.sellerId !== undefined)
      return json({error:'Select the company-store maker items to prepare.'},400);
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length < 8 || note.length > 500) return json({ error: 'Add a clear note of 8–500 characters.' }, 400);
    if (body.trackingCode !== undefined && typeof body.trackingCode !== 'string')
      return json({ error: 'Invalid tracking reference.' }, 400);
    const trackingCode = typeof body.trackingCode === 'string' ? body.trackingCode.trim() : undefined;
    if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(body.requestId))
      return json({ error: 'A valid request reference is required.' }, 400);
    if (!Number.isSafeInteger(body.formVersion) || Number(body.formVersion) < 1 ||
      !Array.isArray(body.customAnswers))
      return json({ error: 'This form changed. Refresh it and review your answers.' }, 409);
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    db = database;
    const form = await validateSellerFormSubmission(database, 'staff.order-fulfillment',
      body.formVersion, body.customAnswers, body.requestId);
    validatedVersionId = form.versionId;
    if (companyPreparation) {
      await transitionCompanyPreparation(database, {orderId:id,sellerId:body.sellerId as string,actorId:staff.id,
        action:body.action as 'start_packing'|'ready_for_pickup',note,requestId:body.requestId,now:Date.now(),
        form:{requestId:body.requestId,versionId:form.versionId,answers:form.answers}});
      await sendPendingOrderUpdates({orderId:id});
      return json({ok:true});
    }
    await transitionAdminFulfillment(
      database,
      {
        orderId: id,
        actorId: staff.id,
        action,
        note,
        ...(body.codNotConfirmed === true ? { codNotConfirmed: true } : {}),
        cause: typeof body.cause === 'string' ? body.cause : undefined,
        trackingCode,
        requestId: body.requestId,
        now: Date.now(),
        form: { requestId: body.requestId, versionId: form.versionId, answers: form.answers },
      },
    );
    await sendPendingOrderUpdates({ orderId: id });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: 'Request too large.' }, 413);
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof FormRuntimeError) return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (db && validatedVersionId && await isValidatedFormVersionStale(db,
      'staff.order-fulfillment', validatedVersionId))
      return json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
    if (error instanceof FulfillmentConflictError) return json({ error: error.message }, 409);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
    console.error('Admin fulfilment update failed', error);
    return json({ error: 'The fulfilment status could not be updated.' }, 500);
  }
}
