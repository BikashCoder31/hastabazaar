import {responseScopeContains} from './response-sql';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {readOrderResponsePortion} from './response-workflow';

/** Stable identities allow source creation and both channels to share the release transaction. */
export async function prepareInitialResponseNotices(db:D1Database,orderId:string,sellerIds?:readonly string[]){
 const sellers=sellerIds??(await db.prepare('SELECT DISTINCT seller_id AS id FROM order_items WHERE order_id=?').bind(orderId).all<{id:string}>()).results.map(r=>r.id),clock=checkoutCommitClock(db),statements:D1PreparedStatement[]=[];
 for(const sellerId of sellers)for(const mode of ['seller','company']){const portionId=`response:${orderId}:${sellerId}:${mode}`,eventId='released:'+crypto.randomUUID(),aggregate=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_ARRAYAGG':'json_group_array';
  const unnotified="r.portion_id=p.id AND NOT EXISTS(SELECT 1 FROM order_response_milestones m WHERE m.order_item_id=r.order_item_id AND m.milestone='released')";
  statements.push(db.prepare(`INSERT INTO order_response_events(id,portion_id,order_id,kind,scope_json,source_key,actor_id,note,created_at) SELECT ?,p.id,p.order_id,'released',(SELECT ${aggregate}(r.order_item_id) FROM order_response_items r WHERE ${unnotified}),?,NULL,'Preparation is now actionable.',${clock} FROM order_response_portions p WHERE p.id=? AND EXISTS(SELECT 1 FROM order_response_items r WHERE ${unnotified})`).bind(eventId,eventId,portionId),db.prepare(`INSERT OR IGNORE INTO order_response_milestones(order_item_id,milestone,event_id,created_at) SELECT r.order_item_id,'released',e.id,${clock} FROM order_response_items r JOIN order_response_events e ON e.id=? WHERE ${responseScopeContains(db,'e.scope_json','r.order_item_id')}`).bind(eventId),...await operationalBusinessNotificationStatements(db,{kind:'order.response',sourceId:eventId,eventId,actorId:'system',now:Date.now(),status:'released_'+mode,detail:'New items are ready for preparation. Review the exact scope and permitted actions in your order workspace.'}));

 }return statements;
}
/** Rechecked at delivery; a queued no-response message cannot survive meaningful progress or an actual hold. */
export async function currentResponseNotice(db:D1Database,eventId:string){
 const event=await db.prepare('SELECT portion_id AS portionId,case_id AS caseId,source_key AS sourceKey,kind,scope_json AS scopeJson,case_state AS caseState,case_revision AS caseRevision,due_at AS dueAt,expires_at AS expiresAt FROM order_response_events WHERE id=?').bind(eventId).first<{portionId:string|null;caseId:string|null;sourceKey:string;kind:string;scopeJson:string;caseState:string|null;caseRevision:number|null;dueAt:number|null;expiresAt:number|null}>();if(!event)return false;
 if(event.caseRevision!==null&&event.caseId){return Boolean(await db.prepare(`SELECT 1 FROM order_response_cases WHERE id=? AND revision=? AND state<>'resolved' AND ${checkoutCommitClock(db)}>=? AND (? IS NULL OR ${checkoutCommitClock(db)}<?)`).bind(event.caseId,event.caseRevision,event.dueAt,event.expiresAt,event.expiresAt).first());}
 if(['delay','followup','customer_update'].includes(event.kind)&&event.caseId){const current=await db.prepare('SELECT last_event_id AS eventId,state FROM order_response_cases WHERE id=?').bind(event.caseId).first<{eventId:string;state:string}>();const source=event.kind==='customer_update'?await db.prepare('SELECT case_state AS state FROM order_response_events WHERE id=?').bind(event.sourceKey.slice('customer:'.length)).first<{state:string|null}>():{state:event.caseState};return Boolean(current&&(source?.state?source.state===current.state:current.state!=='resolved')&&current.eventId===(event.kind==='customer_update'?event.sourceKey.slice('customer:'.length):eventId));}
 if(event.kind==='customer_update'){
  if(!await db.prepare('SELECT 1 FROM order_response_customer_state WHERE current_event_id=?').bind(eventId).first())return false;
  const ids=JSON.parse(event.scopeJson) as string[];for(const id of ids){if(await db.prepare("SELECT 1 FROM order_items i JOIN order_response_items r ON r.order_item_id=i.id WHERE i.id=? AND i.fulfillment_status='confirmed' AND r.progress_at IS NULL AND r.exception_case_id IS NULL").bind(id).first())return true;}return false;
 }if(!event.portionId)return false;const portion=await readOrderResponsePortion(db,event.portionId);if(!portion)return false;const ids=JSON.parse(event.scopeJson) as string[],items=portion.items.filter(i=>!ids.length||ids.includes(i.id));
 return items.some(i=>event.kind==='released'?!i.clock.responded&&!i.clock.paused&&i.clock.elapsedMs<6*3600000:event.kind==='reminder'?i.clock.reminderDue:event.kind==='escalation'?i.clock.escalationDue:event.kind==='checkpoint'?i.clock.checkpointDue:false);
}
