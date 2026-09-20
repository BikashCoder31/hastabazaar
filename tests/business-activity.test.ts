import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDestination, auditFilters, listBusinessActivity } from '../lib/db/repositories/business-activity';
import { notificationDestination, canViewStaffNotification } from '../lib/operations/notification-links';
void test('audit destinations and filters accept only known internal records and bounded valid dates',()=>{
 assert.equal(auditDestination('order','order-1'),'/admin/orders/order-1');
 assert.equal(auditDestination('unknown','https://evil.test'),null);
 assert.equal(auditDestination('order','../team'),null);
 assert.deepEqual(auditFilters({action:' payout.paid ',actor:'a',type:'payout',from:'2026-09-13',to:'2026-09-13'}),{action:'payout.paid',actor:'a',type:'payout',from:Date.parse('2026-09-13T00:00:00+05:45'),to:Date.parse('2026-09-14T00:00:00+05:45')});
 assert.throws(()=>auditFilters({from:'2026-02-31'}));
 assert.throws(()=>auditFilters({from:'2026-09-14',to:'2026-09-13'}));
});
void test('business history denies ordinary Admin before database access',async()=>{
 await assert.rejects(()=>listBusinessActivity({} as D1Database,{role:'admin'},{}),/Super Admin/);
});
void test('notification links require matching audience and safe related records',()=>{
 assert.equal(notificationDestination('seller','seller','order','o-1'),'/seller/orders/o-1');
 assert.equal(notificationDestination('customer','seller','order','o-1'),null);
 assert.equal(notificationDestination('customer','customer','order','o-1'),'/account/orders');
 assert.equal(notificationDestination('seller','seller','order','../team'),null);
 assert.equal(notificationDestination('seller','seller','external','https://evil.test'),null);
});

void test('staff notification destinations and visibility follow current effective permissions',()=>{
 assert.equal(notificationDestination('staff','staff','product','p-1'),'/admin/products/p-1');
 assert.equal(notificationDestination('customer','customer','seller_application','s-1'),'/sell/application');
 assert.equal(canViewStaffNotification({role:'admin',permissions:[]},'product'),false);
 assert.equal(canViewStaffNotification({role:'admin',permissions:['product.review']},'product'),true);
 assert.equal(canViewStaffNotification({role:'seller'},'product'),false);
 assert.equal(canViewStaffNotification({role:'super_admin'},'unknown'),false);
});

void test('explicit notification permissions override inferred types and unknown values deny',()=>{
 assert.equal(canViewStaffNotification({role:'admin',permissions:['product.review']},'product','product.publish'),false);
 assert.equal(canViewStaffNotification({role:'super_admin'},'product','unknown.permission'),false);
});

void test('customer order links use verified order numbers and product outcomes use a useful record destination',()=>{
 assert.equal(notificationDestination('customer','customer','order','internal',{orderNumber:'HK-123'}),'/orders/HK-123');
 assert.equal(notificationDestination('customer','customer','order','internal',{orderNumber:'../admin'}),'/account/orders');
 assert.equal(notificationDestination('seller','seller','product','p-1',{productStatus:'published'}),'/seller/products#product-p-1');
 assert.equal(notificationDestination('seller','seller','product','p-1',{productStatus:'needs_changes'}),'/seller/products/p-1/edit');
 assert.equal(notificationDestination('staff','staff','exception_work','e-1'),'/admin/exceptions');
 assert.equal(canViewStaffNotification({role:'admin',permissions:['payout.prepare']},'exception_work','payout.prepare'),false);
});

void test('customer case notifications open the owned order aftercare section',()=>{
 assert.equal(notificationDestination('customer','customer','return_request','r-1',{orderNumber:'HK-1'}),'/orders/HK-1#aftercare-title');
 assert.equal(notificationDestination('customer','customer','complaint','c-1',{orderNumber:'HK-2'}),'/orders/HK-2#aftercare-title');
});
