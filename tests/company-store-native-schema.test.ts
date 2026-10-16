import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb} from './helpers/incentive-db';
void test('native D1 applies every additive maker statement and preserves all history guards',async()=>{
 const f=await createIncentiveDb();
 try {
  const columns=(await f.db.prepare('PRAGMA table_info(managed_maker_application_details)').all<{name:string}>()).results.map(row=>row.name);
  assert.ok(columns.includes('agreement_form_version_id'),'The second ALTER must run through the real D1 migration path');
  for(const name of ['managed_payout_allocations','managed_allocation_one_reservation','managed_allocation_preserve_identity','managed_allocation_no_delete',
   'managed_payout_preserve_identity','managed_payout_no_delete','managed_payout_preserve_terminal','managed_legacy_payout_link_no_update','managed_legacy_payout_link_no_delete'])
   assert.ok(await f.db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').bind(name).first(),name);
 }finally{await f.dispose();}
});
