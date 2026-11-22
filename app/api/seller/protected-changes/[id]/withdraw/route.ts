import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {withdrawProtectedChange} from '@/lib/sellers/protected-change-disposition';
import {ProtectedChangeError} from '@/lib/sellers/protected-change-policy';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
  try{const owner=await requireSellerCenterApi();if(hasActorIntentMismatch(request,owner.userId))throw new SellerCenterAuthorizationError('The signed-in account changed. Reopen this case for your current account.',403);const body=await readBoundedJsonObject(request),{id}=await context.params;
    if(Object.keys(body).some(key=>!['accountId','version','reason','commandId'].includes(key))||!Number.isSafeInteger(body.version)||typeof body.reason!=='string'
      ||typeof body.commandId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(body.commandId))return reply({error:'Record the current request version and withdrawal reason.'},400);
    if(body.accountId!==owner.userId)return reply({error:'The signed-in account changed. Reopen the owned request.',code:'account_changed'},409);
    await withdrawProtectedChange(requireDatabase(env as unknown as {DB?:D1Database}),{caseId:id,actorId:owner.userId,expectedVersion:body.version as number,reason:body.reason,requestId:body.commandId,now:Date.now()});
    return reply({ok:true,holdsRetained:true});
  }catch(error){if(error instanceof ProtectedChangeError||error instanceof SellerCenterAuthorizationError)return reply({error:error.message},error.status);
    if(error instanceof BodyTooLargeError)return reply({error:'Withdrawal reason is too large.'},413);if(error instanceof SyntaxError)return reply({error:'Invalid withdrawal request.'},400);
    return reply({error:'Withdrawal could not be confirmed. Keep the same request reference and retry.'},503);}
}
