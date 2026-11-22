import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

void test('system ownership preserves exact scalar/null comparisons and truthful boolean receipts in Maria source',async()=>{
 const loadedFixtureModule=await import('../lib/operations/system-ownership-schema.mjs').catch(()=>null);
 assert.equal(typeof loadedFixtureModule?.mariaSystemOwnershipSchema,'function');
 const source=await readFile(new URL('../drizzle/0152_review_task_system_ownership.sql',import.meta.url),'utf8');
 const native=loadedFixtureModule.mariaSystemOwnershipSchema(source);
 assert.match(native,/DROP TRIGGER product_priority_case_revision;/);
 assert.equal((native.match(/FOR EACH ROW BEGIN/g)||[]).length,3);
 assert.match(native,/JSON_CONTAINS\(a.command_result_json,'true','\$\.system'\)=1/);
 assert.match(native,/JSON_TYPE\(JSON_EXTRACT\(a.command_result_json,'\$\.system'\)\)='BOOLEAN'/);
 assert.match(native,/BINARY JSON_VALUE\(a.command_result_json,'\$\.ownerId'\)<=>BINARY t.owner_id/);
 assert.match(native,/BINARY NEW.state=BINARY OLD.state/);
 assert.match(native,/BINARY a.action=BINARY 'review_task.coverage_rerouted'/);
 assert.match(native,/NOT\(BINARY NEW.command_result_json<=>BINARY OLD.command_result_json\)/);
 assert.match(native,/NEW.revision<>\(OLD.revision\+1\)/);
 assert.doesNotMatch(native.replace(/JSON_TYPE\(JSON_EXTRACT\(a\.command_result_json,'\$\.system'\)\)='BOOLEAN'/g,''),/json_extract|RAISE\s*\(|\bIS\s+(?:NOT\s+)?(?:NEW|OLD|t)\./i);
 assert.equal(loadedFixtureModule.mariaSystemOwnershipSchema(source.replace(/\r?\n/g,'\r\n')),native);
});
