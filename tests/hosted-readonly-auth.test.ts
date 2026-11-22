import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {securityDatabase} from './helpers/security-database';
import {fixtureWithOverrides} from './helpers/fixture-delegation';
import {SecurityStore} from '../lib/security/store';
import {MfaService} from '../lib/security/mfa';
import {totpAtCounter} from '../lib/security/crypto';
import {getHostedIdentity} from '../lib/auth/hosted-session';

// Only request/runtime transport is substituted. Authentication, signed MFA
// state, role resolution and audit SQL below are the production implementations.
const state={db:null as D1Database|null,key:'',headers:new Headers()};
(globalThis as typeof globalThis&{hostedReadonlyFixture:typeof state}).hostedReadonlyFixture=state;
registerHooks({resolve(specifier,context,next){
 const modules:Record<string,string>={
  'cloudflare:workers':'export const env={get DB(){return globalThis.hostedReadonlyFixture.db},get HASTABAZAAR_SECURITY_KEY(){return globalThis.hostedReadonlyFixture.key},HASTABAZAAR_RUNTIME_ENV:"test"};',
  'next/headers':'export async function headers(){return globalThis.hostedReadonlyFixture.headers}',
  'next/navigation':'export function redirect(url){throw Error("redirect:"+url)}',
 };
 return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);
}});

function fixture(role='customer',subject:string|null='fictional:actor',age=3_700_000){
 const f=securityDatabase(),now=Date.now(),token='fictional-readonly-session',hash=createHash('sha256').update(token).digest('hex');
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);
 f.sqlite.exec(`ALTER TABLE users ADD COLUMN phone TEXT; ALTER TABLE users ADD COLUMN locale TEXT DEFAULT 'en-NP';
 CREATE TABLE staff_permission_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),permissions_json TEXT,version INTEGER,updated_by TEXT,updated_at INTEGER);
 CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT REFERENCES users(id),action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER);`);
 f.sqlite.prepare('INSERT INTO users(id,auth_subject,email,display_name,status,updated_at) VALUES(?,?,?,?,?,?)').run('actor',subject,'actor@local.hastabazaar.test','Fictional actor','active',now-age);
 f.sqlite.prepare('INSERT INTO user_roles VALUES(?,?)').run('actor',role);
 f.sqlite.prepare('INSERT INTO user_sessions VALUES(?,?,?,?,?)').run(hash,'actor',now+86_400_000,now-age,now-age);
 state.db=f.db;state.key='';state.headers=new Headers({host:'fixture.test',cookie:'hastabazaar_session='+token});
 const snapshot=()=>({users:f.sqlite.prepare('SELECT * FROM users').all(),roles:f.sqlite.prepare('SELECT * FROM user_roles').all(),sessions:f.sqlite.prepare('SELECT * FROM user_sessions').all(),security:f.sqlite.prepare('SELECT * FROM marketplace_settings').all()});
 return {...f,now,hash,snapshot,close(){state.db=null;state.key='';f.dispose();}};
}

void test('read-only hosted authentication refuses unbound subjects without linking identity',async()=>{
 const f=fixture('customer',null);try{const before=f.snapshot(),changes=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
 assert.equal(await (await import('../app/auth')).getAuthenticatedUser({readOnly:true}),null);
 assert.deepEqual(f.snapshot(),before);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,changes);
 }finally{f.close();}
});

void test('existing customer read accepts a bound account without touching its old session',async()=>{
 const f=fixture();try{const before=f.snapshot();assert.equal((await (await import('../lib/auth/customer')).requireExistingCustomerApi()).userId,'actor');assert.deepEqual(f.snapshot(),before);}finally{f.close();}
});

void test('reject-only customer intent cannot bind a null subject before refusing a different actor',async()=>{
 const f=fixture('customer',null);try{const before=f.snapshot();await assert.rejects((await import('../lib/auth/customer-intent')).requireCustomerIntentApi(new Request('https://fixture.test',{headers:{'X-Hastabazaar-Actor':'different-actor'}})));assert.deepEqual(f.snapshot(),before);}finally{f.close();}
});

void test('ordinary hosted authentication retains valid session linking and activity behavior',async()=>{
 const f=fixture('customer',null);try{const auth=await import('../app/auth');assert.equal((await auth.getAuthenticatedUser())?.userId,'local:actor');assert.equal(f.sqlite.prepare('SELECT auth_subject FROM users').get()!.auth_subject,'local:actor');assert.ok(Number(f.sqlite.prepare('SELECT last_seen_at FROM user_sessions').get()!.last_seen_at)>f.now-3_700_000);}finally{f.close();}
});

void test('existing staff intent refuses a different displayed actor before any session touch',async()=>{
 const f=fixture('super_admin','fictional:actor',120_000);try{state.headers.set('sec-fetch-user','?1');const before=f.snapshot();await assert.rejects((await import('../lib/auth/staff-intent')).requireExistingStaffIntentApi(new Request('https://fixture.test',{headers:{'X-Hastabazaar-Actor':'other'}}),'order.manage'));assert.deepEqual(f.snapshot(),before);}finally{f.close();}
});

void test('existing staff capability denial keeps mandatory security audit but no identity or activity writes',async()=>{
 const f=fixture('admin','fictional:actor',120_000);try{state.headers.set('sec-fetch-user','?1');f.sqlite.prepare('INSERT INTO staff_permission_profiles VALUES(?,?,?,?,?)').run('actor','[]',1,'actor',f.now);const before=f.snapshot();await assert.rejects((await import('../lib/auth/staff-intent')).requireExistingStaffIntentApi(new Request('https://fixture.test'),'order.manage'));assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.sqlite.prepare('SELECT action,actor_id FROM audit_logs').all().map(row=>({...row})),[{action:'staff.authorization.denied',actor_id:'actor'}]);}finally{f.close();}
});

void test('read-only identity refuses session, subject, status and privileged-role drift during its read',async t=>{
 for(const [name,sql] of [
  ['session',"DELETE FROM user_sessions"],
  ['subject',"UPDATE users SET auth_subject='replacement:subject' WHERE id='actor'"],
  ['status',"UPDATE users SET status='suspended' WHERE id='actor'"],
  ['role',"DELETE FROM user_roles WHERE user_id='actor'"],
 ] as const)await t.test(name,async()=>{const f=fixture('seller');try{let changed=false;state.db=fixtureWithOverrides(f.db,{prepare(sqlText:string){const statement=f.db.prepare(sqlText);return fixtureWithOverrides(statement,{async first<T>(column?:string){const result=column===undefined?await statement.first<T>():await statement.first<T>(column);if(!changed&&sqlText.includes('FROM user_sessions')){changed=true;f.sqlite.exec(sql);}return result;}});}});assert.equal(await (await import('../app/auth')).getAuthenticatedUser({readOnly:true}),null);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get()!.n,0);}finally{f.close();}});
});

void test('read-only signed MFA session never renews its proof and rejects expired or corrupted proof',async()=>{
 const f=fixture('super_admin','fictional:actor',120_000);try{
  state.key=Buffer.from(randomBytes(32)).toString('base64url');const issued=f.now-120_000,store=new SecurityStore(f.db,state.key);await store.initialize(['actor'],issued);const service=new MfaService(store),setup=await service.beginSetup({userId:'actor',sessionHash:f.hash,now:issued});
  await service.confirmSetup({userId:'actor',sessionHash:f.hash,setupId:setup.setupId,code:totpAtCounter(setup.secret,Math.floor(issued/30_000)),now:issued});
  await service.activateSetup({userId:'actor',sessionHash:f.hash,setupId:setup.setupId,recoverySaved:true,passwordVerifiedAt:issued,now:issued});
  state.headers.set('sec-fetch-user','?1');const before=f.snapshot();const auth=await import('../app/auth');assert.equal((await auth.getAuthenticatedUser({readOnly:true}))?.userId,'fictional:actor');assert.deepEqual(f.snapshot(),before);
  assert.equal(await getHostedIdentity(f.db,state.headers,issued+9*3_600_000,{securityKey:state.key,readOnly:true}),null);
  f.sqlite.prepare("UPDATE marketplace_settings SET value='corrupted' WHERE `key`=?").run('auth-private:session:'+f.hash);const damaged=f.snapshot();assert.equal(await auth.getAuthenticatedUser({readOnly:true}),null);assert.deepEqual(f.snapshot(),damaged);
 }finally{f.close();}
});

void test('existing seller workspace, terms and notification recipient reads do not repair a missing subject',async t=>{
 for(const kind of ['center','terms','recipient'])await t.test(kind,async()=>{const f=fixture('seller',null);try{
  // Existing profile permits the old identity-repair branch to reach its result.
  f.sqlite.exec("CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),trading_name TEXT,status TEXT,seller_agreement_version TEXT,seller_agreement_accepted_at INTEGER); INSERT INTO seller_profiles VALUES('seller','actor','Fictional shop','approved',NULL,NULL)");
  const before=f.snapshot();const read=kind==='center'?(await import('../lib/auth/seller-center')).requireSellerCenterApi:kind==='terms'?(await import('../lib/auth/seller-commercial-access')).requireSellerTermsApi:(await import('../lib/auth/notification-recipient')).requireNotificationRecipientApi;
  await assert.rejects(read());assert.deepEqual(f.snapshot(),before);
 }finally{f.close();}});
});

void test('notifications reject a changed seller or staff before identity activity changes',async t=>{
 for(const role of ['seller','super_admin'])await t.test(role,async()=>{const f=fixture(role,'fictional:actor',role==='seller'?3_700_000:120_000);try{
  f.sqlite.exec("CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),trading_name TEXT,status TEXT,seller_agreement_version TEXT,seller_agreement_accepted_at INTEGER); INSERT INTO seller_profiles VALUES('seller','actor','Fictional shop','approved',NULL,NULL)");
  state.headers.set('sec-fetch-user','?1');const before=f.snapshot();const response=await (await import('../app/api/notifications/route')).GET(new Request('https://fixture.test/api/notifications?audience='+(role==='seller'?'seller':'staff'),{headers:{'X-Hastabazaar-Actor':'old-actor'}}));assert.equal(response.status,403);assert.deepEqual(f.snapshot(),before);
 }finally{f.close();}});
});

void test('claim principal exact-subject recheck uses the real read-only hosted path',async()=>{
 const f=fixture();try{const before=f.snapshot();assert.deepEqual(await (await import('../lib/payments/claim-release-http')).claimReleasePrincipal(new Request('https://fixture.test',{headers:{'X-Hastabazaar-Actor':'actor'}}),'claim'),{actorId:'actor',authSubject:'fictional:actor'});assert.deepEqual(f.snapshot(),before);}finally{f.close();}
});

void test('seller fulfillment original GET does not renew session activity while validating the reference',async()=>{
 const f=fixture('seller');try{f.sqlite.exec("CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),status TEXT); INSERT INTO seller_profiles VALUES('seller','actor','approved')");const before=f.snapshot();const response=await (await import('../app/api/seller/orders/[id]/fulfillment/route')).GET(new Request('https://fixture.test/api/seller/orders/order/fulfillment',{headers:{'X-Hastabazaar-Actor':'actor'}}),{params:Promise.resolve({id:'order'})});assert.equal(response.status,400);assert.deepEqual(f.snapshot(),before);}finally{f.close();}
});
