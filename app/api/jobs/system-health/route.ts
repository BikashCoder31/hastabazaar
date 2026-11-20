import {env} from 'cloudflare:workers';
import {authorizedEmailJob} from '@/lib/email/job-auth';
import {requireDatabase} from '@/lib/db/d1';
import {runSystemHealthMonitor} from '@/lib/operations/system-health-monitor';
import {incidentHealthTransitionStatements} from '@/lib/operations/incident-review';
import type {SecurityPolicyBindings} from '@/lib/security/runtime-policy';
export async function POST(request:Request){
 const headers={'cache-control':'no-store'},bindings=env as unknown as SecurityPolicyBindings&Record<string,string|undefined>&{DB?:D1Database};
 if(!await authorizedEmailJob(request,bindings.SYSTEM_HEALTH_JOB_SECRET))return Response.json({error:'Unauthorized'},{status:401,headers});
 try{
  const now=Date.now(),raw=bindings.SYSTEM_HEALTH_EXPECTED_SINCE,parsed=raw&&/^\d+$/.test(raw)?Number(raw):NaN,expectedSince=Number.isSafeInteger(parsed)&&parsed>0&&parsed<=now?parsed:null;
  const result=await runSystemHealthMonitor(requireDatabase(bindings),bindings,{now,expectedSince},incidentHealthTransitionStatements);
  return Response.json(result,{headers,status:result.services.length===2?200:503});
 }catch{return Response.json({error:'System health evidence is unavailable.'},{status:503,headers});}
}
