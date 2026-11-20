import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {consumePublicRequestRateLimit,rateLimitJson} from '@/lib/http/rate-limit';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {requestProtectedChange} from '@/lib/sellers/protected-change-requests';
import {ProtectedChangeError} from '@/lib/sellers/protected-change-policy';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
  if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
  try{const viewer=await requireSellerCenterApi();if(hasActorIntentMismatch(request,viewer.userId))throw new SellerCenterAuthorizationError('The signed-in account changed. Reopen the protected scope for your current account.',403);if(!viewer.sellerId)return reply({error:'Registration not found.'},404);const body=await readBoundedJsonObject(request);
    if(Object.keys(body).some(key=>!['kind','fields','reason','identityRevision','bankRevision','currentUnusable','commandId','accountId'].includes(key))
      ||!['identity','bank'].includes(String(body.kind))||!Array.isArray(body.fields)||!body.fields.every(field=>typeof field==='string')
      ||typeof body.reason!=='string'||typeof body.commandId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(body.commandId)||!Number.isSafeInteger(body.identityRevision)||!Number.isSafeInteger(body.bankRevision)
      ||typeof body.currentUnusable!=='boolean')return reply({error:'Choose the protected scope and explain the change.'},400);
    if(body.accountId!==viewer.userId)return reply({error:'The signed-in account changed. Reopen this request for your current account.'},409);
    const db=requireDatabase(env as unknown as {DB?:D1Database}),rate=await consumePublicRequestRateLimit(db,request,{scope:`seller-protected-request:${viewer.userId}`,limit:10,windowMs:60*60_000});if(!rate.allowed)return rateLimitJson(rate);
    const id=await requestProtectedChange(db,{sellerId:viewer.sellerId,actorId:viewer.userId,kind:body.kind as 'bank'|'identity',fields:body.fields as string[],reason:body.reason,
      expectedIdentityRevision:body.identityRevision as number,expectedBankRevision:body.bankRevision as number,currentUnusable:body.currentUnusable,requestId:body.commandId,now:Date.now()});
    return reply({ok:true,caseId:id});
  }catch(error){if(error instanceof ProtectedChangeError||error instanceof SellerCenterAuthorizationError)return reply({error:error.message},error.status);
    if(error instanceof BodyTooLargeError)return reply({error:'Change request content is too large.'},413);if(error instanceof SyntaxError)return reply({error:'Invalid change request content.'},400);
    return reply({error:'The change request could not be confirmed. Keep your reason and retry the same submission.'},503);}
}
