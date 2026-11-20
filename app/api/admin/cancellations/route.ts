import {requireStaffIntentApi,requireExistingStaffIntentApi} from '@/lib/auth/staff-intent';
import {readActionProof,prepareActionProof,type ActionReference,type ActionProof, type AtomicActionProof} from '@/lib/orders/action-recovery';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import {
  cancellationPreview,
  continueCancellationSettlement,
  cancelSelectedParcels,
  CancellationConflictError,
  rejectCancellationReview,
} from '@/lib/cancellation/repository';
export async function POST(request: Request) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site request rejected.' }, 403);
  let db: D1Database | null = null;
  let validatedVersionId: string | undefined;
  let reference:ActionReference|undefined;
  let beforeWrite=true;
  let originalProof:AtomicActionProof|undefined;
  let replayedApproval:ActionProof|undefined;
  let originalActor:{id:string;authSubject:string}|undefined;
  try {
    const staff = await requireStaffIntentApi(request,'order.manage');
    originalActor=staff;
    const
      database = requireDatabase(env as unknown as { DB?: D1Database }),
      body = await readBoundedJsonObject(request) as unknown;
    db = database;
    // This explicit recovery command contains only an original reference. It
    // cannot provide replacement decision terms or create a native proof.
    if(body&&typeof body==='object'&&!Array.isArray(body)&&(body as Record<string,unknown>).continuation===true){
      const input=body as Record<string,unknown>;
      if(Object.keys(input).some(key=>!['reviewId','action','clientAttemptId','continuation'].includes(key))||input.action!=='approve'||
        typeof input.reviewId!=='string'||!/^[a-zA-Z0-9:_-]{1,150}$/.test(input.reviewId)||
        typeof input.clientAttemptId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.clientAttemptId))return json({error:'Invalid original settlement reference.'},400);
      reference={actorId:staff.id,sourceId:input.reviewId,action:'approve',requestId:input.clientAttemptId};
      replayedApproval=await readActionProof(database,reference,staff.authSubject)??undefined;
      await confirmActor(request,staff);
      if(!replayedApproval)return json({error:'Original outcome remains unconfirmed.'},409);
      beforeWrite=false;
      const proof=await continueCancellationSettlement(database,reference,staff.authSubject,Date.now());
      await confirmActor(request,staff);
      return json({...proof,settlement:'confirmed'});
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['reviewId','action','note','fingerprint',
        'formVersion','customAnswers','clientAttemptId'].includes(key)))
      return json({ error: 'Invalid cancellation review request.' }, 400);
    const input = body as Record<string, unknown>;
    if (typeof input.reviewId !== 'string' || !/^[a-zA-Z0-9:_-]{1,150}$/.test(input.reviewId))
      return json({ error: 'Select a review.' }, 400);
    if (!['preview','approve','reject'].includes(String(input.action)) ||
      !Number.isSafeInteger(input.formVersion) || !Array.isArray(input.customAnswers))
      return json({ error: 'Review the current decision form.' }, 400);
    if(input.clientAttemptId!==undefined){
      if(typeof input.clientAttemptId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.clientAttemptId)||input.action==='preview')return json({error:'Invalid original decision reference.'},400);
      reference={actorId:staff.id,sourceId:input.reviewId,action:String(input.action),requestId:input.clientAttemptId};
      const original=await prepareActionProof(database,reference,staff.authSubject,input,Date.now());
      if(original.replayed){
        await confirmActor(request,staff);
        if(!original.proof)return json({error:'Original outcome remains unconfirmed.'},503);
        if(input.action!=='approve')return json(original.proof);
        // The decision proof commits before managed settlement hooks. Exact POST
        // replay must still reach the native, idempotent post-commit continuation.
        replayedApproval=original.proof;
        beforeWrite=false;
      }else originalProof=original.atomic;
    }
    const requestId = input.action === 'approve' ? `review:${input.reviewId}` :
      input.action === 'reject' ? `review-reject:${input.reviewId}` : undefined;
    const form = await validateSellerFormSubmission(database, 'staff.cancellation-review',
      input.formVersion, input.customAnswers, requestId);
    validatedVersionId = form.versionId;
    const row = await database
      .prepare(
        'SELECT r.seller_ids_json AS sellers,r.status,o.order_number AS number FROM order_cancellation_reviews r JOIN orders o ON o.id=r.order_id WHERE r.id=?',
      )
      .bind(input.reviewId)
      .first<{ sellers: string; number: string; status: string }>();
    if (!row)
      throw new CancellationConflictError('Review was not found.');
    if (input.action === 'reject') {
      if (typeof input.note !== 'string' ||
        input.fingerprint !== undefined && typeof input.fingerprint !== 'string')
        return json({ error: 'Add a decision reason.' }, 400);
      beforeWrite=false;
      await rejectCancellationReview(database, {
        originalProof,
        id: input.reviewId,
        actorId: staff.id,
        note: input.note,
        fingerprint: input.fingerprint as string | undefined,
        now: Date.now(),
        form: { formId: 'staff.cancellation-review', requestId: requestId!,
          versionId: form.versionId, answers: form.answers },
      });
      await confirmActor(request,staff);
      if(reference){const proof=await readActionProof(database,reference,staff.authSubject);await confirmActor(request,staff);return proof?json(proof):json({error:'Original outcome remains unconfirmed.'},503);}
      return json({ ok: true });
    }
    const access = { actorId: staff.id, orderNumber: row.number },
      sellerIds = JSON.parse(row.sellers) as string[];
    if (input.action === 'preview') {
      if (row.status !== 'pending' || input.fingerprint !== undefined ||
        input.note !== undefined && typeof input.note !== 'string')
        throw new CancellationConflictError('Review is no longer pending.');
      const p = await cancellationPreview(database, access, sellerIds);
      await confirmActor(request,staff);
      return json({
        fingerprint: p.fingerprint,
        total: p.next.total,
        walletRestored: p.walletRestored,
        delivery: p.next.delivery,
        deliveryPricingPolicy:p.deliveryPricingPolicy,
      });
    }
    if (
      input.action !== 'approve' ||
      typeof input.fingerprint !== 'string' ||
      typeof input.note !== 'string'
    )
      return json(
        { error: 'Review current amounts and add a decision reason.' },
        400,
      );
    beforeWrite=false;
    const result=await cancelSelectedParcels(database, access, {
        originalProof,
        staffAuthSubject:staff.authSubject,
        sellerIds,
        fingerprint: input.fingerprint,
        requestId: requestId!,
        note: input.note,
        reviewId: input.reviewId,
        now: Date.now(),
        form: { formId: 'staff.cancellation-review', requestId: requestId!,
          versionId: form.versionId, answers: form.answers },
      });
    await confirmActor(request,staff);
    if(reference){const proof=await readActionProof(database,reference,staff.authSubject);await confirmActor(request,staff);return proof?json({...proof,settlement:'confirmed'}):json({error:'Original outcome remains unconfirmed.'},503);}
    return json(result);
  } catch (e) {
    if(originalActor)try{await confirmActor(request,originalActor);}catch{return json({error:'Staff access changed. Reopen this review.'},403);}
    if(db&&reference?.action==='approve'&&originalActor&&!beforeWrite){
      // A lost commit acknowledgement can hide the saved decision even on the
      // first POST. Read only its atomic original proof; never infer it from the
      // current order/review state or report a known approval as not recorded.
      let proof=replayedApproval;
      try{proof??=await readActionProof(db,reference,originalActor.authSubject)??undefined;}catch{/* An unreadable original proof remains unconfirmed. */}
      try{await confirmActor(request,originalActor);}catch{return json({error:'Staff access changed. Reopen this review.'},403);}
      if(proof)return json({...proof,settlement:'unconfirmed',error:'The original cancellation is recorded. Settlement continuation could not be confirmed; retry this same request.'},503);
    }
    if (e instanceof BodyTooLargeError) return json({ error: 'Request too large.' }, 413);
    if (e instanceof SyntaxError) return json({ error: 'Invalid review request.' }, 400);
    if (e instanceof FormValidationError)
      return json({ error: e.message, fieldId: e.fieldId,...(reference?{...reference,recorded:false,...(beforeWrite?{phase:'before_write'}:{})}:{}) }, 400);
    if (e instanceof FormRuntimeError)
      return json({ error: e.message, code: e.code,...(reference?{...reference,recorded:false,...(beforeWrite?{phase:'before_write'}:{})}:{}) }, e.code === 'stale_version' ? 409 : 503);
    if (db && validatedVersionId && await isValidatedFormVersionStale(db,
      'staff.cancellation-review', validatedVersionId))
      return json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
    return json(
      {
        error:
          e instanceof CancellationConflictError ||
          e instanceof StaffAuthorizationError
            ? e.message
            : 'Review could not be saved.',
      },
      e instanceof StaffAuthorizationError ? e.status : 409,
    );
  }
}

async function confirmActor(request:Request,original:{id:string;authSubject:string}){
 const current=await requireExistingStaffIntentApi(request,'order.manage');
 if(current.id!==original.id||current.authSubject!==original.authSubject)throw new StaffAuthorizationError('Staff access changed. Reopen this review.',403);
}
export async function GET(request:Request){
 let originalActor:{id:string;authSubject:string}|undefined;
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 try{
  const staff=await requireExistingStaffIntentApi(request,'order.manage'),query=new URL(request.url).searchParams;originalActor=staff;
  const sourceId=query.get('sourceId')??'',action=query.get('action')??'',requestId=query.get('requestId')??'';
  if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(sourceId)||!/^[0-9a-f-]{36}$/i.test(requestId)||!['approve','reject'].includes(action))return json({error:'Invalid original decision reference.'},400);
  const proof=await readActionProof(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:staff.id,sourceId,action,requestId},staff.authSubject);
  await confirmActor(request,staff);return proof?json({...proof,...(action==='approve'?{settlement:'unconfirmed'}:{})}):json({error:'Original outcome remains unconfirmed.'},404);
 }catch(error){if(originalActor)try{await confirmActor(request,originalActor);}catch{return json({error:'Staff access changed. Reopen this review.'},403);}return json({error:error instanceof StaffAuthorizationError?error.message:'Original outcome remains unconfirmed.'},error instanceof StaffAuthorizationError?error.status:503);}
}
