import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {assignDelivery,DeliveryError} from '@/lib/delivery/repository';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 if(!isTrustedMutationRequest(request))return Response.json({error:'Cross-site request rejected.'},{status:403});
 try{const staff=await requireStaffApi('order.manage');const {id}=await context.params;const b=await request.json() as Record<string,string>;
 if(!b||typeof b.method!=='string'||['riderEmail','courierName','trackingUrl','trackingReference'].some(k=>b[k]!==undefined&&typeof b[k]!=='string'))return Response.json({error:'Invalid assignment.'},{status:400});
 await assignDelivery(requireDatabase(env as unknown as {DB?:D1Database}),{orderId:id,actorId:staff.id,method:b.method,riderEmail:b.riderEmail,courierName:b.courierName,trackingUrl:b.trackingUrl,trackingReference:b.trackingReference,now:Date.now()});return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof DeliveryError||e instanceof StaffAuthorizationError?e.message:'Assignment could not be saved.'},{status:e instanceof StaffAuthorizationError?e.status:e instanceof DeliveryError?409:500});}
}
