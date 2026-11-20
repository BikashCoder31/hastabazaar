import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generatePublicFeedbackMariaSql} from '../lib/forms/public-feedback-schema.mjs';

void test('native public feedback Maria guards are generated from all actual source guards without replacing old history',async()=>{
 const source=await readFile(new URL('../drizzle/0154_native_public_feedback_defaults.sql',import.meta.url),'utf8');
 const actual=await readFile(new URL('../deployment/babal/mariadb-native-public-feedback-defaults.sql',import.meta.url),'utf8');
 assert.equal(actual,generatePublicFeedbackMariaSql(source));
 assert.equal((actual.match(/CREATE TRIGGER/g)??[]).length,5);
 assert.match(actual,/MODIFY COLUMN `config_version_id` VARCHAR\(191\) COLLATE utf8mb4_nopad_bin NULL/);
 assert.match(actual,/CHECK \(JSON_TYPE\(`feedback_json`\)='OBJECT'\)/,'The native transition must retain the actual source object-type constraint, beyond JSON validity.');
 assert.doesNotMatch(actual,/DROP TABLE|DROP FOREIGN KEY|FOREIGN_KEY_CHECKS|--\S/);
 assert.equal((actual.match(/JSON_TYPE\(JSON_EXTRACT\(receipt.next_json,'\$\.version'\)\)='INTEGER'/g)??[]).length,2);
 assert.equal((actual.match(/JSON_LENGTH\(JSON_EXTRACT\(receipt.next_json,'\$\.answers'\)\)=0/g)??[]).length,2);
 assert.equal((actual.match(/HEX\(JSON_VALUE\(fact.next_json,'\$\.payloadHash'\)\)=HEX\(NEW.payload_hash\)/g)??[]).length,2);
 assert.throws(()=>generatePublicFeedbackMariaSql(source.replace('CREATE TRIGGER feedback_native_origin_update','CREATE TRIGGER unreviewed_guard')));
 assert.throws(()=>generatePublicFeedbackMariaSql(source.replace("RAISE(ABORT,'Original native feedback facts are immutable')","RAISE(IGNORE)")));
});
