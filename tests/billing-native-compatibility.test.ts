import assert from 'node:assert/strict';
import test from 'node:test';
import {translateSqliteSql} from '../lib/runtime/node-bindings';
import {sellerSkuSql} from '../lib/products/stock-codes';

void test('native billing queries preserve text JSON semantics and concatenate seller addresses',()=>{
  const sql=translateSqliteSql(sellerSkuSql());
  assert.match(sql,/JSON_TYPE\(JSON_EXTRACT\(stock_answer.answers_json,'\$\.productIdentity.sellerSku'\)\)='STRING'/);
  assert.match(sql,/JSON_UNQUOTE\(JSON_EXTRACT\(stock_answer.answers_json,'\$\.productIdentity.sellerSku'\)\)/);
  const address="(seller_profiles.locality || ', ' || seller_profiles.municipality || ', ' || seller_profiles.district || ', ' || seller_profiles.province || ', Nepal')";
  assert.match(translateSqliteSql(address),/CONCAT\(seller_profiles.locality/);
  assert.match(translateSqliteSql("SELECT json_extract(d.snapshot_json,'$.billing.receiptGroups[0].key')"),/JSON_UNQUOTE/);
  const text="SELECT 'json_extract(d.snapshot_json,''$.billing.version'')' /* json_type(stock_answer.answers_json,'$.productIdentity.sellerSku')='text' */";
  assert.equal(translateSqliteSql(text),text);
});
