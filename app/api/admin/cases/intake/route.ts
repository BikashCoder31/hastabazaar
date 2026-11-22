import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {validateSellerFormSubmission} from '@/lib/forms/submission';
import {FormRuntimeError} from '@/lib/forms/runtime';
import {parseReturnRequest} from '@/lib/returns/validation';
import {createCustomerReturnRequest,ReturnConflictError} from '@/lib/db/repositories/returns';
import {createCustomerComplaint,complaintCategories,ComplaintConflictError,type ComplaintCategory} from '@/lib/db/repositories/complaints';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 try{const actor=await requireStaffApi('support.manage'),db=requireDatabase(env as unknown as {DB?:D1Database}),query=new URL(request.url).searchParams,type=query.get('sourceType'),order=query.get('order'),attempt=query.get('attempt');
  if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in staff account changed. Open this original care record again.',403);
  if(!['return_request','complaint'].includes(type??'')||!order||!attempt)return json({error:'Use the original intake reference.'},400);
  const row=await db.prepare(type==='return_request'?`SELECT r.id FROM return_requests r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id WHERE r.created_request_id=? AND r.intake_recorded_by=? AND o.order_number=?`:`SELECT c.id FROM complaints c JOIN orders o ON o.id=c.order_id WHERE c.created_request_id=? AND c.intake_recorded_by=? AND o.order_number=?`).bind(attempt,actor.id,order).first<{id:string}>();return json({outcome:row});
 }catch(error){return json({error:error instanceof StaffAuthorizationError?error.message:'The supported intake outcome could not be checked.'},error instanceof StaffAuthorizationError?error.status:503);}
}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return json({error:'Cross-site request rejected.'},403);
 try{const actor=await requireStaffApi('support.manage'),db=requireDatabase(env as unknown as {DB?:D1Database}),body=await readBoundedJsonObject(request),allowed=['sourceType','orderNumber','orderItemId','quantity','reason','requestedResolution','originalSealIntact','category','subject','detail','locale','receivedAt','channel','sourceReference','requestId','formVersion','customAnswers'];
  if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in staff account changed. Open this original care record again.',403);
  if(Object.keys(body).some(key=>!allowed.includes(key))||!['return_request','complaint'].includes(String(body.sourceType))||typeof body.orderNumber!=='string'||typeof body.requestId!=='string'||body.requestId.length<8||body.requestId.length>100||!Number.isSafeInteger(body.receivedAt)||!['email','support'].includes(String(body.channel))||typeof body.sourceReference!=='string'||typeof body.detail!=='string'||body.detail.length<10||body.detail.length>4000||!['en-NP','ne-NP'].includes(String(body.locale))||!Number.isSafeInteger(body.formVersion)||!Array.isArray(body.customAnswers))return json({error:'Retain the exact order, first receipt and source evidence using the current form.'},400);
  const order=await db.prepare('SELECT customer_id AS customerId,receipt_token_hash AS receiptHash FROM orders WHERE order_number=?').bind(body.orderNumber).first<{customerId:string|null;receiptHash:string|null}>();if(!order)return json({error:'The original order was not found.'},404);
  const returned=body.sourceType==='return_request',form=await validateSellerFormSubmission(db,returned?'commerce.return-request':'commerce.complaint',body.formVersion,body.customAnswers,body.requestId),common={orderNumber:body.orderNumber,customerId:order.customerId,receiptTokenHash:order.receiptHash,detail:body.detail,locale:body.locale as 'en-NP'|'ne-NP',now:Date.now(),form:{versionId:form.versionId,answers:form.answers},supportIntake:{actorId:actor.id,receivedAt:body.receivedAt as number,channel:body.channel as 'email'|'support',sourceReference:body.sourceReference}};
  if(returned){const data=new FormData();for(const key of ['orderItemId','quantity','reason','requestedResolution','detail','locale']){const value=body[key]??'';if(typeof value!=='string'&&(key!=='quantity'||typeof value!=='number'))return json({error:'Use text return fields and an exact quantity.'},400);data.set(key,String(value));}data.set('idempotencyKey',body.requestId);if(body.originalSealIntact===true)data.set('originalSealIntact','yes');const parsed=parseReturnRequest(data);if(!parsed.input)return json({error:parsed.errors.join(' ')},400);return json(await createCustomerReturnRequest(db,{...common,...parsed.input,evidence:[]}));}
  if(!complaintCategories.includes(body.category as ComplaintCategory)||typeof body.subject!=='string'||body.subject.length<5||body.subject.length>200||body.orderItemId!==null&&typeof body.orderItemId!=='string')return json({error:'Choose the actual complaint category, subject and optional item.'},400);
  return json(await createCustomerComplaint(db,{...common,orderItemId:body.orderItemId as string|null,category:body.category as ComplaintCategory,subject:body.subject,requestId:body.requestId}));
 }catch(error){return json({error:error instanceof ReturnConflictError||error instanceof ComplaintConflictError||error instanceof FormRuntimeError||error instanceof StaffAuthorizationError?error.message:'The supported intake could not be confirmed. Check its original outcome.',...(error instanceof FormRuntimeError?{code:error.code}:{})},error instanceof StaffAuthorizationError?error.status:error instanceof ReturnConflictError||error instanceof ComplaintConflictError?409:503);}
}
