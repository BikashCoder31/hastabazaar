import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {sqlStatements} from '../scripts/testing/verify-current-native.mjs';
import {splitFixtureSql} from '../scripts/portable-mariadb-fixture.mjs';

void test('actual native importers keep the prerequisite compound block whole and the accepted156 statements exact',async()=>{
 const base=await readFile('.test-artifacts/t35/native-health-schema-astra-20261104/candidate-v3/mariadb-schema.sql','utf8');
 const companion=await readFile('deployment/babal/mariadb-bootstrap-prerequisites.sql','utf8');
 for(const parse of [sqlStatements,splitFixtureSql]){
  const one=parse(companion),original=parse(base),combined=parse(base+'\n'+companion);
  assert.equal(one.length,1,'No comment-only query or split internal semicolons');
  assert.match(one[0],/^BEGIN NOT ATOMIC/);assert.match(one[0],/END IF;/);assert.match(one[0],/END$/);
  assert.equal(original.length,1776);assert.equal(combined.length,1777);
  assert.deepEqual(combined.slice(0,-1),original);assert.equal(combined.at(-1),one[0]);
 }
});
