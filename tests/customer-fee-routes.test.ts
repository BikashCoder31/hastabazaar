import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { feeWaiverFixture, interleaveFeeWaiverBatch } from './helpers/fee-waiver-fixture';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import {seedLegacyRevision,seedLegacyReceipt} from './helpers/legacy-fee-history-fixture';
import { totpAtCounter } from '../lib/security/crypto';

declare global {
  var customerFeeHttpDb: D1Database;
  var customerFeeHttpKey: string;
  var customerFeeHttpHeaders: Headers;
}
// Only framework bindings are doubled. Staff, hosted sessions and MFA stay real.
registerHooks({ resolve(specifier, context, nextResolve) {
  const source = specifier === 'cloudflare:workers'
    ? 'export const env={get DB(){return globalThis.customerFeeHttpDb},get HASTABAZAAR_SECURITY_KEY(){return globalThis.customerFeeHttpKey},HASTABAZAAR_SECURITY_INITIALIZED:"true"}'
    : specifier === 'next/headers' ? 'export async function headers(){return globalThis.customerFeeHttpHeaders}'
    : specifier === 'next/navigation' ? 'export function redirect(path){throw Error("REDIRECT:"+path)}' : null;
  return source ? { url:'data:text/javascript,'+encodeURIComponent(source), shortCircuit:true } : nextResolve(specifier, context);
}});
const url = 'http://localhost:3018/api/admin/customer-fee-waivers';
const legacyUrl = 'http://localhost:3018/api/admin/fee-waivers';
const terms = { name:'Customer campaign', description:'Whole positive customer charge', startsAt:0, endsAt:253402280099999 };
const create = { feeTarget:'customer_service_fee', reason:'Independently review this exact fictional customer fee campaign.', command:{type:'create',terms}, expectedRevision:0, requestId:'route-create' };
function request(body: unknown, origin='http://localhost:3018', path=url, raw=false) {
  return new Request(path,{method:'POST',headers:{origin,'content-type':'application/json'},body:raw?String(body):JSON.stringify(body)});
}
async function fixture() {
  const f = await feeWaiverFixture(), now=Date.now();
  f.sqlite.exec("CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL)");
  globalThis.customerFeeHttpDb=f.database;
  globalThis.customerFeeHttpKey=Buffer.from(randomBytes(32)).toString('base64url');
  const store=new SecurityStore(f.database,globalThis.customerFeeHttpKey);
  await store.initialize(['owner','staff'],now);
  for(const id of ['owner','staff']) {
    const hash=createHash('sha256').update('fee-session-'+id).digest('hex');
    await f.database.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind(hash,id,now+3600000,now,now).run();
  }
  for(const id of ['owner','staff']) {
    const sessionHash=createHash('sha256').update('fee-session-'+id).digest('hex');
    const mfa=new MfaService(store), setup=await mfa.beginSetup({userId:id,sessionHash,now});
    await mfa.confirmSetup({userId:id,sessionHash,setupId:setup.setupId,code:totpAtCounter(setup.secret,Math.floor(now/30000)),now});
    await mfa.activateSetup({userId:id,sessionHash,setupId:setup.setupId,recoverySaved:true,passwordVerifiedAt:now,now});
  }
  const hash=createHash('sha256').update('fee-session-owner').digest('hex');
  globalThis.customerFeeHttpHeaders=new Headers({cookie:'hastabazaar_session=fee-session-owner'});
  return {...f,hash};
}
void test('customer controls require explicit target, bounded allowlisted input, current authority and unchanged MFA assurance',async()=>{
  assert.ok(existsSync('app/api/admin/customer-fee-waivers/route.ts'),'explicit customer route exists');
  const route=await import('../app/api/admin/customer-fee-waivers/route');
  const f=await fixture();
  try {
    assert.equal((await route.POST(request(create,'https://attacker.test'))).status,403);
    for(const body of [ {...create,feeTarget:undefined},{...create,feeTarget:'seller_commission'},{...create,extra:true},{...create,expectedRevision:-1},{...create,command:{type:'create',terms:{...terms,commissionBps:0}}},[],null ])
      assert.equal((await route.POST(request(body))).status,422);
    for(const raw of ['{','{"padding":"'+'x'.repeat(70000)+'"}']) assert.equal((await route.POST(request(raw,undefined,undefined,true))).status,422);
    const saved=await route.POST(request(create));
    assert.equal(saved.status,200);assert.equal(saved.headers.get('cache-control'),'no-store');
    assert.equal((await route.POST(request(create))).status,200);
    assert.equal((await route.POST(request({...create,requestId:'stale'}))).status,409);
    assert.equal((await route.POST(request({...create,command:{type:'create',terms:{...terms,name:'Changed'}}}))).status,409);
    const state=await (await route.GET(new Request(url))).json() as {feeTarget:string;revision:number;campaigns:unknown[]};
    assert.equal(state.feeTarget,'customer_service_fee');assert.equal(state.revision,1);assert.equal(state.campaigns.length,1);
    assert.equal((await route.GET(new Request(url+'?target=legacy'))).status,422);
    globalThis.customerFeeHttpHeaders=new Headers({cookie:'hastabazaar_session=fee-session-staff'});
    assert.equal((await route.POST(request(create))).status,403);
    globalThis.customerFeeHttpHeaders=new Headers({cookie:'hastabazaar_session=fee-session-owner'});
    f.sqlite.prepare("DELETE FROM marketplace_settings WHERE `key`=?").run('auth-private:session:'+f.hash);
    assert.equal((await route.POST(request(create))).status,403,'enrolled owner without MFA proof is denied');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_fee_waiver_campaigns').get()?.n,1);
  } finally {await f.dispose();}
});
void test('legacy POST is retired after trusted origin and live authorization and cannot reinterpret old payloads or receipts',async()=>{
  const legacy=await import('../app/api/admin/fee-waivers/route');
  const f=await fixture();
  try {
    const historical=await seedLegacyRevision(f.database,{...terms,id:'original-seller-history',revision:1,state:'draft'});
    await seedLegacyReceipt(f.database,{actorId:'owner',authSubject:'owner',expectedRevision:0,requestId:create.requestId,now:100},create.command as {type:'create';terms:typeof terms},historical);
    const before=JSON.stringify(f.sqlite.prepare('SELECT * FROM marketplace_fee_waiver_control').all());
    const {feeTarget:_,...old}=create;
    const customer=await import('../app/api/admin/customer-fee-waivers/route');
    assert.equal((await customer.POST(request(old))).status,422,'old payload and saved request ID cannot become a customer command');
    assert.equal((await legacy.POST(request(old,undefined,legacyUrl))).status,410);
    assert.equal((await legacy.POST(request(create,undefined,legacyUrl))).status,410);
    assert.equal((await legacy.POST(request(old,'https://attacker.test',legacyUrl))).status,403);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM marketplace_fee_waiver_control').all()),before);
    for(const table of ['customer_fee_waiver_campaigns','marketplace_fee_waiver_campaigns','customer_fee_waiver_requests','marketplace_fee_waiver_requests'])
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get()?.n,table.startsWith('marketplace')?1:0);
    assert.equal((await legacy.GET(new Request(legacyUrl))).status,200);
    f.sqlite.exec("DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'");
    assert.equal((await legacy.POST(request(old,undefined,legacyUrl))).status,403);
    assert.equal((await legacy.GET(new Request(legacyUrl))).status,403);
  } finally {await f.dispose();}
});
void test('customer route rejects revoked, inactive and changed actors including transaction interleaving',async()=>{
  assert.ok(existsSync('app/api/admin/customer-fee-waivers/route.ts'));
  const route=await import('../app/api/admin/customer-fee-waivers/route');
  for(const change of ["DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'","UPDATE users SET status='disabled' WHERE id='owner'","UPDATE users SET auth_subject='changed-owner' WHERE id='owner'"]) {
    const f=await fixture();
    try {
      globalThis.customerFeeHttpDb=interleaveFeeWaiverBatch(f.database,async()=>{f.sqlite.exec(change)});
      assert.equal((await route.POST(request(create))).status,403);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_fee_waiver_campaigns').get()?.n,0);
    } finally {await f.dispose();}
  }
});

void test('authorized customer endpoint rejects out-of-editor timestamps before campaign, audit or receipt writes', async () => {
  const route = await import('../app/api/admin/customer-fee-waivers/route');
  const f = await fixture();
  try {
    const snapshot = () => JSON.stringify(['customer_fee_waiver_control', 'customer_fee_waiver_campaigns',
      'customer_fee_waiver_revisions', 'customer_fee_waiver_requests', 'audit_logs'].map(table =>
      f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()));
    const before = snapshot();
    for (const at of [253402280100000, 8640000000000000, Number.MAX_SAFE_INTEGER]) {
      const response = await route.POST(request({ ...create, requestId: 'bad-date-' + at,
        command: { type: 'create', terms: { ...terms, endsAt: at } } }));
      assert.equal(response.status, 422, await response.clone().text());
      assert.equal(snapshot(), before);
    }
    for (const [index, [startsAt, endsAt]] of [[0, 1], [0, 60000], [253402280039999, 253402280099999]].entries()) {
      const response = await route.POST(request({ ...create, expectedRevision: index, requestId: 'good-date-' + index,
        command: { type: 'create', terms: { ...terms, startsAt, endsAt } } }));
      assert.equal(response.status, 200, await response.clone().text());
    }
  } finally { await f.dispose(); }
});
