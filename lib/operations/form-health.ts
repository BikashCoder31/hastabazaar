import {FORM_REGISTRY} from '../forms/registry';
import {readDatabaseHealthScope} from '../db/health-context';
import {resolveRuntimeEnvironment} from '../staging/environment';
import manifest from '../../deployment/babal/release-manifest.json';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {recordServiceHealthObservation,readServiceHealth,evaluateServiceHealth,type HealthEnvironment,type HealthTransitionStatements,type HealthIncidentEvidenceStatements} from './service-health-repository';
import {nativeFormContract} from './native-form-health';
import {sweepCommittedFormSaves} from './form-save-sweep';

export class FormHealthAccessError extends Error{readonly status=403;}
export interface FormHealthScope{environment:HealthEnvironment|'unknown';releaseId:string;now:number;formId?:string;limit?:number;deadlineMs?:number}
type LoadOutcome='compatible'|'fallback'|'blocked';
interface Observation{id:string;supportReference:string;formId:string;version:number|null;journey:string;phase:'load'|'save';outcome:LoadOutcome|'saved';category:string|null;observedAt:number;releaseId:string;environment:string;}
const columns='id,support_reference supportReference,form_id formId,form_version version,journey,phase,outcome,category,observed_at observedAt,release_id releaseId,environment';
function scope(input:FormHealthScope){if(!['production','development','local_staging','test','unknown'].includes(input.environment)||!Number.isSafeInteger(input.now)||input.now<0||typeof input.releaseId!=='string'||!/^[-a-zA-Z0-9_.:]{1,160}$/.test(input.releaseId)||input.formId&&!FORM_REGISTRY[input.formId]||input.limit!==undefined&&(!Number.isInteger(input.limit)||input.limit<1||input.limit>200)||input.deadlineMs!==undefined&&(!Number.isSafeInteger(input.deadlineMs)||input.deadlineMs<0))throw new Error('Use a current supported form-health scope.');}
export function formHealthRuntimeScope(bindings:Record<string,string|undefined>=process.env,now=Date.now()):FormHealthScope{
 let environment:HealthEnvironment|'unknown'='unknown';try{if(bindings.HASTABAZAAR_RUNTIME_ENV)environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,appOrigin:bindings.APP_ORIGIN,nodeEnvironment:bindings.NODE_ENV??process.env.NODE_ENV}).kind;}catch{}
 return {environment,releaseId:bindings.HASTABAZAAR_RELEASE_ID&&/^[-a-zA-Z0-9_.:]{1,160}$/.test(bindings.HASTABAZAAR_RELEASE_ID)?bindings.HASTABAZAAR_RELEASE_ID:manifest.release,now};
}
export function formHealthDatabaseScope(db:D1Database,now=Date.now()):FormHealthScope{const saved=readDatabaseHealthScope(db);return saved?{...saved,now}:{environment:'unknown',releaseId:'unrecorded',now};}
/** Called by the server definition loader only. No caller can claim a saved submission. */
export async function recordFormLoadObservation(db:D1Database,input:FormHealthScope&{formId:string;version:number|null;outcome:LoadOutcome;category?:'definition_unavailable'|'definition_invalid'|'read_unavailable'}){
 scope(input);if(!FORM_REGISTRY[input.formId]||!['compatible','fallback','blocked'].includes(input.outcome)||input.version!==null&&(!Number.isSafeInteger(input.version)||input.version<1)||input.category&&!['definition_unavailable','definition_invalid','read_unavailable'].includes(input.category))throw new Error('Use a sanitized server form observation.');
 const id=crypto.randomUUID(),supportReference='form-health-'+id;
 await db.prepare("INSERT INTO form_health_observations(id,support_reference,environment,release_id,form_id,form_version,journey,phase,outcome,category,evidence_kind,evidence_id,observed_at) VALUES(?,?,?,?,?,?,?,'load',?,?,'runtime',NULL,?)").bind(id,supportReference,input.environment,input.releaseId,input.formId,input.version,FORM_REGISTRY[input.formId].adapterId,input.outcome,input.category??null,input.now).run();return supportReference;
}
export async function readFormHealth(db:D1Database,actorId:string,input:FormHealthScope){
 scope(input);const authority=await staffMutationGuard(db,actorId,'system.health.view',FormHealthAccessError);
 const ids=input.formId?[input.formId]:(await db.prepare('SELECT DISTINCT form_id id FROM form_health_observations WHERE environment=? AND release_id=? ORDER BY form_id LIMIT ?').bind(input.environment,input.releaseId,Math.max(1,Math.min(input.limit??150,200))).all<{id:string}>()).results.map(r=>r.id);
 const result=[];for(const formId of ids){
  const native=await nativeFormContract(formId);
  const rows=(await db.prepare(`SELECT ${columns} FROM form_health_observations WHERE environment=? AND release_id=? AND form_id=? AND observed_at<=? ${native?'AND form_version=?':''} ORDER BY observed_at DESC,id DESC LIMIT 50`).bind(input.environment,input.releaseId,formId,input.now,...(native?[native.version]:[])).all<Observation>()).results;
  const lastLoad=rows.find(r=>r.phase==='load')??null,lastSave=rows.find(r=>r.phase==='save'&&(!lastLoad||r.version===lastLoad.version))??null;
  let state=!rows.length||input.now-rows[0].observedAt>300000?'unknown':rows[0].outcome==='blocked'?'action_needed':rows[0].outcome==='fallback'?'degraded':lastSave?'healthy':'unknown';
  if(native&&state==='healthy')state=lastLoad?.outcome==='blocked'?'action_needed':lastLoad?.outcome==='compatible'&&input.now-lastLoad.observedAt<=300000&&lastSave&&input.now-lastSave.observedAt<=300000?'healthy':'unknown';
  const incident=await db.prepare('SELECT id,state FROM service_health_incidents WHERE environment=? AND service_key=? ORDER BY episode DESC LIMIT 1').bind(input.environment,'form.'+formId).first<{id:string;state:string}>();
  if(state==='healthy'&&incident&&incident.state!=='resolved')state='degraded';
  result.push({formId,journey:FORM_REGISTRY[formId]?.adapterId??'unsupported',state,lastLoad,lastSave,incident:incident?{id:incident.id,state:incident.state}:null,meaning:lastSave?'A durable submission was recorded; this does not complete every linked business obligation.':'Definition compatibility is separate from durable submission evidence.'});
 }
 await db.batch(authority.statements);return result;
}
/** Ingest only persisted native receipts carrying the scope captured by the original server batch. */
export async function ingestCommittedFormSaves(db:D1Database,input:FormHealthScope){
 scope(input);return (await sweepCommittedFormSaves(db,input)).recorded;
}
/** Eligibility belongs before bounded selection, including latest-event recovery checks. */
async function currentObservationPredicate(){
 const native=(await Promise.all(Object.keys(FORM_REGISTRY).map(async formId=>{const contract=await nativeFormContract(formId);return contract?{formId,version:contract.version}:null;}))).filter((row):row is {formId:string;version:number}=>row!==null);
 return {sql:'(form_id NOT IN('+native.map(()=>'?').join(',')+') OR '+native.map(()=>'(form_id=? AND form_version=?)').join(' OR ')+')',values:[...native.map(row=>row.formId),...native.flatMap(row=>[row.formId,row.version])]};
}
/** Keep the actual delivered opening evidence even when catch-up delayed creation.
 * Both snapshots are bounded by readServiceHealth's 100-row evaluation window;
 * the episode boundary and a preceding success exclude unrelated old failures. */
function incidentEvidenceStatements(input:FormHealthScope,formId:string,version:number|null,evidenceScope:string):HealthIncidentEvidenceStatements{
 return async(db,incident,observations)=>{
  const expired=()=>input.deadlineMs!==undefined&&Date.now()>=input.deadlineMs;
  if(expired())return null;
  const previous=await db.prepare("SELECT resolved_at resolvedAt FROM service_health_incidents WHERE environment=? AND service_key=? AND episode<? AND state='resolved' ORDER BY episode DESC LIMIT 1").bind(input.environment,'form.'+formId,incident.episode).first<{resolvedAt:number|null}>();
  const after=previous?.resolvedAt??-1;
  const opening=incident.firstSeenAt===input.now?observations:(await readServiceHealth(db,{environment:input.environment as HealthEnvironment,serviceKey:'form.'+formId,expectedSince:null,observationMode:'event',evidenceScope,now:incident.firstSeenAt})).observations;
  const contributing=[];
  for(const observation of opening){
   if(observation.observedAt<=after||observation.successful)break;
   contributing.push(observation);
  }
  const retained=new Map([...contributing,...observations.filter(observation=>observation.observedAt>incident.firstSeenAt&&observation.observedAt>after)].filter(observation=>observation.serviceKey==='form.'+formId&&observation.sourceKind==='evaluator'&&observation.evidenceScope===evidenceScope&&observation.observedAt<=input.now).map(observation=>[observation.runKey,observation]));
  const statements=[];
  for(const observation of retained.values()){
   if(expired())return null;
   // Verify the immutable form identity as well as the server delivery scope.
   // Never copy answers, raw receipt payloads, or caller-supplied diagnostics.
   statements.push(db.prepare(`INSERT OR IGNORE INTO form_health_incident_links(observation_id,incident_id,retained_at)
    SELECT id,?,? FROM form_health_observations WHERE id=? AND environment=? AND release_id=? AND form_id=?
    AND (form_version=? OR (form_version IS NULL AND ? IS NULL)) AND observed_at=? AND outcome=?`).bind(incident.id,input.now,observation.runKey,input.environment,input.releaseId,formId,version,version,observation.observedAt,observation.successful?'saved':'blocked'));
  }
  return expired()?null:statements;
 };
}
/** Dispatcher seam. The original recorded event clock/identity is never replaced by scan time. */
export async function evaluateFormHealth(db:D1Database,input:FormHealthScope,transitions?:HealthTransitionStatements){
 scope(input);if(input.environment==='unknown')return {scanned:0,unmapped:true};
 const ingestion=await sweepCommittedFormSaves(db,input),current=await currentObservationPredicate();
 const eligible="environment=? AND release_id=? AND outcome IN('blocked','saved') AND observed_at<=? AND "+current.sql+(input.formId?' AND form_id=?':'');
 const values=[input.environment,input.releaseId,input.now,...current.values,...(input.formId?[input.formId]:[])];
 const rows=(await db.prepare(`SELECT ${columns} FROM form_health_observations WHERE ${eligible} AND NOT EXISTS(SELECT 1 FROM service_health_observations delivered WHERE delivered.environment=form_health_observations.environment AND delivered.run_key=form_health_observations.id) ORDER BY observed_at,id LIMIT ?`).bind(...values,(input.limit??100)+1).all<Observation>()).results;
 const selected=rows.slice(0,input.limit??100);
 let processed=0;for(const row of selected){
  if(input.deadlineMs!==undefined&&Date.now()>=input.deadlineMs)break;
  const evidenceScope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([input.releaseId,row.formId,row.version])))),v=>v.toString(16).padStart(2,'0')).join('');
  await recordServiceHealthObservation(db,{environment:input.environment,serviceKey:'form.'+row.formId,runKey:row.id,observedAt:row.observedAt,successful:row.outcome!=='blocked',functionalSuccess:row.outcome==='saved',eligibleBacklog:row.outcome==='blocked'?1:0,oldestEligibleAt:row.outcome==='blocked'?row.observedAt:null,progressCount:row.outcome==='saved'?1:0,failureCategory:row.outcome==='blocked'?'worker':null,sourceKind:'evaluator',evidenceScope});
  processed++;
 }
 // Re-evaluate retained latest facts too: a failed incident/notice write must be
 // recoverable without copying the same successful submission observation.
 // Delivery can advance independently, but incident/notice decisions require a
 // completed receipt sweep. Retained facts are revisited after completion even
 // when their delivery happened in an earlier, partial invocation.
 const known=ingestion.completedThrough===null?[]:(await db.prepare(`SELECT form_id formId FROM form_health_observations WHERE ${eligible} GROUP BY form_id ORDER BY form_id LIMIT 200`).bind(...values).all<{formId:string}>()).results;
 for(const row of known){
  if(input.deadlineMs!==undefined&&Date.now()>=input.deadlineMs)break;
  // Do not create a catch-up outage from an older blocked event while a later
  // committed outcome is still waiting in this bounded ingestion queue.
  const latest=await db.prepare(`SELECT id,form_version version,observed_at observedAt FROM form_health_observations WHERE ${eligible} AND form_id=? ORDER BY observed_at DESC,id DESC LIMIT 1`).bind(...values,row.formId).first<{id:string;version:number|null;observedAt:number}>();
  if(!latest||latest.observedAt>ingestion.completedThrough!||!await db.prepare('SELECT 1 FROM service_health_observations WHERE environment=? AND run_key=?').bind(input.environment,latest.id).first())continue;
  const native=await nativeFormContract(row.formId);if(native&&latest.version!==native.version)continue;
  const evidenceScope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([input.releaseId,row.formId,latest.version])))),v=>v.toString(16).padStart(2,'0')).join('');
  await evaluateServiceHealth(db,{environment:input.environment,serviceKey:'form.'+row.formId,expectedSince:null,observationMode:'event',evidenceScope,now:input.now},transitions,incidentEvidenceStatements(input,row.formId,latest.version,evidenceScope));
 }
 return {scanned:processed,unmapped:false,busy:ingestion.busy,budgetExhausted:ingestion.budgetExhausted||rows.length>selected.length||input.deadlineMs!==undefined&&Date.now()>=input.deadlineMs};
}
export const formDiagnosticRetention={routineDays:30,cleanupEnabled:false,incidentEvidence:'Retain linked incident evidence under its case policy; no automatic cleanup is enabled.'} as const;
