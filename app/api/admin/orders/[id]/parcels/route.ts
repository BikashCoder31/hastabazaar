import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedBody} from '@/lib/http/bounded-body';
import {prepareSellerParcels,operateParcel,ParcelConflictError} from '@/lib/operations/parcels';
import {sendPendingOrderUpdates} from '@/lib/email/send-order-updates';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);
 try{
  const staff=await requireStaffApi('order.manage');const {id}=await context.params;
  let body:Record<string,unknown>;try{body=JSON.parse(new TextDecoder().decode(await readBoundedBody(request,16384))) as Record<string,unknown>;if(!body||Array.isArray(body))throw new Error();}catch{return reply({error:'Invalid or oversized request.'},400);}
  const text=(key:string)=>typeof body[key]==='string'?body[key] as string:undefined;
  const db=requireDatabase(env as unknown as {DB?:D1Database}),requestId=text('requestId');
  if(!requestId||requestId.length>150)return reply({error:'Request reference required.'},400);
  if(body.action==='setup')await prepareSellerParcels(db,{orderId:id,actorId:staff.id,requestId,now:Date.now()});
  else{
   const jobId=text('jobId');if(!jobId||!await db.prepare('SELECT id FROM shipping_jobs WHERE id=? AND order_id=?').bind(jobId,id).first())return reply({error:'Parcel not found.'},404);
   await operateParcel(db,{jobId,actorId:staff.id,requestId,version:Number(body.version),action:text('action')??'',note:text('note')??'',now:Date.now(),amountPaisa:typeof body.amountPaisa==='number'?body.amountPaisa:undefined,reference:text('reference'),cashRecordId:text('cashRecordId'),method:text('method'),riderEmail:text('riderEmail'),courierName:text('courierName'),trackingUrl:text('trackingUrl'),trackingCode:text('trackingCode')});
  }
  if(body.action!=='record_cost')await sendPendingOrderUpdates({orderId:id});return reply({ok:true});
 }catch(error){return reply({error:error instanceof StaffAuthorizationError||error instanceof ParcelConflictError?error.message:'Parcel operation could not be completed.'},error instanceof StaffAuthorizationError?error.status:error instanceof ParcelConflictError?409:500);}
}
