import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { inspectReadiness } from '../lib/operations/readiness.ts';
import { stagingNativeUpgrade } from './staging-native-upgrade.mjs';
import { rehearseNativeRecovery } from './recovery/rehearse-native.mjs';
import {assertLocalRecoveryMode,createLocalSourceArtifact} from './recovery/local-source-artifact.mjs';
import {assertRequiredNativeResults} from './recovery/native-test-results.mjs';
import {safeChildEnvironment,withOwnedProcesses} from './testing/verify-packaged-browser-gates.mjs';
import {stagingNativeMode} from './testing/staging-native-mode.mjs';

// This command has no database-target arguments. It creates its own isolated
// container and new databases; it never resets, seeds or connects to saved data.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(resolve(process.cwd()), project);
const {localRecovery,historicalOnly}=stagingNativeMode(process.argv.slice(2));
if(localRecovery)assertLocalRecoveryMode();
const docker = process.platform === 'win32' ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker';
const context = JSON.parse(execFileSync(docker, ['context','inspect'], {encoding:'utf8'}))[0];
assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
const run = Date.now().toString();
const workspace = resolve(project,'.superpowers/sdd/2026-10-16-staging-native-compatibility');
await mkdir(workspace, {recursive:true});
const name = 'hastabazaar-native-' + run;
const password = randomBytes(32).toString('hex');
const token = randomBytes(24).toString('hex');
const securityKey = randomBytes(32).toString('base64url');
const envFile = resolve(workspace, '.env.native-' + run);
const marker = resolve(workspace, '.native-' + run + '.json');
await writeFile(envFile, 'MARIADB_ROOT_PASSWORD=' + password + '\nMARIADB_ROOT_HOST=%\n', {flag:'wx',mode:0o600});
const id = execFileSync(docker, ['run','-d','--name',name,'--label','codex.scope=staging-native-compatibility',
  '-p','127.0.0.1:13329:3306','--env-file',envFile,'mariadb:10.11'], {encoding:'utf8'}).trim();
const owned = () => {
  const actual = JSON.parse(execFileSync(docker,['inspect',name],{encoding:'utf8'}))[0];
  assert.equal(actual.Id,id); assert.equal(actual.Config.Image,'mariadb:10.11');
  assert.equal(actual.Config.Labels['codex.scope'],'staging-native-compatibility');
  assert.deepEqual(actual.HostConfig.PortBindings['3306/tcp'],[{HostIp:'127.0.0.1',HostPort:'13329'}]);
  assert.equal(actual.Mounts.some(m => m.Type==='bind'),false);
};
owned();
await writeFile(marker, JSON.stringify({id,name,password,token,host:'127.0.0.1',port:13329,database:'native_'+run+'_fresh'}), {flag:'wx',mode:0o600});
let connection;
const observations=[];
const nativeRuns=[];
let activeFile='', activeStatement='';
function nativeTests(files, expectedTests){
  activeFile=files.join(', ');activeStatement='';
  let output;
  try{output=execFileSync(process.execPath,['--import','tsx','--test','--test-reporter=tap','--test-concurrency=1',...files],{
    cwd:project,encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,HATSKALA_STAGING_NATIVE:'1',HATSKALA_NATIVE_MARKER:marker,HATSKALA_NATIVE_TOKEN:token,
      HASTABAZAAR_NATIVE_SECURITY_KEY:securityKey,HASTABAZAAR_RUNTIME_ENV:'local_staging',MEDIA_ROOT:resolve(workspace,'native-'+run+'-media'),DB_HOST:'127.0.0.1',DB_PORT:'13329',DB_NAME:'native_'+run+'_fresh',DB_USER:'root',DB_PASSWORD:password},
  });}catch(error){
    const diagnostics=[error.stdout,error.stderr].filter(Boolean).map(value=>String(value)).join('\n');
    console.error(diagnostics.replaceAll(password,'[redacted]').replaceAll(token,'[redacted]').replaceAll(securityKey,'[redacted]'));
    throw new Error('Required native test failed: '+files.join(', '));
  }
  const counts=assertRequiredNativeResults(output,expectedTests);
  nativeRuns.push({files,...counts});
  console.log(output);
}
function statements(sql) {
  let delimiter=';', buffer=''; const result=[];
  for(const line of sql.split(/\r?\n/)){
    const directive=/^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if(directive){assert.ok(!buffer.trim()||buffer.trim().split('\n').every(l=>!l.trim()||l.trim().startsWith('--')));delimiter=directive[1];continue;}
    buffer+=line+'\n';
    if(buffer.trimEnd().endsWith(delimiter)){result.push(buffer.trimEnd().slice(0,-delimiter.length));buffer='';}
  }
  assert.ok(!buffer.trim()||buffer.trim().split('\n').every(l=>!l.trim()||l.trim().startsWith('--')));
  return result.filter(s=>s.trim());
}
async function load(path, override){
  activeFile=path;
  for(const sql of statements(override??await readFile(resolve(project,path),'utf8'))){
    activeStatement=sql.replace(/^\s*--[^\n]*(\n|$)/gm,'').trim().slice(0,130);
    await connection.query(sql);
  }
}
async function create(label){
  const database='native_'+run+'_'+label;
  assert.match(database,/^native_\d+_[a-z]+$/);
  await connection.query('CREATE DATABASE `'+database+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await connection.query('USE `'+database+'`');
  return database;
}
async function check(label,fn){await fn();observations.push({label,status:'PASS'});console.log('PASS: '+label);}
try {
  for(let attempt=0;attempt<60;attempt++){
    try{connection=await mysql.createConnection({host:'127.0.0.1',port:13329,user:'root',password});break;}
    catch{await new Promise(resolve=>setTimeout(resolve,1000));}
  }
  assert.ok(connection,'Isolated MariaDB did not become ready');
  assert.match((await connection.query('SELECT VERSION() v'))[0][0].v,/^10\.11\./);
  const manifest=JSON.parse(await readFile(resolve(project,'deployment/babal/release-manifest.json'),'utf8'));
  const upgrade=await stagingNativeUpgrade(project);
  await writeFile(resolve(workspace,'staging-upgrade-'+run+'.sql'),upgrade.sql,{flag:'wx'});
  await writeFile(resolve(workspace,'staging-upgrade-'+run+'-inventory.json'),JSON.stringify({sha256:upgrade.sha256,sources:upgrade.steps.map(({name,sourceSha256})=>({name,sourceSha256}))},null,2),{flag:'wx'});
  const schema=await readFile(resolve(project,'deployment/babal/mariadb-schema.sql'),'utf8');
  const adapter={dialect:'mariadb',prepare(sql){return{async all(){const [results]=await connection.query(sql);return{results};}};}};
  const companions=['mariadb-company-store-maker-readiness.sql','mariadb-loyalty-scheduled-changes.sql','mariadb-marketplace-fee-waivers.sql','mariadb-customer-service-fee-waivers.sql'];
  await create('fresh');
  await check('fresh bootstrap and maintained companion sequence',async()=>{
    await load('deployment/babal/mariadb-schema.sql');
    for(const migration of manifest.migrations.filter(m=>m.usage==='additive-maintenance'))await load(migration.path);
    assert.deepEqual(await inspectReadiness(adapter),{ready:true,missing:[]});
  });
  await check('real native repository and financial guard tests',async()=>{
    nativeTests(['tests/staging-native-runtime.test.ts']);
  });
  await create('legacy');
  await check('populated pre-weekly schema upgrades conserve every original value',async()=>{
    const customerFeeCompanion='deployment/babal/mariadb-customer-service-fee-waivers.sql';
    const customerFeeSource=(await readFile(resolve(project,customerFeeCompanion),'utf8')).replace(/\r\n/g,'\n').trim();
    const [historicalSource,laterSchema,...duplicates]=schema.split(customerFeeSource);
    assert.ok(historicalSource && laterSchema && duplicates.length===0,'The 0074 boundary must appear exactly once');
    const maintenance=manifest.migrations.filter(m=>m.usage==='additive-maintenance');
    const customerFeeIndex=maintenance.findIndex(m=>m.path===customerFeeCompanion);
    assert.ok(customerFeeIndex>=0,'0074 must be listed in maintained migration order');
    const historicalSchema=historicalSource+customerFeeSource;
    const loyalty=(await readFile(resolve(project,'deployment/babal/mariadb-loyalty-points.sql'),'utf8')).replace(/\r\n/g,'\n');
    assert.equal(loyalty.split('-- Weekly loyalty cycle extension').length,2);
    // SQL contains $' sequences; use a callback so replacement strings cannot
    // reinterpret them as JavaScript replacement patterns.
    let legacy=historicalSchema.replace(loyalty.trim(),()=>loyalty.split('-- Weekly loyalty cycle extension')[0].trim());
    for(const companion of companions){
      const source=(await readFile(resolve(project,'deployment/babal',companion),'utf8')).replace(/\r\n/g,'\n').trim();
      assert.equal(legacy.split(source).length,2,'Each maintained companion must be removed exactly once');
      legacy=legacy.replace(source,'');
    }
    assert.notEqual(legacy,historicalSchema);
    await load('fixture-pre-weekly-bootstrap',legacy);
    // These four companions plus the weekly loyalty extension are absent.
    for(const migration of maintenance.slice(0,customerFeeIndex).filter(m=>!companions.some(n=>m.path.endsWith(n))&&!m.path.endsWith('mariadb-loyalty-points.sql')))await load(migration.path);
    // Earlier wallet companions replace their kind CHECK. Restore the actual
    // pre-weekly loyalty base last, as the old hosted release does.
    await load('fixture-pre-weekly-loyalty',loyalty.split('-- Weekly loyalty cycle extension')[0]);
    assert.equal((await connection.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'customer_fee_waiver%'"))[0][0].n,0,'0074 must be absent before additive upgrade');
    assert.equal((await connection.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_customer_service_fees'"))[0][0].n,0,'0074 order evidence must be absent before additive upgrade');
    await connection.query("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES('historic','historic@example.test','Fictional historical user',17,17)");
    await connection.query("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at) VALUES('historic-audit','historic','fictional.history','user','historic','historic',17)");
    // Copy only synthetic records made by the fresh runtime tests, using the
    // old schema's columns. Real FK and history triggers stay enabled.
    for(const table of ['users','user_roles','form_config_versions','wallet_accounts','seller_profiles','seller_documents',
      'seller_participation_profiles','managed_maker_application_details','categories','products','orders','order_items',
      'managed_commercial_snapshots','managed_entitlements','managed_payouts']){
      const columns=(await connection.query('SHOW COLUMNS FROM `'+table+'`'))[0].filter(c=>!String(c.Extra).includes('GENERATED')).map(c=>'`'+c.Field+'`').join(',');
      const keys=(await connection.query('SHOW INDEX FROM `'+table+'` WHERE Key_name=\'PRIMARY\''))[0].sort((a,b)=>a.Seq_in_index-b.Seq_in_index).map(row=>row.Column_name);
      assert.ok(keys.length,table+' primary identity');
      const absent=keys.map(column=>'dst.`'+column+'`<=>src.`'+column+'`').join(' AND ');
      await connection.query('INSERT INTO `'+table+'`('+columns+') SELECT '+columns.split(',').map(c=>'src.'+c).join(',')+' FROM `native_'+run+'_fresh`.`'+table+'` src WHERE NOT EXISTS(SELECT 1 FROM `'+table+'` dst WHERE '+absent+')');
    }
    // Model an already-applied 0073 installation before the additive customer
    // migration. These original seller records must survive every later step.
    await load('fixture-retained-0073-history',await readFile(resolve(project,'deployment/babal/mariadb-marketplace-fee-waivers.sql'),'utf8'));
    await connection.query("INSERT INTO marketplace_fee_waiver_campaigns VALUES('upgrade-historical-campaign',2,1,2)");
    await connection.query("INSERT INTO marketplace_fee_waiver_revisions VALUES('upgrade-historical-campaign',1,'draft','Historical seller campaign','Retained pre-customer fixture',0,253402300799999,'super','upgrade-historical-create',1),('upgrade-historical-campaign',2,'published','Historical seller campaign','Retained pre-customer fixture',0,253402300799999,'super','upgrade-historical-publish',2)");
    await connection.query("INSERT INTO marketplace_fee_waiver_requests VALUES('upgrade-historical-create','super','super','{\"type\":\"create\"}','{\"id\":\"upgrade-historical-campaign\",\"revision\":1}',1),('upgrade-historical-publish','super','super','{\"type\":\"publish\"}','{\"id\":\"upgrade-historical-campaign\",\"revision\":2}',2)");
    await connection.query("UPDATE marketplace_fee_waiver_control SET revision=2 WHERE id='default'");
    await connection.query("INSERT INTO order_item_marketplace_fees SELECT id,commission_bps,COALESCE(commission_base_paisa,line_total_paisa-seller_discount_paisa),commission_paisa,0,commission_paisa,NULL,NULL,1 FROM order_items WHERE id='allocation-item'");
    assert.equal((await connection.query('SELECT COUNT(*) n FROM order_item_marketplace_fees'))[0][0].n,1,'Populated original seller fee evidence is required before 0074');
    assert.equal((await connection.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_customer_service_fees'"))[0][0].n,0,'0074 must still be absent with retained 0073 history');
    await connection.query("INSERT INTO managed_settlement_entries(id,entitlement_id,type,amount_paisa,metadata_json,reason_code,request_id,created_by,created_at) VALUES('historic-settlement','entitlement','earned',9100,'{}','fictional','historic-settlement','super',1)");
    await connection.query("INSERT INTO managed_payout_entries(payout_id,settlement_entry_id) VALUES('payout-two','historic-settlement')");
    await connection.query("INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at) VALUES(1,1,100,100,1000,0,253402300799999,1000,10000,'super','historic-live','Fictional historical live','staff.loyalty-settings-v1',1),(2,0,7,100,1000,NULL,NULL,NULL,NULL,'super','historic-draft','Fictional historical draft','staff.loyalty-settings-v1',2)");
    await connection.query("UPDATE loyalty_config SET current_revision=1,draft_revision=2,paused=0");
    await connection.query("INSERT INTO loyalty_accounts(user_id,created_at) VALUES('customer',1)");
    await connection.query("INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at) VALUES('historic-claim','customer','customer','historic-claim',?,1,'2026-09-28',100,?,'account.daily-reward-v1',?)",['a'.repeat(64),JSON.stringify({claimId:'historic-claim',localDate:'2026-09-28',awardedPoints:100,balancePoints:100}),Date.parse('2026-09-28T12:00:00Z')]);
    await connection.query("UPDATE loyalty_config SET paused=1,version=7");
    await connection.query("INSERT INTO loyalty_redemptions(id,user_id,actor_id,request_id,payload_digest,revision,points,credit_paisa,response_json,form_version_id,created_at) VALUES('historic-redemption','customer','customer','historic-redemption',?,1,100,1000,?,'account.points-redemption-v1',?)",['b'.repeat(64),JSON.stringify({redemptionId:'historic-redemption',points:100,creditPaisa:1000,balancePoints:0,walletBalancePaisa:1000}),Date.parse('2026-09-28T12:00:01Z')]);
    const before={};
    const tables=(await connection.query('SELECT TABLE_NAME n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\''))[0];
    for(const {n} of tables){const [rows]=await connection.query('SELECT * FROM `'+n+'` ORDER BY 1');before[n]={rows,columns:(await connection.query('SHOW COLUMNS FROM `'+n+'`'))[0].map(c=>c.Field)};}
    const preserved=async()=>{for(const [table,{rows,columns}]of Object.entries(before))assert.deepEqual((await connection.query('SELECT '+columns.map(c=>'`'+c+'`').join(',')+' FROM `'+table+'` ORDER BY 1'))[0],rows,table);};
    for(let repeat=0;repeat<2;repeat++)for(const step of upgrade.steps){await load('reviewed-staging-delta/'+step.name,step.sql);await preserved();}
    // Later views need the upgraded tables. Apply the same maintained overlay as fresh bootstrap.
    await load('fixture-post-0074-bootstrap',laterSchema);
    for(const migration of maintenance)await load(migration.path);
    assert.deepEqual(await inspectReadiness(adapter),{ready:true,missing:[]});
    assert.deepEqual((await connection.query('SELECT scheduled_revision,scheduled_for,scheduled_unpause,paused,current_revision,draft_revision,issued_points,redeemed_points,credited_paisa FROM loyalty_config'))[0][0],{scheduled_revision:null,scheduled_for:null,scheduled_unpause:0,paused:1,current_revision:1,draft_revision:2,issued_points:100,redeemed_points:100,credited_paisa:1000});
    for(const table of ['seller_participation_profiles','managed_commercial_snapshots'])assert.equal((await connection.query('SELECT COUNT(*) n FROM '+table+' WHERE accepted_managed_detail_id IS NOT NULL'))[0][0].n,0);
  });
  await connection.query('USE `native_'+run+'_fresh`');
  await check('current accounting, financial, billing, fee waiver and hosted MFA native journeys execute without skips',async()=>{
    const exactFeeCounts={'tests/fee-waiver-native.test.ts':5,'tests/customer-fee-native.test.ts':29};
    for(const file of ['tests/accounting-native-runtime.test.ts','tests/commerce-financial-native.test.ts','tests/billing-release-native.test.ts','tests/fee-waiver-native.test.ts','tests/customer-fee-native.test.ts']){
      // This exact schema was created by this process in the pinned disposable
      // container. Never accept a name/host from the caller or reuse saved data.
      owned();await connection.query('USE information_schema');
      await connection.query('DROP DATABASE `native_'+run+'_fresh`');
      await create('fresh');
      await load('deployment/babal/mariadb-schema.sql');
      for(const migration of manifest.migrations.filter(m=>m.usage==='additive-maintenance'))await load(migration.path);
      nativeTests([file],exactFeeCounts[file]);
    }
    // Enroll alongside the fee fixture so recovery verifies real commerce
    // records and MFA together. This test does not replace business records.
    nativeTests(['tests/hosted-security-native.test.ts']);
  });
  if(!localRecovery&&!historicalOnly)await check('required exact-package contact/catalog and populated-summary browser gates',async()=>{
    // Do not reset: preserve financial evidence and already-enrolled staff, then
    // include the appended fictional optional Admin in the later recovery dump.
    owned();
    const childEnv={...safeChildEnvironment(process.env),GITHUB_SHA:process.env.GITHUB_SHA,
      HASTABAZAAR_NATIVE_ARTIFACT_DIRECTORY:process.env.HASTABAZAAR_NATIVE_ARTIFACT_DIRECTORY,
      HATSKALA_STAGING_NATIVE:'1',HATSKALA_NATIVE_MARKER:marker,HATSKALA_NATIVE_TOKEN:token,
      HASTABAZAAR_NATIVE_SECURITY_KEY:securityKey,HASTABAZAAR_RUNTIME_ENV:'local_staging',
      DB_HOST:'127.0.0.1',DB_PORT:'13329',DB_NAME:'native_'+run+'_fresh',DB_USER:'root',DB_PASSWORD:password};
    const result=await withOwnedProcesses(owner=>owner.run(process.execPath,['--import','tsx','scripts/testing/verify-packaged-browser-gates.mts'],{
      cwd:project,env:childEnv,
    },600_000),45_000);
    console.log(result.output.replaceAll(password,'[redacted]').replaceAll(token,'[redacted]').replaceAll(securityKey,'[redacted]'));
    assert.equal(result.code,0,'Both required browser gates must execute without skips before recovery/artifact acceptance');
    owned();
  });
  else console.log(historicalOnly?'HISTORICAL GATE ONLY: selected artifact browser/recovery acceptance is required separately':'LOCAL SOURCE SNAPSHOT ONLY: exact Linux packaged browser acceptance is not certified');
  if(!historicalOnly)await check(localRecovery?'local source snapshot survives encrypted native database/media/key recovery':'exact verified Linux artifact survives encrypted native database/media/key recovery',async()=>{
    const artifactDirectory=localRecovery?await createLocalSourceArtifact(project,workspace):process.env.HASTABAZAAR_NATIVE_ARTIFACT_DIRECTORY;
    assert.ok(artifactDirectory,'An exact verified Linux release artifact is required for native recovery rehearsal');
    const result=await rehearseNativeRecovery({docker,marker:{id,name,password,token,host:'127.0.0.1',port:13329,database:'native_'+run+'_fresh'},owned,source:connection,workspace,artifactDirectory,key:securityKey,localRecovery});
    await writeFile(resolve(artifactDirectory,'native-recovery-verification.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify(result));
  });
}catch(error){
  console.error(JSON.stringify({status:'FAIL',file:activeFile,statement:activeStatement,message:String(error.message).replaceAll(password,'[redacted]').slice(0,1800)}));process.exitCode=1;
}finally{
  await connection?.end();owned();execFileSync(docker,['stop',name],{stdio:'pipe'});
  await writeFile(resolve(workspace,'native-'+run+'-results.json'),JSON.stringify({observations,nativeRuns,container:name,databasesPreserved:true,stopped:true},null,2),{flag:'wx'});
}
