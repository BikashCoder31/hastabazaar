import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';

function requestBody(body:RequestInit['body']){assert.equal(typeof body,'string','The owned fake transport expects a JSON string body');return body as string;}
const modulePath='../scripts/email-automation-watchdog.mjs';
const senderPath='../scripts/run-email-automation.mjs';
const now=2_000_000_000_000;
const config={version:1,enabled:true,environment:'production',expectedSince:now,healthUrl:'https://app.example.test/api/jobs/email-health',allowedAppOrigin:'https://app.example.test',boundary:{independenceReviewed:true,evidenceReference:'fictional-independent-host-review',monitorHostId:'fictional-monitor',applicationHostId:'fictional-application',schedulerBoundaryId:'fictional-monitor-scheduler',applicationSchedulerBoundaryId:'fictional-app-scheduler',contactIndependentOfApplicationSmtp:true},contact:{channelId:'ops-oncall',url:'https://alerts.example.test/health-hook',allowedOrigin:'https://alerts.example.test',mappingReviewed:true,mappingReference:'fictional-approved-ops-contact',acknowledgement:'http_2xx_acceptance',providerIdempotencyVerified:false},statePath:'/fictional/watchdog/state.json',lockPath:'/fictional/watchdog/state.lock'};
const healthy=(at:number)=>({environment:'production',observedAt:at,services:[{serviceKey:'email.sender',state:'healthy',reason:'recent_success',incident:null},{serviceKey:'email.evaluator',state:'healthy',reason:'recent_success',incident:null}]});
function fixture(){let saved:unknown=null;const alerts:Record<string,unknown>[]=[];return{store:{async load(){return structuredClone(saved);},async save(value:unknown){saved=structuredClone(value);}},alerts,read:()=>saved};}

void test('corrupt retained observation counters and clocks stop before another monitor request',async()=>{
 const m=await import(modulePath),f=fixture();let requests=0;
 const dependencies={store:f.store,now:()=>now,healthSecret:'fictional-health-secret',contactSecret:'fictional-contact-secret',fetch:async()=>{requests++;return Response.json(healthy(now));}};
 await m.pollWatchdog(config,dependencies);const valid=structuredClone(f.read()) as Record<string,unknown>;
 for(const invalid of [{failedObservations:-1},{failedObservations:3},{failedObservations:'2'},{lastPollAt:'unknown'},{firstFailureAt:-1},{expectedReleaseId:''}]){
  await f.store.save({...valid,...invalid});await assert.rejects(m.pollWatchdog(config,dependencies),/retained_state_invalid/);
 }
 assert.equal(requests,1);
});

void test('independent watchdog accepts the actual system-monitor response contract',async()=>{
 const {serviceHealthFixture}=await import('./helpers/service-health-fixture'),{readFileSync}=await import('node:fs'),{captureDatabaseHealthScope}=await import('../lib/db/health-context'),{runSystemHealthMonitor}=await import('../lib/operations/system-health-monitor');
 const db=serviceHealthFixture(),f=fixture();try{
  db.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY,form_id TEXT,answers_json TEXT,created_at INTEGER);CREATE TABLE audit_logs(id TEXT PRIMARY KEY,action TEXT,next_json TEXT,created_at INTEGER);CREATE TABLE form_config_versions(form_id TEXT,version INTEGER,config_json TEXT,published_at INTEGER,status TEXT)');
  db.sqlite.exec(readFileSync('drizzle/0149_team_governance.sql','utf8'));db.sqlite.exec(readFileSync('drizzle/0151_form_health_records.sql','utf8'));
  captureDatabaseHealthScope(db.db,{HASTABAZAAR_RUNTIME_ENV:'production',NODE_ENV:'production',APP_ORIGIN:'https://app.example.test',HASTABAZAAR_RELEASE_ID:'watchdog-contract-v1'});
  const result=await runSystemHealthMonitor(db.db,{}, {now,expectedSince:now},async()=>[],{application:async()=>true,database:async()=>true,ownership:async()=>({scanned:0,changed:0,busy:false})});
  const system={...config,healthKind:'system',expectedReleaseId:'watchdog-contract-v1',healthUrl:'https://app.example.test/api/jobs/system-health'};
  const m=await import(modulePath),state=await m.pollWatchdog(system,{store:f.store,now:()=>now,healthSecret:'fictional-health-secret',contactSecret:'fictional-contact-secret',fetch:async(url:string)=>{assert.equal(url,system.healthUrl);return Response.json(result);}});
  assert.equal(state.state,'healthy');assert.equal(state.episode,null);
 }finally{db.sqlite.close();}
});

void test('independent system monitoring waits for two failures and requires two current-release recovery observations',async()=>{
 const m=await import(modulePath),f=fixture();
 const system={...config,healthKind:'system',expectedReleaseId:'fixture-release-1',healthUrl:'https://app.example.test/api/jobs/system-health'};
 let at=now,up=false;
 const dependencies={store:f.store,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret',fetch:async(url:string,options:RequestInit)=>{
  if(url!==system.healthUrl){f.alerts.push(JSON.parse(requestBody(options.body)));return new Response('{}',{status:202});}
  if(!up)throw new Error('fictional unavailable application');
  return Response.json({environment:'production',releaseId:system.expectedReleaseId,observedAt:at,services:['application.availability','database.readiness'].map(serviceKey=>({serviceKey,state:'healthy',incident:null}))});
 }};
 await m.pollWatchdog(system,dependencies);assert.equal(f.alerts.length,0);
 at+=60_000;await m.pollWatchdog(system,dependencies);assert.equal(f.alerts.length,1);assert.equal(f.alerts[0].detectedAt,now);
 at+=60_000;await m.pollWatchdog(system,dependencies);assert.equal(f.alerts.length,1);
 up=true;at+=60_000;await m.pollWatchdog(system,dependencies);assert.equal(f.alerts.length,1);
 system.expectedReleaseId='fixture-release-2';at+=60_000;await m.pollWatchdog(system,dependencies);assert.equal(f.alerts.length,1,'Old-release success cannot complete current-release recovery.');
 at+=60_000;await m.pollWatchdog(system,dependencies);assert.equal(f.alerts.length,2);assert.equal(f.alerts[1].transition,'recovery');
 assert.equal(f.alerts[0].source,'hastabazaar-system-watchdog');assert.deepEqual(f.alerts[0].services,['application.availability','database.readiness']);
 assert.throws(()=>m.validateWatchdogConfig({...system,expectedReleaseId:''}));
 assert.throws(()=>m.validateWatchdogConfig({...system,healthKind:'unknown'}));
});

void test('five minutes of missing external health opens one retained outage and does not repeat it',async()=>{
 const m=await import(modulePath),f=fixture();
 const fetch=async(url:string,options:RequestInit)=>{if(url===config.healthUrl)throw new Error('private provider details');f.alerts.push(JSON.parse(requestBody(options.body)));return new Response('{}',{status:202});};
 for(const at of[now,now+240_000,now+300_000,now+360_000])await m.pollWatchdog(config,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});
 assert.equal(f.alerts.length,1);assert.equal(f.alerts[0].transition,'outage');assert.doesNotMatch(JSON.stringify(f.read()),/private provider details|health-secret|contact-secret/);
});
void test('recovery needs two distinct actual healthy observations at least one minute apart and no open incident',async()=>{
 const m=await import(modulePath),f=fixture();let value=healthy(now),at=now;
 const fetch=async(url:string,options:RequestInit)=>{if(url===config.healthUrl)return Response.json(value);f.alerts.push(JSON.parse(requestBody(options.body)));return new Response('{}',{status:202});};
 value.services[0]={...value.services[0],state:'action_needed',incident:{id:'episode-one',episode:1,state:'detected'}} as unknown as typeof value.services[0];
 await m.pollWatchdog(config,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});assert.equal(f.alerts.length,1);
 at+=60_000;value=healthy(at);await m.pollWatchdog(config,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});
 at+=30_000;value=healthy(at);await m.pollWatchdog(config,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});assert.equal(f.alerts.length,1);
 at+=30_000;value=healthy(at);await m.pollWatchdog(config,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});assert.equal(f.alerts.length,2);assert.equal(f.alerts[1].transition,'recovery');
 at+=60_000;value=healthy(at);await m.pollWatchdog(config,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});assert.equal(f.alerts.length,2);
});
void test('persisted alert handoff fences unknown acceptance across restart without an idempotency promise',async()=>{
 const m=await import(modulePath),f=fixture();let attempts=0;
 const fetch=async(url:string,options:RequestInit)=>{if(url===config.healthUrl)throw new Error('offline');attempts++;assert.equal(new Headers(options.headers).has('Idempotency-Key'),false);throw new Error('acknowledgement lost');};
 await m.pollWatchdog(config,{store:f.store,fetch,now:()=>now+300_000,healthSecret:'health-secret',contactSecret:'contact-secret'});
 await m.pollWatchdog(config,{store:f.store,fetch,now:()=>now+600_000,healthSecret:'health-secret',contactSecret:'contact-secret'});assert.equal(attempts,1);assert.match(JSON.stringify(f.read()),/uncertain/);
});
void test('stale, wrong-scope and partial healthy payloads cannot close a watchdog episode',async()=>{
 const m=await import(modulePath);
 for(const value of[{...healthy(now),environment:'local_staging'},{...healthy(now),observedAt:now-120_000},{...healthy(now),services:[healthy(now).services[0]]}]){
  const f=fixture();await m.pollWatchdog(config,{store:f.store,fetch:async(url:string,options:RequestInit)=>url===config.healthUrl?Response.json(value):(f.alerts.push(JSON.parse(requestBody(options.body))),new Response('{}',{status:202})),now:()=>now+300_000,healthSecret:'health-secret',contactSecret:'contact-secret'});assert.equal(f.alerts.length,1);assert.equal(f.alerts[0].transition,'outage');
 }
});
void test('CLI mappings fail closed before network unless exact HTTPS endpoints and independent boundaries are reviewed',async()=>{
 const m=await import(modulePath);
 for(const invalid of[{...config,enabled:false},{...config,healthUrl:'http://localhost:3018/api/jobs/email-health'},{...config,healthUrl:'https://user:secret@app.example.test/api/jobs/email-health'},{...config,boundary:{...config.boundary,monitorHostId:config.boundary.applicationHostId}},{...config,contact:{...config.contact,url:'https://alerts.example.test/hook?token=secret'}},{...config,environment:'local_staging'}])assert.throws(()=>m.validateWatchdogConfig(invalid));
 assert.doesNotThrow(()=>m.validateWatchdogConfig(config));
});
void test('bounded HTTP uses headers, refuses redirects and oversized response bodies',async()=>{
 const m=await import(modulePath);let request:RequestInit|undefined;
 await m.requestJson(config.healthUrl,{secret:'private-token',timeoutMs:100,maxBytes:1000},async(_url:string,options:RequestInit)=>{request=options;return Response.json(healthy(now));});
 assert.equal(request?.redirect,'error');assert.equal(new Headers(request?.headers).get('authorization'),'Bearer private-token');
 await assert.rejects(m.requestJson(config.healthUrl,{secret:'private-token',timeoutMs:100,maxBytes:8},async()=>new Response('x'.repeat(100))));
});
void test('sender launcher calls only the existing bounded job and validates returned environment',async()=>{
 const m=await import(senderPath);let calls=0;
 const sender={version:1,enabled:true,environment:'production',jobUrl:'https://app.example.test/api/jobs/order-emails',allowedAppOrigin:'https://app.example.test',hostMappingReviewed:true,mappingReference:'fictional-host-review',lockPath:'/fictional/sender.lock'};
 const result=await m.runSenderTick(sender,{secret:'job-secret',now:()=>now,fetch:async(url:string,options:RequestInit)=>{calls++;assert.equal(url,sender.jobUrl);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');return Response.json({environment:'production',observedAt:now,ok:true});}});assert.equal(result.ok,true);assert.equal(calls,1);
 await assert.rejects(m.runSenderTick(sender,{secret:'job-secret',now:()=>now,fetch:async()=>Response.json({environment:'local_staging',observedAt:now,ok:true})}));
});
void test('injected OS lock runner keeps busy runs quiet and releases crash ownership for the next process',async()=>{
 const m=await import(modulePath);let owned=false,executions=0;
 const lockRunner=async(action:()=>Promise<unknown>)=>{if(owned)return{busy:true};owned=true;try{return await action();}finally{owned=false;}};
 await assert.rejects(m.withRunLock(lockRunner,async()=>{executions++;throw new Error('fake process died');}));
 await m.withRunLock(lockRunner,async()=>{executions++;const busy=await m.withRunLock(lockRunner,async()=>{executions++;});assert.deepEqual(busy,{busy:true});});assert.equal(executions,2);
});
void test('verified HTTP acceptance is retained even when webhook returns a non-JSON body',async()=>{
 const m=await import(modulePath),f=fixture();let calls=0;
 const fetch=async(url:string)=>{if(url===config.healthUrl)throw new Error('offline');calls++;return new Response('accepted',{status:202});};
 await m.pollWatchdog(config,{store:f.store,fetch,now:()=>now+300_000,healthSecret:'health-secret',contactSecret:'contact-secret'});
 assert.equal(calls,1);assert.match(JSON.stringify(f.read()),/"phase":"accepted"/);assert.doesNotMatch(JSON.stringify(f.read()),/"phase":"uncertain"/);
});
void test('explicit webhook rate rejection honors Retry-After and retries one stable event only',async()=>{
 const m=await import(modulePath),f=fixture();let at=now+300_000,calls=0;const ids:string[]=[];
 const retryConfig={...config,contact:{...config.contact,knownNotAcceptedStatuses:[429],rejectionEvidenceReference:'fictional-rejection-contract'}};
 const fetch=async(url:string,options:RequestInit)=>{if(url===config.healthUrl)throw new Error('offline');calls++;ids.push(String(JSON.parse(requestBody(options.body)).eventId));return calls===1?new Response('<p>rate limited</p>',{status:429,headers:{'retry-after':'600'}}):new Response('ok',{status:202});};
 const run=()=>m.pollWatchdog(retryConfig,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});
 await run();at+=599_000;await run();assert.equal(calls,1);at+=1000;await run();assert.equal(calls,2);assert.equal(ids[0],ids[1]);
});
void test('an unverified webhook 5xx cannot authorize replay after possible handler acceptance',async()=>{
 const m=await import(modulePath),f=fixture();let attempts=0;
 const fetch=async(url:string)=>{if(url===config.healthUrl)throw new Error('offline');attempts++;return new Response('unknown result',{status:500});};
 await m.pollWatchdog(config,{store:f.store,fetch,now:()=>now+300_000,healthSecret:'health-secret',contactSecret:'contact-secret'});
 await m.pollWatchdog(config,{store:f.store,fetch,now:()=>now+900_000,healthSecret:'health-secret',contactSecret:'contact-secret'});assert.equal(attempts,1);assert.match(JSON.stringify(f.read()),/external_rejection_contract_unverified/);
});
void test('a missed watchdog interval creates its own truthful episode even if the application is currently healthy',async()=>{
 const m=await import(modulePath),f=fixture();let at=now;
 const fetch=async(url:string,options:RequestInit)=>url===config.healthUrl?Response.json(healthy(at)):(f.alerts.push(JSON.parse(requestBody(options.body))),new Response('{}',{status:202}));
 await m.pollWatchdog(config,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});at+=7*60_000;
 await m.pollWatchdog(config,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});assert.equal(f.alerts.length,1);assert.equal(f.alerts[0].reason,'expected_health_observation_missing');
});
void test('accepted webhook followed by state-write loss stays fenced after process restart',async()=>{
 const m=await import(modulePath),f=fixture();let sends=0;
 const store={load:()=>f.store.load(),async save(value:unknown){if(JSON.stringify(value).includes('"phase":"accepted"'))throw new Error('simulated completion write loss');await f.store.save(value);}};
 const fetch=async(url:string)=>{if(url===config.healthUrl)throw new Error('offline');sends++;return new Response('ok',{status:202});};
 await assert.rejects(m.pollWatchdog(config,{store,fetch,now:()=>now+300_000,healthSecret:'health-secret',contactSecret:'contact-secret'}));
 await m.pollWatchdog(config,{store:f.store,fetch,now:()=>now+360_000,healthSecret:'health-secret',contactSecret:'contact-secret'});assert.equal(sends,1);assert.match(JSON.stringify(f.read()),/handoff_started/);
});
void test('timeout and a missing contact credential fail without leaking secrets or creating a phantom handoff',async()=>{
 const m=await import(modulePath),f=fixture();let fetches=0;
 await assert.rejects(m.requestJson(config.healthUrl,{secret:'private-token',timeoutMs:5,maxBytes:100},async()=>new Promise(()=>{})),/request_timeout/);
 await assert.rejects(m.pollWatchdog(config,{store:f.store,fetch:async()=>{fetches++;return Response.json(healthy(now));},now:()=>now,healthSecret:'health-secret',contactSecret:''}),/credential_unavailable/);assert.equal(fetches,0);assert.equal(f.read(),null);
});
void test('actual CLI wrapper selects no-fork OS flock and refuses unsupported hosts before spawning',async()=>{
 const m=await import(modulePath);let executions=0;
 const spawn=(command:string,args:string[])=>{executions++;assert.equal(command,'flock');assert.deepEqual(args.slice(0,4),['--no-fork','--nonblock','--conflict-exit-code','75']);assert.equal(args[4],config.lockPath);const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',75));return child;};
 assert.equal(await m.launchLockedCli('/fictional/monitor.mjs','/fictional/config.json',config.lockPath,{platform:'linux',spawn}),75);assert.equal(executions,1);
 await assert.rejects(m.launchLockedCli('/fictional/monitor.mjs','/fictional/config.json',config.lockPath,{platform:'win32',spawn}),/linux_flock_capability_unverified/);assert.equal(executions,1);
});
void test('a cached healthy observation from before the incident cannot start its recovery clock',async()=>{
 const m=await import(modulePath),f=fixture();let at=now+300_000,body=healthy(at);body.services[0]={...body.services[0],state:'action_needed',incident:{id:'root-incident',episode:1,state:'detected'}} as unknown as typeof body.services[0];
 const fetch=async(url:string,options:RequestInit)=>url===config.healthUrl?Response.json(body):(f.alerts.push(JSON.parse(requestBody(options.body))),new Response('{}',{status:202}));
 const run=()=>m.pollWatchdog(config,{store:f.store,fetch,now:()=>at,healthSecret:'health-secret',contactSecret:'contact-secret'});
 await run();body=healthy(at-30_000);await run();at+=30_000;body=healthy(at);await run();assert.equal(f.alerts.length,1);
});
