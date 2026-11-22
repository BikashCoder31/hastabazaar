import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';

const state={db:null as D1Database|null};
(globalThis as typeof globalThis&{teamReadonlyAuthFixture:typeof state}).teamReadonlyAuthFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.teamReadonlyAuthFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:"new-pending-reviewer",email:"pending-team@local.hastabazaar.test",fullName:"Fictional pending reviewer",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('Team original-outcome GET never provisions or accepts an invited identity without an actor header',async()=>{
 const f=await completeVersionFixture(Date.now());state.db=f.db;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const {createStaffInvitation}=await import('../lib/db/repositories/staff');
  const invitation=await createStaffInvitation(f.db,{email:'pending-team@local.hastabazaar.test',role:'super_admin',invitedBy:'reviewer',now:f.now});
  const before=f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n;
  const api=await import('../app/api/admin/team/governance/route');
  const response=await api.GET(new Request('http://localhost:3018/api/admin/team/governance?requestId=unknown-original'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n,before,'A saved-outcome read must not create a new staff identity.');
  assert.equal(response.status,403,await response.text());
  assert.equal(f.sqlite.prepare('SELECT status FROM staff_invitations WHERE id=?').get(invitation.id)!.status,'pending');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM users WHERE auth_subject='new-pending-reviewer'").get()!.n,0);
 }finally{f.dispose();state.db=null;}
});
