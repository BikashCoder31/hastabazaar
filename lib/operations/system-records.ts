import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {FormHealthAccessError} from './form-health';
import {listReviewTasks,reviewTaskReminderSource} from '../workflows/review-tasks';
import {paymentGuard} from '../payments/manual-receipts';
import {businessEmailQueue} from './business-notifications';
import {listOrderEmailHistory} from './email-queue';
import {auditDestination} from '../db/repositories/business-activity';
export interface SystemRecordFilters{environment:string;reference?:string;type?:string;actor?:string;from?:string;to?:string;status?:string;action?:string;limit?:number}
export interface SystemRecord{reference:string;type:string;record:string;action:string;status:string;environment:string;releaseId:string|null;version:number|null;category:string|null;createdAt:number;actorId?:string|null;href?:string|null;changes?:{field:string;before:string|null;after:string|null}[];}
export async function searchSystemRecords(db:D1Database,actorId:string,input:SystemRecordFilters){
 const authority=await staffMutationGuard(db,actorId,'system.health.view',FormHealthAccessError);
 const sourceGuards:D1PreparedStatement[]=[];
 if(!['production','development','local_staging','test','unknown'].includes(input.environment)||Object.values(input).some(v=>typeof v==='string'&&(v.length>200||/[\p{Cc}<>]/u.test(v))))throw new Error('Use bounded record filters.');
 if(input.type&&!['form','file','incident','delivery','review','action'].includes(input.type))throw new Error('Select a supported scoped record type.');
 const date=(value:string|undefined)=>{if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Error('Use a valid record date.');return Date.parse(value+'T00:00:00+05:45');};
 const from=date(input.from),to=date(input.to);if(from!==null&&to!==null&&from>to)throw new Error('The record date range is reversed.');
 const limit=Math.max(1,Math.min(Number.isInteger(input.limit)?input.limit!:50,100));
 const predicates=['environment=?'],values:unknown[]=[input.environment];
 if(input.reference){predicates.push('(support_reference=? OR id=?)');values.push(input.reference,input.reference);}
 if(input.status){predicates.push('outcome=?');values.push(input.status);}
 if(input.action){predicates.push('phase=?');values.push(input.action);}
 if(from!==null){predicates.push('observed_at>=?');values.push(from);}if(to!==null){predicates.push('observed_at<?');values.push(to+86400000);}
 // Form diagnostics intentionally record no actor or business subject identifier.
 const rows:SystemRecord[]=input.type&&input.type!=='form'||input.actor?[]:(await db.prepare(`SELECT support_reference reference,'form' type,form_id record,phase action,outcome status,environment,release_id releaseId,form_version version,category,observed_at createdAt FROM form_health_observations WHERE ${predicates.join(' AND ')} ORDER BY observed_at DESC,id DESC LIMIT ?`).bind(...values,limit).all<SystemRecord>()).results;
 if(!input.type||input.type==='incident'){
  const parts=['h.environment=?'],args:unknown[]=[input.environment];
  if(input.reference){parts.push('(h.id=? OR e.id=?)');args.push(input.reference,input.reference);}if(input.status){parts.push('h.state=?');args.push(input.status);}if(input.actor){parts.push('e.actor_id=?');args.push(input.actor);}if(input.action){parts.push('e.action=?');args.push(input.action);}
  if(from!==null){parts.push('COALESCE(e.occurred_at,h.first_seen_at)>=?');args.push(from);}if(to!==null){parts.push('COALESCE(e.occurred_at,h.first_seen_at)<?');args.push(to+86400000);}
  const events=await db.prepare(`SELECT COALESCE(e.id,h.id) reference,'incident' type,h.service_key record,COALESCE(e.action,'detected') action,h.state status,h.environment,NULL releaseId,h.revision version,h.failure_category category,COALESCE(e.occurred_at,h.first_seen_at) createdAt,e.actor_id actorId,e.from_revision beforeRevision,e.to_revision afterRevision FROM service_health_incidents h LEFT JOIN service_incident_events e ON e.incident_id=h.id WHERE ${parts.join(' AND ')} ORDER BY COALESCE(e.occurred_at,h.first_seen_at) DESC,h.id,e.id LIMIT ?`).bind(...args,limit).all<SystemRecord&{beforeRevision:string|null;afterRevision:string|null}>();
  rows.push(...events.results.map(({beforeRevision,afterRevision,...row})=>({...row,changes:row.action==='detected'?[]:[{field:'Incident version',before:beforeRevision,after:afterRevision}]})));
 }
 if(input.type==='file'&&!input.actor){
  const where=['environment=?'],args:unknown[]=[input.environment];if(input.reference){where.push('(support_reference=? OR id=?)');args.push(input.reference,input.reference);}if(input.status){where.push('outcome=?');args.push(input.status);}if(from!==null){where.push('observed_at>=?');args.push(from);}if(to!==null){where.push('observed_at<?');args.push(to+86400000);}
  rows.push(...(await db.prepare(`SELECT support_reference reference,'file' type,access_kind record,'storage_read' action,outcome status,environment,release_id releaseId,NULL version,category,observed_at createdAt FROM file_health_observations WHERE ${where.join(' AND ')} ORDER BY observed_at DESC,id DESC LIMIT ?`).bind(...args,limit).all<SystemRecord>()).results);
 }
 if(input.type==='delivery'){
  const delivery=await staffMutationGuard(db,actorId,'email.delivery.manage',FormHealthAccessError,'super_admin');
  const sourceFilters={reference:input.reference,fromAt:from??undefined,beforeAt:to===null?undefined:to+86400000};
  const [business,order]=await Promise.all([businessEmailQueue(db,Date.now(),sourceFilters),listOrderEmailHistory(db,sourceFilters,Date.now(),100)]);
  rows.push(...business.map(row=>({reference:row.id,type:'delivery',record:'business_email',action:'delivery',status:row.displayStatus,environment:input.environment,releaseId:null,version:null,category:row.failureCategory,createdAt:row.createdAt,href:'/admin/business-emails'})),...order.jobs.map(row=>({reference:row.id,type:'delivery',record:'order_email',action:'delivery',status:row.displayStatus,environment:input.environment,releaseId:null,version:null,category:row.failureCategory,createdAt:row.createdAt,href:'/admin/order-emails'})));
  await db.batch(delivery.statements);
 }
 if(input.type==='review'){
  const tasks=await listReviewTasks(db,actorId,undefined,{limit:1000,reference:input.reference,fromAt:from??undefined,beforeAt:to===null?undefined:to+86400000});
  for(const row of tasks){
   if(input.reference&&input.reference!==row.id||input.status&&input.status!==row.status||input.actor&&input.actor!==row.ownerId)continue;
   const original=await reviewTaskReminderSource(db,row.id);if(!original||original.current.ownerId===actorId||original.current.conflictIds?.includes(actorId))continue;
   let current;try{current=await staffMutationGuard(db,actorId,original.current.permission,FormHealthAccessError,original.current.reserved?'super_admin':undefined);}catch(error){if(!(error instanceof FormHealthAccessError))throw error;if(!original.current.alternativePermission)continue;try{current=await staffMutationGuard(db,actorId,original.current.alternativePermission,FormHealthAccessError);}catch(denied){if(denied instanceof FormHealthAccessError)continue;throw denied;}}
   sourceGuards.push(...current.statements,...paymentGuard(db,original.current.predicate,original.current.values));
   rows.push({reference:row.id,type:'review',record:row.sourceType,action:'review',status:row.status,environment:input.environment,releaseId:null,version:row.revision,category:null,createdAt:row.startedAt,actorId:row.ownerId,href:'/admin?reviewQ='+encodeURIComponent(row.sourceId)+'#seller-review-queue'});if(rows.length>=limit)break;
  }
 }
 if(input.type==='action'){
  const audit=await staffMutationGuard(db,actorId,'audit_log.view',FormHealthAccessError,'super_admin');
  const where:string[]=[],args:unknown[]=[];
  if(input.reference){where.push('(id=? OR subject_id=? OR request_id=?)');args.push(input.reference,input.reference,input.reference);}if(input.actor){where.push('actor_id=?');args.push(input.actor);}if(input.action){where.push('action=?');args.push(input.action);}if(from!==null){where.push('created_at>=?');args.push(from);}if(to!==null){where.push('created_at<?');args.push(to+86400000);}
  const events=await db.prepare(`SELECT id,actor_id actorId,action,subject_type subjectType,subject_id subjectId,created_at createdAt FROM audit_logs ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...args,limit).all<{id:string;actorId:string|null;action:string;subjectType:string;subjectId:string;createdAt:number}>();
  rows.push(...events.results.map(row=>({reference:row.id,type:'action',record:row.subjectType,action:row.action,status:'recorded',environment:input.environment,releaseId:null,version:null,category:null,createdAt:row.createdAt,actorId:row.actorId,href:auditDestination(row.subjectType,row.subjectId)})));await db.batch(audit.statements);
 }
 const matches=(row:SystemRecord)=>(!input.reference||row.reference===input.reference||['form','file','incident','action'].includes(row.type))&&(!input.status||row.status===input.status)&&(!input.actor||row.actorId===input.actor)&&(!input.action||row.action===input.action)&&(from===null||row.createdAt>=from)&&(to===null||row.createdAt<to+86400000);
 const filtered=rows.filter(matches);
 filtered.sort((a,b)=>b.createdAt-a.createdAt||a.reference.localeCompare(b.reference));
 await db.batch([...authority.statements,...sourceGuards]);return {records:filtered.slice(0,limit),limit,coverage:'Bounded canonical source windows. An empty window is not proof that no older authorized work exists; continue in its protected source history.',retention:'The environment identifies this connection; older delivery/review/audit records have no recorded release. Routine diagnostics: 30 days after an approved retention/hold mapping. Cleanup is disabled; business and audit histories are unchanged.'};
}
