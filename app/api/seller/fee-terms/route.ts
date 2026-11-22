import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {FeePolicyError,getRegisteredFeeOffers,acceptRegisteredFeeOffer} from '@/lib/commission/coordinated-policy';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){if(error instanceof FeePolicyError||error instanceof SellerCenterAuthorizationError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:error.message},413);if(error instanceof SyntaxError)return reply({error:'Invalid fee acceptance request.'},400);return reply({error:'Acceptance could not be confirmed. Keep the exact request for recovery.'},503);}
export async function GET(){try{const viewer=await requireSellerCenterApi();if(!viewer.sellerId)return reply({error:'An existing seller registration is required.'},403);return reply(await getRegisteredFeeOffers(requireDatabase(env as unknown as {DB?:D1Database}),viewer.sellerId,Date.now()));}catch(error){return failure(error);}}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{const viewer=await requireSellerCenterApi();if(!viewer.sellerId)return reply({error:'An existing seller registration is required.'},403);const body=await readBoundedJsonObject(request);
  if(Object.keys(body).some(key=>!['requestId','versionId','context','accepted'].includes(key))||body.accepted!==true||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||typeof body.versionId!=='string'||typeof body.context!=='string'||!/^[a-f0-9]{64}$/.test(body.context))return reply({error:'Explicitly accept the exact displayed fee offer.'},400);
  return reply(await acceptRegisteredFeeOffer(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:viewer.userId,requestId:body.requestId,expectedRevision:null,now:Date.now()},{sellerId:viewer.sellerId,versionId:body.versionId,context:body.context,accepted:true}));
 }catch(error){return failure(error);}
}
