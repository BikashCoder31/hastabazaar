import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { activateManagedMakerForSimulation, ManagedActivationError } from '@/lib/managed-commerce/activation';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return Response.json({error:'Cross-site requests are not allowed.'},{status:403});
  try {
    const actor = await requireStaffApi('business_settings.approve');
    const body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 12 * 1024))) as Record<string, unknown>;
    const value = (key: string) => typeof body[key] === 'string' ? body[key] as string : '';
    const bindings = env as unknown as Record<string, string>;
    const environment = resolveRuntimeEnvironment({
      runtimeEnvironment: bindings.HASTABAZAAR_RUNTIME_ENV,
      nodeEnvironment: process.env.NODE_ENV,
      appOrigin: bindings.APP_ORIGIN,
    });
    const { id } = await context.params;
    await activateManagedMakerForSimulation(requireDatabase(env as unknown as {DB?:D1Database}), {
      sellerId: id, actorId: actor.id, model: 'managed_sale_linked_percentage_v1',
      legalSellerReference: value('legalSellerReference'), invoiceIssuerReference: value('invoiceIssuerReference'),
      payoutBeneficiaryReference: value('payoutBeneficiaryReference'), agreementVersion: value('agreementVersion'),
      agreementLanguage: body.agreementLanguage === 'ne' ? 'ne' : 'en',
      agreementAcceptedAt: Number(body.agreementAcceptedAt),
      requestId: value('requestId') || crypto.randomUUID(), now: Date.now(), environment,
    });
    return Response.json({ok:true,simulation:true},{status:200});
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return Response.json({error:error.message},{status:error.status});
    if (error instanceof BodyTooLargeError) return Response.json({error:error.message},{status:413});
    if (error instanceof ManagedActivationError || error instanceof RangeError || error instanceof TypeError) {
      return Response.json({error:error.message},{status:409});
    }
    return Response.json({error:'Simulated activation was not completed.'},{status:400});
  }
}
