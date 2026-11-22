import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { SellerProfileConflictError, updateSellerProfile, type EditableSellerProfile } from '@/lib/db/repositories/seller-profile';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

/** An opaque reference proves only an existing original native receipt; it cannot resend. */
export async function GET(request:Request):Promise<Response>{
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
 try{
  const seller=await requireSellerApi();
  if(hasActorIntentMismatch(request,seller.userId))throw new SellerAuthorizationError('The signed-in account changed. Reopen this workshop for your current account.',403);
  const query=new URL(request.url).searchParams,requestId=query.get('requestId'),sellerId=query.get('sellerId');
  if([...query.keys()].some(key=>!['requestId','sellerId'].includes(key)||query.getAll(key).length!==1)||!requestId||!/^[A-Za-z0-9_-]{1,100}$/.test(requestId)||!sellerId||sellerId.length>191)return reply({error:'Identify the exact original workshop request.'},400);
  if(sellerId!==seller.sellerId)return reply({error:'Workshop not found.'},404);
  const db=requireDatabase(env as unknown as{DB?:D1Database});
  const receipt=await db.prepare("SELECT id FROM audit_logs WHERE request_id=? AND actor_id=? AND action='seller.profile.updated' AND subject_type='seller_profile' AND subject_id=? LIMIT 1").bind(requestId,seller.userId,seller.sellerId).first();
  const current=await requireSellerApi();
  if(current.userId!==seller.userId||current.sellerId!==seller.sellerId||hasActorIntentMismatch(request,current.userId))throw new SellerAuthorizationError('The signed-in account changed. Reopen this workshop for your current account.',403);
  return reply({requestId,status:receipt?'recorded':'unconfirmed'});
 }catch(error){if(error instanceof SellerAuthorizationError)return reply({error:error.message},error.status);return reply({error:'The original workshop outcome could not be checked. Keep its reference and retry.'},503);}
}

export async function PATCH(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const seller = await requireSellerApi();
    if(hasActorIntentMismatch(request,seller.userId))throw new SellerAuthorizationError('The signed-in account changed. Reopen this workshop for your current account.',403);
    const body = await readBoundedJsonObject(request) as {
      profile?: EditableSellerProfile; idempotencyKey?: string; formVersion?: number; customAnswers?: unknown };
    const profileKeys = new Set(['tradingName', 'businessDescription', 'productCategories', 'supportPhone',
      'supportEmail', 'province', 'district', 'municipality', 'ward', 'locality']);
    if (!body || Array.isArray(body) || Object.keys(body).some((key) =>
      !['profile', 'idempotencyKey', 'formVersion', 'customAnswers'].includes(key)) ||
      !body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile) ||
      Object.keys(body.profile).some((key) => !profileKeys.has(key)) ||
      !body.idempotencyKey || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.idempotencyKey) ||
      !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers))
      return Response.json({ error: 'Profile and form request are required.' }, { status: 400 });
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(database, 'seller.profile', body.formVersion,
      body.customAnswers, body.idempotencyKey, { tradingName: body.profile.tradingName,
        businessDescription: body.profile.businessDescription });
    await updateSellerProfile(database, { sellerId: seller.sellerId, actorId: seller.userId, input: body.profile,
      requestId: body.idempotencyKey, now: Date.now(),
      form: { requestId: body.idempotencyKey, versionId: form.versionId, answers: form.answers } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SellerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: 'The seller profile request is invalid.' }, { status: 400 });
    if (error instanceof SellerProfileConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRequestConflictError) return Response.json({ error: error.message, code: 'request_id_conflict' }, { status: 409 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (error instanceof BodyTooLargeError) return Response.json({ error: error.message }, { status: 413 });
    // A commit-time authority fence may fail after the original API preflight.
    // Report proven current loss as a denial; preserve unknown database failures.
    try {
      const current=await requireSellerApi();
      if(hasActorIntentMismatch(request,current.userId))throw new SellerAuthorizationError('The signed-in account changed. Reopen this workshop for your current account.',403);
    } catch (currentError) {
      if(currentError instanceof SellerAuthorizationError)return Response.json({error:currentError.message},{status:currentError.status});
    }
    return Response.json({ error: 'The seller profile could not be updated.' }, { status: 500 });
  }
}
