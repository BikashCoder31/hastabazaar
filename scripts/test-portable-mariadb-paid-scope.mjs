/** Isolated query-equivalence fixture only; no application tables/data are loaded. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {withPortableMariaFixture,createFixtureDatabase,assertUnder} from './portable-mariadb-fixture.mjs';
import {positiveOriginalPaidSql} from '../lib/payments/recovery-partial-paid-source.ts';
import {paidScopeTables,paidScopeSchema,paidScopeRows,paidScopeExpected} from '../tests/helpers/original-paid-scope-fixture.ts';
assert.equal(process.argv.length,3);const id=process.argv[2];assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);
await withPortableMariaFixture(id,async fixture=>{
 const database=await createFixtureDatabase(fixture,'paid_scope_'+randomUUID().slice(0,8));
 for(const sql of paidScopeSchema)await fixture.connection.query(sql);
 for(const[table,rows]of Object.entries(paidScopeRows())){const columns=paidScopeTables[table].columns;for(const row of rows)await fixture.connection.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,row);}
 const expression=model=>positiveOriginalPaidSql(model,'native_source.scope_id','native_source.seller_id','mariadb');
 await fixture.connection.query(`CREATE VIEW fixture_original_paid_basis AS SELECT paid_scopes.* FROM (SELECT native_source.scope_id scopeId,native_source.seller_id sellerId,${expression('registered')} registeredPaisa,${expression('managed')} managedPaisa FROM (SELECT scope_id,seller_id FROM requested) native_source) paid_scopes`);
 const[raw]=await fixture.connection.query('SELECT * FROM fixture_original_paid_basis ORDER BY scopeId,sellerId'),rows=raw.map(row=>({...row,registeredPaisa:Number(row.registeredPaisa),managedPaisa:Number(row.managedPaisa)}));
 assert.deepEqual(rows,paidScopeExpected);
 const result={status:'PASS',version:fixture.facts.version,database,rows,scope:'isolated signed positive-paid query equivalence; no application finance rows'};
 const path=assertUnder(fixture.root,join(fixture.root,'paid-scope-'+randomUUID()+'.json'));await writeFile(path,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({...result,evidencePath:path}));
});
