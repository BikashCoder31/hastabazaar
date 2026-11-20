import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {extractCreateTables,extractTriggerNames} from '../lib/operations/sql-schema-inventory.mjs';
const directory='.test-artifacts/t33/complete-bootstrap-parity-astra-20261105';
void test('release inventory includes bare CREATE tables without borrowing later table columns',async()=>{
 await mkdir(directory,{recursive:true});
 const output=directory+'/manifest-inventory-test.json';
 execFileSync(process.execPath,['scripts/generate-release-manifest.mjs','--output='+output],{stdio:'pipe'});
 const {requiredTables:tables,requiredTriggers:triggers}=JSON.parse(await readFile(output,'utf8'));
 for(const name of ['email_transport_backoff','operational_notice_states','operational_reminder_cursors','operational_reminder_milestones','service_health_guards'])assert.ok(tables[name],name+' is required current storage');
 assert.deepEqual(tables.service_health_guards,['id','valid']);
 assert.ok(!tables.email_transport_backoff.includes('owner_id'),'must not borrow columns from a later CREATE');
 assert.ok(triggers.refund_obligation_source_retained,'CREATE OR REPLACE trigger is required current protection');
 assert.ok(tables.request_rate_limits.includes('key'),'quoted KEY is a column, not an index clause');
});
void test('structural inventory respects nested checks, quoted punctuation and comments',()=>{
 const sql="-- CREATE TABLE ghost (fake INT);\nCREATE TABLE `one` (`key` VARCHAR(32), value DECIMAL(10,2) DEFAULT 0, note TEXT DEFAULT '); CREATE TABLE fake (id INT);', CHECK(value IN (1,2)));\n/* CREATE TABLE ghost2(id INT); */ CREATE TABLE two (id INT, CONSTRAINT valid CHECK (id>0)) ENGINE=InnoDB;";
 assert.deepEqual(extractCreateTables(sql).map(t=>[t.name,t.columns.map(c=>c.name)]),[['one',['key','value','note']],['two',['id']]]);
 assert.deepEqual(extractTriggerNames("-- CREATE TRIGGER ghost\nCREATE OR REPLACE TRIGGER `real` BEFORE UPDATE ON one FOR EACH ROW SET @s='CREATE TRIGGER fake'; CREATE TRIGGER IF NOT EXISTS other BEFORE DELETE ON one FOR EACH ROW SET @s=1;"),['real','other']);
 assert.throws(()=>extractCreateTables('CREATE TABLE broken (id INT;'),/Unclosed/);
 assert.deepEqual(extractTriggerNames('CREATE TRIGGER retired BEFORE DELETE ON one FOR EACH ROW SET @x=1; DROP TRIGGER IF EXISTS retired; CREATE OR REPLACE TRIGGER current BEFORE DELETE ON one FOR EACH ROW SET @x=2;'),['current']);
});
