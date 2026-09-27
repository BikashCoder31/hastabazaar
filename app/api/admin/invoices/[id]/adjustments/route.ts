import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import {
  issueManagedInvoiceAdjustment,
  ManagedInvoiceAdjustmentError,
  type ManagedInvoiceAdjustmentKind,
} from '@/lib/db/repositories/managed-documents';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import {
  assertSimulationAllowed,
  resolveRuntimeEnvironment,
} from '@/lib/staging/environment';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request)) {
    return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  }
  try {
    const actor = await requireStaffApi('tax_policy.manage');
    const now = Date.now();
    const body = JSON.parse(
      new TextDecoder().decode(await readBoundedBody(request, 8 * 1024)),
    ) as Record<string, unknown>;
    if (!body || Array.isArray(body)) throw new TypeError('Invalid request.');
    const bindings = env as unknown as Record<string, string>;
    const environment = resolveRuntimeEnvironment({
      runtimeEnvironment: bindings.HASTABAZAAR_RUNTIME_ENV,
      nodeEnvironment: process.env.NODE_ENV,
      appOrigin: bindings.APP_ORIGIN,
    });
    assertSimulationAllowed(environment);
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const reasons = await getEffectiveBusinessSetting(
      database,
      'managed_adjustment_reason_codes',
      now,
    );
    const { id } = await context.params;
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const form = await validateSellerFormSubmission(database, 'staff.invoice-adjustment',
      body.formVersion, body.customAnswers, requestId);
    validatedVersionId = form.versionId;
    const result = await issueManagedInvoiceAdjustment(database, {
      invoiceGroupId: id,
      kind: body.kind as ManagedInvoiceAdjustmentKind,
      amountPaisa: Number(body.amountPaisa),
      reasonCode: typeof body.reasonCode === 'string' ? body.reasonCode : '',
      note: typeof body.note === 'string' ? body.note : '',
      actorId: actor.id,
      requestId,
      now,
      approvedReasonCodes: reasons.value,
      form: { requestId, versionId: form.versionId, answers: form.answers },
    });
    return Response.json({ ...result, simulation: true }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof BodyTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof FormRuntimeError)
      return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError)
      return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (
      error instanceof ManagedInvoiceAdjustmentError ||
      error instanceof RangeError ||
      error instanceof TypeError ||
      error instanceof SyntaxError
    ) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }),
      'staff.invoice-adjustment', validatedVersionId))
      return Response.json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, { status: 409 });
    console.error('Simulated invoice adjustment failed', error);
    return Response.json({ error: 'The simulated correction document was not issued.' }, { status: 500 });
  }
}
