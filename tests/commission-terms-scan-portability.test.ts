import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {historicalCommissionDatabase} from './helpers/commission-database';
import {processFeeTermsScan} from '../lib/commission/terms-followup';
void test('fee scanner preserves its cursor across bounded pages using portable quoted SQL',async()=>{
 const f=await historicalCommissionDatabase(true);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const source=await readFile(new URL('../deployment/babal/mariadb-common-fee-policies.sql',import.meta.url),'utf8');assert.match(source,/CREATE TABLE commission_terms_scan_state\([^;]*`cursor` VARCHAR\(191\) NOT NULL DEFAULT ''/);
 const seen:string[]=[],db={prepare(sql:string){if(sql.includes('commission_terms_scan_state')){seen.push(sql);assert.match(sql,/`cursor`/,'The same existing cursor identifier must be quoted for MariaDB.');}return f.database.prepare(sql);},batch:f.database.batch.bind(f.database)} as D1Database;
 const ids=f.sqlite.prepare("SELECT s.id FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE u.status='active' AND s.status IN('submitted','under_review','approved') ORDER BY s.id").all().map(row=>String(row.id));assert.equal(ids.length,2);
 const before=Number(f.sqlite.prepare("SELECT revision FROM commission_terms_scan_state WHERE id='default'").get()!.revision),now=Date.UTC(2026,10,3);
 const first=await processFeeTermsScan(db,now,1);assert.equal(first.scanned,1);assert.equal(first.cursor,ids[0]);assert.deepEqual(first.failures,[]);
 const second=await processFeeTermsScan(db,now+1,1);assert.equal(second.scanned,1);assert.equal(second.cursor,ids[1]);assert.deepEqual(second.failures,[]);
 const exhausted=await processFeeTermsScan(db,now+2,1);assert.equal(exhausted.scanned,0);assert.equal(exhausted.cursor,'');assert.deepEqual(exhausted.failures,[]);
 const state=f.sqlite.prepare("SELECT `cursor`,revision FROM commission_terms_scan_state WHERE id='default'").get()!;assert.equal(state.cursor,'');assert.equal(state.revision,before+3);assert.equal(seen.length,6);
 }finally{await f.dispose();}
});
