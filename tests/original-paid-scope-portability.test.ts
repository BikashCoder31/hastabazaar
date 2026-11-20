import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {positiveOriginalPaidSql} from '../lib/payments/recovery-partial-paid-source';
import {paidScopeTables,paidScopeSchema,paidScopeRows,paidScopeExpected} from './helpers/original-paid-scope-fixture';
void test('Maria positive original scope rewrite preserves signed payout groups and managed native/legacy exclusivity',()=>{
 const db=new DatabaseSync(':memory:');try{
 assert.ok(db.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 for(const sql of paidScopeSchema)db.exec(sql);
 for(const [table,rows] of Object.entries(paidScopeRows())){const columns=paidScopeTables[table].columns,insert=db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);for(const row of rows)insert.run(...row);}
 for(const dialect of ['sqlite','mariadb'] as const){const sql=`SELECT requested.scope_id scopeId,requested.seller_id sellerId,${positiveOriginalPaidSql('registered','requested.scope_id','requested.seller_id',dialect)} registeredPaisa,${positiveOriginalPaidSql('managed','requested.scope_id','requested.seller_id',dialect)} managedPaisa FROM requested ORDER BY scopeId,sellerId`;assert.deepEqual(db.prepare(sql).all().map(row=>({...row})),paidScopeExpected);}
 assert.equal(positiveOriginalPaidSql('registered','scope','seller'),positiveOriginalPaidSql('registered','scope','seller','sqlite'));
 }finally{db.close();}
});
