/** Source-only rehearsal driver. Run only during a root-granted exclusive Maria window. */
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withPortableMariaFixture,createFixtureDatabase,importFixtureSql,splitFixtureSql,assertUnder} from './portable-mariadb-fixture.mjs';
import {sameFeeSqlDefinition} from '../lib/operations/fee-schema-readiness.mjs';

const root=await realpath('C:/Users/abinash/Desktop/HastaBazaar');
assert.equal((await realpath(process.cwd())).toLowerCase(),root.toLowerCase());
assert.equal(process.argv.length,4,'Pass the reviewed offline fixture ID and the new156 candidate directory.');
const id=process.argv[2];assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);
const proof=JSON.parse(await readFile(resolve(root,'.test-artifacts/t33/'+id+'.json'),'utf8'));
assert.equal(proof.id,id);assert.equal(proof.purpose,'t33-offline-preservation');assert.equal(proof.version,'10.11.19');
assert.equal(proof.sha256,'398ea30e5036010bbebe01d2b1804280424dcc2626e36d8e95155c04d25a0490');assert.equal(proof.copiedStaticArchiveOnly,true);
assertUnder(resolve(root,'test-artifacts/mariadb'),await realpath(proof.root));
const owned=resolve(root,'.test-artifacts/t35/native-health-schema-astra-20261104');
const candidate=assertUnder(owned,await realpath(process.argv[3]));
const hash=value=>createHash('sha256').update(value).digest('hex');
const prefixPath=resolve(root,'.test-artifacts/t35/price-history-schema-astra-20261104/candidate-v6/mariadb-schema.sql');
const appendPath=resolve(root,'deployment/babal/mariadb-native-form-health.sql');
const prefix=await readFile(prefixPath),append=await readFile(appendPath,'utf8'),full=await readFile(join(candidate,'mariadb-schema.sql'));
const manifest=JSON.parse(await readFile(join(candidate,'bundle/deployment/babal/release-manifest.json'),'utf8'));
assert.equal(manifest.migrations[0].sha256,hash(full));
assert.equal(hash(prefix),'53c2b2ec52a2abf120056051ef3e276dad409e9243942785c1f2615b1dfe5621');
assert.equal(manifest.migrations.find(entry=>entry.path.endsWith('/mariadb-native-form-health.sql')).sha256,hash(append));
const footer=Buffer.from('SET FOREIGN_KEY_CHECKS = 1;\n');
assert.ok(full.subarray(0,prefix.length-footer.length).equals(prefix.subarray(0,-footer.length)));
assert.equal(full.subarray(prefix.length-footer.length).toString(),append.trim().replaceAll('\r\n','\n')+'\n'+footer);
const statements=splitFixtureSql(append);assert.equal(statements.length,4);
const paths=['db/schema.ts','drizzle/0156_native_form_health.sql','deployment/babal/mariadb-native-form-health.sql','deployment/babal/mariadb-form-health-records.sql','scripts/generate-mariadb-schema.mjs','scripts/generate-release-manifest.mjs','scripts/test-t35-native-health-schema-mariadb.mjs','lib/operations/fee-schema-readiness.mjs'];
const sources=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const suffix=Date.now().toString(36)+'_'+randomUUID().slice(0,4),base=join(owned,'native-'+suffix);
await writeFile(base+'-freeze.json',JSON.stringify({sources,schemaSha256:hash(full),prefixSha256:hash(prefix),appendSha256:hash(append)},null,2),{flag:'wx'});
const tables=['form_health_observations','form_health_incident_links','audit_logs'];
async function rows(connection){const result={};for(const table of [...tables,'service_health_incidents'])result[table]=(await connection.query('SELECT * FROM '+table+' ORDER BY 1,2'))[0];return result;}
async function metadata(connection){
 const list=tables.map(()=>'?').join(',');const result={};
 for(const[key,query]of Object.entries({
  columns:`SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,ORDINAL_POSITION`,
  constraints:`SELECT TABLE_NAME,CONSTRAINT_NAME,CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,CONSTRAINT_NAME`,
  checks:`SELECT TABLE_NAME,CONSTRAINT_NAME,LEVEL,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,CONSTRAINT_NAME`,
  keys:`SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,ORDINAL_POSITION,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION`,
  indexes:`SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`,
  triggers:`SELECT EVENT_OBJECT_TABLE,TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN (${list}) ORDER BY TRIGGER_NAME`,
 })){result[key]=(await connection.query(query,tables))[0];}
 result.routines=(await connection.query("SELECT ROUTINE_NAME,ROUTINE_DEFINITION FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME='hastabazaar_native_form_health_0156'"))[0];
 return result;
}
async function seed(connection){
 // This connection switches fresh schemas between checkpoints. Use parameterized
 // text queries: mysql2 execute caches prepared INSERTs bound to the first schema.
 await connection.query("INSERT INTO service_health_incidents(id,environment,service_key,episode,state,first_seen_at,last_seen_at) VALUES('h156-incident','test','h156-native-forms',1,'detected',1,1)");
 for(const[kind,phase,outcome,evidence]of [['runtime','load','compatible',null],['form_answer_set','save','saved','h156-answer'],['core_receipt','save','saved','h156-core']]){
  await connection.query("INSERT INTO form_health_observations(id,support_reference,environment,release_id,form_id,form_version,journey,phase,outcome,category,evidence_kind,evidence_id,observed_at) VALUES(?,?,'test','h156-release','seller.document-change-request',1,'native_compatibility',?,?,NULL,?,?,1)",['h156-'+kind,'FH-'+kind,phase,outcome,kind,evidence]);
  await connection.query("INSERT INTO form_health_incident_links(observation_id,incident_id,retained_at) VALUES(?,'h156-incident',2)",['h156-'+kind]);
 }
 for(const[name,next]of [['historical',null],['scoped',JSON.stringify({nativeFormHealth:{environment:'test',releaseId:'h156-release',formId:'seller.document-change-request',formVersion:281474976710655}})]]){
  // Generic command probes isolate the new guard. Keep document command rows
  // too: their older immutable trigger legitimately rejects some changes first.
  for(const[prefix,action,subjectType]of [['','fixture.native.command','fixture'],['document-','seller.document.command.request','seller_document_request']])await connection.query("INSERT INTO audit_logs(id,action,subject_type,subject_id,created_at,command_key,command_digest,command_result_json,next_json) VALUES(?,?,?,?,1,?,?,'{}',?)",['h156-'+prefix+name,action,subjectType,'h156-request-'+prefix+name,hash(prefix+name),hash('digest-'+prefix+name),next]);
 }
 await connection.query("INSERT INTO audit_logs(id,action,subject_type,created_at,next_json) VALUES('h156-noncommand','ordinary-audit','fixture',1,NULL)");
}
async function assertFkOn(connection){assert.equal(Number((await connection.query('SELECT @@FOREIGN_KEY_CHECKS enabled'))[0][0].enabled),1);}
async function assertPrefix(connection,expectedMetadata,expectedRows){await assertFkOn(connection);assert.deepEqual(await metadata(connection),expectedMetadata,'Unknown metadata must stop prefix recovery.');assert.deepEqual(await rows(connection),expectedRows,'Changed historical rows must stop prefix recovery.');}
async function guards(connection){
 for(const[table,idColumn,rowId,updateMessage,deleteMessage]of [
  ['form_health_observations','id','h156-runtime','form_health_observation_retained','form_health_cleanup_not_enabled'],
  ['form_health_incident_links','observation_id','h156-runtime','form_health_incident_link_retained','form_health_incident_evidence_retained'],
 ]){
  await assert.rejects(connection.query(`UPDATE ${table} SET ${idColumn}=${idColumn} WHERE ${idColumn}=?`,[rowId]),new RegExp(updateMessage));
  await assert.rejects(connection.query(`DELETE FROM ${table} WHERE ${idColumn}=?`,[rowId]),new RegExp(deleteMessage));
 }
 await assert.rejects(connection.query("INSERT INTO form_health_incident_links VALUES('missing','h156-incident',3)"),/foreign key/i);
 await assert.rejects(connection.query("INSERT INTO form_health_incident_links VALUES('h156-runtime','missing',3)"),/foreign key/i);
 for(const rowId of ['h156-historical','h156-scoped']){
  for(const[assignment,value]of [['id=?',rowId.toUpperCase()],['id=?',rowId+' '],['next_json=?','{}'],['next_json=?','{"nativeFormHealth":{"environment":"test","releaseId":"later"}}']])await assert.rejects(connection.query('UPDATE audit_logs SET '+assignment+' WHERE id=?',[value,rowId]),/native_form_command_provenance_retained/);
  await assert.rejects(connection.query('DELETE FROM audit_logs WHERE id=?',[rowId]),/command_receipt_retained/);
  await connection.query('UPDATE audit_logs SET next_json=next_json,id=id WHERE id=?',[rowId]);
 }
 // Byte identity must reject case/whitespace changes even under the old CI collation.
 const scoped=(await connection.query("SELECT next_json FROM audit_logs WHERE id='h156-scoped'"))[0][0].next_json;
 for(const value of [null,scoped.replace('test','TEST'),scoped+' '])await assert.rejects(connection.query("UPDATE audit_logs SET next_json=? WHERE id='h156-scoped'",[value]),/native_form_command_provenance_retained/);
 for(const rowId of ['h156-document-historical','h156-document-scoped']){
  await assert.rejects(connection.query("UPDATE audit_logs SET next_json='{}' WHERE id=?",[rowId]),/seller_document_audit_immutable/);
  await assert.rejects(connection.query('UPDATE audit_logs SET id=? WHERE id=?',[rowId.toUpperCase(),rowId]),/native_form_command_provenance_retained/);
  await assert.rejects(connection.query('DELETE FROM audit_logs WHERE id=?',[rowId]),/command_receipt_retained/);
 }
 await connection.query("UPDATE audit_logs SET next_json='{}' WHERE id='h156-noncommand'");
 const insert=async({id='h156-native',phase='save',outcome='saved',kind='native_command',evidence='h156-scoped',version=281474976710655}={})=>connection.execute("INSERT INTO form_health_observations(id,support_reference,environment,release_id,form_id,form_version,journey,phase,outcome,category,evidence_kind,evidence_id,observed_at) VALUES(?,?,'test','h156-release','seller.document-change-request',?,'native_submission',?,?,'durable_submission',?,?,3)",[id,'FH-'+id,version,phase,outcome,kind,evidence]);
 await insert();assert.equal(Number((await connection.query("SELECT form_version FROM form_health_observations WHERE id='h156-native'"))[0][0].form_version),281474976710655);
 await assert.rejects(insert({id:'h156-duplicate'}),/duplicate/i);
 for(const change of [{phase:'load'},{outcome:'compatible'},{evidence:null},{kind:'NATIVE_COMMAND'},{kind:'native_command '},{phase:'SAVE'},{outcome:'SAVED'},{kind:'runtime'},{phase:'unknown'}])await assert.rejects(insert({id:'h156-invalid',...change}),/CONSTRAINT/i);
 return{bothPhysicalForeignKeys:true,fourRetentionGuards:true,historicalNullCannotBeScoped:true,byteExactAuditIdentity:true,existingDocumentCommandGuardsRetained:true,noncommandUnchanged:true,nativeSaveShape:true,nativeEvidenceDeduplicated:true,positive48BitVersionRoundtrip:true};
}
let result,ownedPid;
try{result=await withPortableMariaFixture(id,async fixture=>{
 ownedPid=fixture.pid;fixture.connection.connection.config.jsonStrings=true;
 const connection=fixture.connection;
 const prefixCopy=join(fixture.root,'h156-prefix-'+suffix+'.sql'),fullCopy=join(fixture.root,'h156-full-'+suffix+'.sql');
 await copyFile(prefixPath,prefixCopy,constants.COPYFILE_EXCL);await copyFile(join(candidate,'mariadb-schema.sql'),fullCopy,constants.COPYFILE_EXCL);
 const referenceDatabase=await createFixtureDatabase(fixture,'h156ref_'+suffix),importedPrefix=await importFixtureSql(fixture,prefixCopy);
 console.log(JSON.stringify({stage:'native-health-exact155-imported',database:referenceDatabase,statements:importedPrefix.statements}));
 await assertFkOn(connection);await seed(connection);const before=await rows(connection),initialMetadata=await metadata(connection),checkpoints=[initialMetadata];
 for(const statement of statements){await connection.query(statement);await assertFkOn(connection);assert.deepEqual(await rows(connection),before);checkpoints.push(await metadata(connection));}
 const finalMetadata=checkpoints.at(-1);
 for(const key of ['columns','keys','indexes'])assert.deepEqual(finalMetadata[key],initialMetadata[key],key+' retained exactly');
 assert.deepEqual(finalMetadata.triggers.filter(row=>row.TRIGGER_NAME!=='native_form_command_provenance_retained'),initialMetadata.triggers);
 const oldChecks=initialMetadata.checks.filter(row=>row.TABLE_NAME==='form_health_observations'&&row.CHECK_CLAUSE.includes('evidence_kind'));
 assert.equal(oldChecks.length,2);
 assert.deepEqual(finalMetadata.checks.filter(row=>!row.CONSTRAINT_NAME.startsWith('form_health_native_')),initialMetadata.checks.filter(row=>!oldChecks.includes(row)));
 for(const[key,definition]of Object.entries(manifest.requiredExactChecks).filter(([name])=>name.startsWith('form_health_observations.form_health_native_'))){
  const actual=finalMetadata.checks.find(row=>row.TABLE_NAME+'.'+row.CONSTRAINT_NAME===key);assert.ok(actual);assert.equal(sameFeeSqlDefinition(actual.CHECK_CLAUSE,definition),true,key+' matches exact release readiness: '+JSON.stringify({actual:actual.CHECK_CLAUSE,expected:definition}));
 }
 const auditTrigger=finalMetadata.triggers.find(row=>row.TRIGGER_NAME==='native_form_command_provenance_retained');
 assert.equal(sameFeeSqlDefinition(auditTrigger.ACTION_STATEMENT,manifest.requiredExactTriggerDefinitions.native_form_command_provenance_retained),true,'Exact audit trigger matches release requirement');
 assert.equal(finalMetadata.keys.filter(row=>row.TABLE_NAME==='form_health_incident_links'&&row.REFERENCED_TABLE_NAME).length,2);
 assert.match(finalMetadata.columns.find(row=>row.TABLE_NAME==='form_health_observations'&&row.COLUMN_NAME==='form_version').COLUMN_TYPE,/^bigint/);
 await connection.query(statements[0]);await connection.query(statements[1]);await connection.query(statements[2]);await assertPrefix(connection,finalMetadata,before);
 const nativeGuards=await guards(connection),resumed=[];
 for(let checkpoint=0;checkpoint<=statements.length;checkpoint++){
  const database=await createFixtureDatabase(fixture,'h156c'+checkpoint+'_'+suffix);await importFixtureSql(fixture,prefixCopy);await seed(connection);
  for(const statement of statements.slice(0,checkpoint))await connection.query(statement);
  await assertPrefix(connection,checkpoints[checkpoint],before);
  // Deliberately drift a fresh fixture index; recovery refuses any unknown state.
  await connection.query('CREATE INDEX h156_unreviewed ON form_health_observations(form_version)');
  await assert.rejects(assertPrefix(connection,checkpoints[checkpoint],before),/Unknown metadata/);
  await connection.query('DROP INDEX h156_unreviewed ON form_health_observations');
  await assertPrefix(connection,checkpoints[checkpoint],before);
  for(const statement of statements.slice(checkpoint)){await connection.query(statement);await assertFkOn(connection);}
  await assertPrefix(connection,finalMetadata,before);
  resumed.push({checkpoint,database,remainingStatements:statements.length-checkpoint,retainedRows:true,exactMetadata:true,driftRejected:true});
  console.log(JSON.stringify({stage:'native-health-checkpoint-resumed',checkpoint,database}));
 }
 const mismatchDatabase=await createFixtureDatabase(fixture,'h156bad_'+suffix);await importFixtureSql(fixture,prefixCopy);await seed(connection);await connection.query(statements[0]);
 const legacy=oldChecks.find(row=>!row.CHECK_CLAUSE.includes('phase'));assert.ok(legacy);
 const kindDescriptor='MODIFY COLUMN evidence_kind VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL';
 async function rejected(pattern){const actual=await metadata(connection);await assert.rejects(connection.query(statements[1]),pattern);assert.deepEqual(await metadata(connection),actual);assert.deepEqual(await rows(connection),before);}
 await connection.query('ALTER TABLE form_health_observations ADD CONSTRAINT h156_duplicate CHECK('+legacy.CHECK_CLAUSE+')');
 await rejected(/unknown_or_ambiguous_metadata/);
 await connection.query('ALTER TABLE form_health_observations DROP CONSTRAINT h156_duplicate, '+kindDescriptor+" CHECK(evidence_kind IN ('runtime','form_answer_set','core_receipt','unexpected'))");
 await rejected(/unknown_or_ambiguous_metadata/);
 await connection.query('ALTER TABLE form_health_observations '+kindDescriptor+' CHECK('+legacy.CHECK_CLAUSE+')');
 // A CI/pad-space column might admit these old rows. Metadata still must not
 // normalize changed string literal case, spaces or backticks into approval.
 for(const changed of ["evidence_kind IN ('RUNTIME','form_answer_set','core_receipt')","evidence_kind IN ('runtime','form_answer_set','core_receipt ')"]){
  await connection.query('ALTER TABLE form_health_observations '+kindDescriptor+' CHECK('+changed+')');
  await rejected(/unknown_or_ambiguous_metadata/);
  await connection.query('ALTER TABLE form_health_observations '+kindDescriptor+' CHECK('+legacy.CHECK_CLAUSE+')');
 }
 await connection.query(statements[1]);
 await connection.query('ALTER TABLE form_health_observations DROP CONSTRAINT form_health_native_save_0156, ADD CONSTRAINT form_health_native_save_0156 CHECK(evidence_id IS NULL OR evidence_id IS NOT NULL)');
 await rejected(/completed_metadata_mismatch/);
 await connection.query('ALTER TABLE form_health_observations DROP CONSTRAINT form_health_native_save_0156');
 await rejected(/unknown_or_ambiguous_metadata/);
 const freshDatabase=await createFixtureDatabase(fixture,'h156fresh_'+suffix),importedFull=await importFixtureSql(fixture,fullCopy);await assertFkOn(connection);assert.deepEqual(await metadata(connection),finalMetadata);
 for(const[path,expected]of Object.entries(sources))assert.equal(hash(await readFile(resolve(root,path))),expected,path+' stayed frozen');
 assert.equal(hash(await readFile(prefixPath)),hash(prefix));assert.equal(hash(await readFile(join(candidate,'mariadb-schema.sql'))),hash(full));
 return{status:'PASS',fixture:id,version:fixture.facts.version,referenceDatabase,mismatchDatabase,freshDatabase,importedPrefix,importedFull,sourceSha256:sources,fullSchemaSha256:hash(full),appendSha256:hash(append),originalRowsSha256:hash(JSON.stringify(before)),originalRows:before,originalMetadata:initialMetadata,finalMetadata,resumed,nativeGuards,guardedAlterReplay:true,unknownAmbiguousAndPartialMetadataStop:true,completedMetadataMismatchStops:true,foreignKeysContinuouslyEnabledDuringUpgrade:true,ddlAutoCommit:true,transactionRollbackClaimed:false,resetExecuted:false};
});}catch(error){result={status:'FAIL',message:String(error.message).slice(0,7000),stack:String(error.stack).slice(0,4000),diagnostic:error.diagnostic};process.exitCode=1;
}finally{
 await writeFile(base+'.json',JSON.stringify(result??{status:'FAIL',message:'No result before cleanup.'},null,2),{flag:'wx'});
 if(ownedPid!==undefined){await copyFile(join(proof.root,'last-shutdown.json'),base+'-shutdown.json',constants.COPYFILE_EXCL);const shutdown=JSON.parse(await readFile(base+'-shutdown.json','utf8'));assert.equal(shutdown.pid,ownedPid);assert.equal(shutdown.authenticatedShutdown,true);assert.equal(shutdown.stopped,true);assert.equal(shutdown.forcedStop,false);}
}
console.log(JSON.stringify({status:result.status,evidencePath:base+'.json',message:result.message}));
