import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import ts from 'typescript';
import {compileFunction} from 'node:vm';

// Execute the actual fixture function with every I/O capability replaced.
// This probe cannot launch a process, open a connection or touch fixture data.
const fixtureSource=await readFile(new URL('../scripts/portable-mariadb-fixture.mjs',import.meta.url),'utf8');
const start=fixtureSource.indexOf('export async function withPortableMariaFixture(');
const stop=fixtureSource.indexOf('\nexport function splitFixtureSql',start);
assert.ok(start>=0&&stop>start);
const fixtureFunction=fixtureSource.slice(start,stop).replace('export ','');
async function harness(options={}){
 const state={root:resolve('test-artifacts/mocked-only'),logs:resolve('test-artifacts/mocked-only/logs'),server:resolve('test-artifacts/mocked-only/mariadbd.exe'),data:resolve('test-artifacts/mocked-only/data'),tmp:resolve('test-artifacts/mocked-only/tmp'),basedir:resolve('test-artifacts/mocked-only/runtime'),password:'fictional-password'};
 const pid=4242,port=33061,writes=new Map(),liveFixtures=new WeakSet();let running=true,ended=0,forced=0,queries=0,activeFixture;
 const connection={query:async sql=>{queries++;if(sql==='SHUTDOWN'){if(!options.force)running=false;if(options.shutdownError)throw options.shutdownError;return[];}return[[{version:'10.11.19',dataDirectory:state.data,port,bindAddress:'127.0.0.1',skipNameResolve:1,logBin:0,eventScheduler:'OFF',localInfile:0,pidFile:join(state.root,'server.pid')}]];},end:async()=>{ended++;}};
 const deps={assert,join,resolve,randomUUID:()=> 'fictional',readOwnedState:async()=>state,freeLoopbackPort:async()=>port,
  readFile:async path=>{if(path.endsWith('owned-process.json'))throw Object.assign(new Error('missing'),{code:'ENOENT'});return String(pid);},writeFile:async(path,value)=>{writes.set(path,value);},
  isRunning:async value=>{assert.equal(value,pid);return running;},spawn:(file,args,configuration)=>{assert.equal(file,'powershell.exe');assert.equal(configuration.windowsHide,true);assert.equal(configuration.shell,false);assert.ok(args.includes('-NonInteractive'));return{unref(){}};},sleep:async()=>{},
  mysql:{createConnection:async configuration=>{assert.equal(configuration.host,'127.0.0.1');assert.equal(configuration.password,state.password);return connection;}},liveFixtures,
  execute:async(file,args)=>{assert.equal(file,'powershell.exe');const script=writes.get(args.at(-1));assert.match(script,/Get-Process -Id 4242/);assert.match(script,/Owned PID identity changed; refusing stop/);assert.match(script,/GetFullPath\(\$p.Path\)/);if(options.identityChanged)throw new Error('Owned PID identity changed; refusing stop');forced++;running=false;}};
 const actual=compileFunction(fixtureFunction+'; return withPortableMariaFixture;',Object.keys(deps))(...Object.values(deps));
 let value,error,failed=false;
 try{value=await actual('fixture-fictional',async fixture=>{activeFixture=fixture;assert.equal(liveFixtures.has(fixture),true);if(options.operationFailed)throw options.operationError;return{retained:'result'};});}catch(caught){error=caught;failed=true;}
 assert.equal(ended,1);assert.equal(queries,2);assert.equal(liveFixtures.has(activeFixture),false);
 return{value,error,failed,forced,shutdown:JSON.parse(writes.get(join(state.root,'last-shutdown.json'))??'null')};
}
void test('portable fixture keeps its result only after authenticated shutdown and revokes fixture authority',async()=>{
 const result=await harness();assert.equal(result.failed,false);assert.deepEqual(result.value,{retained:'result'});assert.deepEqual({...result.shutdown,at:undefined},{pid:4242,authenticatedShutdown:true,forcedStop:false,stopped:true,at:undefined});
});
void test('portable fixture retains the exact operation failure, including a falsy thrown value',async()=>{
 for(const failure of [new Error('original operation'),undefined]){const result=await harness({operationFailed:true,operationError:failure});assert.equal(result.failed,true);assert.equal(result.error,failure);assert.equal(result.shutdown.authenticatedShutdown,true);}
});
void test('portable fixture preserves both original operation and shutdown errors',async()=>{
 const original=new Error('original operation'),shutdown=new Error('authenticated shutdown rejected');
 const result=await harness({operationFailed:true,operationError:original,shutdownError:shutdown});assert.ok(result.error instanceof AggregateError);assert.deepEqual(result.error.errors,[original,shutdown]);assert.equal(result.error.cause,original);assert.equal(result.shutdown.authenticatedShutdown,false);
});
void test('portable fixture rejects forced cleanup and identity drift without hiding the original failure',async()=>{
 const original=new Error('original operation');
 for(const identityChanged of [false,true]){const result=await harness({force:true,identityChanged,operationFailed:true,operationError:original});assert.ok(result.error instanceof AggregateError);assert.equal(result.error.errors[0],original);assert.match(result.error.errors[1].message,identityChanged?/identity changed/:/forced cleanup/);assert.equal(result.forced,identityChanged?0:1);if(!identityChanged)assert.equal(result.shutdown.forcedStop,true);}
});
void test('portable fixture accepts only documented disconnect codes and surfaces standalone shutdown errors',async()=>{
 for(const code of ['ECONNRESET','PROTOCOL_CONNECTION_LOST']){const result=await harness({shutdownError:Object.assign(new Error('disconnect'),{code})});assert.equal(result.failed,false);assert.equal(result.shutdown.authenticatedShutdown,true);}
 const shutdown=new Error('permission denied'),result=await harness({shutdownError:shutdown});assert.equal(result.error,shutdown);assert.equal(result.failed,true);
});

async function route(path,mocks){
 const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const loadedModule={exports:{}};compileFunction(compiled,['require','module','exports'])(name=>{assert.ok(Object.hasOwn(mocks,name),'Unexpected import '+name);return mocks[name];},loadedModule,loadedModule.exports);return loadedModule.exports;
}
class DomainError extends Error{}
const commonMocks={
 'cloudflare:workers':{env:{}},'@/lib/http/request-security':{isTrustedMutationRequest:()=>true},
 '@/lib/auth/staff':{requireStaffApi:async()=>({id:'fictional-reviewer'}),StaffAuthorizationError:DomainError},
 '@/lib/http/bounded-body':{readBoundedForm:request=>request.formData(),BodyTooLargeError:DomainError},
 '@/lib/db/d1':{requireDatabase:()=>({}),requireMediaBucket:()=>({})},
};
const post=form=>new Request('https://fixture.local.test/upload',{method:'POST',body:form});
void test('private live evidence accepts exact text references and rejects File values, duplicates and unknown fields',async()=>{
 const calls=[],api=await route('app/api/admin/managed-makers/[id]/live-evidence/route.ts',{...commonMocks,
  '@/lib/managed-commerce/live-activation-support':{ManagedLiveError:DomainError},
  '@/lib/managed-commerce/live-clearance-evidence':{uploadManagedClearanceEvidence:async(...args)=>{calls.push(args);return{id:'fictional-evidence'};},recoverManagedClearanceEvidence:async(...args)=>{calls.push(args);return{id:'fictional-recovery'};},readManagedClearanceEvidence:async()=>{throw Error('GET not used');}},
 });
 const form=()=>{const f=new FormData();f.set('requestId','request-0001');f.set('materialScopeDigest','a'.repeat(64));return f;};
 for(const field of ['requestId','materialScopeDigest']){const f=form();f.set(field,new File(['private bytes'],'evidence.txt'));const response=await api.POST(post(f),{params:Promise.resolve({id:'maker'})});assert.equal(response.status,400);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.doesNotMatch(await response.text(),/private bytes/);}
 for(const key of ['requestId','unexpected']){const f=form();f.append(key,'duplicate');assert.equal((await api.POST(post(f),{params:Promise.resolve({id:'maker'})})).status,400);}
 assert.equal(calls.length,0);
 const valid=form();valid.set('file',new File(['fictional bytes'],'fictional.txt'));assert.equal((await api.POST(post(valid),{params:Promise.resolve({id:'maker'})})).status,200);
 assert.equal(calls[0][2].requestId,'request-0001');assert.deepEqual(calls[0][3],{sellerId:'maker',materialScopeDigest:'a'.repeat(64)});
 assert.equal((await api.POST(post(form()),{params:Promise.resolve({id:'maker'})})).status,200);assert.equal(calls.length,2);
});
void test('public-profile upload rejects nontext kind and preserves owner and file validation',async()=>{
 const calls=[],api=await route('app/api/seller/public-profile/media/route.ts',{...commonMocks,
  '@/lib/http/actor-intent':{hasActorIntentMismatch:()=>false},
  '@/lib/auth/seller-center':{requireSellerCenterApi:async()=>({sellerId:'maker',userId:'owner'}),SellerCenterAuthorizationError:DomainError},
  '@/lib/http/rate-limit':{consumePublicRequestRateLimit:async()=>({allowed:true}),rateLimitJson:()=>{throw Error('not rate limited');}},
  '@/lib/sellers/public-profile-media':{savePublicProfileMedia:async(...args)=>{calls.push(args);return'fictional-media';}},
  '@/lib/sellers/public-profile-types':{PublicProfileError:DomainError},
 });
 const form=()=>{const f=new FormData();Object.entries({sellerId:'maker',ownerId:'owner',requestId:'request-0001',kind:'profile_image'}).forEach(([k,v])=>f.set(k,v));f.set('file',new File(['fictional bytes'],'fictional.png'));return f;};
 const malformed=form();malformed.set('kind',new File(['profile_image'],'kind'));assert.equal((await api.POST(post(malformed))).status,400);
 const foreign=form();foreign.set('ownerId','other');assert.equal((await api.POST(post(foreign))).status,403);assert.equal(calls.length,0);
 assert.equal((await api.POST(post(form()))).status,200);assert.equal(calls[0][2].kind,'profile_image');assert.equal(calls[0][2].actorId,'owner');
});
void test('account reference control-character rejection preserves the exact original ASCII range',async()=>{
 const api=await route('lib/account/command-outcomes.ts',{'./command-outcome-contract':{accountCommandActions:['profile.update']}});
 for(let code=0;code<=255;code++){
  const input={action:'profile.update',sourceId:'source-'+String.fromCharCode(code),requestId:'request-0001'};
  if(code<=31||code===127)assert.throws(()=>api.accountCommandReference(input),/reference is invalid/);
  else assert.deepEqual(api.accountCommandReference(input),input);
 }
 for(const value of ['',{},null,undefined,'a'.repeat(192)])assert.throws(()=>api.accountCommandReference({action:'profile.update',sourceId:value,requestId:'request-0001'}));
});
void test('offer draft scalar guard retains bounded text and rejects objects without coercion',async()=>{
 const api=await route('lib/products/offer-contracts.ts',{}),matrix={axes:[],offers:[{id:'offer',selection:{},price:'123',compareAt:'',sku:'A',mediaId:null,stockFamilyKey:'A',baseUnit:'piece',unitsPerOffer:'1',included:true,browseOnly:false,stockIntent:'2'}]};
 assert.deepEqual(api.retainOfferMatrix(matrix),matrix);
 for(const key of ['price','compareAt','sku','stockFamilyKey','baseUnit','unitsPerOffer','stockIntent']){
  for(const value of [{},['text'],123,'a'.repeat(201)])assert.throws(()=>api.retainOfferMatrix({...matrix,offers:[{...matrix.offers[0],[key]:value}]}),/supported bounded public offer fields/);
 }
});
void test('supported intake keeps valid numeric or text quantity and rejects structured text fields',async()=>{
 const calls=[],validation=await route('lib/returns/validation.ts',{});
 const api=await route('app/api/admin/cases/intake/route.ts',{...commonMocks,
  '@/lib/http/actor-intent':{hasActorIntentMismatch:()=>false},
  '@/lib/db/d1':{requireDatabase:()=>({prepare:()=>({bind:()=>({first:async()=>({customerId:'fictional-customer',receiptHash:null})})})})},
  '@/lib/http/form-json-body':{readBoundedJsonObject:request=>request.json()},
  '@/lib/forms/submission':{validateSellerFormSubmission:async()=>({versionId:'fixture-version',answers:[]})},
  '@/lib/forms/runtime':{FormRuntimeError:DomainError},
  '@/lib/returns/validation':validation,
  '@/lib/db/repositories/returns':{createCustomerReturnRequest:async(_db,input)=>{calls.push(input);return{id:'fictional-return'};},ReturnConflictError:DomainError},
  '@/lib/db/repositories/complaints':{createCustomerComplaint:async()=>{throw Error('not a complaint');},complaintCategories:[],ComplaintConflictError:DomainError},
 });
 const body={sourceType:'return_request',orderNumber:'FIXTURE-ORDER',orderItemId:'fixture-item',quantity:1,reason:'damaged',requestedResolution:'refund',detail:'Fictional item was received with a visible defect.',locale:'en-NP',receivedAt:1000,channel:'support',sourceReference:'fictional-call',requestId:'request-0001',formVersion:1,customAnswers:[]};
 const request=value=>new Request('https://fixture.local.test/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 for(const key of ['orderItemId','quantity','reason','requestedResolution'])for(const value of [{},['invalid']])assert.equal((await api.POST(request({...body,[key]:value}))).status,400);
 assert.equal(calls.length,0);
 for(const quantity of [1,'1'])assert.equal((await api.POST(request({...body,quantity}))).status,200);
 assert.equal(calls.length,2);assert.equal(calls[0].quantity,1);assert.equal(calls[1].quantity,1);assert.equal(calls[0].supportIntake.actorId,'fictional-reviewer');assert.equal(calls[0].orderItemId,'fixture-item');
});
void test('Team notices refuse malformed duty facts before eligibility lookup and retain valid exact duty checks',async()=>{
 let authorityReads=0,details;
 const api=await route('lib/operations/team-notice-sources.ts',{
  './team-governance':{teamDutyCatalogue:[{id:'team_governance',permission:'team.manage',reserved:true}],TeamGovernanceConflict:DomainError},
  '../db/repositories/staff-mutation-guard':{staffMutationGuard:async()=>{authorityReads++;}},
  './event-catalog':{operationalNotificationRequestId:async()=> 'fixture-notice'},
  '../legal-procedures/lifecycle':{currentNativeProcedureIdSql:()=> 'SELECT fictional_source'},
  '../checkout/commit-policy-guards':{checkoutCommitClock:()=> '0'},
 });
 const notice={template:'business.team.governance',userId:'reviewer',relatedId:'event',audience:'staff',relatedType:'team_governance_event',requestId:'fixture-notice',channel:'in_app'};
 const db={prepare:sql=>({bind:()=>({first:async()=>sql.startsWith('SELECT action,')?{action:'access_changed',sourceId:'reviewer',details}: {current:1}})})};
 for(const malformed of ['null','[]','"team_governance"','{}','{"dutyId":["team_governance"]}','{"dutyId":{}}','not json']){details=malformed;assert.equal(await api.isCurrentTeamNotice(db,notice,1000),false);}
 assert.equal(authorityReads,0);details='{"dutyId":"team_governance"}';assert.equal(await api.isCurrentTeamNotice(db,notice,1000),true);assert.equal(authorityReads,1);
});
