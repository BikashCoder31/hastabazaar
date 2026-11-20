import {env} from 'cloudflare:workers';
import {authorizedEmailJob} from '@/lib/email/job-auth';
import {requireDatabase} from '@/lib/db/d1';
import {readEmailHealthRuntimeConfig} from '@/lib/operations/email-delivery-overview';
import {evaluateServiceHealth} from '@/lib/operations/service-health-repository';
import {incidentHealthTransitionStatements} from '@/lib/operations/incident-review';
import {readDatabaseHealthScope} from '@/lib/db/health-context';

/** Separate watchdog credential. A monitor cannot forge successful sender/evaluator observations. */
export async function POST(request:Request){
 const headers={'cache-control':'no-store'};
 const bindings=env as unknown as {DB?:D1Database;EMAIL_WATCHDOG_SECRET?:string;HASTABAZAAR_RUNTIME_ENV?:string;APP_ORIGIN?:string;EMAIL_AUTOMATION_EXPECTED_SINCE?:string};
 if(!await authorizedEmailJob(request,bindings.EMAIL_WATCHDOG_SECRET))return Response.json({error:'Unauthorized'},{status:401,headers});
 try{
  const now=Date.now(),scope=readEmailHealthRuntimeConfig({HASTABAZAAR_RUNTIME_ENV:bindings.HASTABAZAAR_RUNTIME_ENV,APP_ORIGIN:bindings.APP_ORIGIN,EMAIL_AUTOMATION_EXPECTED_SINCE:bindings.EMAIL_AUTOMATION_EXPECTED_SINCE,NODE_ENV:process.env.NODE_ENV},now);
  if(!scope.environment)return Response.json({error:'Email automation runtime scope is unavailable.'},{status:503,headers});
  const db=requireDatabase(bindings),runtime=readDatabaseHealthScope(db),states=[];
  if(runtime&&runtime.environment!==scope.environment)throw new Error('Health runtime scope differs.');
  for(const serviceKey of ['email.sender','email.evaluator']){
   const state=await evaluateServiceHealth(db,{environment:scope.environment,expectedSince:scope.expectedSince,evidenceScope:runtime?.releaseId??null,serviceKey,now},incidentHealthTransitionStatements);
   states.push({serviceKey,state:state.state,reason:state.reason,incident:state.incident?{id:state.incident.id,episode:state.incident.episode,state:state.incident.state}:null});
  }
  return Response.json({environment:scope.environment,observedAt:now,services:states},{headers});
 }catch{return Response.json({error:'Email health evidence is unavailable.'},{status:503,headers});}
}
