import {env} from 'cloudflare:workers';
import {runScheduledEmailOutbox} from '@/lib/email/outbox-runner';
import {runEmailAutomation} from '@/lib/email/automation';
import {authorizedEmailJob} from '@/lib/email/job-auth';
import type {DeliveryMailService} from '@/lib/email/delivery-attempts';
import {requireDatabase} from '@/lib/db/d1';
import {applyDueRouteTransitions} from '@/lib/managed-commerce/route-transition';
import {resolveRuntimeEnvironment} from '@/lib/staging/environment';
import {readEmailHealthRuntimeConfig} from '@/lib/operations/email-delivery-overview';
import {processReminderDispatch} from '@/lib/operations/reminder-dispatch';

// Retain the existing scheduler endpoint. One host job runs both bounded workers.
export async function POST(request:Request){
 const headers={'cache-control':'no-store'};
 const bindings=env as unknown as {DB?:D1Database;EMAIL?:DeliveryMailService&{configured?:boolean};ORDER_EMAIL_JOB_SECRET?:string;HASTABAZAAR_RUNTIME_ENV?:string;APP_ORIGIN?:string;EMAIL_AUTOMATION_EXPECTED_SINCE?:string};
 if(!await authorizedEmailJob(request,bindings.ORDER_EMAIL_JOB_SECRET))return Response.json({error:'Unauthorized'},{status:401,headers});
 try{
  const startedAt=Date.now(),health=readEmailHealthRuntimeConfig({HASTABAZAAR_RUNTIME_ENV:bindings.HASTABAZAAR_RUNTIME_ENV,APP_ORIGIN:bindings.APP_ORIGIN,EMAIL_AUTOMATION_EXPECTED_SINCE:bindings.EMAIL_AUTOMATION_EXPECTED_SINCE,NODE_ENV:process.env.NODE_ENV},startedAt);
  if(!health.environment)return Response.json({error:'Email automation runtime scope is unavailable.'},{status:503,headers});
  const db=requireDatabase(bindings),runtime=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
  const result=await runEmailAutomation(db,{environment:health.environment,expectedSince:health.expectedSince,mail:bindings.EMAIL,deadlineMs:startedAt+45_000},{
   evaluate:async(options)=>{
    if(runtime.simulationAllowed){
     const due=await db.prepare("SELECT id FROM seller_route_transition_applications WHERE status='scheduled' AND effective_at<=? ORDER BY effective_at,id LIMIT 10").bind(options.now).all<{id:string}>();
     for(const row of due.results){if(Date.now()>=options.deadlineMs)break;await applyDueRouteTransitions(db,options.now,runtime,row.id);}
    }
    return processReminderDispatch(db,{...options,limit:50});
   },
   send:options=>runScheduledEmailOutbox({...options,limit:12}),
  });
  return Response.json({...result,environment:health.environment,observedAt:Date.now()},{status:result.ok?200:503,headers});
 }catch{return Response.json({error:'Email automation is unavailable. Saved delivery work is retained.'},{status:503,headers});}
}
