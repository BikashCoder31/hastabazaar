import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {readServiceHealth} from './service-health-repository';
import {readFormHealth,FormHealthAccessError,formDiagnosticRetention,type FormHealthScope} from './form-health';
import {listIncidents} from './incident-review';
import {readFileHealth} from './file-access-health';
export async function readSystemHealthWorkspace(db:D1Database,actorId:string,input:FormHealthScope&{expectedSince?:number|null;systemExpectedSince?:number|null}){
 const authority=await staffMutationGuard(db,actorId,'system.health.view',FormHealthAccessError);
 const [forms,emailServices,owned,files]=await Promise.all([readFormHealth(db,actorId,input),input.environment==='unknown'?Promise.resolve([]):Promise.all(['email.sender','email.evaluator','application.availability','database.readiness'].map(async serviceKey=>{
  const state=await readServiceHealth(db,{environment:input.environment as Exclude<FormHealthScope['environment'],'unknown'>,serviceKey,expectedSince:serviceKey.startsWith('email.')?input.expectedSince??null:input.systemExpectedSince??null,evidenceScope:input.releaseId??null,now:input.now});return {serviceKey,state:state.incident&&state.incident.state!=='resolved'&&state.state==='healthy'?'degraded':state.state,lastObservedAt:state.lastObservedAt};
 })),listIncidents(db,actorId,input.environment,input.now,{limit:100}),readFileHealth(db,actorId,input)]);
 const services=[...emailServices,...files.map(row=>({serviceKey:'files.'+row.accessKind,state:row.state,lastObservedAt:row.lastObservation?.observedAt??null}))];
 const incidents=owned.filter(row=>row.state!=='resolved').map(row=>({id:row.id,state:row.state,severity:row.severity,ownerId:row.ownerId,nextAction:row.nextAction,nextUpdateAt:row.nextUpdateAt}));
 await db.batch(authority.statements);
 return {environment:input.environment,releaseId:input.releaseId,observedAt:input.now,forms,services,incidents,retention:formDiagnosticRetention,unobserved:['Full business save journeys']};
}
export type SystemHealthOverview=Awaited<ReturnType<typeof readSystemHealthWorkspace>>;
