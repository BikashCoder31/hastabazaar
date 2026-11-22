import {processPreparationCaseSupervision} from './response-supervision';
import {preparationReviewTask} from './response-task';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {readOrderResponsePortion} from './response-workflow';
import {ensureReviewTask} from '../workflows/review-tasks';

function guard(db:D1Database,predicate:string,values:unknown[]=[]){const id=crypto.randomUUID();return [db.prepare('INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN '+predicate+' THEN 1 ELSE 0 END').bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
async function key(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}

/** Bounded internal worker. Current source state, not page visits or mail outcomes, controls every milestone. */
export async function processOrderResponseFollowup(db:D1Database,limit=100,scope?:{portionId:string;orderId:string}){
 if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error('Use a bounded response batch.');
 const portions=(await db.prepare("SELECT p.id FROM order_response_portions p WHERE EXISTS(SELECT 1 FROM order_response_items r JOIN order_items i ON i.id=r.order_item_id WHERE r.portion_id=p.id AND i.fulfillment_status='confirmed' AND r.progress_at IS NULL AND r.exception_case_id IS NULL) "+(scope?' AND p.id=?':'')+" ORDER BY p.created_at,p.id LIMIT ?").bind(...(scope?[scope.portionId]:[]),limit).all<{id:string}>()).results,clock=checkoutCommitClock(db),result={reminders:0,escalations:0,checkpoints:0,customerUpdates:0};
 for(const entry of portions){const portion=await readOrderResponsePortion(db,entry.id);if(!portion)continue;
  const marked=(await db.prepare('SELECT order_item_id AS id,milestone FROM order_response_milestones WHERE order_item_id IN(SELECT order_item_id FROM order_response_items WHERE portion_id=?)').bind(portion.id).all<{id:string;milestone:string}>()).results;
  for(const milestone of ['checkpoint','escalation','reminder'] as const){
   const items=portion.items.filter(i=>(milestone==='checkpoint'?i.clock.checkpointDue:milestone==='escalation'?i.clock.escalationDue:i.clock.reminderDue)&&!marked.some(m=>m.id===i.id&&m.milestone===milestone));if(!items.length)continue;
   const ids=items.map(i=>i.id).sort(),eventId=crypto.randomUUID(),sourceKey=await key([portion.id,milestone,ids]),statements:D1PreparedStatement[]=[db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(portion.orderId)];
   for(const item of items){statements.push(...guard(db,"EXISTS(SELECT 1 FROM order_response_items r JOIN order_items i ON i.id=r.order_item_id WHERE r.order_item_id=? AND r.revision=? AND r.progress_at IS NULL AND r.exception_case_id IS NULL AND i.fulfillment_status='confirmed')",[item.id,item.revision]));if(milestone==='reminder')statements.push(...guard(db,`${clock}<?`,[portion.now+12*3600000-item.clock.elapsedMs]));}
   if(milestone==='checkpoint')for(const item of items)statements.push(...guard(db,"NOT EXISTS(SELECT 1 FROM order_response_milestones WHERE order_item_id=? AND milestone='checkpoint')",[item.id]));
   let caseId:string|null=null;
   if(milestone!=='reminder'){
    const held=items.every(i=>i.clock.paused),kind=held?'hold':'no_response',prior=await db.prepare("SELECT id FROM order_response_cases WHERE portion_id=? AND kind=? AND state<>'resolved' ORDER BY created_at,id LIMIT 1").bind(portion.id,kind).first<{id:string}>(),caseKey=(held?'held-response:':'no-response:')+sourceKey;caseId=prior?.id??crypto.randomUUID();
    if(!prior)statements.push(db.prepare(`INSERT INTO order_response_cases(id,portion_id,source_key,kind,scope_json,private_detail,created_at,first_due_at,last_event_id) VALUES(?,?,?,?,?,?,${clock},${clock}+?,?)`).bind(caseId,portion.id,caseKey,held?'hold':'no_response',JSON.stringify(ids),held?'Review the actual blocker and original release age; this is not seller inactivity.':'Contact the responsible fulfiller and record the next action. Named coverage and a customer commitment are still required.',milestone==='checkpoint'?0:2*3600000,eventId));
    else statements.push(db.prepare("UPDATE order_response_cases SET state='open',scope_json=?,revision=revision+1,last_event_id=? WHERE id=?").bind(JSON.stringify(ids),eventId,caseId));
   }
   if(caseId)statements.push(preparationReviewTask(db,caseId));
   statements.push(db.prepare(`INSERT INTO order_response_events(id,portion_id,case_id,order_id,kind,scope_json,source_key,note,created_at) VALUES(?,?,?,?,?,?,?,?,${clock})`).bind(eventId,portion.id,caseId,portion.orderId,milestone,JSON.stringify(ids),sourceKey,milestone==='checkpoint'?'Review unresolved work at the absolute original-release checkpoint.':'Actual preparation response remains unresolved.'));
   const savedMilestones=items.flatMap(item=>[milestone,...(milestone==='checkpoint'&&item.clock.escalationDue?['escalation']:[]),...(milestone!=='reminder'&&!item.clock.paused&&item.clock.elapsedMs>=6*3600000?['reminder']:[])].map(m=>({id:item.id,milestone:m})));
   for(const saved of savedMilestones)statements.push(db.prepare(`INSERT OR IGNORE INTO order_response_milestones(order_item_id,milestone,event_id,created_at) VALUES(?,?,?,${clock})`).bind(saved.id,saved.milestone,eventId));
   statements.push(...await operationalBusinessNotificationStatements(db,{kind:'order.response',sourceId:eventId,eventId,actorId:'system',now:portion.now,status:milestone+'_'+portion.operatorMode,detail:milestone==='reminder'?'These released items still need a preparation response. Open the exact scope or report a real delay.':milestone==='checkpoint'?'Review the original release, current progress and any authorized blocker. Assign an eligible owner and a concrete next action.':'Contact the responsible fulfiller within two elapsed hours. Record the factual customer update and its accountable next-update owner.'}));
   try{await db.batch(statements);}catch(error){if(await db.prepare('SELECT 1 FROM order_response_events WHERE source_key=?').bind(sourceKey).first())continue;if(milestone==='checkpoint'&&await db.prepare("SELECT 1 FROM order_response_milestones WHERE order_item_id=? AND milestone='checkpoint'").bind(items[0].id).first())continue;const fresh=await readOrderResponsePortion(db,portion.id);if(!fresh||items.some(i=>fresh.items.find(n=>n.id===i.id)?.revision!==i.revision))continue;throw error;}
   marked.push(...savedMilestones);
   if(caseId)await ensureReviewTask(db,{sourceType:'order_response',sourceId:caseId,now:portion.now});
   if(milestone==='reminder')result.reminders++;else if(milestone==='checkpoint')result.checkpoints++;else result.escalations++;
  }
 }
 // Reconstruct from durable current source, including after an interrupted worker.
 const orderIds=(await db.prepare("SELECT DISTINCT p.order_id AS id FROM order_response_portions p JOIN order_response_items r ON r.portion_id=p.id WHERE r.progress_at IS NULL AND r.exception_case_id IS NULL "+(scope?' AND p.order_id=?':'')+" ORDER BY p.order_id LIMIT ?").bind(...(scope?[scope.orderId]:[]),limit).all<{id:string}>()).results;
 for(const {id:orderId} of orderIds){
  const entries=(await db.prepare('SELECT id FROM order_response_portions WHERE order_id=?').bind(orderId).all<{id:string}>()).results,snapshots=[];
  for(const p of entries){const source=await readOrderResponsePortion(db,p.id);if(source)snapshots.push(source);}
  const allItems=snapshots.flatMap(p=>p.items),ids=allItems.filter(i=>i.clock.escalationDue).map(i=>i.id).sort();if(!ids.length)continue;
  const sourceKey=await key(['customer-preparation-update',orderId,ids]);if(await db.prepare('SELECT 1 FROM order_response_events WHERE source_key=?').bind(sourceKey).first())continue;
  const previous=await db.prepare('SELECT revision FROM order_response_customer_state WHERE order_id=?').bind(orderId).first<{revision:number}>(),eventId=crypto.randomUUID(),now=snapshots[0].now,statements=[db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(orderId)];
  statements.push(...guard(db,'(SELECT COUNT(*) FROM order_response_items r JOIN order_response_portions p ON p.id=r.portion_id WHERE p.order_id=?)=?',[orderId,allItems.length]));
  for(const item of allItems)statements.push(...guard(db,'EXISTS(SELECT 1 FROM order_response_items WHERE order_item_id=? AND revision=?)',[item.id,item.revision]));
  statements.push(db.prepare(`INSERT INTO order_response_events(id,order_id,kind,scope_json,source_key,note,created_at) VALUES(?,?,'customer_update',?,?,?,${clock})`).bind(eventId,orderId,JSON.stringify(ids),sourceKey,'We are checking preparation of the affected items. Open your order for current progress and support. The support team still needs to confirm the next update time.'));
  if(previous)statements.push(db.prepare('UPDATE order_response_customer_state SET current_event_id=?,revision=revision+1 WHERE order_id=? AND revision=?').bind(eventId,orderId,previous.revision),...guard(db,'changes()=1'));
  else statements.push(db.prepare('INSERT INTO order_response_customer_state(order_id,current_event_id) VALUES(?,?)').bind(orderId,eventId));
  statements.push(...await operationalBusinessNotificationStatements(db,{kind:'order.preparation_update',sourceId:eventId,eventId,actorId:'system',now,detail:'We are checking preparation of the affected items. Open your order for current progress and support. The support team still needs to confirm the next update time.'}));
  try{await db.batch(statements);result.customerUpdates++;}catch(error){if(await db.prepare('SELECT 1 FROM order_response_events WHERE source_key=?').bind(sourceKey).first())continue;if(/constraint|guard/i.test(String(error)))continue;throw error;}
 }

 if(!scope)await processPreparationCaseSupervision(db,limit);
 return result;
}

