import {readDatabaseHealthScope} from '../db/health-context';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {FormHealthAccessError,type FormHealthScope} from './form-health';
import {recordServiceHealthObservation,evaluateServiceHealth,type HealthTransitionStatements} from './service-health-repository';
type Kind='public'|'private';
interface FileObservation{id:string;supportReference:string;accessKind:Kind;outcome:'read'|'blocked';category:string|null;observedAt:number;}
const wrappers=new WeakMap<D1Database,WeakMap<R2Bucket,Map<Kind,R2Bucket>>>();
async function observed(db:D1Database,accessKind:Kind,outcome:'read'|'blocked'){
 try{const saved=readDatabaseHealthScope(db),id=crypto.randomUUID();await db.prepare('INSERT INTO file_health_observations(id,support_reference,environment,release_id,access_kind,outcome,category,observed_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,'file-health-'+id,saved?.environment??'unknown',saved?.releaseId??'unrecorded',accessKind,outcome,outcome==='blocked'?'storage_read_failed':null,Date.now()).run();}catch{/* Diagnostics never grant file access or replace the original outcome. */}
}
/** Use only AFTER current source authority/public visibility is established.
 * Keys and object metadata never enter diagnostics. Stable wrappers preserve
 * existing per-bucket transformation/concurrency caches. No write is wrapped. */
export function observedFileBucket(db:D1Database,bucket:R2Bucket,accessKind:Kind):R2Bucket{
 if(!['public','private'].includes(accessKind))throw new Error('Use a supported file-access class.');
 let buckets=wrappers.get(db);if(!buckets){buckets=new WeakMap();wrappers.set(db,buckets);}let kinds=buckets.get(bucket);if(!kinds){kinds=new Map();buckets.set(bucket,kinds);}const previous=kinds.get(accessKind);if(previous)return previous;
 const wrapped=new Proxy(bucket,{get(target,key){const value=Reflect.get(target,key,target);if(key==='get'&&typeof value==='function')return async(...args:unknown[])=>{try{const object=await value.apply(target,args);if(object&&typeof object==='object'&&'body'in object)await observed(db,accessKind,'read');return object;}catch(error){const status=error&&typeof error==='object'&&'status'in error?error.status:null;if(status!==403&&status!==404)await observed(db,accessKind,'blocked');throw error;}};return typeof value==='function'?value.bind(target):value;}});kinds.set(accessKind,wrapped);return wrapped;
}
export async function readFileHealth(db:D1Database,actorId:string,input:FormHealthScope){
 const authority=await staffMutationGuard(db,actorId,'system.health.view',FormHealthAccessError),result=[];
 for(const kind of ['public','private'] as const){const last=await db.prepare("SELECT id,support_reference supportReference,access_kind accessKind,outcome,category,observed_at observedAt FROM file_health_observations WHERE environment=? AND release_id=? AND access_kind=? AND observed_at<=? ORDER BY observed_at DESC,CASE outcome WHEN 'blocked' THEN 0 ELSE 1 END,id DESC LIMIT 1").bind(input.environment,input.releaseId,kind,input.now).first<FileObservation>();const incident=await db.prepare('SELECT id,state FROM service_health_incidents WHERE environment=? AND service_key=? ORDER BY episode DESC LIMIT 1').bind(input.environment,'files.'+kind).first<{id:string;state:string}>();result.push({accessKind:kind,state:!last||input.now-last.observedAt>300000?'unknown':last.outcome==='blocked'?'action_needed':incident&&incident.state!=='resolved'?'degraded':'healthy',lastObservation:last,incident});}
 await db.batch(authority.statements);return result;
}
export async function evaluateFileHealth(db:D1Database,input:FormHealthScope,transitions?:HealthTransitionStatements){
 if(input.environment==='unknown')return{scanned:0};let scanned=0;
 const rows=(await db.prepare("SELECT id,support_reference supportReference,access_kind accessKind,outcome,category,observed_at observedAt FROM file_health_observations WHERE environment=? AND release_id=? AND observed_at<=? AND NOT EXISTS(SELECT 1 FROM service_health_observations recorded WHERE recorded.environment=file_health_observations.environment AND recorded.run_key=file_health_observations.id) ORDER BY observed_at,id LIMIT ?").bind(input.environment,input.releaseId,input.now,Math.max(1,Math.min(input.limit??50,200))).all<FileObservation>()).results;
 for(const row of rows){if(input.deadlineMs!==undefined&&Date.now()>=input.deadlineMs)break;const mixed=row.outcome==='read'&&!!await db.prepare("SELECT 1 FROM file_health_observations WHERE environment=? AND release_id=? AND access_kind=? AND observed_at=? AND outcome='blocked'").bind(input.environment,input.releaseId,row.accessKind,row.observedAt).first();await recordServiceHealthObservation(db,{environment:input.environment,serviceKey:'files.'+row.accessKind,runKey:row.id,observedAt:row.observedAt,successful:row.outcome==='read'&&!mixed,functionalSuccess:row.outcome==='read'&&!mixed,eligibleBacklog:row.outcome==='blocked'?1:0,oldestEligibleAt:row.outcome==='blocked'?row.observedAt:null,progressCount:row.outcome==='read'?1:0,failureCategory:mixed?'unknown':row.outcome==='blocked'?'worker':null,sourceKind:'evaluator',evidenceScope:input.releaseId});scanned++;}
 for(const kind of ['public','private']){if(input.deadlineMs!==undefined&&Date.now()>=input.deadlineMs)break;
  const latest=await db.prepare("SELECT id FROM file_health_observations WHERE environment=? AND release_id=? AND access_kind=? AND observed_at<=? ORDER BY observed_at DESC,CASE outcome WHEN 'blocked' THEN 0 ELSE 1 END,id DESC LIMIT 1").bind(input.environment,input.releaseId,kind,input.now).first<{id:string}>();
  if(latest&&!await db.prepare('SELECT 1 FROM service_health_observations WHERE environment=? AND run_key=?').bind(input.environment,latest.id).first())continue;
  const state=await evaluateServiceHealth(db,{environment:input.environment,serviceKey:'files.'+kind,expectedSince:null,now:input.now,observationMode:'event',evidenceScope:input.releaseId},transitions);if(state.incident&&state.incident.state!=='resolved')for(const row of rows.filter(r=>r.accessKind===kind))await db.prepare('INSERT OR IGNORE INTO file_health_incident_links(observation_id,incident_id,retained_at) VALUES(?,?,?)').bind(row.id,state.incident.id,input.now).run();}
 return {scanned};
}
