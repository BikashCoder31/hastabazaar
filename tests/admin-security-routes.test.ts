import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import { totpAtCounter } from '../lib/security/crypto';

const context={db:null as D1Database|null,key:Buffer.from(randomBytes(32)).toString('base64url'),initialized:false};
(globalThis as typeof globalThis & {securityRouteContext:typeof context}).securityRouteContext=context;
registerHooks({resolve(specifier,parent,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,'+encodeURIComponent('export const env={get DB(){return globalThis.securityRouteContext.db},get HASTABAZAAR_SECURITY_KEY(){return globalThis.securityRouteContext.key},SECURITY_POLICY:{async read(){return globalThis.securityRouteContext.initialized},async mark(){globalThis.securityRouteContext.initialized=true}},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3018"}'),shortCircuit:true};return next(specifier,parent);}});
void test('local owner can establish a first password, confirm their authenticator and activate without changing roles',async()=>{
 const f=securityDatabase();context.db=f.db;let cookies='hastabazaar_local_test_role=super_admin';
 const request=(path:string,body:unknown,origin='http://localhost:3018')=>new Request('http://localhost:3018'+path,{method:'POST',headers:{origin,host:'localhost:3018','content-type':'application/json',cookie:cookies},body:JSON.stringify(body)});
 const accept=(response:Response)=>{const additions=response.headers.getSetCookie().map(v=>v.split(';')[0]);for(const cookie of additions){const key=cookie.split('=')[0];cookies=cookies.split(';').map(x=>x.trim()).filter(x=>!x.startsWith(key+'=')).concat(cookie).join('; ');}};
 try{
 f.sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('local-test-super-admin','local-test-super-admin','superadmin@local.hastabazaar.test','Fictional Super','active',1);
 f.sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run('local-test-super-admin','super_admin');
 const roles=JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all());
 const {handleSecurityAction,securityStatus}=await import('../lib/security/controller');
 const before=JSON.stringify(f.sqlite.prepare('SELECT * FROM marketplace_settings').all());
 const status=await securityStatus(new Request('http://localhost:3018/api/security/status',{headers:{host:'localhost:3018',cookie:cookies}}));
 assert.equal(status.status,200);assert.equal((await status.json() as {needsPassword:boolean}).needsPassword,true);
 assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM marketplace_settings').all()),before,'GET does not initialize security');
 assert.equal((await handleSecurityAction(request('/api/security/bootstrap',{action:'request'},'https://evil.example'),'bootstrap')).status,403);
 const send=await handleSecurityAction(request('/api/security/bootstrap',{action:'request'}),'bootstrap');assert.equal(send.status,200);accept(send);
 const capture=await send.json() as {code:string;localSimulation:boolean};assert.equal(capture.localSimulation,true);assert.match(capture.code,/^\d{6}$/);
 const password='fictional-owner-password-2026';
 const complete=await handleSecurityAction(request('/api/security/bootstrap',{action:'complete',code:capture.code,password,confirmation:password}),'bootstrap');assert.equal(complete.status,200);accept(complete);
 const setup=await handleSecurityAction(request('/api/security/setup',{password}),'setup');assert.equal(setup.status,200);accept(setup);
 const detail=await setup.json() as {setupId:string;manualKey:string};
 const confirmed=await handleSecurityAction(request('/api/security/confirm',{password,setupId:detail.setupId,code:totpAtCounter(detail.manualKey,Math.floor(Date.now()/30000))}),'confirm');assert.equal(confirmed.status,200);
 const codes=await confirmed.json() as {recoveryCodes:string[]};assert.equal(codes.recoveryCodes.length,10);
 const active=await handleSecurityAction(request('/api/security/confirm',{password,setupId:detail.setupId,acknowledge:true}),'confirm');assert.equal(active.status,200);accept(active);
 const store=new SecurityStore(f.db,context.key);assert.equal((await store.readAccount('local-test-super-admin'))!.value.status,'active');
 assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all()),roles);
 const rows=JSON.stringify(f.sqlite.prepare('SELECT * FROM marketplace_settings').all());assert.ok(!rows.includes(detail.manualKey));assert.ok(codes.recoveryCodes.every(code=>!rows.includes(code)));
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM users').get()!.n,1);
 const reused=await handleSecurityAction(request('/api/security/bootstrap',{action:'complete',code:capture.code,password:'another-password-1234',confirmation:'another-password-1234'}),'bootstrap');assert.notEqual(reused.status,200);
 }finally{context.db=null;f.dispose();}
});
