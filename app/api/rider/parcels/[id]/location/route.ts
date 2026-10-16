import { isRiderPortalEnabled } from '@/lib/riders/availability';
import { riderPortalHoldResponse } from '@/lib/riders/portal-hold';
import {env} from 'cloudflare:workers';
import {requireCustomerApi,CustomerAuthorizationError} from '@/lib/auth/customer';
import {requireDatabase} from '@/lib/db/d1';
import {shareParcelLocation as updateRiderLocation,ParcelConflictError as DeliveryError} from '@/lib/operations/parcels';
import {readBoundedBody} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {consumePublicRequestRateLimit as consumeRequestRateLimit,rateLimitJson} from '@/lib/http/rate-limit';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  if (!isRiderPortalEnabled()) return riderPortalHoldResponse();
 if(!isTrustedMutationRequest(request))return Response.json({error:'Cross-site request rejected.'},{status:403});
 try{const rider=await requireCustomerApi();const db=requireDatabase(env as unknown as {DB?:D1Database});const {id}=await context.params;const body=JSON.parse(new TextDecoder().decode(await readBoundedBody(request,4096))) as {location?:unknown};
 const rate=await consumeRequestRateLimit(db,request,{scope:'rider-position:'+rider.userId,limit:20,windowMs:60000});if(!rate.allowed)return rateLimitJson(rate);
 await updateRiderLocation(db,id,rider.userId,body?.location,Date.now());return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof DeliveryError||e instanceof CustomerAuthorizationError?e.message:'Location update failed.'},{status:e instanceof CustomerAuthorizationError?e.status:e instanceof DeliveryError?409:500});}
}
