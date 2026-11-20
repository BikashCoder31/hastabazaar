import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAdminReturnTo,withAdminReturnTo} from '../lib/admin/return-context';

void test('admin return navigation preserves exact local filters, selection and fragment without granting a destination',()=>{
 const context='/admin?reviewView=assigned&reviewPage=3&reviewQ=Fictional+shop&reviewSelected=task-7&reviewScroll=840#seller-review-queue';
 assert.equal(safeAdminReturnTo(context),context);
 const target=new URL(withAdminReturnTo('/admin/payments?tab=incoming&order=fictional#claim-7',context),'https://fixture.invalid');
 assert.equal(target.searchParams.get('returnTo'),context);assert.equal(target.searchParams.get('order'),'fictional');assert.equal(target.hash,'#claim-7');
 assert.equal(target.searchParams.getAll('returnTo').length,1);
 assert.equal(new URL(withAdminReturnTo(target.pathname+target.search+target.hash,context),'https://fixture.invalid').searchParams.getAll('returnTo').length,1);
});

void test('untrusted external, malformed and non-admin return values fail closed to a local fallback',()=>{
 for(const value of [undefined,null,['/admin'],'https://evil.test/admin','//evil.test/admin','javascript:alert(1)','/account','/administrator','/admin\\evil','/admin\r\nLocation: x','/admin/%2f%2fevil','/admin/%2e%2e/security','/admin/'+ 'x'.repeat(4100)])assert.equal(safeAdminReturnTo(value,'/admin/payments?tab=refunds'),'/admin/payments?tab=refunds');
 assert.equal(safeAdminReturnTo(undefined,'https://evil.test'),'/admin');
 assert.throws(()=>withAdminReturnTo('https://evil.test/admin','/admin'),/local admin route/);
});
