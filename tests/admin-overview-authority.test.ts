import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {completeVersionFixture} from './helpers/complete-version-fixture';

const fixture={db:null as D1Database|null,createElement,role:'super_admin',permissions:undefined as string[]|undefined};
(globalThis as typeof globalThis&{overviewAuthorityFixture:typeof fixture}).overviewAuthorityFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.overviewAuthorityFixture.db}};',
 'next/navigation':'export function usePathname(){return "/admin"};export function useSearchParams(){return new URLSearchParams()};export function useRouter(){return{refresh(){}}};export function redirect(path){throw Error(path)}',
 'next/link':'export default function Link({children,scroll,prefetch,...props}){return globalThis.overviewAuthorityFixture.createElement("a",props,children)}',
 '@/lib/auth/staff':'export async function requireStaffPage(){const f=globalThis.overviewAuthorityFixture;return{id:"reviewer",displayName:"Fictional session actor",role:f.role,permissions:f.permissions}}',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('actual Overview native readers cannot return old private Super Admin data after role loss',async()=>{
 const f=await completeVersionFixture(Date.now());fixture.db=f.db;try{
  const {default:Overview}=await import('../app/admin/page');
  const original=renderToStaticMarkup(await Overview());assert.match(original,/Marketplace summary/);
  const batch=f.db.batch.bind(f.db);let raced=false;
  f.db.batch=async statements=>{if(!raced){raced=true;f.sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='reviewer' AND role='super_admin'");}return batch(statements);};
  await assert.rejects(Overview());assert.equal(raced,true);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM staff_permission_guards').get()!.n,0);
 }finally{fixture.db=null;f.dispose();}
});

void test('Overview uses the guard current permission snapshot instead of older session-page claims',async()=>{
 const f=await completeVersionFixture(Date.now());fixture.db=f.db;fixture.role='admin';fixture.permissions=['order.manage','payout.prepare','audit_log.view'];try{
  f.sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='reviewer';INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('reviewer','[]',1,'reviewer',1)");
  const prepare=f.db.prepare.bind(f.db);let privateCountReads=0;f.db.prepare=sql=>{if(/SELECT COUNT\(\*\).*FROM payout_requests/i.test(sql))privateCountReads++;return prepare(sql);};
  const {default:Overview}=await import('../app/admin/page');const html=renderToStaticMarkup(await Overview());
  assert.doesNotMatch(html,/href="\/admin\/(?:analytics|payouts)"/);assert.equal(privateCountReads,0);
 }finally{fixture.db=null;fixture.role='super_admin';fixture.permissions=undefined;f.dispose();}
});

void test('a failed operational count source stays unknown while independent original review work remains available',async()=>{
 const f=await completeVersionFixture(Date.now());fixture.db=f.db;try{
  const prepare=f.db.prepare.bind(f.db);let failed=false;
  f.db.prepare=sql=>{if(sql.includes('AS sellers,')&&sql.includes('AS payoutRequests')){failed=true;throw Error('Fictional operational count source outage');}return prepare(sql);};
  const {default:Overview}=await import('../app/admin/page'),html=renderToStaticMarkup(await Overview());assert.equal(failed,true);assert.match(html,/Operational queue counts are unavailable/);assert.match(html,/Shared review queue/);assert.doesNotMatch(html,/Review queue unavailable/);
 }finally{fixture.db=null;f.dispose();}
});
