import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import {prepareSellerParcels,operateParcel,ParcelConflictError} from '@/lib/operations/parcels';
import {sendPendingOrderUpdates} from '@/lib/email/send-order-updates';
import {isValidatedFormVersionStale,validateSellerFormSubmission} from '@/lib/forms/submission';
import {FormRuntimeError} from '@/lib/forms/runtime';
import {FormValidationError} from '@/lib/forms/validation';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
const formActions=new Set(['record_cost','assign','cancel','dispatch','deliver','fail','retry','return_to_origin','receive_return','collect','propose_remittance']);
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 let validatedVersionId:string|undefined;
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);
 try{
  const actorId=request.headers.get(ACTOR_INTENT_HEADER);
  const staff=await requireStaffApi('order.manage',actorId?{intendedActorId:actorId}:undefined);const {id}=await context.params;
  let body:Record<string,unknown>;try{body=await readBoundedJsonObject(request) as Record<string,unknown>;if(!body||Array.isArray(body))throw new Error();}catch(error){if(error instanceof BodyTooLargeError)throw error;return reply({error:'Invalid request.'},400);}
  const text=(key:string)=>typeof body[key]==='string'?body[key] as string:undefined;
  const db=requireDatabase(env as unknown as {DB?:D1Database}),requestId=text('requestId');
  if(!requestId||requestId.length>150)return reply({error:'Request reference required.'},400);
  const action=text('action')??'';
  if(action==='fail'&&body.failureReason!==undefined&&(!actorId||typeof body.failureReason!=='string'))
   return reply({error:'Reopen the current parcel and choose a delivery failure reason.'},400);
  if(staff.role!=='super_admin'){
   if(text('method')==='own_rider'||text('riderEmail')||body.riderReportId)return reply({error:'Super Admin access is required.'},403);
   const target=text('jobId');
   if(target && await db.prepare("SELECT 1 FROM shipping_parcels WHERE shipping_job_id=? AND (method='own_rider' OR rider_user_id IS NOT NULL)").bind(target).first())return reply({error:'Super Admin access is required.'},403);
  }
  const form=formActions.has(action)?await validateSellerFormSubmission(db,'staff.parcel-control',body.formVersion,body.customAnswers,requestId):null;
  validatedVersionId=form?.versionId;
  if(body.action==='setup')await prepareSellerParcels(db,{orderId:id,actorId:staff.id,requestId,now:Date.now()});
  else{
   const jobId=text('jobId');if(!jobId||!await db.prepare('SELECT id FROM shipping_jobs WHERE id=? AND order_id=?').bind(jobId,id).first())return reply({error:'Parcel not found.'},404);
   await operateParcel(db,{jobId,actorId:staff.id,requestId,version:Number(body.version),action,note:text('note')??'',now:Date.now(),amountPaisa:typeof body.amountPaisa==='number'?body.amountPaisa:undefined,reference:text('reference'),cashRecordId:text('cashRecordId'),method:text('method'),riderEmail:text('riderEmail'),courierName:text('courierName'),trackingUrl:text('trackingUrl'),trackingCode:text('trackingCode'),failureReason:text('failureReason'),...(form?{form:{requestId,versionId:form.versionId,answers:form.answers}}:{})});
  }
  if(body.action!=='record_cost')await sendPendingOrderUpdates({orderId:id});return reply({ok:true});
 }catch(error){
    if (error instanceof BodyTooLargeError) return Response.json({ error: error.message }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  if(error instanceof FormRuntimeError)return reply({error:error.message,code:error.code},error.code==='stale_version'?409:503);
  if(error instanceof FormValidationError)return reply({error:error.message,fieldId:error.fieldId},400);
  if(validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as {DB?:D1Database}),
    'staff.parcel-control',validatedVersionId))return reply({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},409);
  return reply({error:error instanceof StaffAuthorizationError||error instanceof ParcelConflictError?error.message:'Parcel operation could not be completed.'},error instanceof StaffAuthorizationError?error.status:error instanceof ParcelConflictError?409:500);
 }
}
