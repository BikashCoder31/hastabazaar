import { env } from 'cloudflare:workers';

import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { operatePayout, PayoutConflictError, type PayoutOperation } from '@/lib/db/repositories/payouts';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';
const actions = new Set<PayoutOperation>(['approve', 'reject', 'start_processing', 'mark_paid', 'mark_failed']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  let validatedVersionId: string | undefined;
  try {
    let body: unknown;
    try { body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedBody(request,256*1024))); }
    catch(error){if(error instanceof BodyTooLargeError)throw error;
      return Response.json({error:'Valid payout input is required.'},{status:400});}
    if(!body||typeof body!=='object'||Array.isArray(body))
      return Response.json({error:'Valid payout input is required.'},{status:400});
    const values=body as Record<string,unknown>;
    if (typeof values.action!=='string' || !actions.has(values.action as PayoutOperation) ||
      typeof values.idempotencyKey!=='string' || !values.idempotencyKey || values.idempotencyKey.length > 100 ||
      typeof values.note!=='string' ||
      (values.providerReference!==undefined && typeof values.providerReference!=='string')) {
      return Response.json({ error: 'A valid payout action and idempotency key are required.' }, { status: 400 });
    }
    const action = values.action as PayoutOperation;
    const permission = action === 'approve' || action === 'reject' ? 'payout.approve' : 'payout.mark_paid';
    const staff = await requireStaffApi(permission);
    const { id } = await context.params;
    const database=requireDatabase(env as unknown as { DB?: D1Database });
    const form=await validateSellerFormSubmission(database,'staff.payout-2',
      values.formVersion,values.customAnswers,values.idempotencyKey);
    validatedVersionId=form.versionId;
    await operatePayout(database, {
      payoutId: id,
      actorId: staff.id,
      actorRole: staff.role,
      action,
      note: values.note,
      providerReference: values.providerReference as string|undefined,
      requestId: values.idempotencyKey,
      now: Date.now(),
      form:{formId:'staff.payout-2',requestId:values.idempotencyKey,
        versionId:form.versionId,answers:form.answers},
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof BodyTooLargeError) return Response.json({error:'Payout request is too large.'},{status:413});
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as {DB?:D1Database}),
      'staff.payout-2',validatedVersionId))
      return Response.json({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},{status:409});
    if (error instanceof PayoutConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError) return Response.json({error:error.message,code:error.code},
      {status:error.code==='stale_version'?409:503});
    if (error instanceof FormValidationError) return Response.json({error:error.message,fieldId:error.fieldId},{status:400});
    return Response.json({ error: 'The payout could not be updated.' }, { status: 500 });
  }
}
