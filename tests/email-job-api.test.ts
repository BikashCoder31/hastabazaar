import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {commissionDatabase} from './helpers/commission-database';
declare global {var emailJobBindings:Record<string,unknown>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env=new Proxy({},{get(_target,key){return globalThis.emailJobBindings[key]}})',shortCircuit:true};
 return next(specifier,context);
}});
void test('actual scheduled endpoint runs both workers without a signed-in staff session and watchdog cannot fabricate successful work',async()=>{
 const f=await commissionDatabase({seedSellers:false});const realClock=Date.now;try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  // An empty installation is intentional; domain fixtures test unconfigured terms.
  let probes=0,sends=0;
  const workerSecret='fictional-worker-only-secret-0123456789',watchdogSecret='fictional-watchdog-only-secret-9876543210';
  globalThis.emailJobBindings={DB:f.database,APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RUNTIME_ENV:'test',ORDER_EMAIL_JOB_SECRET:workerSecret,EMAIL_WATCHDOG_SECRET:watchdogSecret,EMAIL_AUTOMATION_EXPECTED_SINCE:String(realClock()-1000),EMAIL:{configured:true,transport:'capture',transportKey:'fictional-capture',configurationFingerprint:'fictional-configuration',handoffAware:true,send:async(_message:unknown,context:{beforeHandoff():Promise<void>})=>{await context.beforeHandoff();sends++;return {outcome:'captured',transport:'capture',receipt:'fictional-only'};},probe:async()=>{probes++;return {available:true,transport:'capture'};}}};
  const worker=await import('../app/api/jobs/order-emails/route'),watchdog=await import('../app/api/jobs/email-health/route');
  const request=(path:string,secret?:string)=>new Request('http://localhost:3018/api/jobs/'+path,{method:'POST',headers:secret?{authorization:'Bearer '+secret}:{}});
  const missingCredential = await worker.POST(request('order-emails'));
  assert.equal(missingCredential.status,401);
  assert.deepEqual(await missingCredential.json(), {error:'Unauthorized'});
  assert.equal((await worker.POST(request('order-emails?secret='+workerSecret))).status,401);
  assert.equal((await worker.POST(request('order-emails',watchdogSecret))).status,401);
  assert.equal((await watchdog.POST(request('email-health',workerSecret))).status,401);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_observations').get()!.n,0);
  assert.equal(probes+sends,0);
  const response=await worker.POST(request('order-emails',workerSecret));
  assert.equal(response.status,200,await response.clone().text());
  const result=await response.json() as {environment:string;observedAt:number;healthRecorded:boolean;sender:{functionalVerified:boolean}};
  assert.equal(result.environment,'test');assert.ok(result.observedAt>0);assert.equal(result.healthRecorded,true);assert.equal(result.sender.functionalVerified,true);assert.equal(probes+sends>0,true);
  assert.deepEqual(f.sqlite.prepare('SELECT service_key,functional_success FROM service_health_observations ORDER BY service_key').all().map(row=>({...row})),[{service_key:'email.evaluator',functional_success:1},{service_key:'email.sender',functional_success:1}]);
  Date.now=()=>realClock()+6*60_000;
  const health=await watchdog.POST(request('email-health',watchdogSecret));assert.equal(health.status,200);
  const body=await health.json() as {services:{state:string;incident:{state:string}|null}[]};assert.ok(body.services.every(service=>service.state==='action_needed'&&service.incident?.state==='detected'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_observations').get()!.n,2,'Watchdog inspection cannot manufacture worker success.');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.email_health'").get()!.n,4);
  await watchdog.POST(request('email-health',watchdogSecret));assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.email_health'").get()!.n,4);
 }finally{Date.now=realClock;globalThis.emailJobBindings={};await f.dispose();}
});
