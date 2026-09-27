import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  PayoutConflictError,
  processPayoutRequest,
} from '@/lib/db/repositories/payouts';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('payout.prepare');
    const body = (await request.json()) as {
      action?: 'prepare' | 'reject';
      note?: string;
      requestId?: string;
      formVersion?: unknown;
      customAnswers?: unknown;
    };
    if (!body.requestId || !['prepare', 'reject'].includes(body.action ?? ''))
      return Response.json(
        { error: 'Valid action and request identifier are required.' },
        { status: 400 },
      );
    const { id } = await context.params;
    const database=requireDatabase(env as unknown as {DB?:D1Database});
    const form=await validateSellerFormSubmission(database,'staff.payout-request-action',
      body.formVersion,body.customAnswers,body.requestId);
    validatedVersionId=form.versionId;
    await processPayoutRequest(
      database,
      {
        id,
        actorId: staff.id,
        actorRole: staff.role,
        action: body.action!,
        note: body.note ?? '',
        requestId: body.requestId,
        now: Date.now(),
        form:{requestId:body.requestId,versionId:form.versionId,answers:form.answers},
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as {DB?:D1Database}),
      'staff.payout-request-action',validatedVersionId))
      return Response.json({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},{status:409});
    if (error instanceof PayoutConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError)
      return Response.json({error:error.message,code:error.code},{status:error.code==='stale_version'?409:503});
    if (error instanceof FormValidationError)
      return Response.json({error:error.message,fieldId:error.fieldId},{status:400});
    return Response.json(
      { error: 'Payout request could not be processed.' },
      { status: 500 },
    );
  }
}
