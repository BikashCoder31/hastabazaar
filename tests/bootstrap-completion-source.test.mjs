import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildBootstrapCompletion} from '../lib/operations/bootstrap-completion.mjs';
import {buildFreshBootstrapDefaults} from '../lib/operations/fresh-bootstrap-defaults.mjs';
import {sqlStatements} from '../scripts/testing/verify-current-native.mjs';
import {splitFixtureSql} from '../scripts/portable-mariadb-fixture.mjs';
import {schemaTokens} from '../lib/operations/sql-schema-inventory.mjs';
const root=new URL('../',import.meta.url);
void test('bootstrap completion restores all omitted current table and column definitions',async()=>{
 let sql;try{sql=await readFile(new URL('deployment/babal/mariadb-bootstrap-completion.sql',root),'utf8');}
 catch(error){if(error.code!=='ENOENT')throw error;sql=await readFile(new URL('.test-artifacts/t35/bootstrap-prerequisites-candidate-20261105-v1/mariadb-schema.sql',root),'utf8');}
 for(const name of ['referral_campaign','referral_redemptions','order_email_jobs','review_photos','review_replies','password_reset_challenges','product_deletions','product_sku_claims','delivery_rate_versions','delivery_rate_current','parcel_courier_costs','exception_work_items','exception_work_events','homepage_product_controls','marketplace_settings','homepage_hero_media'])assert.ok(new RegExp('CREATE TABLE(?: IF NOT EXISTS)? `?'+name+'`?\\s*\\(').test(sql),'missing '+name);
 for(const name of ['delivery_rate_snapshot_json','size','colour','variations','specifications'])assert.match(sql,new RegExp('ADD COLUMN `?'+name+'`? '),'missing '+name);
});
void test('checked companions match pinned source generation and reject source drift',async()=>{
 const contract=JSON.parse(await readFile(new URL('lib/operations/bootstrap-completion-contract.json',root),'utf8'));
 const sourceTexts=Object.fromEntries(await Promise.all(Object.keys(contract.reference.sources).map(async path=>[path,await readFile(new URL(path,root),'utf8')])));
 const sql=buildBootstrapCompletion({...contract,sourceTexts});
 assert.equal(sql,await readFile(new URL('deployment/babal/mariadb-bootstrap-completion.sql',root),'utf8'));
 assert.equal(buildFreshBootstrapDefaults(contract),await readFile(new URL('deployment/babal/mariadb-fresh-bootstrap-defaults.sql',root),'utf8'));
 const path='drizzle/0030_product_identity_taxonomy.sql';
 assert.throws(()=>buildBootstrapCompletion({...contract,sourceTexts:{...sourceTexts,[path]:sourceTexts[path]+'\n-- unreviewed drift'}}),/source drift/);
 const words=schemaTokens(sql).filter(t=>t.kind==='word').map(t=>t.value.toUpperCase());
 assert.equal(words.filter(w=>w==='INSERT').length,1,'only canonical missing-SKU mapping mutates rows');
 for(const word of ['DELETE','UPDATE','REPLACE','TRUNCATE'])assert.ok(!words.includes(word),'no top-level '+word);
 assert.match(sql,/PRECEDES wallet_refund_guard/);
 assert.doesNotMatch(sql,/INSERT.*(?:marketplace_settings|referral_campaign|audit_logs|delivery_rate_versions)/);
});
void test('real import parsers retain the accepted prerequisite prefix and both complete compound blocks',async()=>{
 const base=await readFile(new URL('.test-artifacts/t35/bootstrap-prerequisites-candidate-20261105-v1/mariadb-schema.sql',root),'utf8');
 assert.equal(createHash('sha256').update(base).digest('hex'),'dd751ebe5fe7b0894a96c49646c7d8e413da31137add3dffea3c4461874a18b8');
 const completion=await readFile(new URL('deployment/babal/mariadb-bootstrap-completion.sql',root),'utf8'),fresh=await readFile(new URL('deployment/babal/mariadb-fresh-bootstrap-defaults.sql',root),'utf8');
 for(const parse of [sqlStatements,splitFixtureSql]){
  const original=parse(base),a=parse(completion),b=parse(fresh),combined=parse(base+'\n'+completion+'\n'+fresh);
  assert.equal(a.length,1);assert.equal(b.length,1);assert.equal(combined.length,1779);
  assert.deepEqual(combined.slice(0,-2),original);assert.equal(combined.at(-2),a[0]);assert.equal(combined.at(-1),b[0]);
 }
});
