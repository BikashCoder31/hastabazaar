import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {consumePublicRequestRateLimit,rateLimitJson} from '@/lib/http/rate-limit';
import {ownerPublicProfileCommand} from '@/lib/sellers/public-profile-commands';
import {getPublicProfileWorkspace} from '@/lib/sellers/public-profile-workflow';
import {PublicProfileError} from '@/lib/sellers/public-profile-types';
import {FormRuntimeError} from '@/lib/forms/runtime';
import {FormValidationError} from '@/lib/forms/validation';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){
 if(error instanceof SellerCenterAuthorizationError||error instanceof PublicProfileError)return reply({error:error.message},error.status);
 if(error instanceof SyntaxError)return reply({error:'Invalid profile command.'},400);
 if(error instanceof BodyTooLargeError)return reply({error:error.message},413);
 if(error instanceof FormRuntimeError)return reply({error:error.message},error.code==='stale_version'?409:503);
 if(error instanceof FormValidationError)return reply({error:error.message,fieldId:error.fieldId},400);
 return reply({error:'The profile result could not be confirmed. Keep your entries and retry the same request.'},503);
}
export async function GET(request?:Request){
 try{const owner=await requireSellerCenterApi();if(request&&hasActorIntentMismatch(request,owner.userId))throw new SellerCenterAuthorizationError('The signed-in account changed. Reopen your current Seller workspace.',403);if(!owner.sellerId)return reply({error:'Seller application not found.'},404);
  const workspace=await getPublicProfileWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),owner.sellerId,owner.userId,'owner',Date.now());
  const current=await requireSellerCenterApi();if(current.userId!==owner.userId||current.sellerId!==owner.sellerId)throw new SellerCenterAuthorizationError('The current Seller owner changed. Reopen this workspace.',403);
  return reply(workspace);
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{const owner=await requireSellerCenterApi();if(request&&hasActorIntentMismatch(request,owner.userId))throw new SellerCenterAuthorizationError('The signed-in account changed. Reopen your current Seller workspace.',403);if(!owner.sellerId)return reply({error:'Seller application not found.'},404);
  const body=await readBoundedJsonObject(request),db=requireDatabase(env as unknown as {DB?:D1Database});
  if(body.sellerId!==owner.sellerId||body.ownerId!==owner.userId)return reply({error:'This draft belongs to another account. Return to its signed-in owner before retrying.'},403);
  const rate=await consumePublicRequestRateLimit(db,request,{scope:`public-profile:${owner.userId}`,limit:120,windowMs:60*60_000});
  if(!rate.allowed)return rateLimitJson(rate);
  const {sellerId:_seller,ownerId:_owner,...command}=body;
  const result=await ownerPublicProfileCommand(db,owner.sellerId,owner.userId,command,Date.now());return reply({ok:true,result:result??null});
 }catch(error){return failure(error);}
}
