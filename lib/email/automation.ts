import type {DeliveryMailService} from './delivery-attempts';
import {MailDeliveryError} from './delivery-attempts';
import {businessEmailQueueSummary} from '../operations/business-notifications';
import {emailQueueSummary} from '../operations/email-queue';
import {recordServiceHealthObservation,evaluateServiceHealth,type HealthEnvironment,type HealthTransitionStatements} from '../operations/service-health-repository';
import {incidentHealthTransitionStatements} from '../operations/incident-review';
import {readDatabaseHealthScope} from '../db/health-context';

interface SenderResult {pending?:boolean;reason?:string;processed?:number;business?:{accepted:number;failed:number;cancelled:number};orders?:{sent:number;failed:number;cancelled:number}}
interface ReminderResult {scanned:number;created:number;cancelled:number;failures:readonly {code:string}[];busy?:boolean;budgetExhausted?:boolean}
interface QueueSnapshot {eligibleBacklog:number;oldestEligibleAt:number|null;backoffCategory:'provider'|'configuration'|null}
interface AutomationDependencies {
 evaluate:(options:{now:number;deadlineMs:number})=>Promise<ReminderResult>;
 send:(options:{deadlineMs:number})=>Promise<SenderResult>;
 /** Explicit fixture seams. Production uses the real queues and common notifications. */
 queueSnapshot?:()=>Promise<QueueSnapshot>;
 attemptFailures?:(startedAt:number)=>Promise<readonly string[]>;
 transitions?:HealthTransitionStatements;
 clock?:()=>number;
}
async function queueSnapshot(db:D1Database,mail:DeliveryMailService|undefined,now:number):Promise<QueueSnapshot>{
 const [business,orders]=await Promise.all([businessEmailQueueSummary(db,now,mail),emailQueueSummary(db,now,mail)]);
 const oldest=[business.oldestEligibleAt,orders.oldestEligibleAt].filter((value):value is number=>value!==null&&value!==undefined);
 const backoff=mail?.transportKey?await db.prepare('SELECT failure_category category FROM email_transport_backoff WHERE transport_key=? AND blocked_until>? AND (config_fingerprint=? OR (config_fingerprint IS NULL AND ? IS NULL))').bind(mail.transportKey,now,mail.configurationFingerprint??null,mail.configurationFingerprint??null).first<{category:string|null}>():null;
 return {eligibleBacklog:business.due+(orders.due??0),oldestEligibleAt:oldest.length?Math.min(...oldest):null,backoffCategory:backoff?(backoff.category==='configuration'?'configuration':'provider'):null};
}
const category=(error:unknown):'configuration'|'recipient'|'provider'|'unknown'|'worker'=>error instanceof MailDeliveryError?error.category==='configuration'?'configuration':error.category==='permanent_recipient'?'recipient':error.category==='temporary'?'provider':'unknown':'worker';

/** One bounded scheduled tick. Failure in reminder creation does not discard saved outgoing work. */
export async function runEmailAutomation(db:D1Database,scope:{environment:HealthEnvironment;expectedSince:number|null;mail?:DeliveryMailService&{configured?:boolean};deadlineMs?:number},dependencies:AutomationDependencies){
 const clock=dependencies.clock??Date.now,startedAt=clock(),deadlineMs=scope.deadlineMs??startedAt+45_000,runKey=crypto.randomUUID();
 const runtime=readDatabaseHealthScope(db);
 if(runtime&&runtime.environment!==scope.environment)throw new Error('Email health scope differs from the current connection.');
 const evidenceScope=runtime?.releaseId??null;
 const transitions=dependencies.transitions??incidentHealthTransitionStatements;
 let healthRecorded=true;
 const observe=async(serviceKey:string,input:{successful:boolean;functionalSuccess:boolean;eligibleBacklog:number;oldestEligibleAt:number|null;progressCount:number;failureCategory:'provider'|'recipient'|'configuration'|'unknown'|'worker'|null})=>{
  try{
   const now=clock();
   await recordServiceHealthObservation(db,{...input,environment:scope.environment,serviceKey,runKey,evidenceScope,observedAt:now,sourceKind:serviceKey==='email.sender'?'sender':'evaluator'});
   await evaluateServiceHealth(db,{environment:scope.environment,serviceKey,evidenceScope,expectedSince:scope.expectedSince,now},transitions);
  }catch{healthRecorded=false;}
 };
 let reminderResult:ReminderResult={scanned:0,created:0,cancelled:0,failures:[]};
 let evaluatorFailure:'configuration'|'worker'|null=null;
 try{
  reminderResult=await dependencies.evaluate({now:clock(),deadlineMs:Math.min(deadlineMs,startedAt+15_000)});
  if(reminderResult.failures.length)evaluatorFailure=reminderResult.failures.every(item=>item.code==='commission_rate_unavailable')?'configuration':'worker';
 }catch{evaluatorFailure='worker';}
 const evaluatorFailed=evaluatorFailure!==null;
 if(!reminderResult.busy)await observe('email.evaluator',{successful:!evaluatorFailed,functionalSuccess:!evaluatorFailed&&!reminderResult.budgetExhausted,eligibleBacklog:0,oldestEligibleAt:null,progressCount:reminderResult.created+reminderResult.cancelled,failureCategory:evaluatorFailure});
 let sender:SenderResult={pending:true},failure:'provider'|'recipient'|'configuration'|'unknown'|'worker'|null=null,functionalSuccess=false;
 try{
  if(clock()>=deadlineMs)failure='worker';
  else{
   sender=await dependencies.send({deadlineMs});
   if(sender.pending)failure='configuration';
   const accepted=(sender.business?.accepted??0)+(sender.orders?.sent??0);
   functionalSuccess=accepted>0;
   if((sender.business?.failed??0)+(sender.orders?.failed??0)>0){
    const failures=dependencies.attemptFailures?await dependencies.attemptFailures(startedAt):(await db.prepare("SELECT DISTINCT failure_category category FROM email_delivery_attempts WHERE started_at>=? AND phase IN('not_accepted','uncertain') LIMIT 4").bind(startedAt).all<{category:string}>()).results.map(row=>row.category);
    failure=failures.includes('configuration')?'configuration':failures.includes('temporary')?'provider':failures.includes('unknown')?'unknown':failures.length&&failures.every(value=>value==='permanent_recipient')?'recipient':'worker';
   }
  }
 }catch(error){failure=category(error);}
 let snapshot:QueueSnapshot={eligibleBacklog:0,oldestEligibleAt:null,backoffCategory:null};
 try{snapshot=await(dependencies.queueSnapshot?.()??queueSnapshot(db,scope.mail,clock()));}catch{failure='worker';}
 if(snapshot.backoffCategory)failure=snapshot.backoffCategory;
 if(!functionalSuccess&&(!failure||failure==='recipient')&&clock()<deadlineMs&&scope.mail?.probe){
  try{const proof=await scope.mail.probe();functionalSuccess=proof.available===true&&(proof.transport==='provider'||proof.transport==='capture');}catch(error){failure=category(error);}
 }
 const progressCount=(sender.business?.accepted??0)+(sender.orders?.sent??0);
 // An accepted item proves its own progress, not recovery of a mixed failing batch.
 functionalSuccess=functionalSuccess&&(failure===null||failure==='recipient');
 await observe('email.sender',{successful:failure===null,functionalSuccess,eligibleBacklog:snapshot.eligibleBacklog,oldestEligibleAt:snapshot.oldestEligibleAt,progressCount,failureCategory:failure});
 return {ok:!evaluatorFailed&&!failure&&healthRecorded,reminders:{scanned:reminderResult.scanned,created:reminderResult.created,cancelled:reminderResult.cancelled,failed:evaluatorFailed},sender:{processed:sender.processed??0,failed:(sender.business?.failed??0)+(sender.orders?.failed??0),pending:!!sender.pending,functionalVerified:functionalSuccess},healthRecorded};
}
