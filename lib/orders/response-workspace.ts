import {withNativeFormLoad} from '../operations/native-form-health';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {withOrderOfferSnapshots} from '../products/offer-order-contract';
import {readOrderResponsePortion} from './response-workflow';
import {OrderResponseError} from './response-cases';
import {can,validateAdminPermissions} from '../marketplace/permissions';

export type PreparationAudience='seller'|'staff'|'customer';
/** Authorize before loading private case detail. References may be an order, case or notification event. */
async function readPreparationWorkspaceSource(db:D1Database,actorId:string,reference:string,audience:PreparationAudience,identity:{actorAuthSubject?:string|null}={}){
 const order=await db.prepare(`SELECT id,order_number AS number,customer_id AS customerId FROM orders WHERE id=? OR id IN(SELECT order_id FROM order_response_events WHERE id=?) OR id IN(SELECT p.order_id FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id WHERE c.id=?) LIMIT 1`).bind(reference,reference,reference).first<{id:string;number:string;customerId:string|null}>();
 if(!order)return null;
 const originalActor=await db.prepare("SELECT u.id,u.auth_subject AS authSubject,CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND HEX(r.role) IN(HEX('customer'),HEX('seller'))) THEN 1 ELSE 0 END AS sellerAccess,CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND HEX(r.role)=HEX('customer')) THEN 1 ELSE 0 END AS customerAccess FROM users u WHERE u.id=? AND u.status='active'").bind(actorId).first<{id:string;authSubject:string|null;sellerAccess:number;customerAccess:number}>();
 if(!originalActor||originalActor.id!==actorId||identity.actorAuthSubject!==undefined&&identity.actorAuthSubject!==originalActor.authSubject)return null;
 if(audience==='seller'&&!originalActor.sellerAccess||audience==='customer'&&!originalActor.customerAccess)return null;
 let superAdmin=false;
 if(audience==='customer'&&order.customerId!==actorId)return null;
 if(audience==='staff')superAdmin=(await staffMutationGuard(db,actorId,'order.manage',OrderResponseError)).role==='super_admin';
 const entries=(await db.prepare(`SELECT p.id,p.operator_mode AS mode,s.user_id AS sellerOwner FROM order_response_portions p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.order_id=? AND ${audience==='seller'?"s.user_id=? AND p.operator_mode='seller'":audience==='staff'&&!superAdmin?"p.operator_mode='seller'":'1=1'} ORDER BY p.created_at,p.id`).bind(order.id,...(audience==='seller'?[actorId]:[])).all<{id:string;mode:string;sellerOwner:string}>()).results;
 if(audience==='seller'&&!entries.length&&!await db.prepare('SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=? AND s.user_id=?').bind(order.id,actorId).first())return null;
 const portions=[];
 for(const entry of entries){const portion=await readOrderResponsePortion(db,entry.id);if(!portion)continue;
  const cases=(await db.prepare(`SELECT id,kind,state,scope_json AS scopeJson,public_message AS publicMessage,proposed_ready_at AS proposedReadyAt,owner_id AS ownerId,backup_id AS backupId,created_at AS createdAt,first_due_at AS firstDueAt,next_update_at AS nextUpdateAt,commitment_missing AS commitmentMissing,revision,${audience==='staff'?'private_detail':"NULL"} AS privateDetail FROM order_response_cases WHERE portion_id=? ORDER BY created_at,id`).bind(entry.id).all<{id:string;kind:string;state:string;scopeJson:string;publicMessage:string|null;proposedReadyAt:number|null;ownerId:string|null;backupId:string|null;createdAt:number;firstDueAt:number;nextUpdateAt:number|null;commitmentMissing:number;revision:number;privateDetail:string|null}>()).results;
  const visibleCases=[];
  for(const c of cases){const history=audience==='staff'?(await db.prepare('SELECT e.id,e.kind,e.note,e.created_at AS createdAt,u.display_name AS actor FROM order_response_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.case_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 20').bind(c.id).all<{id:string;kind:string;note:string;createdAt:number;actor:string|null}>()).results:[];visibleCases.push({...c,history,proposedReadyAt:audience==='staff'?c.proposedReadyAt:null,ownerId:audience==='staff'?c.ownerId:null,backupId:audience==='staff'?c.backupId:null,itemIds:JSON.parse(c.scopeJson) as string[]});}
  const canAct=audience==='seller'||audience==='staff'&&order.customerId!==actorId&&entry.sellerOwner!==actorId&&(entry.mode!=='company'||superAdmin);
  portions.push({id:portion.id,operatorMode:portion.operatorMode,canAct,items:await withOrderOfferSnapshots(db,portion.items,i=>i.id),cases:visibleCases});
 }
 const reviewers:Array<{id:string;name:string;role:string}>=[];
 if(audience==='staff'){
  const candidates=(await db.prepare("SELECT DISTINCT u.id,u.display_name AS name FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role IN('admin','super_admin') AND (? IS NULL OR u.id<>?) AND NOT EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=? AND s.user_id=u.id)").bind(order.customerId,order.customerId,order.id).all<{id:string;name:string}>()).results;
  for(const candidate of candidates){try{const access=await staffMutationGuard(db,candidate.id,'order.manage',OrderResponseError);reviewers.push({...candidate,role:access.role});}catch(error){if(!(error instanceof OrderResponseError))throw error;}}
 }
 // A single final native read fences private projections, original identity and
 // the exact visible source revisions after every asynchronous history lookup.
 const current=(await db.prepare(`SELECT u.id,u.status,u.auth_subject AS authSubject,r.role,profile.permissions_json AS permissions,
  o.id AS orderId,o.customer_id AS customerId,p.id AS portionId,p.operator_mode AS mode,s.user_id AS sellerOwner,c.id AS caseId,c.revision,
  CASE WHEN EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles seller ON seller.id=i.seller_id WHERE i.order_id=o.id AND seller.user_id=u.id) THEN 1 ELSE 0 END AS ownsItem
  FROM users u JOIN orders o ON o.id=? LEFT JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles profile ON profile.user_id=u.id
  LEFT JOIN order_response_portions p ON p.order_id=o.id LEFT JOIN seller_profiles s ON s.id=p.seller_id LEFT JOIN order_response_cases c ON c.portion_id=p.id
  WHERE u.id=?`).bind(order.id,actorId).all<{id:string;status:string;authSubject:string|null;role:string|null;permissions:string|null;orderId:string;customerId:string|null;portionId:string|null;mode:string|null;sellerOwner:string|null;caseId:string|null;revision:number|null;ownsItem:number}>()).results;
 if(!current.length||current.some(row=>row.id!==actorId||row.status!=='active'||row.authSubject!==originalActor.authSubject||row.orderId!==order.id||row.customerId!==order.customerId))return null;
 if(audience==='customer'&&current[0].customerId!==actorId)return null;
 if(audience==='seller'&&!current.some(row=>row.role==='customer'||row.role==='seller')||audience==='customer'&&!current.some(row=>row.role==='customer'))return null;
 if(audience==='staff'){
  if(current.some(row=>row.role==='super_admin')!==superAdmin)return null;
  if(!current.some(row=>{if(row.role!=='admin'&&row.role!=='super_admin')return false;try{return can({role:row.role,permissions:row.permissions===null?undefined:validateAdminPermissions(JSON.parse(row.permissions))},'order.manage');}catch{return false;}}))return null;
 }
 const visible=current.filter(row=>row.portionId!==null&&(audience==='seller'?row.mode==='seller'&&row.sellerOwner===actorId:audience==='staff'&&!superAdmin?row.mode==='seller':true));
 if(audience==='seller'&&!visible.length&&!current[0].ownsItem)return null;
 const visibleIds=new Set(visible.map(row=>row.portionId));
 if(visibleIds.size!==entries.length||portions.length!==entries.length)return null;
 for(const entry of entries){
  const rows=visible.filter(row=>row.portionId===entry.id),projection=portions.find(portion=>portion.id===entry.id);
  if(!projection||!rows.length||rows.some(row=>row.mode!==entry.mode||row.sellerOwner!==entry.sellerOwner)||projection.operatorMode!==entry.mode)return null;
  const caseIds=new Set(rows.flatMap(row=>row.caseId===null?[]:[row.caseId]));
  if(caseIds.size!==projection.cases.length||projection.cases.some(c=>!rows.some(row=>row.caseId===c.id&&row.revision===c.revision)))return null;
 }
 return {orderId:order.id,orderNumber:order.number,actorId,audience,portions,reviewers};
}
export type PreparationWorkspace=NonNullable<Awaited<ReturnType<typeof readPreparationWorkspace>>>;

export async function readPreparationWorkspace(db:D1Database,actorId:string,reference:string,audience:PreparationAudience,identity:{actorAuthSubject?:string|null}={}){
 return withNativeFormLoad(db,audience==='customer'?[]:[audience+'.order-preparation'],()=>readPreparationWorkspaceSource(db,actorId,reference,audience,identity));
}
