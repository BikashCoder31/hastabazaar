import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {listReviewTasks,reviewTaskReadProof} from '../workflows/review-tasks';
import {filterReviewQueue,readReviewQueueFilters,financeQueueItem,type ReviewQueueTask} from './review-queue-view';
import {safeAdminReturnTo,withAdminReturnTo} from './return-context';
import {reviewTaskHref} from './review-task-links';
import {readFinanceWorkItems,readFinanceWorkSourceState,type FinanceWorkSourceKey} from './finance-work-items';
import type {RuntimeEnvironment} from '../staging/environment';
import {can} from '../marketplace/permissions';

export type ReviewContinuation={state:'next';href:string}|{state:'pending';followUpHref?:string}|{state:'complete'|'unavailable'};
function contextScope(path:string,task:ReviewQueueTask){
 if('finance'in task)return path==='/admin';
 if(path==='/admin'||path==='/admin/sellers')return true;
 if(path==='/admin/commission/terms')return task.sourceType==='commission_terms';
 if(path==='/admin/products/intakes')return task.sourceType.startsWith('product_intake_');
 if(path==='/admin/products/publications')return task.sourceType==='product_intake_review'&&['ready_for_decision','resolved'].includes(task.sourceStatus);
 const seller=/^\/admin\/sellers\/([^/]+)$/.exec(path);return Boolean(seller&&task.sellerId===decodeURIComponent(seller[1]));
}
/** A successful historical step is not permission to skip a remaining sensitive action. */
export async function readReviewContinuation(db:D1Database,actorId:string,returnTo:unknown,options:{now?:number;environment?:RuntimeEnvironment}={}):Promise<ReviewContinuation>{
 const context=safeAdminReturnTo(returnTo),url=new URL(context,'http://localhost');
 let currentId:string;try{currentId=decodeURIComponent(url.hash.replace(/^#review-task-/,''));}catch{return{state:'unavailable'};}
 if(!url.hash.startsWith('#review-task-')||!currentId)return{state:'unavailable'};
 const reader=await staffMutationGuard(db,actorId,'account.self.manage',Error),guards=[...reader.statements];
 const finish=async(result:ReviewContinuation)=>{await db.batch(guards);return result;};
 const financeAllowed=!!options.environment&&url.pathname==='/admin'&&(can(reader,'payout.prepare')||can(reader,'refund.approve.standard'));
 // Both readers finish with guarded transactions on this database connection.
 const reviewRows=await listReviewTasks(db,actorId),finance=financeAllowed?await readFinanceWorkItems(db,actorId,options.environment!,{limit:100,returnTo:context}):null;
 const rows:ReviewQueueTask[]=[...reviewRows,...(finance?.items??[]).map(financeQueueItem)];
 if(currentId.startsWith('finance:')){
  if(!financeAllowed)return{state:'unavailable'};
  const parts=currentId.split(':');if(parts.length!==4||!['payout_request','payout_candidate','payout_packet','refund_obligation','refund_source'].includes(parts[1]))return{state:'unavailable'};
  let key:FinanceWorkSourceKey;try{key={family:parts[1] as FinanceWorkSourceKey['family'],sourceKind:decodeURIComponent(parts[2]),id:decodeURIComponent(parts[3])};}catch{return{state:'unavailable'};}
  let current=await readFinanceWorkSourceState(db,actorId,options.environment!,key,{returnTo:context});if(!current)return{state:'unavailable'};
  const originalCompleted=current.completed,seen=new Set<string>();let followed=false;
  for(let depth=0;current.followUp;depth++){
   const identity=JSON.stringify(current.followUp);if(depth>=4||seen.has(identity))return{state:'unavailable'};seen.add(identity);
   const target=await readFinanceWorkSourceState(db,actorId,options.environment!,current.followUp,{returnTo:context});if(!target)return{state:'unavailable'};current=target;followed=true;
  }
  if(!current.completed){
   if(!followed)return finish({state:'pending'});
   const back=new URL(context,'http://localhost');back.hash='review-task-'+encodeURIComponent(`finance:${current.family}:${encodeURIComponent(current.sourceKind)}:${encodeURIComponent(current.id)}`);
   return finish({state:'pending',followUpHref:withAdminReturnTo(current.href,back.pathname+back.search+back.hash)});
  }
  // A completed child must not silently clear a separate unresolved original issue.
  if(!originalCompleted)return finish({state:'pending'});
 }else{
  const current=reviewRows.find(row=>row.id===currentId&&contextScope(url.pathname,row));if(!current)return{state:'unavailable'};
  const proof=await reviewTaskReadProof(db,actorId,current.id);guards.push(...proof.statements);
  if(proof.task.revision!==current.revision||proof.status!==current.status||proof.sourceStatus!==current.sourceStatus)return{state:'unavailable'};
  if(!['completed','superseded'].includes(proof.status))return finish({state:'pending'});
 }
 const next=filterReviewQueue(rows.filter(row=>contextScope(url.pathname,row)),actorId,readReviewQueueFilters(url.searchParams),options.now??Date.now()).find(row=>row.id!==currentId&&row.status==='awaiting_review');
 if(next){
  if('finance'in next){const proof=await readFinanceWorkSourceState(db,actorId,options.environment!,{family:next.finance.family,id:next.finance.id,sourceKind:next.finance.sourceKind});if(!proof||proof.completed||proof.blocked||!proof.actionRequired)return{state:'unavailable'};}
  else{const proof=await reviewTaskReadProof(db,actorId,next.id);if(proof.task.revision!==next.revision||proof.status!==next.status||proof.sourceStatus!==next.sourceStatus||proof.ownerId!==next.ownerId)return{state:'unavailable'};guards.push(...proof.statements);}
 }
 await db.batch(guards);
 if(!next)return{state:finance?.coverage.some(row=>can(reader,row.family.startsWith('payout_')?'payout.prepare':'refund.approve.standard')&&row.state!=='available')?'unavailable':'complete'};
 url.hash='review-task-'+encodeURIComponent(next.id);
 return{state:'next',href:reviewTaskHref(next,url.pathname+url.search+url.hash)};
}
