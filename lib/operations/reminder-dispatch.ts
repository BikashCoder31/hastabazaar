import { checklistExpirySelectionSql, enqueueChecklistExpiry } from '../sellers/shop-checklist-notices';
import { documentExpiryWindowMs } from '../sellers/shop-checklist-evidence';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {processOrderResponseFollowup} from '../orders/response-followup';
import {processPreparationCaseSupervision} from '../orders/response-supervision';
import {processManualPaymentWindows} from '../payments/payment-maintenance';
import {processFeeTermsScan} from '../commission/terms-followup';
import {scanProductDiscountAdvisories} from '../products/discount-advisory-store';
import {ensureRecoveryContactWork,ensureRecoveryReviewWork} from '../payments/recovery-followup';
import {paymentGuard} from '../payments/manual-receipts';
import {operationalBusinessNotificationStatements} from './business-notifications';
import {refundReminderSelectionSql,reminderFacts,reminderMilestoneIdentity,type ReminderFamily} from './reminder-notice-sources';
import {processProgrammeDue} from './programme-notice-sources';
import {reconcileObsoleteOperationalNotice} from './obsolete-notices';
import {processTeamGovernanceDue} from './team-governance';
import {reconcileStaffAccessCoverage} from './team-access-reconciliation';
import {reconcileTeamTaskCoverage} from './team-coverage-dispatch';
import {enqueuePayoutFixReadyReminder,payoutFixReminderSelectionSql} from '../sellers/payout-fix-reminder-source';

const families=['order_response','order_supervision','manual_payment','terms','return_request','complaint','recovery','refund_obligation','review_task','system_incident','team_governance','team_access','team_coverage','discount_advisory','promo_campaign','loyalty_programme','fee_waiver_campaign','stale_notices','seller_payout_fix','seller_document_expiry'] as const;
type Family=typeof families[number];
export interface ReminderDispatchOptions{now?:number;limit?:number;deadlineMs?:number}
export interface ReminderDispatchResult{scanned:number;created:number;cancelled:number;cursor:Record<string,string>;failures:{family:string;sourceId:string|null;code:string}[];busy:boolean;budgetExhausted:boolean}

function selection(family:Family){
 switch(family){
  case'order_response':return "SELECT id FROM order_response_portions WHERE id>? AND EXISTS(SELECT 1 FROM order_response_items item WHERE item.portion_id=order_response_portions.id AND item.progress_at IS NULL AND item.exception_case_id IS NULL) ORDER BY id LIMIT 1";
  case'order_supervision':return "SELECT id FROM order_response_cases WHERE id>? AND state<>'resolved' ORDER BY id LIMIT 1";
  case'manual_payment':return 'SELECT order_id id FROM manual_payment_windows WHERE order_id>? AND paid_at IS NULL AND closed_at IS NULL ORDER BY order_id LIMIT 1';
  case'return_request':return "SELECT id FROM return_requests WHERE id>? AND status NOT IN('closed','resolved','rejected') ORDER BY id LIMIT 1";
  case'complaint':return "SELECT id FROM complaints WHERE id>? AND status NOT IN('closed','resolved','rejected') ORDER BY id LIMIT 1";
  case'recovery':return 'SELECT id FROM seller_recovery_cases WHERE id>? ORDER BY id LIMIT 1';
  case'refund_obligation':return refundReminderSelectionSql();
  case'review_task':return "SELECT id FROM review_tasks WHERE id>? AND source_type NOT IN('return_request','complaint','order_response','commission_terms','recovery_review','recovery_contact','system_incident') ORDER BY id LIMIT 1";
  case'system_incident':return "SELECT h.id FROM service_health_incidents h JOIN service_incident_governance g ON g.incident_id=h.id WHERE h.id>? AND h.state<>'resolved' AND g.merged_into IS NULL ORDER BY h.id LIMIT 1";
  case'discount_advisory':return "SELECT DISTINCT product_id id FROM product_discount_cycles WHERE product_id>? AND (day23='pending' OR day29='pending') ORDER BY product_id LIMIT 1";
  case'promo_campaign':return "SELECT id FROM promo_campaigns WHERE id>? AND status='published' AND paused=0 ORDER BY id LIMIT 1";
  case'loyalty_programme':return 'SELECT id FROM loyalty_config WHERE id>? ORDER BY id LIMIT 1';
  case'fee_waiver_campaign':return "SELECT c.id FROM customer_fee_waiver_campaigns c JOIN customer_fee_waiver_revisions r ON r.campaign_id=c.id AND r.revision=c.revision WHERE c.id>? AND r.state IN('published','paused') ORDER BY c.id LIMIT 1";
  case'seller_payout_fix':return payoutFixReminderSelectionSql();
  case'seller_document_expiry':return checklistExpirySelectionSql();
  case'stale_notices':return "SELECT id FROM notification_messages WHERE id>? AND template_key LIKE 'business.%' AND (status IN('queued','failed') OR status='cancelled' AND failure_reason='obsolete_or_access_changed') ORDER BY id LIMIT 1";
  default:throw new Error('Terms owns its existing durable cursor.');
 }
}
async function sourceReminders(db:D1Database,family:ReminderFamily,id:string,now:number){
 if(family==='recovery'){await ensureRecoveryContactWork(db,id,now);await ensureRecoveryReviewWork(db,id,now);}
 let created=0;
 for(const fact of await reminderFacts(db,family,id,now)){
  const key=await reminderMilestoneIdentity(fact),prior=await db.prepare('SELECT 1 FROM operational_reminder_milestones WHERE id=?').bind(key).first();
  if(!prior){
   try{await db.batch([...paymentGuard(db,fact.predicate,fact.values),...paymentGuard(db,`${checkoutCommitClock(db)}>=?`,[fact.dueAt]),db.prepare('INSERT OR IGNORE INTO operational_reminder_milestones(id,family,source_id,milestone,source_revision,due_at,created_at) VALUES(?,?,?,?,?,?,?)').bind(key,family,id,fact.milestone,fact.sourceRevision,fact.dueAt,now)]);created++;}
   catch(error){if(!(await reminderFacts(db,family,id,now)).some(current=>current.milestone===fact.milestone&&current.sourceRevision===fact.sourceRevision&&current.dueAt===fact.dueAt))continue;throw error;}
  }
  // This durable handoff is retried with the SAME milestone after interruption.
  const current=(await reminderFacts(db,family,id,now)).some(value=>value.milestone===fact.milestone&&value.sourceRevision===fact.sourceRevision&&value.dueAt===fact.dueAt);if(!current)continue;
  let detail=fact.customerPrompt||fact.sellerPrompt
    ?'The open case still needs the requested clarification. Open the original case to respond or contact its responsible team.'
    :'The original owned follow-up is due. Review the current source, assignment and factual next action; reading this notice does not resolve the work.';
  if(family==='refund_obligation'){
   detail=fact.milestone==='binding_due'
     ?'The binding refund deadline has arrived. Review the original obligation and the verified state of its payment.'
     :'The recorded time for the next refund update has arrived. Review the original obligation and its current payment status.';
  }
  await db.batch(await operationalBusinessNotificationStatements(db,{kind:'workflow.reminder',sourceId:key,eventId:key,actorId:'system',now,status:family+':'+fact.milestone,detail}));
 }
 return created;
}
async function processOne(db:D1Database,family:Family,id:string,now:number){
 if(family==='seller_payout_fix')return enqueuePayoutFixReadyReminder(db,id,now);
 if(family==='seller_document_expiry')return enqueueChecklistExpiry(db,id,now);
 if(family==='system_incident'){const {ensureReviewTask}=await import('../workflows/review-tasks');await ensureReviewTask(db,{sourceType:'system_incident',sourceId:id,now});}
 if(family==='order_response'){const row=await db.prepare('SELECT order_id orderId FROM order_response_portions WHERE id=?').bind(id).first<{orderId:string}>();if(!row)return 0;const result=await processOrderResponseFollowup(db,1,{portionId:id,orderId:row.orderId});return result.reminders+result.escalations+result.checkpoints+result.customerUpdates;}
 if(family==='order_supervision')return (await processPreparationCaseSupervision(db,1,id)).alerts;
 if(family==='manual_payment'){const result=await processManualPaymentWindows(db,1,id);return result.reminded+result.exceptions+result.expired;}
 if(family==='discount_advisory')return (await scanProductDiscountAdvisories(db,id,now)).suggestions;
 if(family==='promo_campaign'||family==='loyalty_programme'||family==='fee_waiver_campaign')return processProgrammeDue(db,family==='promo_campaign'?'promo':family==='fee_waiver_campaign'?'waiver':'loyalty',id,now);
 return sourceReminders(db,family as ReminderFamily,id,now);
}

/** Internal bounded evaluator only. Never sends mail, approves money or resets a business clock. */
export async function processReminderDispatch(db:D1Database,options:ReminderDispatchOptions={}):Promise<ReminderDispatchResult>{
 const now=options.now??Date.now(),limit=options.limit??50,deadline=options.deadlineMs??Date.now()+15000;
 if(!Number.isSafeInteger(now)||now<0||!Number.isInteger(limit)||limit<1||limit>200||!Number.isSafeInteger(deadline)||deadline<0)throw new RangeError('Use a bounded authoritative reminder observation.');
 const result:ReminderDispatchResult={scanned:0,created:0,cancelled:0,cursor:{},failures:[],busy:false,budgetExhausted:Date.now()>=deadline};if(result.budgetExhausted)return result;
 const clock=checkoutCommitClock(db),token=crypto.randomUUID();
 await db.prepare("INSERT OR IGNORE INTO operational_reminder_cursors(family) VALUES('dispatch')").run();
 const claim=await db.prepare(`UPDATE operational_reminder_cursors SET lease_token=?,lease_until=${clock}+60000 WHERE family='dispatch' AND (lease_token IS NULL OR lease_until<=${clock})`).bind(token).run();
 if(!Number(claim.meta.changes)){result.busy=true;return result;}
 try{
  const previous=await db.prepare("SELECT `cursor` FROM operational_reminder_cursors WHERE family='dispatch'").first<{cursor:string}>();let index=Math.max(0,families.indexOf(previous?.cursor as Family));const exhausted=new Set<Family>();
  while(result.scanned<limit&&exhausted.size<families.length&&Date.now()<deadline){
   const family=families[index];index=(index+1)%families.length;if(exhausted.has(family))continue;
   const owned=await db.prepare(`SELECT 1 FROM operational_reminder_cursors WHERE family='dispatch' AND lease_token=? AND lease_until>${clock}`).bind(token).first();if(!owned){result.busy=true;break;}
   if(family==='team_governance'){
    try{const team=await processTeamGovernanceDue(db,{now,limit:1,deadlineMs:deadline});result.scanned+=team.scanned;result.created+=team.created;Object.assign(result.cursor,team.cursor);for(const failure of team.failures)result.failures.push({family,sourceId:failure.sourceId,code:failure.code});if(!team.scanned||team.budgetExhausted)exhausted.add(family);}
    catch{result.failures.push({family,sourceId:null,code:'source_scan_failed'});exhausted.add(family);}
   }else if(family==='team_coverage'){
    try{const coverage=await reconcileTeamTaskCoverage(db,{now,limit:1,deadlineMs:deadline});result.scanned+=coverage.scanned;for(const failure of coverage.failures)result.failures.push({family,...failure});if(!coverage.scanned||coverage.budgetExhausted)exhausted.add(family);}
    catch{result.failures.push({family,sourceId:null,code:'coverage_reconciliation_failed'});exhausted.add(family);}
   }else if(family==='team_access'){
    try{const access=await reconcileStaffAccessCoverage(db,{now,limit:1,deadlineMs:deadline});result.scanned+=access.scanned;if(access.failures)result.failures.push({family,sourceId:null,code:'coverage_reconciliation_failed'});if(!access.scanned||access.budgetExhausted)exhausted.add(family);}
    catch{result.failures.push({family,sourceId:null,code:'coverage_reconciliation_failed'});exhausted.add(family);}
   }else if(family==='terms'){
    try{const terms=await processFeeTermsScan(db,now,1);result.scanned+=terms.scanned;result.cursor.terms=terms.cursor;for(const failure of terms.failures)result.failures.push({family,sourceId:failure.sellerId,code:failure.code});if(!terms.scanned||terms.cursor==='')exhausted.add(family);}
    catch{result.failures.push({family,sourceId:null,code:'source_scan_failed'});exhausted.add(family);}
   }else{
    await db.prepare('INSERT OR IGNORE INTO operational_reminder_cursors(family) VALUES(?)').bind(family).run();
    const state=(await db.prepare('SELECT `cursor`,revision FROM operational_reminder_cursors WHERE family=?').bind(family).first<{cursor:string;revision:number}>())!;
    const values=family==='refund_obligation'?[state.cursor,now,now]:family==='seller_payout_fix'?[state.cursor,now]:
      family==='seller_document_expiry'?[now,now+documentExpiryWindowMs,state.cursor]:[state.cursor];
    const entry=await db.prepare(selection(family)).bind(...values).first<{id:string}>();
    if(!entry){await db.prepare('UPDATE operational_reminder_cursors SET `cursor`=\'\',revision=revision+1 WHERE family=? AND revision=?').bind(family,state.revision).run();result.cursor[family]='';exhausted.add(family);}
    else{
     result.scanned++;try{if(family==='stale_notices'){const reconciled=await reconcileObsoleteOperationalNotice(db,entry.id,now);result.cancelled+=reconciled.cancelled;}else result.created+=await processOne(db,family,entry.id,now);}catch{result.failures.push({family,sourceId:entry.id,code:'source_evaluation_failed'});}
     await db.batch([...paymentGuard(db,`EXISTS(SELECT 1 FROM operational_reminder_cursors WHERE family='dispatch' AND lease_token=? AND lease_until>${clock})`,[token]),db.prepare('UPDATE operational_reminder_cursors SET `cursor`=?,revision=revision+1 WHERE family=? AND revision=?').bind(entry.id,family,state.revision)]);result.cursor[family]=entry.id;
    }
   }
   await db.prepare("UPDATE operational_reminder_cursors SET `cursor`=?,revision=revision+1 WHERE family='dispatch' AND lease_token=?").bind(families[index],token).run();
  }
  result.budgetExhausted=Date.now()>=deadline;
 }finally{await db.prepare("UPDATE operational_reminder_cursors SET lease_token=NULL,lease_until=NULL WHERE family='dispatch' AND lease_token=?").bind(token).run();}
 return result;
}

