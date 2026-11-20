import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const minute=60_000;
const environments=new Set(['production','development']);
const hash=value=>createHash('sha256').update(value).digest('hex');
const reference=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,159}$/.test(value);
const systemHealth=config=>config.healthKind==='system';
const serviceKeys=config=>systemHealth(config)?['application.availability','database.readiness']:['email.sender','email.evaluator'];
export class MonitorError extends Error {constructor(code){super(code);this.code=code;}}
const assertCredential=value=>{if(typeof value!=='string'||value.length<8||/[\r\n]/.test(value))throw new MonitorError('credential_unavailable');};

export function validateHttpsUrl(value,allowedOrigin,path){
 let url,origin;
 try{url=new URL(value);origin=new URL(allowedOrigin);}catch{throw new MonitorError('invalid_endpoint_mapping');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.origin!==origin.origin||origin.href!==origin.origin+'/'||(path&&url.pathname!==path))throw new MonitorError('invalid_endpoint_mapping');
 if(['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.hostname.endsWith('.localhost'))throw new MonitorError('invalid_endpoint_mapping');
 return url.href;
}
export function validateWatchdogConfig(config){
 if(!config||config.version!==1||config.enabled!==true||!environments.has(config.environment)||!Number.isSafeInteger(config.expectedSince)||config.expectedSince<=0)throw new MonitorError('watchdog_not_explicitly_enabled');
 if(config.healthKind!==undefined&&!['email','system'].includes(config.healthKind))throw new MonitorError('invalid_health_kind');
 if(systemHealth(config)&&!reference(config.expectedReleaseId))throw new MonitorError('current_release_unmapped');
 validateHttpsUrl(config.healthUrl,config.allowedAppOrigin,systemHealth(config)?'/api/jobs/system-health':'/api/jobs/email-health');
 const boundary=config.boundary,contact=config.contact;
 if(!boundary||boundary.independenceReviewed!==true||boundary.contactIndependentOfApplicationSmtp!==true||!reference(boundary.evidenceReference)||![boundary.monitorHostId,boundary.applicationHostId,boundary.schedulerBoundaryId,boundary.applicationSchedulerBoundaryId].every(reference)||boundary.monitorHostId===boundary.applicationHostId||boundary.schedulerBoundaryId===boundary.applicationSchedulerBoundaryId)throw new MonitorError('independent_boundary_unmapped');
 if(!contact||contact.mappingReviewed!==true||!reference(contact.mappingReference)||!reference(contact.channelId)||contact.acknowledgement!=='http_2xx_acceptance')throw new MonitorError('external_contact_unmapped');
 validateHttpsUrl(contact.url,contact.allowedOrigin);
 if(new URL(contact.url).origin===new URL(config.healthUrl).origin)throw new MonitorError('independent_contact_unmapped');
 if(contact.providerIdempotencyVerified===true&&!reference(contact.idempotencyEvidenceReference))throw new MonitorError('idempotency_support_unverified');
 if(contact.knownNotAcceptedStatuses!==undefined&&(!Array.isArray(contact.knownNotAcceptedStatuses)||contact.knownNotAcceptedStatuses.length>32||contact.knownNotAcceptedStatuses.some(status=>!Number.isInteger(status)||status<400||status>599)||(contact.knownNotAcceptedStatuses.length&&!reference(contact.rejectionEvidenceReference))))throw new MonitorError('rejection_contract_unverified');
 if(![config.statePath,config.lockPath].every(value=>typeof value==='string'&&isAbsolute(value))||resolve(config.statePath)===resolve(config.lockPath))throw new MonitorError('absolute_state_and_lock_paths_required');
 return config;
}

/** One bounded request. Errors expose only an allowlisted local category. */
export async function requestJson(url,options,fetchImplementation=globalThis.fetch){
 assertCredential(options.secret);
 const timeoutMs=Math.max(1,Math.min(options.timeoutMs??10_000,55_000));
 const maxBytes=Math.max(1,Math.min(options.maxBytes??32_768,65_536));
 const controller=new AbortController();let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 const timeout=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new MonitorError('request_timeout')),{once:true}));
 const task=(async()=>{
  let response;
  try{response=await fetchImplementation(url,{method:'POST',redirect:'error',cache:'no-store',signal:controller.signal,headers:{authorization:`Bearer ${options.secret}`,'content-type':'application/json',accept:'application/json',...options.headers},...(options.body===undefined?{}:{body:JSON.stringify(options.body)})});}catch{throw new MonitorError(timedOut?'request_timeout':'request_outcome_unknown');}
  if(response.status>=300&&response.status<400)throw new MonitorError('redirect_rejected');
  if(options.readBody===false){response.body?.cancel().catch(()=>{});return{status:response.status,ok:response.ok,data:null,retryAfter:response.headers.get('retry-after')};}
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>maxBytes){await response.body?.cancel();throw new MonitorError('response_too_large');}
  let bytes=0,text='';const decoder=new TextDecoder();
  if(response.body){const reader=response.body.getReader();try{for(;;){const result=await reader.read();if(result.done)break;bytes+=result.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new MonitorError('response_too_large');}text+=decoder.decode(result.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}}
  let data=null;
  if(text.trim())try{data=JSON.parse(text);}catch{throw new MonitorError('invalid_response');}
  return{status:response.status,ok:response.ok,data,retryAfter:response.headers.get('retry-after')};
 })();
 try{return await Promise.race([task,timeout]);}finally{clearTimeout(timer);controller.abort();}
}

function observation(data,config,now){
 if(systemHealth(config)&&data?.releaseId!==config.expectedReleaseId)throw new MonitorError('unverified_release_scope');
 if(!data||data.environment!==config.environment||!Number.isSafeInteger(data.observedAt)||data.observedAt<now-90_000||data.observedAt>now+30_000||!Array.isArray(data.services)||data.services.length!==2)throw new MonitorError('unverified_health_scope');
 const keys=data.services.map(row=>row?.serviceKey).sort();
 const expected=serviceKeys(config).slice().sort();
 if(keys[0]!==expected[0]||keys[1]!==expected[1])throw new MonitorError('unverified_health_scope');
 for(const row of data.services){
  if(!row||!['healthy','unknown','action_needed','degraded'].includes(row.state))throw new MonitorError('invalid_health_observation');
  if(row.incident!==null&&(!row.incident||!reference(row.incident.id)||!Number.isSafeInteger(row.incident.episode)||row.incident.episode<=0||!['detected','assigned','working','monitoring','resolved'].includes(row.incident.state)))throw new MonitorError('invalid_health_observation');
 }
 const openIncident=data.services.some(row=>row.incident&&row.incident.state!=='resolved');
 return{at:data.observedAt,healthy:data.services.every(row=>row.state==='healthy')&&!openIncident,openIncident};
}
function newEpisode(state,now,reason){
 const previous=state.episodes.at(-1);
 if(previous)for(const channel of Object.values(previous.channels))if(channel.recovery&&pendingPhase(channel.recovery.phase)){channel.recovery.phase='cancelled';channel.recovery.reason='episode_superseded';}
 const episode={id:randomUUID(),number:state.episodes.length+1,startedAt:now,reason,healthyFirstAt:null,healthyLastAt:null,recoveredAt:null,channels:{}};
 state.episodes.push(episode);return episode;
}
const pendingPhase=phase=>!['accepted','uncertain','handoff_started','cancelled'].includes(phase);
function retryAfterMs(value,now){
 if(!value)return 5*minute;
 if(/^\d+$/.test(value))return Math.max(5*minute,Math.min(Number(value)*1000,7*24*60*minute));
 const at=Date.parse(value);return Number.isFinite(at)?Math.max(5*minute,Math.min(at-now,7*24*60*minute)):5*minute;
}

async function notify(config,state,episode,transition,dependencies){
 const channel=config.contact.channelId;
 if(!Object.hasOwn(episode.channels,channel))episode.channels[channel]={};
 const record=episode.channels[channel][transition]??={eventId:`${systemHealth(config)?'system':'email'}-watchdog:${episode.id}:${transition}:${hash(channel)}`,phase:'pending',attempts:0,nextAt:0,configuration:null};
 const fingerprint=hash(JSON.stringify([config.contact,hash(dependencies.contactSecret??'')]));
 if(!pendingPhase(record.phase)||record.nextAt>dependencies.now())return;
 if(record.phase==='needs_correction'&&record.configuration===fingerprint)return;
 const payload={version:1,source:systemHealth(config)?'hastabazaar-system-watchdog':'hastabazaar-email-watchdog',environment:config.environment,eventId:record.eventId,episode:episode.number,transition,detectedAt:episode.startedAt,observedAt:dependencies.now(),reason:transition==='recovery'?'two_verified_healthy_observations':episode.reason,services:serviceKeys(config)};
 record.phase='handoff_started';record.attempts++;record.configuration=fingerprint;record.handoffAt=dependencies.now();
 await dependencies.store.save(state); // Durable fence MUST precede webhook invocation.
 let response;
 try{
  response=await requestJson(config.contact.url,{secret:dependencies.contactSecret,timeoutMs:10_000,maxBytes:8192,readBody:false,body:payload,headers:{'X-Hastabazaar-Event-ID':record.eventId,...(config.contact.providerIdempotencyVerified===true?{'Idempotency-Key':record.eventId}:{})}},dependencies.fetch);
 }catch{
  record.phase='uncertain';record.reason='external_acceptance_unknown';
  await dependencies.store.save(state);return;
 }
 if(response.ok){record.phase='accepted';record.acceptedAt=dependencies.now();record.reason=null;}
 else if(!(config.contact.knownNotAcceptedStatuses??[]).includes(response.status)){record.phase='uncertain';record.reason='external_rejection_contract_unverified';}
 else if(response.status===429||response.status>=500){record.phase='not_accepted';record.reason='external_service_rejected';record.nextAt=dependencies.now()+retryAfterMs(response.retryAfter,dependencies.now());}
 else{record.phase='needs_correction';record.reason='external_contact_configuration';record.nextAt=0;}
 await dependencies.store.save(state);
}

/** Run once per minute under an OS lock. Tests inject fetch and durable state. */
export async function pollWatchdog(config,dependencies){
 validateWatchdogConfig(config);
 assertCredential(dependencies.healthSecret);assertCredential(dependencies.contactSecret);
 const now=dependencies.now?.()??Date.now();
 if(config.expectedSince>now)throw new MonitorError('expected_start_is_future');
 const deps={...dependencies,now:dependencies.now??Date.now,fetch:dependencies.fetch??globalThis.fetch};
 if(!deps.store||typeof deps.store.load!=='function'||typeof deps.store.save!=='function')throw new MonitorError('durable_state_unavailable');
 const scope=hash(JSON.stringify([config.environment,config.healthUrl,config.expectedSince]));
 const loaded=await deps.store.load();
 const state=loaded??{version:1,scope,lastPollAt:null,lastHealthyAt:null,firstFailureAt:null,episodes:[]};
 if(state.version!==1||state.scope!==scope||!Array.isArray(state.episodes)||state.episodes.length>10_000)throw new MonitorError('retained_state_scope_invalid');
 const retainedTime=value=>value===null||Number.isSafeInteger(value)&&value>=0;
 if(![state.lastPollAt,state.lastHealthyAt,state.firstFailureAt].every(retainedTime)||state.failedObservations!==undefined&&(!Number.isSafeInteger(state.failedObservations)||state.failedObservations<0||state.failedObservations>2)||state.expectedReleaseId!==undefined&&!reference(state.expectedReleaseId))throw new MonitorError('retained_state_invalid');
 for(const episode of state.episodes){
  if(!reference(episode.id)||!Number.isSafeInteger(episode.number)||!Number.isSafeInteger(episode.startedAt)||!episode.channels||typeof episode.channels!=='object'||!(episode.recoveredAt===null||Number.isSafeInteger(episode.recoveredAt)))throw new MonitorError('retained_state_invalid');
  if(![episode.startedAt,episode.healthyFirstAt,episode.healthyLastAt,episode.recoveredAt].every(retainedTime))throw new MonitorError('retained_state_invalid');
  for(const channel of Object.values(episode.channels))for(const transition of Object.values(channel))if(!transition||!reference(transition.eventId)||!['pending','handoff_started','uncertain','accepted','not_accepted','needs_correction','cancelled'].includes(transition.phase)||!Number.isSafeInteger(transition.attempts)||!Number.isSafeInteger(transition.nextAt))throw new MonitorError('retained_state_invalid');
 }
 let episode=state.episodes.at(-1);if(episode?.recoveredAt!==null)episode=null;
 if(systemHealth(config)&&state.expectedReleaseId!==config.expectedReleaseId){
  if(episode){episode.healthyFirstAt=null;episode.healthyLastAt=null;}
  state.expectedReleaseId=config.expectedReleaseId;
 }
 const expectedAt=state.lastPollAt===null?config.expectedSince:state.lastPollAt+minute;
 const observationGap=now-expectedAt>=5*minute;
 if(observationGap&&!episode)episode=newEpisode(state,now,'expected_health_observation_missing');
 let proof=null,reason='health_endpoint_unavailable';
 try{const response=await requestJson(config.healthUrl,{secret:deps.healthSecret,timeoutMs:10_000,maxBytes:32_768},deps.fetch);if(!response.ok)throw new MonitorError('health_endpoint_rejected');proof=observation(response.data,config,now);reason=proof.openIncident?'persisted_service_incident':'service_health_not_verified';}catch{/* Persist only a safe summary, never provider/body/error text. */}
 if(proof?.healthy){
  state.lastHealthyAt=now;state.firstFailureAt=null;state.failedObservations=0;
  if(episode&&proof.at>=episode.startedAt){
   if(episode.healthyFirstAt===null){episode.healthyFirstAt=proof.at;episode.healthyLastAt=proof.at;}
   else if(proof.at>episode.healthyLastAt&&proof.at-episode.healthyFirstAt>=minute){episode.healthyLastAt=proof.at;episode.recoveredAt=now;}
  }
 }else{
  state.firstFailureAt??=systemHealth(config)?now:Math.min(now,expectedAt);
  if(state.lastPollAt===null||now>state.lastPollAt)state.failedObservations=Math.min((state.failedObservations??0)+1,2);
  if(episode){episode.healthyFirstAt=null;episode.healthyLastAt=null;}
  if(!episode&&(proof?.openIncident||systemHealth(config)&&state.failedObservations>=2||now-state.firstFailureAt>=5*minute))episode=newEpisode(state,systemHealth(config)?state.firstFailureAt:now,reason);
 }
 state.lastPollAt=now;await deps.store.save(state);
 const latest=state.episodes.at(-1);
 if(latest){
  if(latest.recoveredAt===null)await notify(config,state,latest,'outage',deps);
  else{
   let changed=false;
   for(const channel of Object.values(latest.channels)){if(channel.outage&&pendingPhase(channel.outage.phase)){channel.outage.phase='cancelled';changed=true;}}
   if(changed)await deps.store.save(state);
   if(proof?.healthy)await notify(config,state,latest,'recovery',deps);
  }
 }
 return{environment:config.environment,state:latest?.recoveredAt===null?'outage':proof?.healthy?'healthy':'checking',episode:latest?.number??null,alertState:latest?.channels[config.contact.channelId]??null};
}

/** Atomic replacement with fsync. Corrupt/missing-scope state is never reset. */
export function createFileStateStore(statePath){
 if(!isAbsolute(statePath))throw new MonitorError('absolute_state_path_required');
 return{
  async load(){let value;try{const info=await stat(statePath);if(info.size>1_048_576)throw new MonitorError('retained_state_too_large');value=await readFile(statePath,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw new MonitorError('retained_state_unavailable');}try{return JSON.parse(value);}catch{throw new MonitorError('retained_state_invalid');}},
  async save(state){const text=JSON.stringify(state)+'\n';if(Buffer.byteLength(text)>1_048_576)throw new MonitorError('retained_state_too_large');const temporary=statePath+'.pending-'+randomUUID();let handle;
   try{handle=await open(temporary,'wx',0o600);await handle.writeFile(text,'utf8');await handle.sync();await handle.close();handle=null;await rename(temporary,statePath);const directory=await open(dirname(statePath),'r');try{await directory.sync();}finally{await directory.close();}}
   catch{throw new MonitorError('retained_state_write_failed');}finally{await handle?.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
  },
 };
}
export async function withRunLock(lockRunner,action){return lockRunner(action);}

/** Linux util-linux flock owns the real lock through exec; process death releases
 * it. No sticky file or age-based lock stealing is used. */
export async function launchLockedCli(scriptPath,configPath,lockPath,capabilities={}){
 if((capabilities.platform??process.platform)!=='linux')throw new MonitorError('linux_flock_capability_unverified');
 const token=randomUUID();
 return new Promise((resolveExit,reject)=>{
  const child=(capabilities.spawn??spawn)('flock',['--no-fork','--nonblock','--conflict-exit-code','75',lockPath,process.execPath,scriptPath,'--config',configPath,'--execute','--lock-child',token],{stdio:'inherit',env:{...process.env,HASTABAZAAR_EMAIL_LOCK_TOKEN:token,HASTABAZAAR_EMAIL_LOCK_PARENT:String(process.pid)}});
  child.once('error',()=>reject(new MonitorError('linux_flock_capability_unverified')));child.once('exit',code=>resolveExit(code??1));
 });
}
export async function readCliConfiguration(argv){
 const at=argv.indexOf('--config'),path=at>=0?argv[at+1]:null;
 if(!argv.includes('--execute')||!path||!isAbsolute(path))throw new MonitorError('explicit_reviewed_configuration_required');
 const info=await stat(path);if(!info.isFile()||info.size>65_536)throw new MonitorError('configuration_unavailable');
 const config=JSON.parse(await readFile(path,'utf8'));
 const childAt=argv.indexOf('--lock-child');
 const ownsLock=childAt>=0&&argv[childAt+1]===process.env.HASTABAZAAR_EMAIL_LOCK_TOKEN&&process.env.HASTABAZAAR_EMAIL_LOCK_PARENT===String(process.ppid);
 if(childAt>=0&&!ownsLock)throw new MonitorError('os_lock_owner_unverified');
 return{config,path,ownsLock};
}
export async function watchdogCli(argv=process.argv.slice(2)){
 const input=await readCliConfiguration(argv);validateWatchdogConfig(input.config);
 if(!input.ownsLock)return launchLockedCli(fileURLToPath(import.meta.url),input.path,input.config.lockPath);
 const result=await pollWatchdog(input.config,{store:createFileStateStore(input.config.statePath),healthSecret:systemHealth(input.config)?process.env.SYSTEM_HEALTH_JOB_SECRET:process.env.EMAIL_WATCHDOG_SECRET,contactSecret:systemHealth(input.config)?process.env.SYSTEM_HEALTH_CONTACT_SECRET:process.env.EMAIL_WATCHDOG_CONTACT_SECRET,now:Date.now});
 const alertPhases=result.alertState?Object.fromEntries(Object.entries(result.alertState).map(([transition,value])=>[transition,value.phase])):{};
 console.log(JSON.stringify({component:systemHealth(input.config)?'system-watchdog':'email-watchdog',environment:result.environment,state:result.state,episode:result.episode,alertPhases}));
 return Object.values(alertPhases).some(phase=>['handoff_started','uncertain','needs_correction','not_accepted'].includes(phase))?1:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){watchdogCli().then(code=>{process.exitCode=code;}).catch(error=>{console.error(JSON.stringify({component:'email-watchdog',error:error instanceof MonitorError?error.code:'watchdog_unavailable'}));process.exitCode=1;});}
