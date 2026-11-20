import test from 'node:test';
import assert from 'node:assert/strict';
import {sameFeeSqlDefinition} from '../lib/operations/fee-schema-readiness.mjs';
void test('exact readiness accepts Maria unary NOT regexp without losing negation or literal case',()=>{
 const expected="!(cast(`code` as char charset binary) regexp '[^A-Z0-9_-]')";
 assert.equal(sameFeeSqlDefinition(expected,expected),true);
 assert.equal(sameFeeSqlDefinition(" ! ( CAST(code AS CHAR CHARSET BINARY) REGEXP '[^A-Z0-9_-]' ) ",expected),true);
 for(const actual of [expected.slice(1),expected.replace('A-Z','a-z'),expected.replace('!(','!!('),expected+' OR 1=1',expected+' -- comment',expected.replace('regexp','like')])assert.equal(sameFeeSqlDefinition(actual,expected),false,actual);
 assert.equal(sameFeeSqlDefinition('a != b','a ! = b'),false,'!= remains one token');
});
