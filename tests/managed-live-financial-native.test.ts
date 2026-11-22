import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {earnedMaker} from './helpers/company-store-financial-fixture';
import {prepareManagedPayout} from '../lib/managed-commerce/payout-operations';

const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const canonical=(rows:Record<string,unknown>[])=>rows.map(r=>JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a],[b])=>a.localeCompare(b))))).sort();
void test('native D1 populated pre0146 transition retains historical rows, original labels, foreign keys and source triggers',async()=>{
 const source=await earnedMaker();let mf:Miniflare|undefined;
 try{
 assert.ok(source.sqlite.prepare('PRAGMA database_list').all().every(r=>r.file===''));
 const payoutId=await prepareManagedPayout(source.db,{...source.context,requestId:'native-preserved-simulation-payout'});
 source.sqlite.prepare("INSERT INTO managed_invoice_groups(id,order_id,issuer_reference,invoice_number,snapshot_json,barcode_payload,qr_payload,simulation_label,status,request_id,issued_at) VALUES('legacy-invoice',?,'original-company','SIM-ORIGINAL-100','{}','original-barcode','original-qr','SIMULATED — RETAINED INVOICE','issued','native-original-invoice',1)").run(source.orderId);
 source.sqlite.exec("INSERT INTO managed_invoice_adjustments(id,invoice_group_id,adjustment_number,kind,amount_paisa,reason_code,note,snapshot_json,simulation_label,request_id,created_by,issued_at) VALUES('legacy-adjustment','legacy-invoice','SIM-ORIGINAL-CREDIT','credit_note',100,'refund','Original private adjustment note','{}','SIMULATED — RETAINED CREDIT','native-original-adjustment','reviewer',2)");
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("isolated native preservation fixture")}}',d1Databases:{DB:randomUUID()},d1Persist:false}));
 const db=await mf.getD1Database('DB') as unknown as D1Database;
 const names=(await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>/^\d{4}_.+\.sql$/.test(n)&&n<'0146_').sort();
 const statements=(sql:string)=>sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(s=>s.split(/\r?\n/).some(l=>l.trim()&&!l.trim().startsWith('--')));
 for(const name of names){let pending:D1PreparedStatement[]=[];for(const sql of statements(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'))){if(/^\s*(?:--[^\n]*\n\s*)*PRAGMA\b/i.test(sql)){if(pending.length)await db.batch(pending);pending=[];await db.prepare(sql).run();}else{pending.push(db.prepare(sql));if(pending.length===100){await db.batch(pending);pending=[];}}}if(pending.length)await db.batch(pending);}
 const tables=(await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all<{name:string}>()).results;
 const oldTriggers=(await db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all<{name:string;sql:string}>()).results;
 for(let i=0;i<oldTriggers.length;i+=25)await db.batch(oldTriggers.slice(i,i+25).map(t=>db.prepare('DROP TRIGGER '+quote(t.name))));
 const load=[db.prepare('PRAGMA defer_foreign_keys=ON')];
 for(const table of tables){
  const columns=(await db.prepare('PRAGMA table_xinfo('+quote(table.name)+')').all<{name:string;hidden:number}>()).results.filter(c=>c.hidden===0).map(c=>c.name);
  load.push(db.prepare('DELETE FROM '+quote(table.name)));
  for(const row of source.sqlite.prepare('SELECT '+columns.map(quote).join(',')+' FROM '+quote(table.name)).all())load.push(db.prepare('INSERT INTO '+quote(table.name)+'('+columns.map(quote).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').bind(...columns.map(c=>row[c])));
 }
 await db.batch(load);
 for(let i=0;i<oldTriggers.length;i+=25)await db.batch(oldTriggers.slice(i,i+25).map(t=>db.prepare(t.sql)));
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 const retained=new Map<string,{columns:string[];rows:Record<string,unknown>[]} >();
 for(const t of tables){const columns=(await db.prepare('PRAGMA table_xinfo('+quote(t.name)+')').all<{name:string;hidden:number}>()).results.filter(c=>c.hidden!==1).map(c=>c.name);const rows=(await db.prepare('SELECT '+columns.map(quote).join(',')+' FROM '+quote(t.name)).all<Record<string,unknown>>()).results;retained.set(t.name,{columns,rows});}
 const migration=await readFile(new URL('../drizzle/0146_managed_live_financial.sql',import.meta.url),'utf8');assert.doesNotMatch(migration,/DROP TABLE|foreign_keys\s*=\s*OFF/i);
 await db.batch(statements(migration).map(s=>db.prepare(s)));
 for(const [table,prior] of retained){const after=(await db.prepare('SELECT '+prior.columns.map(quote).join(',')+' FROM '+quote(table)).all<Record<string,unknown>>()).results;assert.deepEqual(canonical(after),canonical(prior.rows),table+' original rows preserved');}
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 const afterTriggers=(await db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all<{name:string;sql:string}>()).results;
 for(const prior of oldTriggers)assert.ok(afterTriggers.some(t=>t.name===prior.name&&t.sql===prior.sql),'Original trigger retained: '+prior.name);
 assert.equal((await db.prepare('SELECT record_kind AS kind FROM managed_payouts WHERE id=?').bind(payoutId).first<{kind:string}>())!.kind,'simulation');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM managed_commercial_snapshots WHERE live_customer_id IS NOT NULL').first<{n:number}>())!.n,0,'Historical simulation buyer facts are not invented.');
 await assert.rejects(db.prepare("UPDATE managed_commercial_snapshots SET simulation_label=NULL").run(),/immutable/);
 }finally{await mf?.dispose();source.dispose();}
});

