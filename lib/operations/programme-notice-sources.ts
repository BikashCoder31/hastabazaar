import type {SourceOperationalEvent,OperationalSourceDescriptor,CurrentOperationalNotice} from './financial-notice-sources';
import {operationalNotificationRequestId} from './event-catalog';
import {readLoyaltyNoticeState} from '../db/repositories/loyalty';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {paymentGuard} from '../payments/manual-receipts';
import {operationalBusinessNotificationStatements} from './business-notifications';

type Programme='promo'|'loyalty'|'waiver'|'referral';
const family=(type:Programme)=>'programme.'+type;
const milestoneFamily=(type:Programme)=>type==='promo'?'promo_campaign':type==='waiver'?'fee_waiver_campaign':'loyalty_programme';
const noticeType=(type:Programme)=>type==='promo'?'promo_campaign_notice':type==='loyalty'?'loyalty_programme_notice':type==='waiver'?'customer_fee_waiver_notice':'referral_campaign_notice';
type ProgrammeContext={actorId:string;requestId:string;now:number};
interface ProgrammeFact{type:Programme;sourceId:string;milestone:string;sourceRevision:string;dueAt:number;status:string;predicate:string;values:unknown[]}
async function milestoneId(fact:ProgrammeFact,baseline=false){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([family(fact.type),fact.sourceId,baseline?'observed_past:'+fact.milestone:fact.milestone,fact.sourceRevision,fact.dueAt])));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
const subjects:Record<string,string>={promo_published:'Promotion terms published',promo_paused:'Promotion paused',promo_expired:'Published promotion window ended',loyalty_published:'Reviewed loyalty terms published or scheduled',loyalty_paused:'Loyalty earning paused',loyalty_schedule_cancelled:'Scheduled loyalty change cancelled',loyalty_effective:'Scheduled loyalty terms reached their effective time',loyalty_expired:'Published loyalty window ended',loyalty_schedule_blocked:'Scheduled loyalty change needs review',waiver_published:'Customer marketplace-fee waiver published',waiver_paused:'Customer marketplace-fee waiver paused',waiver_resumed:'Customer marketplace-fee waiver resumed',waiver_ended:'Customer marketplace-fee waiver ended',waiver_revised:'Customer marketplace-fee waiver terms changed',waiver_expired:'Published customer-fee-waiver window ended',referral_updated:'Referral offer changed'};
export async function programmeNoticeStatements(db:D1Database,ctx:ProgrammeContext,input:{type:Programme;sourceId:string;eventId:string;status:string}){
 if(!Object.hasOwn(subjects,input.status)||!input.status.startsWith(input.type+'_'))throw new Error('Use an exact native programme outcome.');
 const prior=await db.prepare('SELECT revision FROM operational_notice_states WHERE family=? AND source_id=?').bind(family(input.type),input.sourceId).first<{revision:number}>();
 const marker=prior?[db.prepare('UPDATE operational_notice_states SET current_event_id=?,current_status=?,revision=revision+1 WHERE family=? AND source_id=? AND revision=?').bind(input.eventId,input.status,family(input.type),input.sourceId,prior.revision),...paymentGuard(db,'changes()=1')]:[db.prepare('INSERT INTO operational_notice_states(family,source_id,current_event_id,current_status) VALUES(?,?,?,?)').bind(family(input.type),input.sourceId,input.eventId,input.status)];
 return [...marker,...await operationalBusinessNotificationStatements(db,{kind:'programme.updated',sourceId:input.sourceId,eventId:input.eventId,status:input.status,actorId:ctx.actorId,now:ctx.now,detail:'A reviewed programme state changed. Open its original configuration for the current effective window and restrictions. This notice does not change prices, consume a promotion, credit rewards or authorize marketing distribution.'})];
}
/** No programme mutation occurs here; original native clocks decide the current milestone. */
export async function programmeDueFacts(db:D1Database,type:Programme,id:string,now:number):Promise<ProgrammeFact[]>{
 if(type==='referral')return [];
 if(type==='waiver'){
  const row=await db.prepare("SELECT c.revision,r.ends_at AS endsAt FROM customer_fee_waiver_campaigns c JOIN customer_fee_waiver_revisions r ON r.campaign_id=c.id AND r.revision=c.revision WHERE c.id=? AND r.state IN('published','paused')").bind(id).first<{revision:number;endsAt:number}>();if(!row||now<row.endsAt)return [];
  return[{type,sourceId:id,milestone:'expired',sourceRevision:String(row.revision),dueAt:row.endsAt,status:'waiver_expired',predicate:"EXISTS(SELECT 1 FROM customer_fee_waiver_campaigns c JOIN customer_fee_waiver_revisions r ON r.campaign_id=c.id AND r.revision=c.revision WHERE c.id=? AND c.revision=? AND r.state IN('published','paused') AND r.ends_at=?)",values:[id,row.revision,row.endsAt]}];
 }
 if(type==='promo'){
  const row=await db.prepare("SELECT c.current_revision revision,r.ends_at endsAt FROM promo_campaigns c JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=c.current_revision WHERE c.id=? AND c.status='published' AND c.paused=0").bind(id).first<{revision:number;endsAt:number}>();
  if(!row||now<row.endsAt)return [];
  return [{type,sourceId:id,milestone:'expired',sourceRevision:String(row.revision),dueAt:row.endsAt,status:'promo_expired',predicate:"EXISTS(SELECT 1 FROM promo_campaigns c JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=c.current_revision WHERE c.id=? AND c.current_revision=? AND c.status='published' AND c.paused=0 AND r.ends_at=?)",values:[id,row.revision,row.endsAt]}];
 }
 const state=await readLoyaltyNoticeState(db,now),base={type,sourceId:'default',predicate:"EXISTS(SELECT 1 FROM loyalty_config WHERE id='default' AND version=? AND current_revision=? AND issued_points=?)",values:[state.version,state.storedRevision,state.issuedPoints]};
 if(state.blocked&&state.scheduledRevision!==null&&state.scheduledFor!==null&&now>=state.scheduledFor)return [{...base,milestone:'schedule_blocked',sourceRevision:String(state.scheduledRevision),dueAt:state.scheduledFor,status:'loyalty_schedule_blocked'}];
 if(state.enabled&&!state.paused&&state.endsAt!==null&&now>=state.endsAt)return [{...base,milestone:'expired',sourceRevision:String(state.revision),dueAt:state.endsAt,status:'loyalty_expired'}];
 const effective=state.promotion?{revision:state.promotion.revision,scheduledFor:state.promotion.scheduledFor}:state.activation;
 return effective&&now>=effective.scheduledFor?[{...base,milestone:'effective',sourceRevision:String(effective.revision),dueAt:effective.scheduledFor,status:'loyalty_effective'}]:[];
}
export async function processProgrammeDue(db:D1Database,type:Programme,id:string,now:number){
 if(type==='referral')return 0;
 if(!await db.prepare('SELECT 1 FROM operational_notice_states WHERE family=? AND source_id=?').bind(family(type),id).first()){
  // First observation records exact CURRENT native provenance, not historical
  // publish/pause mail. Past transitions become retained, non-alerting baselines.
  let identity:unknown,predicate:string,values:unknown[];
  if(type==='promo'){const row=await db.prepare('SELECT current_revision revision,version FROM promo_campaigns WHERE id=?').bind(id).first<{revision:number|null;version:number}>();if(!row||row.revision===null)return 0;identity=[id,row.revision];predicate='EXISTS(SELECT 1 FROM promo_campaigns WHERE id=? AND current_revision=? AND version=?)';values=[id,row.revision,row.version];}
  else if(type==='waiver'){const row=await db.prepare("SELECT c.revision,r.ends_at AS endsAt FROM customer_fee_waiver_campaigns c JOIN customer_fee_waiver_revisions r ON r.campaign_id=c.id AND r.revision=c.revision WHERE c.id=? AND r.state IN('published','paused')").bind(id).first<{revision:number;endsAt:number}>();if(!row)return 0;identity=[id,row.revision];predicate="EXISTS(SELECT 1 FROM customer_fee_waiver_campaigns c JOIN customer_fee_waiver_revisions r ON r.campaign_id=c.id AND r.revision=c.revision WHERE c.id=? AND c.revision=? AND r.state IN('published','paused') AND r.ends_at=?)";values=[id,row.revision,row.endsAt];}
  else{const row=await readLoyaltyNoticeState(db,now);identity=[id,row.storedRevision,row.scheduledRevision,row.scheduledFor];predicate="EXISTS(SELECT 1 FROM loyalty_config WHERE id='default' AND version=? AND current_revision=? AND issued_points=?)";values=[row.version,row.storedRevision,row.issuedPoints];}
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['programme-first-observation',family(type),identity]))),eventId=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  const facts=await programmeDueFacts(db,type,id,now),statements=[...paymentGuard(db,predicate,values),db.prepare('INSERT INTO operational_notice_states(family,source_id,current_event_id,current_status) VALUES(?,?,?,?)').bind(family(type),id,eventId,type+'_baseline')];
  for(const fact of facts)statements.push(db.prepare('INSERT OR IGNORE INTO operational_reminder_milestones(id,family,source_id,milestone,source_revision,due_at,created_at) VALUES(?,?,?,?,?,?,?)').bind(await milestoneId(fact,true),milestoneFamily(type),id,'observed_past:'+fact.milestone,fact.sourceRevision,fact.dueAt,now));
  await db.batch(statements);return 0;
 }
 let created=0;for(const fact of await programmeDueFacts(db,type,id,now)){
  if(await db.prepare('SELECT 1 FROM operational_reminder_milestones WHERE id=?').bind(await milestoneId(fact,true)).first())continue;
  const eventId=await milestoneId(fact);
  const prior=await db.prepare('SELECT 1 FROM operational_reminder_milestones WHERE id=?').bind(eventId).first();
  if(!prior){await db.batch([...paymentGuard(db,fact.predicate,fact.values),...paymentGuard(db,`${checkoutCommitClock(db)}>=?`,[fact.dueAt]),db.prepare('INSERT OR IGNORE INTO operational_reminder_milestones(id,family,source_id,milestone,source_revision,due_at,created_at) VALUES(?,?,?,?,?,?,?)').bind(eventId,milestoneFamily(type),id,fact.milestone,fact.sourceRevision,fact.dueAt,now)]);created++;}
  const current=await db.prepare('SELECT current_event_id eventId FROM operational_notice_states WHERE family=? AND source_id=?').bind(family(type),id).first<{eventId:string}>();
  if(current?.eventId!==eventId){
   const notices=await programmeNoticeStatements(db,{actorId:'system',requestId:eventId,now},{type,sourceId:id,eventId,status:fact.status});
   try{await db.batch([...paymentGuard(db,fact.predicate,fact.values),...paymentGuard(db,`${checkoutCommitClock(db)}>=?`,[fact.dueAt]),...notices]);}
   catch(error){if(!(await programmeDueFacts(db,type,id,now)).some(fresh=>fresh.milestone===fact.milestone&&fresh.sourceRevision===fact.sourceRevision&&fresh.dueAt===fact.dueAt))continue;throw error;}
  }
 }
 return created;
}

export function programmeOperationalSource(db:D1Database,e:SourceOperationalEvent):OperationalSourceDescriptor|null{
 if(e.kind!=='programme.updated'||!e.status||!Object.hasOwn(subjects,e.status))return null;const type=(['promo','loyalty','waiver','referral'] as const).find(type=>e.status!.startsWith(type+'_'));if(!type||type==='referral'&&e.sourceId!=='default')return null;const status=e.status,json=(field:string,response=true)=>`${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract'}(native_event.next_json,'$.${response?'response.':''}${field}')`;
 const base:OperationalSourceDescriptor={guard:'EXISTS(SELECT 1 FROM operational_notice_states WHERE family=? AND source_id=? AND current_event_id=? AND current_status=?)',guardValues:[family(type),e.sourceId,e.eventId,status],ownerSql:null,ownerValues:[],audience:'staff',staffPermission:'commercial_policy.manage',relatedType:noticeType(type),subject:subjects[status],staffGuard:'1=1',staffGuardValues:[]};
 const natural=['promo_expired','loyalty_effective','loyalty_expired','loyalty_schedule_blocked','waiver_expired'].includes(status);
 if(natural){base.guard+=' AND EXISTS(SELECT 1 FROM operational_reminder_milestones WHERE id=? AND source_id=? AND family=?)';base.guardValues.push(e.eventId,e.sourceId,milestoneFamily(type));}
 else if(type==='promo'){
  base.guard+=` AND EXISTS(SELECT 1 FROM promo_campaigns current_programme JOIN audit_logs native_event ON native_event.subject_id=current_programme.id WHERE current_programme.id=? AND native_event.id=? AND native_event.action=? AND native_event.subject_type='promo_campaign' AND current_programme.current_revision=${json('publishedRevision')} AND current_programme.paused=?)`;base.guardValues.push(e.sourceId,e.eventId,status==='promo_published'?'promo.publish':'promo.pause',status==='promo_paused'?1:0);
 }else if(type==='waiver'){
  const actions:Record<string,string>={waiver_published:'publish',waiver_paused:'pause',waiver_resumed:'resume',waiver_ended:'end',waiver_revised:'revise'},action=actions[status];if(!action)return null;
  base.guard+=` AND EXISTS(SELECT 1 FROM customer_fee_waiver_campaigns current_programme JOIN customer_fee_waiver_revisions native_revision ON native_revision.campaign_id=current_programme.id AND native_revision.revision=current_programme.revision JOIN audit_logs native_event ON native_event.subject_id=current_programme.id WHERE current_programme.id=? AND native_event.id=? AND native_event.action=? AND native_event.subject_type='customer_fee_waiver' AND current_programme.revision=${json('revision',false)} AND native_revision.state=${json('state',false)})`;base.guardValues.push(e.sourceId,e.eventId,'customer.service-fee-waiver.'+action);
 }else if(type==='referral'){
  if(status!=='referral_updated')return null;
  base.guard+=` AND EXISTS(SELECT 1 FROM referral_campaign current_programme JOIN audit_logs native_event ON native_event.subject_id=current_programme.id JOIN form_answer_sets native_form ON native_form.request_id=native_event.request_id AND native_form.form_id='staff.referral-settings' AND native_form.subject_type='referral_campaign' AND native_form.subject_id=current_programme.id AND native_form.actor_id=native_event.actor_id WHERE current_programme.id='default' AND native_event.id=? AND native_event.action='referral.offer.updated' AND native_event.subject_type='referral_campaign' AND current_programme.enabled=CASE WHEN CAST(${json('enabled',false)} AS CHAR) IN('true','1') THEN 1 WHEN CAST(${json('enabled',false)} AS CHAR) IN('false','0') THEN 0 ELSE NULL END AND current_programme.friend_discount_paisa=${json('friendDiscountPaisa',false)} AND current_programme.reward_paisa=${json('rewardPaisa',false)} AND current_programme.minimum_subtotal_paisa=${json('minimumSubtotalPaisa',false)} AND current_programme.return_window_days=${json('returnWindowDays',false)})`;base.guardValues.push(e.eventId);
 }else{
  const expected=status==='loyalty_published'?'loyalty.publish':status==='loyalty_paused'?'loyalty.pause':'loyalty.cancel_schedule';
  base.guard+=` AND EXISTS(SELECT 1 FROM loyalty_config current_programme JOIN audit_logs native_event ON native_event.subject_id=current_programme.id WHERE current_programme.id='default' AND native_event.id=? AND native_event.action=? AND native_event.subject_type='loyalty_config' AND (current_programme.current_revision=${json('publishedRevision')} OR current_programme.scheduled_revision=${json('scheduledRevision')}))`;base.guardValues.push(e.eventId,expected);
 }
 return base;
}
export async function isCurrentProgrammeNotice(db:D1Database,notice:CurrentOperationalNotice,now=Date.now()){
 if(notice.template!=='business.programme.updated')return true;if(!notice.relatedId||!notice.userId||notice.audience!=='staff')return false;
 const type=(['promo','loyalty','waiver','referral'] as const).find(type=>noticeType(type)===notice.relatedType);if(!type)return false;const state=await db.prepare('SELECT current_event_id eventId,current_status status FROM operational_notice_states WHERE family=? AND source_id=?').bind(family(type),notice.relatedId).first<{eventId:string;status:string}>();if(!state)return false;
 const descriptor=programmeOperationalSource(db,{kind:'programme.updated',sourceId:notice.relatedId,eventId:state.eventId,status:state.status,now});if(!descriptor)return false;
 if(!await db.prepare('SELECT 1 WHERE '+descriptor.guard).bind(...descriptor.guardValues).first())return false;
 if(['promo_expired','loyalty_effective','loyalty_expired','loyalty_schedule_blocked','waiver_expired'].includes(state.status)){
  const milestone=await db.prepare('SELECT milestone,source_revision sourceRevision,due_at dueAt FROM operational_reminder_milestones WHERE id=?').bind(state.eventId).first<{milestone:string;sourceRevision:string;dueAt:number}>();
  if(!milestone||!(await programmeDueFacts(db,type,notice.relatedId,now)).some(fact=>fact.milestone===milestone.milestone&&fact.sourceRevision===milestone.sourceRevision&&fact.dueAt===milestone.dueAt))return false;
 }else if(type==='promo'&&state.status==='promo_published'&&(await programmeDueFacts(db,type,notice.relatedId,now)).some(fact=>fact.status==='promo_expired'))return false;
 else if(type==='loyalty'&&state.status==='loyalty_published'&&(await programmeDueFacts(db,type,notice.relatedId,now)).length)return false;
 else if(type==='waiver'&&['waiver_published','waiver_resumed','waiver_revised','waiver_paused'].includes(state.status)&&(await programmeDueFacts(db,type,notice.relatedId,now)).length)return false;
 return notice.requestId===await operationalNotificationRequestId(notice.template,state.eventId,notice.userId,notice.channel);
}
