import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';

const context={db:null as D1Database|null,key:'',headers:new Headers()};
(globalThis as typeof globalThis & {securityAccessContext:typeof context}).securityAccessContext=context;
registerHooks({resolve(specifier,parent,next){
 const stubs:Record<string,string>={
  'cloudflare:workers':'export const env={get DB(){return globalThis.securityAccessContext.db},get HASTABAZAAR_SECURITY_KEY(){return globalThis.securityAccessContext.key}};',
  'next/headers':'export async function headers(){return globalThis.securityAccessContext.headers}',
  'next/navigation':'export function redirect(url){throw Error("redirect:"+url)}',
 };
 return stubs[specifier]?{url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true}:next(specifier,parent);
}});
void test('actual common identity and independent legal access reject an enrolled local role-cookie bypass',async()=>{
 const f=securityDatabase();context.db=f.db;context.key=Buffer.from(randomBytes(32)).toString('base64url');const now=Date.now();
 try{
  f.sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('local-test-super-admin','local-test-super-admin','superadmin@local.hastabazaar.test','Fictional Super','active',now);
  f.sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run('local-test-super-admin','super_admin');
  const token='fictional-raw-session',hash=createHash('sha256').update(token).digest('hex');
  f.sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)').run(hash,'local-test-super-admin',now+8*3600000,now,now);
  const store=new SecurityStore(f.db,context.key);await store.initialize(['local-test-super-admin'],now);
  const service=new MfaService(store),setup=await service.beginSetup({userId:'local-test-super-admin',sessionHash:hash,now});
  await service.confirmSetup({userId:'local-test-super-admin',sessionHash:hash,setupId:setup.setupId,code:totpAtCounter(setup.secret,Math.floor(now/30000)),now});
  await service.activateSetup({userId:'local-test-super-admin',sessionHash:hash,setupId:setup.setupId,recoverySaved:true,passwordVerifiedAt:now,now});
  const auth=await import('../app/auth');const legal=await import('../lib/legal-procedures/access');
  context.headers=new Headers({host:'localhost:3018',cookie:'hastabazaar_local_test_role=super_admin'});
  assert.equal(await auth.getAuthenticatedUser(),null);
  await assert.rejects(()=>legal.requireLegalDraftApi());
  context.headers.set('cookie','hastabazaar_local_test_role=super_admin; hastabazaar_session='+token);
  assert.equal((await auth.getAuthenticatedUser())?.userId,'local-test-super-admin');
  assert.equal((await legal.requireLegalDraftApi()).actor.id,'local-test-super-admin');
  f.sqlite.prepare('DELETE FROM marketplace_settings WHERE `key`=?').run('auth-private:session:'+hash);
  assert.equal(await auth.getAuthenticatedUser(),null);
  await assert.rejects(()=>legal.requireLegalDraftApi());
  f.sqlite.prepare("DELETE FROM marketplace_settings WHERE `key` LIKE 'auth-private:%'").run();
  assert.equal(await auth.getAuthenticatedUser(),null,'Complete namespace loss cannot downgrade the configured installation');
  await assert.rejects(()=>legal.requireLegalDraftApi());
 }finally{context.db=null;f.dispose();}
});
