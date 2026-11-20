import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import test from 'node:test';
import {getTableConfig} from 'drizzle-orm/sqlite-core';
import * as schema from '../db/schema';
import {readReleaseAssets} from '../scripts/release-schema-assets.mjs';
import {readHistoricalMariaDbSchema} from './helpers/historical-mariadb-schema';

const root=resolve(import.meta.dirname,'..');
const artifacts=resolve(root,'.test-artifacts/t35/price-history-schema-astra-20261104');
const hash=(value: Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const read=(path:string)=>readFile(resolve(root,path),'utf8');

void test('typed observation/review metadata agrees with the new immutable SQLite source',async()=>{
 const table=(schema as Record<string,unknown>).productOrderablePriceObservations;
 assert.ok(table,'The source-only155 observation must be available to typed consumers.');
 const config=getTableConfig(table as Parameters<typeof getTableConfig>[0]);
 const source=await read('drizzle/0155_product_orderable_price_history.sql');
 const definition=source.match(/CREATE TABLE product_orderable_price_observations \(([\s\S]*?)\n\);/)![1];
 assert.deepEqual(config.columns.map(column=>column.name),definition.trim().split('\n').map(line=>line.trim().split(' ')[0]));
 assert.equal(config.foreignKeys.length,7);
 assert.equal(config.indexes[0].config.name,'product_orderable_price_history');
 assert.equal(config.checks.length,3);
 assert.ok(schema.productPriceReferenceReviews.evidenceKind.enumValues?.includes('platform_orderable' as never));
 assert.ok(getTableConfig(schema.productPriceReferenceReviews).columns.some(column=>column.name==='history_basis'&&!column.notNull));
 assert.ok(getTableConfig(schema.productPriceReferenceReviews).checks.some(check=>check.name==='price_reference_history_basis'));
});

void test('155 native append keeps all V8 schema bytes and old artifacts, with an exact guarded ALTER',async()=>{
 const retainedPaths=['drizzle/0091_product_price_references.sql','deployment/babal/mariadb-private-price-guidance.sql','deployment/babal/mariadb-schema.sql','deployment/babal/mariadb-reset-empty-import.sql'];
 const retained=Object.fromEntries(await Promise.all(retainedPaths.map(async path=>[path,hash(await read(path))])));
 const append=await read('deployment/babal/mariadb-product-orderable-price-history.sql');
 const native156=await read('deployment/babal/mariadb-native-form-health.sql');
 assert.match(append,/information_schema\.CHECK_CONSTRAINTS/);
 assert.match(append,/MIN\(LEVEL\)/);
 assert.match(append,/COLUMN_TYPE='varchar\(30\)'/);
 assert.match(append,/COLUMN_DEFAULT IS NULL/);
 assert.match(append,/MODIFY COLUMN evidence_kind VARCHAR\(30\) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL/);
 assert.match(append,/unchanged_count<>4/);
 assert.match(append,/DROP CONSTRAINT/);
 assert.doesNotMatch(append,/DROP TABLE|FOREIGN_KEY_CHECKS\s*=|UPDATE product_price_reference_reviews|DELETE FROM|INSERT INTO product_orderable_price_observations/);
 assert.match(append,/ADD COLUMN history_basis LONGTEXT NULL/);
 assert.match(append,/price_reference_history_basis/);
 assert.match(append,/CHAR_LENGTH\(TRIM\(history_basis\)\)>=10/);
 assert.match(append,/orderable_price_observation_immutable/);
 assert.match(append,/orderable_price_observation_retained/);
 assert.equal((append.match(/FOREIGN KEY\(/g)??[]).length,7);
 const directory=resolve(artifacts,'source-'+randomUUID());
 execFileSync(process.execPath,['scripts/generate-mariadb-schema.mjs','--output-directory='+directory],{cwd:root,stdio:'pipe'});
 const {candidate,v8:baseline,reset156}=await readHistoricalMariaDbSchema(directory);
 const footer='SET FOREIGN_KEY_CHECKS = 1;\n';
 const appendOffset=baseline.length-footer.length;
 const bootstrap=await read('deployment/babal/mariadb-bootstrap-prerequisites.sql');
 const completionTail='\n'+await read('deployment/babal/mariadb-bootstrap-completion.sql')+'\n'+await read('deployment/babal/mariadb-fresh-bootstrap-defaults.sql');
 const parityTail='\n'+await read('deployment/babal/mariadb-check-parity.sql')+'\n'+await read('deployment/babal/mariadb-text-length-parity.sql')+'\n'+await read('deployment/babal/mariadb-native-order-stock-governance.sql');
 assert.equal(new TextDecoder().decode(candidate.subarray(appendOffset)),append.trim().replaceAll('\r\n','\n')+'\n'+native156.trim().replaceAll('\r\n','\n')+'\n'+footer+'\n'+bootstrap+completionTail+parityTail.replaceAll('\r\n','\n'));
 const recovery=new TextDecoder().decode(reset156);
 assert.ok(recovery.indexOf('DROP TABLE IF EXISTS `product_orderable_price_observations`')<recovery.indexOf('DROP TABLE IF EXISTS `product_offer_versions`'));
 for(const[path,expected]of Object.entries(retained))assert.equal(hash(await read(path)),expected,path);
 await mkdir(artifacts,{recursive:true});
 await writeFile(resolve(directory,'source-proof.json'),JSON.stringify({databaseOpened:false,nativeEngineProof:false,schemaSha256:hash(candidate),appendSha256:hash(append),historicalV8Sha256:hash(baseline),retained},null,2)+'\n');
});

void test('the exact selected155 schema and forward companion travel with truthful required-column inventory',async()=>{
 const directory=resolve(artifacts,'release-'+randomUUID());
 execFileSync(process.execPath,['scripts/generate-mariadb-schema.mjs','--output-directory='+directory],{cwd:root,stdio:'pipe'});
 const bundle=resolve(directory,'bundle');
 execFileSync(process.execPath,['scripts/generate-release-manifest.mjs','--schema-input='+resolve(directory,'mariadb-schema.sql'),'--asset-root='+bundle],{cwd:root,stdio:'pipe',env:{...process.env,HASTABAZAAR_RELEASE_ID:'local-price-history-155'}});
 const {manifest,files}=await readReleaseAssets(bundle,'local-price-history-155');
 const selected=await readFile(resolve(directory,'mariadb-schema.sql'));
 assert.equal(manifest.migrations[0].sha256,hash(selected));
 assert.deepEqual(files[0].bytes,selected);
 const companion=manifest.migrations.find((entry:{path:string})=>entry.path==='deployment/babal/mariadb-product-orderable-price-history.sql');
 assert.ok(companion,'Explicit forward companion must be discoverable for separately reviewed upgrade planning.');
 assert.equal(companion.sha256,hash(await read('deployment/babal/mariadb-product-orderable-price-history.sql')));
 assert.ok(manifest.requiredTables.product_price_reference_reviews.includes('history_basis'));
 assert.deepEqual(manifest.requiredTables.product_orderable_price_observations,getTableConfig(schema.productOrderablePriceObservations).columns.map(column=>column.name).sort((a,b)=>a.localeCompare(b)));
 for(const name of ['orderable_price_observation_immutable','orderable_price_observation_retained'])assert.ok(name in manifest.requiredTriggers);
 for(const name of ['product_orderable_price_observations.orderable_price_positive','product_orderable_price_observations.orderable_price_currency','product_orderable_price_observations.orderable_price_time','product_price_reference_reviews.price_reference_evidence_kind_0155','product_price_reference_reviews.price_reference_history_basis']){
  assert.ok(name in manifest.requiredChecks);assert.ok(name in manifest.requiredExactChecks);
 }
 assert.equal(Object.keys(manifest.requiredForeignKeys).filter(name=>name.startsWith('product_orderable_price_observations.')).length,7);
 assert.equal(manifest.migrations.some((entry:{path:string})=>entry.path.includes('reset-empty')),false);
});
