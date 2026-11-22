import {responseScopeContains} from './response-sql';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {preparationReviewTask} from './response-task';
const day=86400000;
/** Retain overdue promises. Automated factual updates never extend a human commitment or invent coverage. */
export async function processPreparationCaseSupervision(db:D1Database,limit=100,caseId?:string){
 const clock=checkoutCommitClock(db),now=Number((await db.prepare(`SELECT ${clock} AS now`).first<{now:number}>())!.now);
 const cases=(await db.prepare(`SELECT c.id,c.portion_id AS portionId,c.scope_json AS scopeJson,c.state,c.revision,c.created_at AS createdAt,c.first_action_at AS firstActionAt,c.first_due_at AS firstDueAt,c.next_update_at AS nextUpdateAt,p.order_id AS orderId,p.operator_mode AS mode,
 (SELECT MIN(r.released_at) FROM order_response_items r WHERE ${responseScopeContains(db,'c.scope_json','r.order_item_id')}) AS releasedAt
 FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id WHERE c.state<>'resolved' ${caseId?' AND c.id=?':''} ORDER BY c.created_at,c.id LIMIT ?`).bind(...(caseId?[caseId]:[]),limit).all<{id:string;portionId:string;scopeJson:string;state:string;revision:number;createdAt:number;firstActionAt:number|null;firstDueAt:number;nextUpdateAt:number|null;orderId:string;mode:string;releasedAt:number|null}>()).results;
 let alerts=0;
 for(const c of cases){
  const candidates:Array<{kind:'followup'|'checkpoint';key:string;due:number;customer:boolean;message:string;once?:boolean}>=[];
  if(c.firstActionAt===null&&now>c.createdAt&&now>=c.firstDueAt)candidates.push({kind:'followup',key:'first-followup',due:c.firstDueAt,customer:false,message:'The first preparation follow-up is overdue. An eligible owner must record the actual next action.'});
  if(c.releasedAt!==null&&now>=c.releasedAt+day&&await db.prepare(`SELECT 1 FROM order_response_items r WHERE ${responseScopeContains(db,'?','r.order_item_id')} AND NOT EXISTS(SELECT 1 FROM order_response_milestones m WHERE m.order_item_id=r.order_item_id AND m.milestone='checkpoint')`).bind(c.scopeJson).first())candidates.push({kind:'checkpoint',key:'absolute-checkpoint',due:c.releasedAt+day,customer:false,once:true,message:'This unresolved preparation case has reached the absolute original-release checkpoint. Review its actual owner, progress and scoped blockers.'});
  const updateDue=c.nextUpdateAt??c.createdAt+day;
  if(now>=updateDue)candidates.push({kind:'followup',key:'customer-update',due:updateDue,customer:true,message:c.nextUpdateAt===null?'The preparation issue remains unresolved. Support still needs to confirm an accountable next update. Open your order to contact support.':'The preparation issue remains unresolved and the expected update has not been recorded. Open your order to contact support. The original commitment remains visible.'});
  for(const alert of candidates){
   const period=alert.once?0:Math.floor((now-alert.due)/day),sourceKey=`supervision:${c.id}:${alert.key}:${alert.once?'once':c.revision+':'+alert.due+':'+period}`;
   if(await db.prepare('SELECT 1 FROM order_response_events WHERE source_key=?').bind(sourceKey).first())continue;
   const eventId=crypto.randomUUID(),guardId=crypto.randomUUID(),dueAt=alert.due+period*day,expiresAt=alert.once?null:dueAt+day;
   const statements=[db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(c.orderId),db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM order_response_cases WHERE id=? AND revision=? AND state<>'resolved') AND ${clock}>=? ${expiresAt===null?'':`AND ${clock}<?`} THEN 1 ELSE 0 END`).bind(guardId,c.id,c.revision,dueAt,...(expiresAt===null?[]:[expiresAt])),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),preparationReviewTask(db,c.id),db.prepare(`INSERT INTO order_response_events(id,portion_id,case_id,order_id,kind,scope_json,source_key,note,created_at,case_state,case_revision,due_at,expires_at) VALUES(?,?,?,?,?,?,?,?,${clock},?,?,?,?)`).bind(eventId,c.portionId,c.id,c.orderId,alert.kind,c.scopeJson,sourceKey,alert.message,c.state,c.revision,dueAt,expiresAt),...await operationalBusinessNotificationStatements(db,{kind:'order.response',sourceId:eventId,eventId,actorId:'system',now,status:alert.kind+'_'+c.mode,detail:alert.message})];
   if(alert.kind==='checkpoint'){
    const checkpointGuard=crypto.randomUUID();statements.push(db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM order_response_items r WHERE ${responseScopeContains(db,'?','r.order_item_id')} AND NOT EXISTS(SELECT 1 FROM order_response_milestones m WHERE m.order_item_id=r.order_item_id AND m.milestone='checkpoint')) THEN 1 ELSE 0 END`).bind(checkpointGuard,c.scopeJson),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(checkpointGuard),db.prepare(`INSERT OR IGNORE INTO order_response_milestones(order_item_id,milestone,event_id,created_at) SELECT r.order_item_id,'checkpoint',?,${clock} FROM order_response_items r WHERE ${responseScopeContains(db,'?','r.order_item_id')}`).bind(eventId,c.scopeJson));
   }
   if(alert.customer){const customerId=crypto.randomUUID();statements.push(db.prepare(`INSERT INTO order_response_events(id,case_id,order_id,kind,scope_json,source_key,note,created_at,case_state,case_revision,due_at,expires_at) VALUES(?,?,?,'customer_update',?,?,?,${clock},?,?,?,?)`).bind(customerId,c.id,c.orderId,c.scopeJson,'customer:'+eventId,alert.message,c.state,c.revision,dueAt,expiresAt),...await operationalBusinessNotificationStatements(db,{kind:'order.preparation_update',sourceId:customerId,eventId:customerId,actorId:'system',now,detail:alert.message}));}
   try{await db.batch(statements);alerts++;}catch(error){if(await db.prepare('SELECT 1 FROM order_response_events WHERE source_key=?').bind(sourceKey).first())continue;const current=await db.prepare('SELECT revision FROM order_response_cases WHERE id=?').bind(c.id).first<{revision:number}>();if(current?.revision!==c.revision)continue;if(alert.kind==='checkpoint'&&!await db.prepare(`SELECT 1 FROM order_response_items r WHERE ${responseScopeContains(db,'?','r.order_item_id')} AND NOT EXISTS(SELECT 1 FROM order_response_milestones m WHERE m.order_item_id=r.order_item_id AND m.milestone='checkpoint')`).bind(c.scopeJson).first())continue;throw error;}
  }
 }
 return {alerts};
}

