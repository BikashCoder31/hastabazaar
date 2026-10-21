import assert from 'node:assert/strict';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
import { receiptNumberStatements } from '../lib/db/repositories/billing-documents';
import type { OrderDocumentSnapshot } from '../lib/db/repositories/orders';

void test('receipt numbering is per issuer, replay safe and rolls back with its parent transaction',async()=>{
  const f=securityDatabase();
  try{
    f.sqlite.exec(`CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,
      reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
      CREATE TABLE order_documents(id TEXT PRIMARY KEY,request_id TEXT UNIQUE,snapshot_json TEXT,status TEXT);`);
    const snapshot={billing:{version:'approved-2026-10-21',receiptIssuance:'simulation',receiptGroups:[{key:'issuer-a',billNumber:null},{key:'issuer-b',billNumber:null}]}} as unknown as OrderDocumentSnapshot;
    async function insert(requestId:string,fail=false){
      const statements=[f.db.prepare("INSERT OR IGNORE INTO order_documents VALUES (?,?,?,'issued')")
        .bind(requestId,requestId,JSON.stringify(snapshot)),...await receiptNumberStatements(f.db,{snapshot,requestId,now:10})];
      if(fail)statements.push(f.db.prepare('INSERT INTO operation_transaction_guards VALUES (?,0)').bind('rollback'));
      return f.db.batch(statements);
    }
    await insert('first');await insert('first');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n,2);
    await assert.rejects(insert('failed',true));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM order_documents WHERE id='failed'").get()?.n,0);
    await Promise.all([insert('second'),insert('third')]);
    const groups=(id:string)=>JSON.parse(String(f.sqlite.prepare('SELECT snapshot_json FROM order_documents WHERE id=?').get(id)?.snapshot_json)).billing.receiptGroups;
    assert.deepEqual(groups('first').map((g:{billSequence:number})=>g.billSequence),[1,1]);
    assert.deepEqual([groups('second')[0].billSequence,groups('third')[0].billSequence].sort((a,b)=>a-b),[2,3]);
    assert.deepEqual(groups('first').map((g:{billSequence:number})=>g.billSequence),[1,1]);
  }finally{f.dispose();}
});
