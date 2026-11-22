import assert from 'node:assert/strict';
import test from 'node:test';
import {translateSqliteSql} from '../lib/runtime/node-bindings';

void test('MariaDB recovery ownership and public explanations extract scalar values without JSON quotation',()=>{
 const sql="SELECT json_extract(c.original_source_json,'$.ownerId') AS ownerId,json_extract(c.original_source_json,'$.customerId') AS customerId,json_extract(details_json,'$.publicMessage') AS message FROM seller_recovery_cases c WHERE json_extract(c.original_source_json,'$.ownerId')=?";
 const translated=translateSqliteSql(sql);
 assert.equal(translated,"SELECT JSON_VALUE(c.original_source_json,'$.ownerId') AS ownerId,JSON_VALUE(c.original_source_json,'$.customerId') AS customerId,JSON_VALUE(details_json,'$.publicMessage') AS message FROM seller_recovery_cases c WHERE JSON_VALUE(c.original_source_json,'$.ownerId')=?");
});
void test('recovery scalar translation does not execute quoted text, comments or unrelated JSON expressions',()=>{
 const sql="SELECT 'json_extract(details_json,''$.publicMessage'')',json_extract(unrelated_json,'$.ownerId'),json_extract(details_json,'$.ownerId') /* json_extract(c.original_source_json,'$.ownerId') */ -- json_extract(c.original_source_json,'$.customerId')\n";
 assert.equal(translateSqliteSql(sql),sql);
});
