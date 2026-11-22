import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { safeCourierUrl } from '@/lib/delivery/validation';
import { sendPendingOrderUpdates } from '@/lib/email/send-order-updates';
import { FormRuntimeError } from '@/lib/forms/runtime';
import {
  isValidatedFormVersionStale,
  validateSellerFormSubmission,
} from '@/lib/forms/submission';
import { FormValidationError } from '@/lib/forms/validation';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {
  operateParcel,
  ParcelConflictError,
  prepareSellerParcels,
} from '@/lib/operations/parcels';
import { readDispatchParcels } from '../read-dispatch';

const formId = 'staff.parcel-control';
const id = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 191;
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return reply({ error: 'Cross-site request rejected.' }, 403);
  let db: D1Database | undefined;
  let validatedVersionId: string | undefined;
  try {
    const intendedActorId =
      request.headers.get(ACTOR_INTENT_HEADER) ?? undefined;
    const staff = await requireStaffApi('order.manage', { intendedActorId });
    const body = await readBoundedJsonObject(request);
    const {
      orderId,
      sellerId,
      jobId,
      version,
      action,
      requestId,
      pickupStart,
      pickupEnd,
      deliveryPartnerId,
    } = body;
    if (
      !id(orderId) ||
      !id(sellerId) ||
      !(jobId === null || id(jobId)) ||
      !(
        version === null ||
        (typeof version === 'number' &&
          Number.isSafeInteger(version) &&
          version >= 0)
      ) ||
      (jobId === null) !== (version === null) ||
      (action !== 'assign' && action !== 'dispatch') ||
      (action === 'dispatch' && jobId === null) ||
      (deliveryPartnerId !== undefined && (action !== 'assign' || !id(deliveryPartnerId))) ||
      typeof requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)
    ) {
      return reply({ error: 'Select a parcel and try again.' }, 400);
    }
    let booking:
      | {
          method: 'courier';
          courierName: string;
          trackingCode: string;
          trackingUrl: string;
          pickupStart: number;
          pickupEnd: number;
          deliveryPartnerId?: string;
        }
      | undefined;
    if (action === 'assign') {
      const courierName =
        typeof body.courierName === 'string' ? body.courierName.trim() : '';
      const trackingCode =
        typeof body.trackingCode === 'string' ? body.trackingCode.trim() : '';
      if (
        courierName.length < 2 ||
        courierName.length > 120 ||
        trackingCode.length < 2 ||
        trackingCode.length > 80
      ) {
        return reply(
          { error: 'Enter the courier name and booking or tracking number.' },
          400,
        );
      }
      if (
        typeof pickupStart !== 'number' ||
        !Number.isSafeInteger(pickupStart) ||
        pickupStart < 0 ||
        typeof pickupEnd !== 'number' ||
        !Number.isSafeInteger(pickupEnd) ||
        pickupEnd <= pickupStart ||
        pickupEnd > 8_640_000_000_000_000
      ) {
        return reply({ error: 'Choose a valid pickup time.' }, 400);
      }
      let trackingUrl: string;
      try {
        trackingUrl = safeCourierUrl(
          typeof body.trackingUrl === 'string' ? body.trackingUrl.trim() : '',
        );
      } catch {
        return reply({ error: 'Use a public HTTPS tracking link.' }, 400);
      }
      booking = {
        method: 'courier',
        courierName,
        trackingCode,
        trackingUrl,
        pickupStart,
        pickupEnd,
        ...(typeof deliveryPartnerId === 'string' ? { deliveryPartnerId } : {}),
      };
    }

    db = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(
      db,
      formId,
      body.formVersion,
      body.customAnswers,
      requestId,
    );
    validatedVersionId = form.versionId;
    const prior = await db
      .prepare(`SELECT event.shipping_job_id AS jobId FROM parcel_operation_events event
      JOIN shipping_jobs job ON job.id=event.shipping_job_id
      WHERE event.id=? AND event.order_id=? AND job.seller_id=? AND event.actor_id=? AND event.action=?`)
      .bind(requestId, orderId, sellerId, staff.id, action)
      .first<{ jobId: string }>();
    let targetId = prior?.jobId;
    if (prior && jobId !== null && prior.jobId !== jobId) {
      return reply(
        { error: 'This request belongs to a different parcel.' },
        409,
      );
    }
    if (!targetId) {
      const [current] = await readDispatchParcels(db, { orderId, sellerId });
      if (
        !current ||
        (action === 'assign'
          ? current.lane !== 'ready'
          : !current.canMarkPickedUp) ||
        (jobId !== null &&
          (jobId !== current.jobId || version !== current.version))
      ) {
        return reply(
          { error: 'The parcel has changed. Review the latest Dispatch list.' },
          409,
        );
      }
      if (current.version === null) {
        await prepareSellerParcels(db, {
          orderId,
          actorId: staff.id,
          requestId: `${requestId}-prepare`,
          now: Date.now(),
        });
      }
      const [prepared] =
        current.version === null
          ? await readDispatchParcels(db, { orderId, sellerId })
          : [current];
      if (
        !prepared?.jobId ||
        prepared.version !== (version ?? 0) ||
        (action === 'assign' && prepared.lane !== 'ready')
      ) {
        return reply(
          { error: 'The parcel has changed. Review the latest Dispatch list.' },
          409,
        );
      }
      targetId = prepared.jobId;
    }
    await operateParcel(db, {
      jobId: targetId,
      actorId: staff.id,
      requestId,
      version: version ?? 0,
      action,
      note:
        action === 'assign'
          ? 'Courier pickup booked externally.'
          : 'Courier collected the parcel.',
      now: Date.now(),
      ...booking,
      form: { requestId, versionId: form.versionId, answers: form.answers },
    });
    await sendPendingOrderUpdates({ orderId });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError)
      return reply({ error: error.message }, 413);
    if (error instanceof SyntaxError)
      return reply({ error: error.message }, 400);
    if (error instanceof FormRuntimeError)
      return reply(
        { error: error.message, code: error.code },
        error.code === 'stale_version' ? 409 : 503,
      );
    if (error instanceof FormValidationError)
      return reply({ error: error.message, fieldId: error.fieldId }, 400);
    if (
      db &&
      validatedVersionId &&
      (await isValidatedFormVersionStale(db, formId, validatedVersionId))
    ) {
      return reply(
        {
          error: 'This form changed. Refresh it and review your answers.',
          code: 'stale_version',
        },
        409,
      );
    }
    if (error instanceof ParcelConflictError)
      return reply({ error: error.message }, 409);
    return reply(
      { error: 'The courier update could not be saved. Try again.' },
      500,
    );
  }
}
