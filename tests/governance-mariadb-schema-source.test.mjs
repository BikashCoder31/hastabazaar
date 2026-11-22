import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {mariaGovernanceSchema} from '../lib/operations/governance-schema.mjs';

void test('governance schema preserves native identity, JSON checks and immutable trigger predicates',()=>{
  const sql="CREATE TABLE sample (id TEXT PRIMARY KEY NOT NULL,permissions_json TEXT CHECK(json_valid(permissions_json) AND json_type(permissions_json)='array'),body TEXT,created_at INTEGER);\nCREATE TRIGGER sample_guard BEFORE UPDATE ON sample WHEN NEW.id IS NOT OLD.id BEGIN SELECT RAISE(ABORT,'immutable_identity'); END;";
  const converted=mariaGovernanceSchema(sql);
  assert.match(converted,/id VARCHAR\(191\) PRIMARY KEY NOT NULL/);
  assert.match(converted,/permissions_json LONGTEXT/);
  assert.match(converted,/JSON_TYPE\(permissions_json\)='ARRAY'/);
  assert.match(converted,/body LONGTEXT/);
  assert.match(converted,/created_at BIGINT/);
  assert.match(converted,/NOT\(BINARY NEW.id<=>BINARY OLD.id\)/);
  assert.match(converted,/SIGNAL SQLSTATE '45000'/);
  assert.match(converted,/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/);
  assert.equal(mariaGovernanceSchema(sql.replace(/\n/g,'\r\n')),converted);
  assert.doesNotMatch(converted,/RAISE\s*\(/);
});
void test('retained original string comparisons cannot fold case or trailing spaces in native collation',()=>{
 const converted=mariaGovernanceSchema("CREATE TRIGGER original BEFORE UPDATE ON procedures WHEN NEW.title<>OLD.title OR NEW.body<>OLD.body BEGIN SELECT RAISE(ABORT,'immutable_original'); END;");
 assert.match(converted,/BINARY NEW.title<>BINARY OLD.title/);
 assert.match(converted,/BINARY NEW.body<>BINARY OLD.body/);
});

void test('unsupported trigger or partial-index conversion stops rather than dropping native guards',()=>{
  assert.throws(()=>mariaGovernanceSchema("CREATE TRIGGER unsupported AFTER INSERT ON x BEGIN SELECT RAISE(ABORT,'stop'); END;"),/Unsupported/);
  assert.throws(()=>mariaGovernanceSchema('CREATE UNIQUE INDEX active_one ON sample(id) WHERE active=1;'),/Unsupported/);
});

for(const [source,target]of [['0149_team_governance.sql','mariadb-team-governance.sql'],['0150_incident_governance.sql','mariadb-incident-governance.sql'],['0151_form_health_records.sql','mariadb-form-health-records.sql']]){
  void test('paired source stays reproducible: '+source,async()=>{
    const sqlite=await readFile(new URL('../drizzle/'+source,import.meta.url),'utf8');
    const maria=await readFile(new URL('../deployment/babal/'+target,import.meta.url),'utf8');
    assert.equal(mariaGovernanceSchema(sqlite),maria);
  });
}
void test('combined empty-import recovery inventory derives every new governance table',async()=>{
 const root=new URL('../',import.meta.url);
 const retainedPaths=['deployment/babal/mariadb-schema.sql','deployment/babal/mariadb-reset-empty-import.sql','deployment/babal/release-manifest.json'];
 const retained=await Promise.all(retainedPaths.map(path=>readFile(new URL(path,root))));
 const directory='.test-artifacts/t34/governance-reset-source-'+randomUUID();
 execFileSync(process.execPath,['scripts/generate-mariadb-schema.mjs','--output-directory='+directory],{cwd:root,stdio:'pipe'});
 const reset=await readFile(new URL(directory+'/mariadb-reset-empty-import.sql',root),'utf8');
 const resetTables=new Set([...reset.matchAll(/^DROP TABLE IF EXISTS `(\w+)`;$/gm)].map(match=>match[1]));
 const sources=['mariadb-team-governance.sql','mariadb-incident-governance.sql','mariadb-form-health-records.sql','mariadb-complete-version-legacy-transitions.sql'];
 for(const source of sources){
  const sql=await readFile(new URL('deployment/babal/'+source,root),'utf8');
  const created=[...sql.matchAll(/CREATE TABLE (\w+)\s*\(/g)].map(match=>match[1]);
  assert.ok(created.length>0,source+' must contribute tables');
  for(const table of created)assert.ok(resetTables.has(table),'Generated reset inventory must contain '+table);
 }
 for(const [index,path]of retainedPaths.entries())assert.deepEqual(await readFile(new URL(path,root)),retained[index],path+' must remain byte-identical');
});
