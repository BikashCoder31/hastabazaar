/** Explicit local schema proof only. Requires root-coordinated exclusive Maria window. */
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withPortableMariaFixture,createFixtureDatabase,importFixtureSql,splitFixtureSql,assertUnder} from './portable-mariadb-fixture.mjs';
import {sameFeeSqlDefinition} from '../lib/operations/fee-schema-readiness.mjs';

const root=await realpath('C:/Users/abinash/Desktop/HastaBazaar');
assert.equal((await realpath(process.cwd())).toLowerCase(),root.toLowerCase());
assert.equal(process.argv.length,4,'Pass the reviewed offline fixture ID and new candidate directory.');
const id=process.argv[2];assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);
const proof=JSON.parse(await readFile(resolve(root,'.test-artifacts/t33/'+id+'.json'),'utf8'));
assert.equal(proof.id,id);assert.equal(proof.purpose,'t33-offline-preservation');assert.equal(proof.version,'10.11.19');
assert.equal(proof.sha256,'398ea30e5036010bbebe01d2b1804280424dcc2626e36d8e95155c04d25a0490');assert.equal(proof.copiedStaticArchiveOnly,true);
assertUnder(resolve(root,'test-artifacts/mariadb'),await realpath(proof.root));
const owned=resolve(root,'.test-artifacts/t35/price-history-schema-astra-20261104');
const candidate=assertUnder(owned,await realpath(process.argv[3]));
const hash=value=>createHash('sha256').update(value).digest('hex');
const prefixPath=resolve(root,'.test-artifacts/t33/native-public-feedback-candidate-v8/mariadb-schema.sql');
const appendPath=resolve(root,'deployment/babal/mariadb-product-orderable-price-history.sql');
const prefix=await readFile(prefixPath),append=await readFile(appendPath,'utf8'),full=await readFile(join(candidate,'mariadb-schema.sql'));
const manifest=JSON.parse(await readFile(join(candidate,'bundle/deployment/babal/release-manifest.json'),'utf8'));
assert.equal(manifest.migrations[0].sha256,hash(full));
assert.equal(hash(prefix),'7827e2ab78c852a53d9fffa76aa7e91ca4530b88a0ea82378d9a3153a255be6e');
const footer=Buffer.from('SET FOREIGN_KEY_CHECKS = 1;\n');
assert.ok(full.subarray(0,prefix.length-footer.length).equals(prefix.subarray(0,-footer.length)));
assert.equal(full.subarray(prefix.length-footer.length).toString(),append.trim().replaceAll('\r\n','\n')+'\n'+footer.toString());
const statements=splitFixtureSql(append);assert.equal(statements.length,7);
const paths=['db/schema.ts','drizzle/0155_product_orderable_price_history.sql','deployment/babal/mariadb-product-orderable-price-history.sql','deployment/babal/mariadb-private-price-guidance.sql','scripts/generate-mariadb-schema.mjs','scripts/generate-release-manifest.mjs','scripts/test-t33-price-history-schema-mariadb.mjs','lib/operations/fee-schema-readiness.mjs'];
const sources=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const suffix=Date.now().toString(36)+'_'+randomUUID().slice(0,4),base=join(owned,'native-'+suffix);
await writeFile(base+'-freeze.json',JSON.stringify({sources,schemaSha256:hash(full),prefixSha256:hash(prefix),appendSha256:hash(append)},null,2),{flag:'wx'});
const historyTables=['product_price_reference_reviews','product_discount_cycles','product_discount_advisories','product_discount_advisory_items'];
const metadataTables=[...historyTables,'product_orderable_price_observations'];
async function rows(connection){const result={};for(const table of historyTables){const[data]=await connection.query('SELECT * FROM '+table+' ORDER BY 1,2');result[table]=data.map(row=>{const copy={...row};if('history_basis' in copy){assert.equal(copy.history_basis,null);delete copy.history_basis;}return copy;});}return result;}
async function metadata(connection){
 const list=metadataTables.map(()=>'?').join(',');const result={};
 for(const[key,query]of Object.entries({
  columns:`SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,ORDINAL_POSITION`,
  constraints:`SELECT TABLE_NAME,CONSTRAINT_NAME,CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,CONSTRAINT_NAME`,
  checks:`SELECT TABLE_NAME,CONSTRAINT_NAME,LEVEL,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,CONSTRAINT_NAME`,
  keys:`SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,ORDINAL_POSITION,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION`,
  indexes:`SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${list}) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`,
  triggers:`SELECT EVENT_OBJECT_TABLE,TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN (${list}) ORDER BY TRIGGER_NAME`,
 })){result[key]=(await connection.query(query,metadataTables))[0];}
 result.routines=(await connection.query("SELECT ROUTINE_NAME,ROUTINE_DEFINITION FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME='hastabazaar_price_history_0155'"))[0];
 return result;
}
async function seed(connection){
 const sql=[
  "INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('h155-owner','h155-owner','h155-owner@local.hastabazaar.test','Fictional Owner','active',1,1)",
  "INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES('h155-seller','h155-owner','Fictional Name','Fictional Shop','Fixture','FIX-H155','PAN','FIX-H155','Fictional Owner','9800000000','h155-owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional Workshop','approved',1,1)",
  "INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('h155-category','h155-category','Fictional Category',1,0,1,1)",
  "INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at) VALUES('h155-product','h155-seller','h155-category','h155-product','H155-PRODUCT','Fictional cup','Unused fictional cup',700,0,'Maker','NP','Clay',1,'published',1,1)",
  "INSERT INTO product_offer_versions(id,product_id,matrix_json,created_by,created_at) VALUES('h155-offer-version','h155-product','{}','h155-owner',1)",
  "INSERT INTO product_offer_identities(id,product_id,platform_sku,physical_json,stock_family_key,base_unit,units_per_offer,created_at) VALUES('h155-offer','h155-product','H155-OFFER','{}','h155-family','piece',1,1)",
  "INSERT INTO category_template_versions(id,category_id,version,contract_json,created_by,created_at,reason) VALUES('h155-category-version','h155-category',1,'{}','h155-owner',1,'Fictional exact category')",
  "INSERT INTO product_intake_drafts(id,owner_id,seller_id,product_id,revision,category_id,answers_json,created_at,updated_at) VALUES('h155-draft','h155-owner','h155-seller','h155-product',0,'h155-category','{}',1,1)",
  "INSERT INTO product_intake_workspace_versions(id,draft_id,revision,kind,snapshot_json,created_by,created_at) VALUES('h155-workspace','h155-draft',0,'private','{\"categoryId\":\"h155-category\",\"offers\":{}}','h155-owner',1)",
  "INSERT INTO product_intake_cases(id,draft_id,cycle_number,version_id,revision,state,first_requested_at,triage_due_at,last_event_id) VALUES('h155-case','h155-draft',0,'h155-workspace',0,'resolved',1,86400001,'h155-event')",
  "INSERT INTO product_publication_links(draft_id,product_id,revision) VALUES('h155-draft','h155-product',0)",
  "INSERT INTO product_publication_candidates(id,product_id,case_id,workspace_version_id,offer_version_id,category_version_id,created_by,created_at) VALUES('h155-public','h155-product','h155-case','h155-workspace','h155-offer-version','h155-category-version','h155-owner',2)",
  "INSERT INTO product_publication_decisions(id,version_id,action,review_json,public_json,ordering_facts_ready,actor_id,reason,created_at) VALUES('h155-publication','h155-public','approve_and_publish','{}','{}',1,'h155-owner','Fictional publication',3)",
  "INSERT INTO product_price_reference_reviews(id,product_id,seller_id,offer_id,version_id,review_revision,physical_json,selling_paisa,compare_paisa,decision,evidence_kind,evidence_reference,offered_from,offered_to,reason,actor_id,created_at) VALUES('h155-old-review','h155-product','h155-seller','h155-offer','h155-offer-version',3,'{\"unit\":1}',700,800,'approved','external_offer','Retained private नेपाल evidence',10,20,'Original reviewer basis','h155-owner',30)",
  "INSERT INTO product_discount_cycles VALUES('h155-cycle','h155-product','h155-offer','h155-offer-version','h155-old-review',700,800,'7.00','8.00',31,31,44,'sent','pending',4)",
  "INSERT INTO product_discount_advisories VALUES('h155-advisory','h155-product',23,32,33)",
  "INSERT INTO product_discount_advisory_items VALUES('h155-advisory','h155-cycle')",
 ];for(const statement of sql)await connection.query(statement);
}
async function assertFkOn(connection){assert.equal(Number((await connection.query('SELECT @@FOREIGN_KEY_CHECKS enabled'))[0][0].enabled),1);}
async function guards(connection){
 await assert.rejects(connection.query("UPDATE product_price_reference_reviews SET reason='replacement' WHERE id='h155-old-review'"),/price_reference_immutable/);
 await assert.rejects(connection.query("DELETE FROM product_price_reference_reviews WHERE id='h155-old-review'"),/price_reference_retained/);
 await assert.rejects(connection.query("UPDATE product_discount_cycles SET reference_id='missing'"),/foreign key/i);
 await assert.rejects(connection.query("UPDATE product_discount_advisory_items SET cycle_id='missing'"),/foreign key/i);
 const observation={id:'h155-observation',product_id:'h155-product',seller_id:'h155-seller',offer_id:'h155-offer',offer_version_id:'h155-offer-version',public_version_id:'h155-public',publication_id:'h155-publication',physical_json:'{}',scope_json:'{}',selling_paisa:800,currency:'NPR',observed_at:50,actor_id:'h155-owner',reason:'Observed actual fictional orderable offer'};
 const insert=async input=>connection.query('INSERT INTO product_orderable_price_observations ('+Object.keys(input).join(',')+') VALUES ('+Object.keys(input).map(()=>'?').join(',')+')',Object.values(input));
 await insert(observation);
 for(const column of ['product_id','seller_id','offer_id','offer_version_id','public_version_id','publication_id','actor_id'])await assert.rejects(insert({...observation,id:'invalid-'+column,[column]:'missing'}),/foreign key/i);
 for(const change of [{selling_paisa:0},{observed_at:-1},{currency:'npr'},{currency:'NPR '}])await assert.rejects(insert({...observation,id:'invalid-value',...change}),/CONSTRAINT/i);
 await assert.rejects(connection.query("UPDATE product_orderable_price_observations SET reason='rewrite'"),/orderable_price_observation_immutable/);
 await assert.rejects(connection.query('DELETE FROM product_orderable_price_observations'),/orderable_price_observation_retained/);
 const review="INSERT INTO product_price_reference_reviews(id,product_id,seller_id,offer_id,version_id,review_revision,physical_json,selling_paisa,compare_paisa,decision,evidence_kind,evidence_reference,offered_from,offered_to,reason,actor_id,created_at,history_basis) VALUES(?,'h155-product','h155-seller','h155-offer','h155-offer-version',?,'{}',700,800,'approved',?,'h155-observation',50,50,'Independently assessed historical price','h155-owner',60,?)";
 for(const[kind,basis]of [['platform_orderable',null],['platform_orderable','short'],['external_offer','Unexpected basis'],['PLATFORM_ORDERABLE','Enough substantive basis']])await assert.rejects(connection.execute(review,['invalid-review',4,kind,basis]),/CONSTRAINT/i);
 await connection.execute(review,['h155-native-review',4,'platform_orderable','Independently assessed intervening prices and relevance.']);
 const[accepted]=await connection.query("SELECT history_basis FROM product_price_reference_reviews WHERE id='h155-native-review'");assert.match(accepted[0].history_basis,/intervening prices/);
 return{sevenForeignKeys:true,observationImmutable:true,originalReviewImmutable:true,childForeignKeys:true,invalidValuesRejected:true,historyBasisRequired:true,noCompletedSaleRequired:true};
}
let result,ownedPid;
try{result=await withPortableMariaFixture(id,async fixture=>{
 ownedPid=fixture.pid;fixture.connection.connection.config.jsonStrings=true;
 const connection=fixture.connection;
 const prefixCopy=join(fixture.root,'h155-prefix-'+suffix+'.sql'),fullCopy=join(fixture.root,'h155-full-'+suffix+'.sql');
 await copyFile(prefixPath,prefixCopy,constants.COPYFILE_EXCL);await copyFile(join(candidate,'mariadb-schema.sql'),fullCopy,constants.COPYFILE_EXCL);
 const referenceDatabase=await createFixtureDatabase(fixture,'h155ref_'+suffix),importedPrefix=await importFixtureSql(fixture,prefixCopy);
 console.log(JSON.stringify({stage:'price-history-exact-v8-imported',database:referenceDatabase,statements:importedPrefix.statements}));
 await assertFkOn(connection);await seed(connection);const before=await rows(connection),initialMetadata=await metadata(connection);
 const checkpoints=[initialMetadata];
 for(const statement of statements){await connection.query(statement);await assertFkOn(connection);assert.deepEqual(await rows(connection),before);checkpoints.push(await metadata(connection));}
 const finalMetadata=checkpoints.at(-1);
 for(const[key,definition]of Object.entries(manifest.requiredExactChecks).filter(([name])=>name.startsWith('product_orderable_price_observations.')||name.startsWith('product_price_reference_reviews.'))){
  const actual=finalMetadata.checks.find(row=>row.TABLE_NAME+'.'+row.CONSTRAINT_NAME===key);assert.ok(actual,key+' exists');assert.equal(sameFeeSqlDefinition(actual.CHECK_CLAUSE,definition),true,key+' exactly matches release readiness: '+JSON.stringify({actual:actual.CHECK_CLAUSE,expected:definition}));
 }
 for(const[key,expected]of Object.entries(manifest.requiredForeignKeys).filter(([name])=>name.startsWith('product_orderable_price_observations.'))){
  const actual=finalMetadata.keys.filter(row=>row.TABLE_NAME+'.'+row.CONSTRAINT_NAME===key);assert.equal(actual.length,1);assert.equal(actual[0].COLUMN_NAME,expected.columns[0]);assert.equal(actual[0].REFERENCED_TABLE_NAME,expected.referencedTable);assert.equal(actual[0].REFERENCED_COLUMN_NAME,expected.referencedColumns[0]);
 }
 // Every old descriptor except the one evidence CHECK and added column stays exact.
 for(const key of ['keys','indexes','triggers'])assert.deepEqual(finalMetadata[key].filter(row=>(row.TABLE_NAME??row.EVENT_OBJECT_TABLE)!=='product_orderable_price_observations'),initialMetadata[key]);
 assert.deepEqual(finalMetadata.columns.filter(row=>row.TABLE_NAME!=='product_orderable_price_observations'&&row.COLUMN_NAME!=='history_basis'),initialMetadata.columns);
 await connection.query(statements[0]);await connection.query(statements[1]);await connection.query(statements[2]);
 assert.deepEqual(await rows(connection),before);assert.deepEqual(await metadata(connection),finalMetadata);
 const constraintMetadata=finalMetadata.checks.filter(row=>row.TABLE_NAME==='product_price_reference_reviews');
 const nativeGuards=await guards(connection);
 const resumed=[];
 for(let checkpoint=0;checkpoint<=statements.length;checkpoint++){
  const database=await createFixtureDatabase(fixture,'h155c'+checkpoint+'_'+suffix);await importFixtureSql(fixture,prefixCopy);await seed(connection);
  for(const statement of statements.slice(0,checkpoint))await connection.query(statement);
  await assertFkOn(connection);assert.deepEqual(await rows(connection),before);assert.deepEqual(await metadata(connection),checkpoints[checkpoint],'Only exact metadata permits prefix resume.');
  await connection.query('CREATE INDEX h155_unreviewed ON product_price_reference_reviews(created_at)');
  assert.notDeepEqual(await metadata(connection),checkpoints[checkpoint],'Drift must never satisfy the exact resume checkpoint.');
  await connection.query('DROP INDEX h155_unreviewed ON product_price_reference_reviews');
  assert.deepEqual(await metadata(connection),checkpoints[checkpoint]);
  for(const statement of statements.slice(checkpoint)){await connection.query(statement);await assertFkOn(connection);}
  assert.deepEqual(await rows(connection),before);assert.deepEqual(await metadata(connection),finalMetadata);
  resumed.push({checkpoint,database,retainedRows:true,exactMetadata:true,driftRejected:true,remainingStatements:statements.length-checkpoint});
  console.log(JSON.stringify({stage:'price-history-checkpoint-resumed',checkpoint,database}));
 }
 // Unknown and ambiguous legacy CHECK metadata must stop before ALTER.
 const mismatchDatabase=await createFixtureDatabase(fixture,'h155bad_'+suffix);await importFixtureSql(fixture,prefixCopy);await seed(connection);await connection.query(statements[0]);
 const legacy=(await connection.query("SELECT CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='product_price_reference_reviews'"))[0].find(row=>row.CHECK_CLAUSE.includes("'historical_order'"));assert.ok(legacy);
 await connection.query('ALTER TABLE product_price_reference_reviews ADD CONSTRAINT h155_duplicate CHECK('+legacy.CHECK_CLAUSE+')');
 const ambiguousMetadata=await metadata(connection);await assert.rejects(connection.query(statements[1]),/unknown_or_ambiguous_metadata/);assert.deepEqual(await metadata(connection),ambiguousMetadata);assert.deepEqual(await rows(connection),before);
 await connection.query('ALTER TABLE product_price_reference_reviews DROP CONSTRAINT h155_duplicate, MODIFY COLUMN evidence_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL CHECK(evidence_kind IN (\'historical_order\',\'external_offer\',\'review_finding\',\'unexpected\'))');
 const unknownMetadata=await metadata(connection);await assert.rejects(connection.query(statements[1]),/unknown_or_ambiguous_metadata/);assert.deepEqual(await metadata(connection),unknownMetadata);assert.deepEqual(await rows(connection),before);
 await connection.query('ALTER TABLE product_price_reference_reviews MODIFY COLUMN evidence_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL CHECK('+legacy.CHECK_CLAUSE+')');
 for(const changed of [legacy.CHECK_CLAUSE.replace('external_offer','EXTERNAL_OFFER'),legacy.CHECK_CLAUSE.replace('external_offer','external_offer ')]){
  await connection.query('ALTER TABLE product_price_reference_reviews MODIFY COLUMN evidence_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL CHECK('+changed+')');
  const changedMetadata=await metadata(connection);await assert.rejects(connection.query(statements[1]),/unknown_or_ambiguous_metadata/);assert.deepEqual(await metadata(connection),changedMetadata);assert.deepEqual(await rows(connection),before);
  await connection.query('ALTER TABLE product_price_reference_reviews MODIFY COLUMN evidence_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL CHECK('+legacy.CHECK_CLAUSE+')');
 }
 await connection.query(statements[1]);
 await connection.query("ALTER TABLE product_price_reference_reviews ALTER COLUMN history_basis SET DEFAULT 'unexpected'");
 const wrongDefault=await metadata(connection);await assert.rejects(connection.query(statements[1]),/completed_metadata_mismatch/);assert.deepEqual(await metadata(connection),wrongDefault);assert.deepEqual(await rows(connection),before);
 await connection.query('ALTER TABLE product_price_reference_reviews ALTER COLUMN history_basis DROP DEFAULT');
 await connection.query('ALTER TABLE product_price_reference_reviews DROP CONSTRAINT price_reference_history_basis, ADD CONSTRAINT price_reference_history_basis CHECK(history_basis IS NULL OR CHAR_LENGTH(history_basis)>1)');
 const wrongCompletedCheck=await metadata(connection);await assert.rejects(connection.query(statements[1]),/completed_metadata_mismatch/);assert.deepEqual(await metadata(connection),wrongCompletedCheck);assert.deepEqual(await rows(connection),before);
 const freshDatabase=await createFixtureDatabase(fixture,'h155fresh_'+suffix),importedFull=await importFixtureSql(fixture,fullCopy);await assertFkOn(connection);assert.deepEqual(await metadata(connection),finalMetadata);
 for(const[path,expected]of Object.entries(sources))assert.equal(hash(await readFile(resolve(root,path))),expected,path+' stayed frozen');
 assert.equal(hash(await readFile(prefixPath)),hash(prefix));assert.equal(hash(await readFile(join(candidate,'mariadb-schema.sql'))),hash(full));
 return{status:'PASS',fixture:id,version:fixture.facts.version,referenceDatabase,mismatchDatabase,freshDatabase,importedPrefix,importedFull,sourceSha256:sources,fullSchemaSha256:hash(full),appendSha256:hash(append),originalRowsSha256:hash(JSON.stringify(before)),originalRows:before,originalMetadata:initialMetadata,constraintMetadata,resumed,nativeGuards,reviewAlterReplay:true,unknownAndAmbiguousMetadataStop:true,completedMetadataMismatchStops:true,foreignKeysContinuouslyEnabled:true,ddlAutoCommit:true,transactionRollbackClaimed:false,resetExecuted:false};
});}catch(error){result={status:'FAIL',message:String(error.message).slice(0,7000),stack:String(error.stack).slice(0,4000),diagnostic:error.diagnostic};process.exitCode=1;
}finally{
 await writeFile(base+'.json',JSON.stringify(result??{status:'FAIL',message:'No result before cleanup.'},null,2),{flag:'wx'});
 if(ownedPid!==undefined){await copyFile(join(proof.root,'last-shutdown.json'),base+'-shutdown.json',constants.COPYFILE_EXCL);const shutdown=JSON.parse(await readFile(base+'-shutdown.json','utf8'));assert.equal(shutdown.pid,ownedPid);assert.equal(shutdown.authenticatedShutdown,true);assert.equal(shutdown.stopped,true);assert.equal(shutdown.forcedStop,false);}
}
console.log(JSON.stringify({status:result.status,evidencePath:base+'.json',message:result.message}));
