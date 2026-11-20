import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  PayoutConflictError,
  requestSellerPayout,
} from '@/lib/db/repositories/payouts';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const seller = await requireSellerApi();
    const body = await readBoundedJsonObject(request) as Record<string, unknown>;
    if (!body || Array.isArray(body) || Object.keys(body).some((key) =>
      !['note', 'requestId', 'formVersion', 'customAnswers'].includes(key)) ||
      (body.note!==undefined&&typeof body.note!=='string') || typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId) ||
      !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers))
      return Response.json(
        { error: 'Request identifier is required.' },
        { status: 400 },
      );
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(database, 'seller.payout-request', body.formVersion,
      body.customAnswers, body.requestId);
    const id = await requestSellerPayout(
      database,
      {
        sellerId: seller.sellerId,
        actorId: seller.userId,
        note: typeof body.note==='string'?body.note:'',
        requestId: body.requestId,
        now: Date.now(),
        form: { requestId: body.requestId, versionId: form.versionId, answers: form.answers },
      },
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof SellerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof PayoutConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRequestConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (error instanceof BodyTooLargeError) return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid payout request.' }, { status: 400 });
    return Response.json(
      { error: 'Payout request could not be submitted.' },
      { status: 500 },
    );
  }
}

export async function GET(request:Request){
 try{
  const seller=await requireSellerApi(),url=new URL(request.url),attempt=url.searchParams.get('attempt');
  if(!attempt||!/^[a-zA-Z0-9_-]{1,100}$/.test(attempt)||[...url.searchParams.keys()].some(key=>key!=='attempt'))return Response.json({error:'Use the original payout request reference.'},{status:400});
  const database=requireDatabase(env as unknown as {DB?:D1Database});
  const row=await database.prepare('SELECT id FROM payout_requests WHERE seller_id=? AND created_request_id=?').bind(seller.sellerId,attempt).first<{id:string}>();
  return Response.json({outcome:row?{id:row.id,revision:0}:null},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof SellerAuthorizationError)return Response.json({error:error.message},{status:error.status});return Response.json({error:'The original payout request could not be checked.'},{status:503});}
}
