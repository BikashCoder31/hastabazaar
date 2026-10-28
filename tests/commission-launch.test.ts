import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {commissionDatabase} from './helpers/commission-database';
import {saveBusinessSettingChange, getEffectiveBusinessSetting} from '../lib/db/repositories/business-settings';

const keys=['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps'] as const;
const origin='http://localhost:3018';
async function handler(db:D1Database,options:{role?:string;kind?:string;node?:string;appOrigin?:string}={}){
 const compiled=await build({entryPoints:['app/api/admin/commission/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'launch-boundaries',setup(b){
  b.onResolve({filter:/^(cloudflare:workers|@\/lib\/auth\/staff)$/},a=>({path:a.path,namespace:'launch-test'}));
  b.onLoad({filter:/.*/,namespace:'launch-test'},a=>({loader:'js',contents:a.path==='cloudflare:workers'?'exports.env=__env;':
   `exports.StaffAuthorizationError=class extends Error{};exports.requireStaffApi=async()=>({id:'owner',role:'${options.role??'super_admin'}'});`}));
 }}]});
 const compiledModule={exports:{} as {POST(request:Request):Promise<Response>}};
 runInNewContext(compiled.outputFiles[0].text,{module:compiledModule,exports:compiledModule.exports,require:createRequire(import.meta.url),process:{env:{NODE_ENV:options.node??'development'}},crypto,Date,URL,Intl,TextEncoder,Request,Response,Headers,
  __env:{DB:db,HASTABAZAAR_RUNTIME_ENV:options.kind??'local_staging',APP_ORIGIN:options.appOrigin??origin}});
 return (request:Request)=>compiledModule.exports.POST(request);
}
function body(extra:Record<string,unknown>={}){return {action:'initialize_launch',percent:'12',requestId:'launch-initial-request',expectedRevision:0,
 expectedVersions:{independent_seller_commission_bps:0,managed_sale_linked_platform_retention_bps:0},
 reason:'Owner selected the prelaunch initial 12% company and 88% maker terms now; keep existing historical snapshots.',...extra};}
function request(value:Record<string,unknown>,requestOrigin=origin){return new Request(origin+'/api/admin/commission',{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json'},body:JSON.stringify(value)});}

void test('initial launch saves both current rates atomically, retains cancelled schedules and never manufactures acceptance',async()=>{
 const f=await commissionDatabase();try{
  const now=Date.now();const future=now+20*86400000;
  for(const key of keys)await saveBusinessSettingChange(f.database,{key,value:1200,actorId:'owner',reason:'Earlier scheduled local commission setup',requestId:'schedule-'+key,now,effectiveFrom:future,expectedVersion:0});
  await f.database.prepare("INSERT INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at) VALUES('old-acceptance','seller-a','previous-agreement','en',NULL,900,'original-acceptance','user-a',1)").run();
  const original=(await f.database.prepare('SELECT * FROM seller_agreement_acceptance_history').all()).results;
  const post=await handler(f.database);const input=body({expectedVersions:Object.fromEntries(keys.map(k=>[k,1]))});
  const response=await post(request(input));assert.equal(response.status,201,await response.clone().text());
  const receipt=await response.json() as {effectiveFrom:number};
  for(const key of keys){const current=await getEffectiveBusinessSetting(f.database,key,Date.now());assert.equal(current.value,1200);assert.equal(current.version,2);
   const old=await f.database.prepare('SELECT status,effective_from AS at,value_json AS value FROM business_setting_versions WHERE setting_key=? AND version=1').bind(key).first<{status:string;at:number;value:string}>();assert.deepEqual({...old},{status:'cancelled',at:future,value:'1200'});}
  assert.ok(receipt.effectiveFrom>=now&&receipt.effectiveFrom<=Date.now());
  assert.deepEqual((await f.database.prepare('SELECT * FROM seller_agreement_acceptance_history').all()).results,original);
  assert.equal((await f.database.prepare('SELECT count(*) n FROM commission_rate_acceptances').first<{n:number}>())?.n,0);
  const replay=await post(request(input));assert.equal(replay.status,201);assert.deepEqual(await replay.json(),receipt);
  assert.equal((await post(request({...input,requestId:'second-initial-attempt'}))).status,409);
  assert.equal((await post(request({...input,reason:'Different initial commission intent using the same request reference.'}))).status,409);
  await assert.rejects(saveBusinessSettingChange(f.database,{key:keys[0],value:1300,actorId:'owner',reason:'Later change must retain notice protections',requestId:'later-no-notice',now:Date.now(),effectiveFrom:null,expectedVersion:2}),/15 calendar days/);
 }finally{await f.dispose();}
});

void test('the one-time prelaunch exception refuses every rate other than the authorized 12%',async()=>{
 const f=await commissionDatabase();try{
  const post=await handler(f.database);
  for(const percent of ['0','9','13','100']){const response=await post(request(body({percent,requestId:'wrong-initial-'+percent})));assert.equal(response.status,400,await response.text());}
  assert.equal((await f.database.prepare('SELECT count(*) n FROM business_setting_versions').first<{n:number}>())?.n,0);
 }finally{await f.dispose();}
});

void test('concurrent changes to the second rate reject setup without partially changing the first rate',async()=>{
 const f=await commissionDatabase();try{
  const now=Date.now();for(const key of keys)await saveBusinessSettingChange(f.database,{key,value:1200,actorId:'owner',reason:'Scheduled baseline for concurrency test',requestId:'concurrent-'+key,now,effectiveFrom:now+20*86400000,expectedVersion:0});
  const originalBatch=f.database.batch.bind(f.database);let intercepted=false;
  f.database.batch=async statements=>{if(!intercepted){intercepted=true;await f.database.prepare("UPDATE business_setting_versions SET value_json='1300',revision=revision+1 WHERE setting_key='managed_sale_linked_platform_retention_bps'").run();}return originalBatch(statements);};
  const response=await(await handler(f.database))(request(body({expectedVersions:Object.fromEntries(keys.map(k=>[k,1]))})));assert.equal(response.status,409,await response.text());
  assert.equal((await f.database.prepare("SELECT count(*) n FROM business_setting_versions WHERE version=2").first<{n:number}>())?.n,0);
  assert.equal((await f.database.prepare("SELECT status FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps'").first<{status:string}>())?.status,'published');
 }finally{await f.dispose();}
});

void test('initial launch is forbidden outside local development, for Admin, and for cross-site requests',async()=>{
 const f=await commissionDatabase();try{
  for(const options of [{role:'admin'},{kind:'production'},{node:'production'},{kind:'development'},{appOrigin:'https://staging.hastabazaar.com'}]){
   const response=await(await handler(f.database,options))(request(body()));assert.equal(response.status,403,JSON.stringify(options)+' '+await response.text());
  }
  assert.equal((await(await handler(f.database))(request(body(),'https://other.test'))).status,403);
  assert.equal((await f.database.prepare('SELECT count(*) n FROM business_setting_versions').first<{n:number}>())?.n,0);
 }finally{await f.dispose();}
});

void test('initial launch refuses stale versions, previously effective settings and legacy commission schedules',async()=>{
 for(const mode of ['stale','effective','legacy'] as const){const f=await commissionDatabase();try{
  if(mode==='effective')await f.database.prepare("INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id) VALUES('previous','independent_seller_commission_bps',1,'900','published',1,'controlled',1,'Existing effective terms','owner',1,'previous')").run();
  if(mode==='legacy')await f.database.prepare("INSERT INTO commission_rate_changes(id,basis_points,effective_at,agreement_version,terms_text,reason,created_by,created_at) VALUES('legacy',900,1296000001,'old','Recorded old terms','Existing commission schedule','owner',1)").run();
  const input=body(mode==='stale'?{expectedVersions:{independent_seller_commission_bps:1,managed_sale_linked_platform_retention_bps:0}}:mode==='effective'?{expectedVersions:{independent_seller_commission_bps:1,managed_sale_linked_platform_retention_bps:0}}:{});
  const response=await(await handler(f.database))(request(input));assert.equal(response.status,409,mode+' '+await response.text());
  assert.equal((await f.database.prepare("SELECT count(*) n FROM audit_logs WHERE action='commission.launch.initialized'").first<{n:number}>())?.n,0);
 }finally{await f.dispose();}}
});

void test('a late initial-setup failure rolls back both new rates and schedule cancellations',async()=>{
 const f=await commissionDatabase();try{
  const now=Date.now();for(const key of keys)await saveBusinessSettingChange(f.database,{key,value:1200,actorId:'owner',reason:'Earlier scheduled launch rate',requestId:'old-'+key,now,effectiveFrom:now+20*86400000,expectedVersion:0});
  await f.database.prepare("CREATE TRIGGER fail_initial_audit BEFORE INSERT ON audit_logs WHEN NEW.action='commission.launch.initialized' BEGIN SELECT RAISE(ABORT,'isolated failure'); END").run();
  const response=await(await handler(f.database))(request(body({expectedVersions:Object.fromEntries(keys.map(k=>[k,1]))})));assert.equal(response.status,409);
  const rows=(await f.database.prepare('SELECT version,status FROM business_setting_versions ORDER BY setting_key').all()).results;
  assert.deepEqual(rows.map(r=>({...r})),[{version:1,status:'published'},{version:1,status:'published'}]);
 }finally{await f.dispose();}
});
