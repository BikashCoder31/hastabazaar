import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {catalogueSourceLiteral} from '../lib/products/public-catalogue-query';

void test('catalogue source identities use collation-independent native bytes',()=>{
 const maria={dialect:'mariadb'} as unknown as D1Database;
 for(const value of ['source-A','नेपाली','a\0b',"x'); DROP TABLE users; --"]){
  const sql=catalogueSourceLiteral(maria,value);
  assert.match(sql,/^CAST\(X'[0-9a-f]*' AS BINARY\)$/);
  assert.equal(Buffer.from(sql.split("'")[1],'hex').toString('utf8'),value);
 }
 assert.equal(catalogueSourceLiteral(maria,null),'NULL');
 assert.equal(catalogueSourceLiteral(maria,42),'42');
 assert.throws(()=>catalogueSourceLiteral(maria,{}),/Unsupported/);
});

void test('SQLite catalogue source literals retain exact identity, Unicode, NULL and safe text',()=>{
 const sqlite=new DatabaseSync(':memory:'),db={} as D1Database;
 try{
  for(const value of ['Source-A','नेपाली','a\0b',"x'); DROP TABLE users; --"]){
   const sql=catalogueSourceLiteral(db,value);
   // node:sqlite text retrieval truncates NUL; SQL HEX observes retained bytes.
   assert.equal(sqlite.prepare(`SELECT HEX(${sql}) AS value`).get()!.value,Buffer.from(value).toString('hex').toUpperCase());
   assert.equal(sqlite.prepare(`SELECT ${sql}=? AS same`).get(value)!.same,1);
   assert.equal(sqlite.prepare(`SELECT ${sql}=? AS same`).get(value+' ')!.same,0);
  }
  assert.equal(sqlite.prepare(`SELECT ${catalogueSourceLiteral(db,'Source-A')}='source-a' AS same`).get()!.same,0);
  assert.equal(sqlite.prepare(`SELECT ${catalogueSourceLiteral(db,null)}='x' AS same`).get()!.same,null);
 }finally{sqlite.close();}
});
