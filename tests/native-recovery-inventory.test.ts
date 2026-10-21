import assert from 'node:assert/strict';
import test from 'node:test';
import {captureNativeInventory,normalizeNativeView} from '../scripts/recovery/native-inventory.mjs';

function fixture(database:string,view='loyalty_latest_claims',suffix='',relationDatabase=database){
 return {async query(sql:string){
  if(sql==='SELECT DATABASE() name')return [[{name:database}]];
  if(sql.includes('information_schema.TABLES'))return [[{name:view,kind:'VIEW',engine:null}]];
  if(sql.startsWith('SHOW CREATE VIEW'))return [[{'Create View':`CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW ${view} AS SELECT d.* FROM \`${relationDatabase}\`.\`loyalty_daily_claims\` d${suffix}`,character_set_client:'utf8mb4',collation_connection:'utf8mb4_general_ci'}]];
  if(/information_schema\.(ROUTINES|EVENTS|TRIGGERS)/.test(sql))return [[]];
  throw Error('Unexpected inventory query');
 }};
}
void test('native recovery compares the reviewed view definition across owned schema names and rejects unknown views',async()=>{
 const source=await captureNativeInventory(fixture('native_123_fresh'));
 assert.equal(source.views,1);
 assert.deepEqual(await captureNativeInventory(fixture('native_123_recovery')),source);
 assert.notEqual((await captureNativeInventory(fixture('native_123_recovery','loyalty_latest_claims',' WHERE 1=0'))).schemaSha256,source.schemaSha256);
 await assert.rejects(captureNativeInventory(fixture('native_123_fresh','unknown_view')),/Unreviewed views/);
 await assert.rejects(captureNativeInventory(fixture('native_123_recovery','loyalty_latest_claims','','native_123_fresh')),/Cross-schema/);
 const sql="CREATE VIEW loyalty_latest_claims AS SELECT 'FROM `native_123_fresh`.`loyalty_daily_claims`' literal FROM `native_123_fresh`.`loyalty_daily_claims` d";
 assert.ok(normalizeNativeView(sql,'native_123_fresh').includes("'FROM `native_123_fresh`.`loyalty_daily_claims`'"));
 assert.ok(normalizeNativeView(sql,'native_123_fresh').endsWith('FROM `$database`.`loyalty_daily_claims` d'));
 const qualified='CREATE VIEW loyalty_latest_claims AS SELECT d.* FROM `native_123_fresh`.`loyalty_daily_claims` d';
 assert.equal(normalizeNativeView(qualified.replace('`native_123_fresh`.',''),'native_123_recovery'),normalizeNativeView(qualified,'native_123_fresh'));
});

void test('native view rejects comma relations disguised as aliases and schema-qualified routines',()=>{
 const prefix='CREATE VIEW loyalty_latest_claims AS SELECT d.* FROM `native_123_fresh`.`loyalty_daily_claims` d';
 assert.throws(()=>normalizeNativeView(prefix+', d.secret newer','native_123_fresh'),/Unreviewed native view relation/);
 assert.throws(()=>normalizeNativeView(prefix+' WHERE d.some_function()=1','native_123_fresh'),/routine/);
 assert.throws(()=>normalizeNativeView(prefix+' JOIN newer.secret x ON 1=1','native_123_fresh'),/Unreviewed native view relation/);
});
