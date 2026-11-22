import assert from 'node:assert/strict';
import test from 'node:test';
import {convertV4MiniflareOptions,Miniflare} from 'miniflare';
import {receiptNumberStatements} from '../lib/db/repositories/billing-documents';
import type {OrderDocumentSnapshot} from '../lib/db/repositories/orders';

void test('ephemeral D1 serializes issuer reservations, replay and rollback without opening retained data',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',d1Databases:{DB:crypto.randomUUID()}}));
  try{
    const db=await mf.getD1Database('DB');
    await db.exec(`CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
      CREATE TABLE order_documents(id TEXT PRIMARY KEY,request_id TEXT UNIQUE,snapshot_json TEXT,status TEXT);
      CREATE TABLE fail_guard(valid INTEGER CHECK(valid=1));`);
    const snapshot={billing:{version:'approved-2026-10-21',receiptIssuance:'simulation',receiptGroups:[{key:'issuer-a'},{key:'issuer-b'}]}} as unknown as OrderDocumentSnapshot;
    const insert=async(requestId:string,fail=false,parent=true)=>{
      const statements=[...(parent?[db.prepare("INSERT OR IGNORE INTO order_documents VALUES (?,?,?,'issued')").bind(requestId,requestId,JSON.stringify(snapshot))]:[]),
        ...await receiptNumberStatements(db,{snapshot,requestId,now:1})];
      if(fail)statements.push(db.prepare('INSERT INTO fail_guard VALUES (0)'));
      return db.batch(statements);
    };
    await Promise.all([insert('one'),insert('two'),insert('one')]);
    const read=async(id:string)=>JSON.parse((await db.prepare('SELECT snapshot_json AS json FROM order_documents WHERE id=?').bind(id).first<{json:string}>())!.json);
    const one=await read('one'),two=await read('two');
    assert.deepEqual([one.billing.receiptGroups[0].billSequence,two.billing.receiptGroups[0].billSequence].sort((a,b)=>a-b),[1,2]);
    assert.deepEqual(one.billing.receiptGroups.map((g:{billSequence:number})=>g.billSequence),[one.billing.receiptGroups[0].billSequence,one.billing.receiptGroups[0].billSequence]);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM audit_logs').first<{n:number}>())!.n,4);
    await assert.rejects(insert('failed',true));await insert('absent',false,false);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM audit_logs').first<{n:number}>())!.n,4);
    await insert('three');assert.equal((await read('three')).billing.receiptGroups[0].billSequence,3);
    assert.deepEqual(await read('one'),one);
    const pending={...snapshot,billing:{...snapshot.billing!,receiptIssuance:'pending_clearance' as const}};
    assert.deepEqual(await receiptNumberStatements(db,{snapshot:pending,requestId:'commercial',now:1}),[]);
  }finally{await mf.dispose();}
});
