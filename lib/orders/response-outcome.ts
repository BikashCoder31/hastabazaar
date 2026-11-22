import {can,validateAdminPermissions} from '../marketplace/permissions';
import {OrderResponseError} from './response-cases';

/** Read an own immutable command receipt; never reconstruct or resend its private input. */
export async function preparationCommandOutcome(db:D1Database,actorId:string,audience:'seller'|'staff',input:{orderId:string;sourceId:string;action:'report'|'followup';attempt:string;actorAuthSubject?:string|null}){
 if(audience==='seller'&&input.action!=='report')throw new OrderResponseError('This action is not available in your workspace.',403);
 const portionId=input.action==='report'?input.sourceId:(await db.prepare('SELECT portion_id AS id FROM order_response_cases WHERE id=?').bind(input.sourceId).first<{id:string}>())?.id;
 if(!portionId)throw new OrderResponseError('The original preparation source is unavailable.',404);
 let observedSubject=input.actorAuthSubject;
 async function assertCurrent(){
  // One final native read binds current role/profile, operator and both personal parties.
  const rows=(await db.prepare(`SELECT u.id,u.status,u.auth_subject AS authSubject,r.role,p.permissions_json AS profile,
   s.user_id AS sellerOwner,o.customer_id AS customerId,q.id AS portionId,q.order_id AS orderId,q.operator_mode AS mode
   FROM order_response_portions q JOIN orders o ON o.id=q.order_id JOIN seller_profiles s ON s.id=q.seller_id
   JOIN users u ON u.id=? LEFT JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
   WHERE q.id=?`).bind(actorId,portionId).all<{id:string;status:string;authSubject:string|null;role:string;profile:string|null;sellerOwner:string;customerId:string|null;portionId:string;orderId:string;mode:string}>()).results;
  if(!rows.length||rows[0].portionId!==portionId||rows[0].orderId!==input.orderId)throw new OrderResponseError('This original preparation source does not belong to the selected order.',404);
  const allowed=rows.some(row=>{
   if(row.id!==actorId||row.status!=='active')return false;
   if(audience==='seller')return row.mode==='seller'&&row.sellerOwner===actorId&&(row.role==='customer'||row.role==='seller');
   if(row.customerId===actorId||row.sellerOwner===actorId||row.mode==='company'&&row.role!=='super_admin')return false;
   if(row.role!=='admin'&&row.role!=='super_admin')return false;
   try{return can({role:row.role,permissions:row.profile===null?undefined:validateAdminPermissions(JSON.parse(row.profile))},'order.manage');}catch{return false;}
  });
  if(!allowed)throw new OrderResponseError('Current authority over this original preparation source is required.',403);
  if(observedSubject!==undefined&&rows[0].authSubject!==observedSubject)throw new OrderResponseError('The authenticated preparation identity changed.',403);
  observedSubject=rows[0].authSubject;
 }
 await assertCurrent();
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actorId,input.attempt]))),key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const receipt=await db.prepare('SELECT actor_id AS actorId,action,subject_type AS subjectType,subject_id AS subjectId,request_id AS requestId,command_result_json AS result FROM audit_logs WHERE command_key=?').bind(key).first<{actorId:string;action:string;subjectType:string;subjectId:string;requestId:string;result:string}>();
 let outcome:{id:string;revision?:number}|null=null;
 if(receipt){
  const action='order.response.'+(input.action==='report'?'issue.reported':'followup.recorded');
  if(receipt.actorId!==actorId||receipt.requestId!==input.attempt||receipt.action!==action||receipt.subjectType!=='order_response'||receipt.subjectId!==input.sourceId)throw new OrderResponseError('The saved reference belongs to a different original action.',409);
  let result:unknown;try{result=JSON.parse(receipt.result);}catch{throw new OrderResponseError('The original saved receipt could not be verified.',409);}
  if(!result||typeof result!=='object'||!('id'in result)||typeof result.id!=='string')throw new OrderResponseError('The original saved receipt could not be verified.',409);
  const native=await db.prepare('SELECT c.id,c.portion_id AS portionId,e.actor_id AS actorId,e.source_key AS sourceKey FROM order_response_cases c JOIN order_response_events e ON e.case_id=c.id WHERE c.id=? AND e.source_key=?').bind(result.id,input.action==='report'?'issue:'+result.id:'followup:'+actorId+':'+input.attempt).first<{id:string;portionId:string;actorId:string;sourceKey:string}>();
  if(!native||native.id!==result.id||native.portionId!==portionId||native.actorId!==actorId||native.sourceKey!==(input.action==='report'?'issue:'+result.id:'followup:'+actorId+':'+input.attempt))throw new OrderResponseError('The original native action and receipt could not be verified.',409);
  outcome={id:result.id};
  if(input.action==='followup'){
   const revision=(result as {revision?:unknown}).revision;if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<1)throw new OrderResponseError('The recorded revision could not be verified.',409);
   outcome.revision=revision;
  }
 }
 await assertCurrent();
 return outcome;
}
