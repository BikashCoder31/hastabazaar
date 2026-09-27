import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { assignDelivery, DeliveryError } from '@/lib/delivery/repository';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { digestFormRequest, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request))
    return Response.json({ error: 'Cross-site request rejected.' }, { status: 403 });
  try {
    const staff = await requireStaffApi('order.manage');
    const { id } = await context.params;
    const data = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 65536))) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some((key) => !['method', 'riderEmail', 'courierName',
        'trackingUrl', 'trackingReference', 'requestId', 'formVersion', 'customAnswers'].includes(key)))
      return Response.json({ error: 'Invalid assignment.' }, { status: 400 });
    const body = data as Record<string, unknown>;
    if (typeof body.method !== 'string' ||
      ['riderEmail', 'courierName', 'trackingUrl', 'trackingReference'].some((key) =>
        body[key] !== undefined && typeof body[key] !== 'string') ||
      typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))
      return Response.json({ error: 'Invalid assignment.' }, { status: 400 });
    if (!Number.isSafeInteger(body.formVersion))
      throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(db, 'staff.delivery-assignment',
      body.formVersion, body.customAnswers, body.requestId);
    const digest = await digestFormRequest({ orderId: id, method: body.method,
      riderEmail: body.riderEmail, courierName: body.courierName,
      trackingUrl: body.trackingUrl, trackingReference: body.trackingReference,
      formVersion: body.formVersion, customAnswers: body.customAnswers });
    await assignDelivery(db, { orderId: id, actorId: staff.id, method: body.method,
      riderEmail: body.riderEmail as string | undefined,
      courierName: body.courierName as string | undefined,
      trackingUrl: body.trackingUrl as string | undefined,
      trackingReference: body.trackingReference as string | undefined,
      requestId: body.requestId, now: Date.now(),
      form: { requestId: body.requestId, versionId: form.versionId,
        answers: form.answers, digest } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof BodyTooLargeError)
      return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof FormRuntimeError)
      return Response.json({ error: error.message, code: error.code },
        { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError)
      return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    return Response.json({ error: error instanceof DeliveryError
      ? error.message : 'Assignment could not be saved.' },
      { status: error instanceof DeliveryError ? 409 : 500 });
  }
}
