import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hostedAuthProjectFixture } from './helpers/hosted-auth-project-fixture';
import { inspectReadiness } from '../lib/operations/readiness';
import manifest from '../deployment/babal/release-manifest.json';
import nativeFeeMetadata from './helpers/mariadb-fee-readiness-metadata.json';

void test('native readiness verifies the actual reserved predicate and parent ID collation',async()=>{
  const inspect=async(expression:string,collation='utf8mb4_unicode_ci')=>inspectReadiness({dialect:'mariadb',prepare(sql:string){return{async all(){
    if(sql.includes('information_schema.COLUMNS'))return{results:Object.entries(manifest.requiredTables).flatMap(([tableName,names])=>names.map(columnName=>({tableName,columnName,generationExpression:expression,collation:tableName==='managed_payout_allocations'?collation:manifest.requiredColumnCollations[`${tableName}.${columnName}` as keyof typeof manifest.requiredColumnCollations]??'utf8mb4_unicode_ci'})))};
    if(sql.includes('information_schema.STATISTICS'))return{results:Object.entries(manifest.requiredUniqueIndexes).flatMap(([key,columns])=>columns.map((columnName,i)=>({tableName:key.split('.')[0],name:key.split('.')[1],nonUnique:0,position:i+1,columnName,prefixLength:null})))};
    if(sql.includes('information_schema.TRIGGERS'))return{results:Object.entries(manifest.requiredTriggers).map(([name,parts])=>({name,definition:nativeFeeMetadata.triggers.find(row=>row.name===name)?.definition??(parts.join(' ')||'BEGIN SIGNAL END'),tableName:manifest.requiredTriggerShapes[name as keyof typeof manifest.requiredTriggerShapes]?.table,event:manifest.requiredTriggerShapes[name as keyof typeof manifest.requiredTriggerShapes]?.event,timing:'BEFORE'}))};
    if(sql.includes('information_schema.KEY_COLUMN_USAGE'))return{results:Object.entries(manifest.requiredForeignKeys).flatMap(([key,fk])=>fk.columns.map((columnName,i)=>({tableName:key.split('.')[0],name:key.split('.')[1],columnName,position:i+1,referencedTable:fk.referencedTable,referencedColumn:fk.referencedColumns[i],referencedSchema:'fixture',databaseName:'fixture',deleteRule:'RESTRICT',updateRule:'RESTRICT'})))};
    if(sql.includes('FROM marketplace_fee_waiver_control')||sql.includes('FROM customer_fee_waiver_control'))return{results:[{id:'default',revision:0}]};
    if(sql.includes('information_schema.CHECK_CONSTRAINTS'))return{results:Object.entries(manifest.requiredChecks).map(([key,parts])=>nativeFeeMetadata.checks.find(row=>row.tableName+'.'+row.name===key)??({tableName:key.split('.')[0],name:key.split('.')[1],definition:parts.join(' ')}))};
    return{results:[]};
  }};}} as unknown as D1Database);
  const actual="case when cast(`disposition` as char charset binary) = 'reserved' then `entitlement_id` else NULL end";
  assert.deepEqual(await inspect(actual),{ready:true,missing:[]});
  for(const broken of [actual.replace("= 'reserved'","<> 'reserved'"),actual.replace("'reserved'","'RESERVED'"),actual.replace('else NULL','else entitlement_id')])
    assert.ok((await inspect(broken)).missing.includes('generated-column-version:managed_payout_allocations.reserved_entitlement_key'));
  assert.ok((await inspect(actual,'utf8mb4_bin')).missing.includes('column-collation:managed_payout_allocations.reserved_entitlement_key'));
});

void test('native readiness rejects a missing allocation reservation unique guard', async () => {
  const db = { dialect: 'mariadb', prepare(sql: string) { return { async all() {
    if (sql.includes('information_schema.COLUMNS')) return { results: Object.entries(manifest.requiredTables).flatMap(([tableName, names]) => names.map(columnName => ({tableName, columnName}))) };
    if (sql.includes('information_schema.TRIGGERS')) return { results: Object.entries(manifest.requiredTriggers).map(([name, parts]) => ({name, definition: parts.join(' ')})) };
    if (sql.includes('information_schema.CHECK_CONSTRAINTS')) return { results: Object.entries(manifest.requiredChecks).map(([key, parts]) => ({tableName:key.split('.')[0],name:key.split('.')[1], definition:parts.join(' ')})) };
    return { results: [] };
  } }; } } as unknown as D1Database;
  const state = await inspectReadiness(db);
  assert.equal(state.ready, false);
  assert.ok(state.missing.includes('index:managed_payout_allocations.managed_allocation_one_reservation'));
});

void test('readiness uses SQLite metadata for a D1 binding without a MariaDB dialect tag', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT PRIMARY KEY)');
  const queries: string[] = [];
  const database = {
    prepare(sql: string) {
      queries.push(sql);
      return { async all() { return { results: sqlite.prepare(sql).all() }; } };
    },
  } as unknown as D1Database;
  try {
    const result = await inspectReadiness(database);
    assert.equal(result.ready, false);
    assert.ok(result.missing.includes('table:orders'));
    assert.ok(result.missing.includes('column:users.email'));
    assert.equal(result.missing.includes('database-unavailable'), false);
    assert.ok(queries.some((sql) => sql.startsWith('PRAGMA table_info(')));
    assert.equal(queries.some((sql) => sql.includes('information_schema')), false);
  } finally { sqlite.close(); }
});

void test('readiness keeps information_schema checks for a tagged MariaDB adapter', async () => {
  const queries: string[] = [];
  const database = {
    dialect: 'mariadb',
    prepare(sql: string) {
      queries.push(sql);
      return { async all() { return { results: [] }; } };
    },
  } as unknown as D1Database;
  const result = await inspectReadiness(database);
  assert.equal(result.ready, false);
  assert.ok(result.missing.includes('table:orders'));
  assert.equal(result.missing.includes('database-unavailable'), false);
  assert.ok(queries.some((sql) => sql.includes('information_schema.COLUMNS')));
  assert.ok(queries.some((sql) => sql.includes('information_schema.CHECK_CONSTRAINTS')));
  assert.equal(queries.some((sql) => sql.startsWith('PRAGMA ')), false);
});

void test('fully migrated SQLite with local auth prerequisites is ready without the MariaDB release tracker', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const directory = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const isolatedProject = await hostedAuthProjectFixture();
  const backup = join(isolatedProject.recovery, `readiness-${crypto.randomUUID()}.sqlite`);
  try {
    for (const name of (await readdir(directory)).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort())
      sqlite.exec(await readFile(directory + name, 'utf8'));
    await isolatedProject.prepareHostedAuthSchema(sqlite, backup);
    const db = { prepare(sql: string) { return { async all() {
      return { results: sqlite.prepare(sql).all() };
    } }; } } as unknown as D1Database;
    assert.deepEqual(await inspectReadiness(db), { ready: true, missing: [] });
    const feeGuard = String(sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='order_item_marketplace_fees_no_update'").get()!.sql);
    sqlite.exec("DROP TRIGGER order_item_marketplace_fees_no_update; CREATE TRIGGER order_item_marketplace_fees_no_update BEFORE UPDATE ON order_item_marketplace_fees WHEN 0 BEGIN SELECT RAISE(ABORT,'marketplace_fee_snapshot_immutable'); END");
    assert.ok((await inspectReadiness(db)).missing.includes('trigger-version:order_item_marketplace_fees_no_update'));
    sqlite.exec('DROP TRIGGER order_item_marketplace_fees_no_update; ' + feeGuard);
    sqlite.exec('DROP TRIGGER order_items_require_available_inventory');
    const missing = await inspectReadiness(db);
    assert.equal(missing.ready, false);
    assert.ok(missing.missing.includes('trigger:order_items_require_available_inventory'));
  } finally { sqlite.close(); await isolatedProject.dispose(); }
});
