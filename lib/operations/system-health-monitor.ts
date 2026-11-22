import {inspectDeploymentReadiness} from './deployment-readiness';
import {GET as localLiveness} from '../../app/health/live/route';
import {decodePublishedForm} from '../forms/runtime';
import type {FormId} from '../forms/types';
import type {SecurityPolicyBindings} from '../security/runtime-policy';
import {readDatabaseHealthScope} from '../db/health-context';
import {evaluateFormHealth} from './form-health';
import {evaluateFileHealth} from './file-access-health';
import {reconcileIncidentOwnership} from './incident-review';
import {recordServiceHealthObservation,evaluateServiceHealth,type HealthTransitionStatements} from './service-health-repository';

export type SystemHealthCheck=(db:D1Database,bindings:SecurityPolicyBindings)=>Promise<boolean>;
/** Local handler proof only. Independent external monitoring detects a stopped process. */
export const inspectLocalApplicationLiveness:SystemHealthCheck=async()=>{const response=localLiveness();return response.status===200&&(await response.json() as {status?:string}).status==='ok';};
/** The release manifest predates T30. Probe the actual additional contracts read-only. */
export const inspectCurrentDatabaseReadiness:SystemHealthCheck=async(db,bindings)=>{
 if(!(await inspectDeploymentReadiness(db,bindings)).ready)return false;
 try{
  for(const sql of [
   'SELECT id,required_permission,primary_user_id FROM team_duties WHERE 1=0',
   'SELECT health_environment,health_release_id FROM form_answer_sets WHERE 1=0',
   'SELECT evidence_scope FROM service_health_observations WHERE 1=0',
   'SELECT incident_id,impact_class,closure_required FROM service_incident_governance WHERE 1=0',
   'SELECT id,support_reference,release_id,evidence_kind FROM form_health_observations WHERE 1=0',
   'SELECT observation_id,incident_id FROM form_health_incident_links WHERE 1=0',
   'SELECT id,support_reference,release_id,access_kind FROM file_health_observations WHERE 1=0',
   'SELECT observation_id,incident_id FROM file_health_incident_links WHERE 1=0',
   'SELECT id,actor_id,action,next_json,created_at FROM audit_logs WHERE 1=0',
  ])await db.prepare(sql).all();
  for(const formId of ['seller.application','seller.product-submission','seller.profile','seller.maker-profile','seller.inventory'] as FormId[]){
   const row=await db.prepare("SELECT version,config_json,published_at FROM form_config_versions WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1").bind(formId).first<{version:number;config_json:string;published_at:number}>();decodePublishedForm(formId,row);
  }
  return true;
 }catch{return false;}
};
export async function runSystemHealthMonitor(db:D1Database,bindings:SecurityPolicyBindings,input:{now:number;expectedSince:number|null;budgetMs?:number},transition:HealthTransitionStatements,checks:{application?:SystemHealthCheck;database?:SystemHealthCheck;clock?:()=>number;ownership?:typeof reconcileIncidentOwnership}={}){
 const scope=readDatabaseHealthScope(db);if(!scope)throw new Error('Trusted runtime health scope is unavailable.');
 if(!Number.isSafeInteger(input.now)||input.now<0||input.budgetMs!==undefined&&(!Number.isInteger(input.budgetMs)||input.budgetMs<1||input.budgetMs>10000))throw new Error('Invalid bounded monitor clock.');
 const clock=checks.clock??Date.now,deadlineMs=clock()+(input.budgetMs??5000),services=[];
 for(const [serviceKey,check] of [['application.availability',checks.application??inspectLocalApplicationLiveness],['database.readiness',checks.database??inspectCurrentDatabaseReadiness]] as const){
  if(clock()>=deadlineMs)break;
  // Detect retained heartbeat silence before the returning run can erase it.
  await evaluateServiceHealth(db,{environment:scope.environment,serviceKey,now:input.now,expectedSince:input.expectedSince,detectionSeverity:'critical',evidenceScope:scope.releaseId},transition);
  let successful=false;try{successful=await check(db,bindings);}catch{}
  await recordServiceHealthObservation(db,{environment:scope.environment,serviceKey,runKey:crypto.randomUUID(),observedAt:input.now,successful,functionalSuccess:successful,eligibleBacklog:successful?0:1,oldestEligibleAt:successful?null:input.now,progressCount:successful?1:0,failureCategory:successful?null:'worker',sourceKind:'watchdog',evidenceScope:scope.releaseId});
  const result=await evaluateServiceHealth(db,{environment:scope.environment,serviceKey,now:input.now,expectedSince:input.expectedSince,detectionSeverity:'critical',evidenceScope:scope.releaseId},transition);
  const incidentOpen=!!result.incident&&result.incident.state!=='resolved';
  services.push({serviceKey,state:incidentOpen&&result.state==='healthy'?'degraded':result.state,reason:incidentOpen&&result.state==='healthy'?'incident_open':result.reason,incident:result.incident?{id:result.incident.id,episode:result.incident.episode,state:result.incident.state}:null});
 }
 const eventScope={...scope,now:input.now,deadlineMs,limit:50};
 const forms=clock()<deadlineMs?await evaluateFormHealth(db,eventScope,transition):null;
 const files=clock()<deadlineMs?await evaluateFileHealth(db,eventScope,transition):null;
 const ownership=clock()<deadlineMs?await (checks.ownership??reconcileIncidentOwnership)(db,{environment:scope.environment,now:input.now,limit:20}):null;
 return {environment:scope.environment,releaseId:scope.releaseId,observedAt:input.now,services,forms,files,ownership,budgetExhausted:clock()>=deadlineMs,proof:'Local liveness handler and read-only database readiness; no whole-journey or external availability proof.'};
}
