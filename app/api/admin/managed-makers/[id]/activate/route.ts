import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { activateManagedMakerForSimulation, ManagedActivationError } from '@/lib/managed-commerce/activation';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request)) return Response.json({error:'Cross-site requests are not allowed.'},{status:403});
  try {
    const actor = await requireStaffApi('business_settings.approve');
    const body = await readBoundedJsonObject(request) as Record<string, unknown>;
    const value = (key: string) => typeof body[key] === 'string' ? body[key] as string : '';
    const bindings = env as unknown as Record<string, string>;
    const environment = resolveRuntimeEnvironment({
      runtimeEnvironment: bindings.HASTABAZAAR_RUNTIME_ENV,
      nodeEnvironment: process.env.NODE_ENV,
      appOrigin: bindings.APP_ORIGIN,
    });
    const { id } = await context.params;
    const model = body.model === 'managed_fixed_supplier_price_v1'
      ? 'managed_fixed_supplier_price_v1'
      : body.model === 'managed_sale_linked_percentage_v1'
        ? 'managed_sale_linked_percentage_v1'
        : null;
    if (!model) return Response.json({error:'Select an implemented Managed Maker model.'},{status:400});
    const database = requireDatabase(env as unknown as {DB?:D1Database});
    const requestId = value('requestId');
    const form = await validateSellerFormSubmission(database,'staff.managed-maker-activation',
      body.formVersion,body.customAnswers,requestId);
    validatedVersionId = form.versionId;
    // Acceptance time is server-owned; the immutable audit time is reused for exact retries.
    const now = Date.now();
    await activateManagedMakerForSimulation(database, {
      sellerId: id, actorId: actor.id, model,
      legalSellerReference: value('legalSellerReference'), invoiceIssuerReference: value('invoiceIssuerReference'),
      payoutBeneficiaryReference: value('payoutBeneficiaryReference'), agreementVersion: value('agreementVersion'),
      agreementLanguage: body.agreementLanguage === 'ne' ? 'ne' : 'en',
      agreementAcceptedAt: now,
      requestId, now, environment,
      form:{requestId,versionId:form.versionId,answers:form.answers},
    });
    return Response.json({ok:true,simulation:true},{status:200});
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof StaffAuthorizationError) return Response.json({error:error.message},{status:error.status});
    if (error instanceof BodyTooLargeError) return Response.json({error:error.message},{status:413});
    if (error instanceof FormRuntimeError)
      return Response.json({error:error.message,code:error.code},{status:error.code==='stale_version'?409:503});
    if (error instanceof FormValidationError)
      return Response.json({error:error.message,fieldId:error.fieldId},{status:400});
    if (error instanceof ManagedActivationError || error instanceof RangeError || error instanceof TypeError) {
      return Response.json({error:error.message},{status:409});
    }
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }),
      'staff.managed-maker-activation', validatedVersionId))
      return Response.json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, { status: 409 });
    return Response.json({error:'Simulated activation was not completed.'},{status:400});
  }
}
