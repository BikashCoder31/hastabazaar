import {getFormAnswerById,type StoredFormAnswer} from '../db/repositories/form-answers';
import {defaultAdminPermissions,validateAdminPermissions,type Permission} from '../marketplace/permissions';
import {commandReceipt} from '../workflows/contracts';
import {digestFormRequest} from './client-submission';
import type {FormAnswerViewer} from './access';

type Link=Pick<StoredFormAnswer,'id'|'formId'|'subjectType'|'subjectId'|'actorId'|'requestId'>;
interface Parent{eventId:string;revision:number;action:string;actorId:string;requestId:string;recordedAt:number;details:string|null;auditId:string;result:string;commandDigest:string;}

/** Operational care context is separate from financial decision answers in the
 * same form. A current grant alone cannot manufacture a committed native parent.
 */
export async function careOperationalAnswerGrant(db:D1Database,viewer:FormAnswerViewer,answer:Link):Promise<boolean|null>{
 const returned=answer.formId==='staff.return-case-action'&&answer.subjectType==='return_request',complaint=answer.formId==='staff.complaint-case-action'&&answer.subjectType==='complaint';
 if(!returned&&!complaint||!answer.actorId)return null;
 const physicalSql=`SELECT event.id AS eventId,event.revision,event.action,event.actor_id AS actorId,event.request_id AS requestId,event.recorded_at AS recordedAt,event.details_json AS details,audit.id AS auditId,audit.command_result_json AS result,audit.command_digest AS commandDigest
  FROM return_handling_events event JOIN audit_logs audit ON audit.subject_type='return_request' AND audit.subject_id=event.case_id AND audit.actor_id=event.actor_id AND audit.request_id=event.request_id AND audit.action='return.handling.'||event.action
  WHERE event.case_id=? AND event.request_id=? AND event.actor_id=?`;
 const followupSql=`SELECT event.id AS eventId,event.revision,'aftercare.followup' AS action,event.actor_id AS actorId,event.request_id AS requestId,event.created_at AS recordedAt,NULL AS details,audit.id AS auditId,audit.command_result_json AS result,audit.command_digest AS commandDigest
  FROM aftercare_followup_events event JOIN audit_logs audit ON audit.subject_type=event.source_type AND audit.subject_id=event.source_id AND audit.actor_id=event.actor_id AND audit.request_id=event.request_id AND audit.action='aftercare.followup'
  WHERE event.source_type=? AND event.source_id=? AND event.request_id=? AND event.actor_id=?`;
 let parent=returned?await db.prepare(physicalSql).bind(answer.subjectId,answer.requestId,answer.actorId).first<Parent>():null;
 const physical=!!parent;
 parent??=await db.prepare(followupSql).bind(answer.subjectType,answer.subjectId,answer.requestId,answer.actorId).first<Parent>();
 if(!parent)return null; // Existing financial-stage policy remains responsible.
 if(!['admin','super_admin'].includes(viewer.role))return false;
 const staff=await db.prepare(`SELECT u.id,u.status,r.role,p.user_id AS profileId,p.permissions_json AS profile
  FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
  WHERE u.id=? AND r.role=?`).bind(viewer.id,viewer.role).first<{id:string;status:string;role:string;profileId:string|null;profile:string|null}>();
 if(!staff||staff.id!==viewer.id||staff.status!=='active'||staff.role!==viewer.role||physical&&parent.action==='waive_return'&&staff.role!=='super_admin')return false;
 if(staff.role!=='super_admin'){
  let permissions:Permission[];try{permissions=staff.profileId===null?[...defaultAdminPermissions]:validateAdminPermissions(JSON.parse(staff.profile??'null'));}catch{return false;}
  if(!(returned?['refund.approve.standard','order.manage','support.manage']:['support.manage']).some(permission=>permissions.includes(permission as Permission)))return false;
 }
 const stored=await getFormAnswerById(db,answer.id);
 if(!stored||stored.formId!==answer.formId||stored.subjectType!==answer.subjectType||stored.subjectId!==answer.subjectId||stored.actorId!==answer.actorId||stored.requestId!==answer.requestId)return false;
 let result:Record<string,unknown>;try{result=JSON.parse(parent.result);if(!result||Array.isArray(result)||result.id!==answer.subjectId||result.revision!==parent.revision||!/^[a-f0-9]{64}$/.test(parent.commandDigest))return false;}catch{return false;}
 const form={versionId:stored.versionId,answers:stored.answers};
 if(typeof result.formContextDigest==='string'){
  if(result.formContextDigest!==await digestFormRequest(form))return false;
 }else{
  // Older physical receipts retain the exact original JSON input. Do not adopt
  // later detached answers, or guess missing/trimmed historical input.
  if(!physical||!parent.details)return false;
  try{const payload=JSON.parse(parent.details);const receipt=await commandReceipt(db,{actorId:parent.actorId,requestId:parent.requestId,expectedRevision:String(parent.revision-1),now:parent.recordedAt},{action:'return.handling.'+parent.action,subjectType:'return_request',subjectId:answer.subjectId},{...payload,form});if(!receipt.replayed)return false;}catch{return false;}
 }
 const exact=(column:string)=>((db as D1Database&{dialect?:string}).dialect==='mariadb'?'BINARY '+column+'=BINARY ?':column+'=?');
 const actor=`EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND ${exact('u.id')} AND ${exact('u.status')} AND ${exact('r.role')} AND ${staff.profileId===null?'NOT EXISTS(SELECT 1 FROM staff_permission_profiles p WHERE p.user_id=u.id)':`EXISTS(SELECT 1 FROM staff_permission_profiles p WHERE p.user_id=u.id AND ${exact('p.permissions_json')})`})`;
 const party=returned?`EXISTS(SELECT 1 FROM return_requests p JOIN order_items item ON item.id=p.order_item_id JOIN orders o ON o.id=item.order_id JOIN seller_profiles seller ON seller.id=item.seller_id WHERE p.id=? AND (o.customer_id IS NULL OR o.customer_id<>?) AND ${physical?'seller.user_id<>?':'NOT EXISTS(SELECT 1 FROM order_items other JOIN seller_profiles own_seller ON own_seller.id=other.seller_id WHERE other.order_id=o.id AND own_seller.user_id=?)'})`:`EXISTS(SELECT 1 FROM complaints p JOIN orders o ON o.id=p.order_id WHERE p.id=? AND (o.customer_id IS NULL OR o.customer_id<>?) AND NOT EXISTS(SELECT 1 FROM order_items item JOIN seller_profiles seller ON seller.id=item.seller_id WHERE item.order_id=o.id AND seller.user_id=?))`;
 const event=physical?'EXISTS(SELECT 1 FROM return_handling_events WHERE id=? AND case_id=? AND revision=?)':'EXISTS(SELECT 1 FROM aftercare_followup_events WHERE id=? AND source_id=? AND revision=?)';
 return Boolean(await db.prepare(`SELECT 1 WHERE ${actor} AND ${party} AND ${event} AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND command_digest=? AND command_result_json=?)`).bind(viewer.id,viewer.id,'active',viewer.role,...(staff.profileId===null?[]:[staff.profile]),answer.subjectId,viewer.id,viewer.id,parent.eventId,answer.subjectId,parent.revision,parent.auditId,parent.commandDigest,parent.result).first());
}
