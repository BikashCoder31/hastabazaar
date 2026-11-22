import test from 'node:test';
import assert from 'node:assert/strict';
import {adminNavigation} from '../lib/admin/navigation';
import {can,type Permission} from '../lib/marketplace/permissions';

void test('a current narrowly scoped operator can enter Overview without receiving audit or finance access',()=>{
 for(const permissions of [[],['product.review'],['system.incidents.manage']] as Permission[][]){
  const links=adminNavigation('admin',permissions);
  assert.ok(links.some(link=>link.href==='/admin'),'Overview must expose permitted work even without a full audit grant.');
  assert.ok(!links.some(link=>['/admin/activity','/admin/accounting','/admin/payouts'].includes(link.href)));
  assert.equal(can({role:'admin',permissions},'audit_log.view'),false);
  assert.equal(can({role:'admin',permissions},'payout.approve'),false);
 }
 assert.equal(adminNavigation('customer').length,0);
});
