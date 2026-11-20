import assert from 'node:assert/strict';
import test from 'node:test';
import {can, configurableAdminPermissions, defaultAdminPermissions, validateAdminPermissions, type Permission} from '../lib/marketplace/permissions';
import {STAFF_ACCESS_RIGHTS, BUILT_IN_STAFF_ACCESS_TEMPLATES} from '../lib/staff/access';
import {adminNavigation, adminTaskGuide} from '../lib/admin/navigation';

const technical = ['system.health.view', 'system.incidents.manage'] as Permission[];

void test('technical response is an explicit narrow grant without widening legacy staff or reserved actions', () => {
  const grants = validateAdminPermissions(technical);
  const responder = {role:'admin' as const,permissions:grants};
  for (const permission of technical) {
    assert.equal(can(responder,permission),true);
    assert.equal(can('admin',permission),false);
    assert.equal(defaultAdminPermissions.includes(permission),false);
    assert.equal(can('customer',permission),false);
    assert.equal(can('seller',permission),false);
    assert.equal(can('super_admin',permission),true);
    assert.equal(can({role:'admin',permissions:[]},permission),false);
  }
  for (const permission of ['admin.invite','admin.permissions.manage','email.delivery.manage','payout.approve','payment.receipt.verify','legal_content.publish','audit_log.view'] as Permission[]) {
    assert.equal(can(responder,permission),false,permission);
  }
});

void test('every configurable grant has a truthful selectable label and the technical template stays narrow', () => {
  for(const permission of configurableAdminPermissions) {
    const choices=STAFF_ACCESS_RIGHTS.filter(choice=>choice.permission===permission);
    assert.equal(choices.length,1,permission);
    assert.ok(choices[0].description.length>20);
  }
  const template=BUILT_IN_STAFF_ACCESS_TEMPLATES.find(item=>item.id==='technical-responder');
  assert.deepEqual(template?.permissions,technical);
});

void test('technical and ordinary staff discover their permitted workspace without management shortcuts', () => {
  const responder=adminNavigation('admin',technical);
  assert.ok(responder.some(item=>item.href==='/admin/system-health'));
  assert.equal(responder.some(item=>['/admin/business-emails','/admin/business-settings','/admin/activity'].includes(item.href)),false);
  assert.equal(adminNavigation('admin').some(item=>item.href==='/admin/system-health'),false);
  assert.equal(adminNavigation('admin',[]).find(item=>item.href==='/admin/team')?.label,'My responsibilities');
  assert.match(adminTaskGuide('/admin/team','admin',[])?.description??'',/your access/);
  assert.doesNotMatch(adminTaskGuide('/admin/team','admin',[])?.steps.join(' ')??'',/invite|grant/i);
  assert.equal(adminNavigation('super_admin').find(item=>item.href==='/admin/business-emails')?.label,'Email delivery');
  assert.deepEqual(adminNavigation('customer',technical),[]);
});
