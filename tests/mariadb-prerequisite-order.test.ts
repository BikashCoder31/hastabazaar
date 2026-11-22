import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
void test('generated Maria schema includes exact nullable seller-registration prerequisites before identity triggers',async()=>{
 const[rawSource,rawSchema]=await Promise.all([readFile(new URL('../deployment/babal/mariadb-seller-registration.sql',import.meta.url),'utf8'),readFile(new URL('../deployment/babal/mariadb-schema.sql',import.meta.url),'utf8')]);
 const source=rawSource.trim().replaceAll('\r\n','\n'),schema=rawSchema.replaceAll('\r\n','\n');
 const base=schema.indexOf('CREATE TABLE IF NOT EXISTS `seller_profiles`'),prerequisite=schema.indexOf(source),dependent=schema.indexOf('CREATE TRIGGER seller_identity_revision_changed');
 assert.ok(base>=0);assert.ok(prerequisite>base,'Include the complete authoritative registration source after the base table, preserving its NULL legacy and generated-key/index rules.');assert.ok(dependent>prerequisite,'Identity trigger must follow the applicant_type prerequisite.');
 assert.match(source,/ADD COLUMN IF NOT EXISTS applicant_type VARCHAR\(20\) NULL/);assert.doesNotMatch(source,/UPDATE\s+seller_profiles\s+SET\s+applicant_type/i);
});

void test('fresh Maria generation places original accounting prerequisites before dependent views without policy activation',async()=>{
 const fsPromises=await import('node:fs/promises'),path=await import('node:path'),url=await import('node:url'),childProcess=await import('node:child_process');
 const project=url.fileURLToPath(new URL('../',import.meta.url)),output=await fsPromises.mkdtemp(path.resolve(project,'.test-artifacts/mariadb-cancellation-order-'));
 childProcess.execFileSync(process.execPath,[path.resolve(project,'scripts/generate-mariadb-schema.mjs'),'--output-directory='+output],{cwd:project,encoding:'utf8'});
 const[rawSource,rawSchema]=await Promise.all([readFile(new URL('../deployment/babal/mariadb-partial-cancellation.sql',import.meta.url),'utf8'),readFile(path.resolve(output,'mariadb-schema.sql'),'utf8')]);
 const source=rawSource.trim().replaceAll('\r\n','\n'),schema=rawSchema.replaceAll('\r\n','\n'),prerequisite=schema.indexOf(source),view=schema.indexOf('CREATE VIEW manual_payment_balances AS');
 assert.ok(prerequisite>=0,'Append the complete authoritative cancellation source, preserving original tables, constraints and immutable history guards.');assert.ok(view>prerequisite,'Payment balances must follow the original cancellation accounting tables.');assert.ok(schema.indexOf('CREATE TABLE IF NOT EXISTS wallet_entries')<prerequisite);
 assert.match(source,/ADD CONSTRAINT IF NOT EXISTS chk_cancellation_totals/);assert.equal((source.match(/ADD COLUMN /g)??[]).length,(source.match(/ADD COLUMN IF NOT EXISTS /g)??[]).length);
 assert.equal((schema.match(/CREATE TRIGGER wallet_cancel_restore /g)??[]).length,2,'The full source deliberately replaces the earlier identical extracted wallet trigger.');assert.ok(schema.indexOf('DROP TRIGGER IF EXISTS wallet_cancel_restore;',prerequisite)>prerequisite);
 for(const column of ['commission_base_refunded_paisa','commission_reversal_paisa']){const statement=`ALTER TABLE refunds ADD COLUMN IF NOT EXISTS ${column} BIGINT NOT NULL DEFAULT 0;`;assert.ok(schema.includes(statement),'Retain the exact original refund accounting column definition: '+column);assert.ok(schema.indexOf(statement)<schema.indexOf('CREATE VIEW seller_recovery_original_source_pools'));}
 assert.doesNotMatch(schema,/INSERT\s+(?:IGNORE\s+)?INTO\s+marketplace_settings\s*\([^;]*?VALUES\s*\(\s*'seller_commission_bps:commission-9pct-v1'/i);
});
