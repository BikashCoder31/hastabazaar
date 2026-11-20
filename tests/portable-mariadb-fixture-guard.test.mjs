import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {assertUnder,splitFixtureSql,importFixtureSql,createFixtureDatabase,probePortableMariaFixture} from '../scripts/portable-mariadb-fixture.mjs';
void test('portable fixture refuses parent/root targets, forged import connections and malformed fixture IDs without touching data',async()=>{
 const root=resolve('test-artifacts/mariadb/guard-fixture');
 assert.equal(assertUnder(root,resolve(root,'data')),resolve(root,'data'));
 assert.throws(()=>assertUnder(root,root));assert.throws(()=>assertUnder(root,resolve(root,'../other-fixture')));
 await assert.rejects(importFixtureSql({root,connection:{query(){throw new Error('Must never query');}}},resolve('.env.local')),/currently verified owned connection/);
 await assert.rejects(createFixtureDatabase({root,connection:{query(){throw new Error('Must never query');}}},'arbitrary'));
 await assert.rejects(probePortableMariaFixture('../../.staging'));
});
void test('portable schema splitter respects trigger delimiters and rejects unterminated input',()=>{
 const statements=splitFixtureSql('-- comment only;\nCREATE TABLE x(id INT);\nDELIMITER $$\nCREATE TRIGGER x_guard BEFORE INSERT ON x FOR EACH ROW BEGIN IF NEW.id<0 THEN SIGNAL SQLSTATE \'45000\'; END IF; END$$\nDELIMITER ;\n-- trailing comment');
 assert.equal(statements.length,2);assert.match(statements[1],/SIGNAL SQLSTATE '45000'; END IF; END$/);assert.throws(()=>splitFixtureSql('CREATE TABLE unfinished(id INT)'));
});
