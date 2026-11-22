import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import * as delivery from '../lib/email/delivery-attempts';
import { emailRetryDelayMs } from '../lib/email/retry-policy';
import { EventEmitter } from 'node:events';
import { LocalCaptureEmailService, SmtpEmailService } from '../lib/runtime/node-bindings';
import type { connect as connectTls } from 'node:tls';
import { readFileSync } from 'node:fs';
import {deliverOrderEmails} from '../lib/email/order-updates';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0147_durable_email_delivery.sql',import.meta.url),'utf8'));
  let failCompletion = false;
  const db = { prepare(sql: string) { const statement = sqlite.prepare(sql); let values: SQLInputValue[] = []; return {
    bind(...next: SQLInputValue[]) { values = next; return this; },
    async first<T>() { return (statement.get(...values) as T) ?? null; },
    async all<T>() { return { results: statement.all(...values) as T[] }; },
    async run() { if (failCompletion && sql.includes("phase='accepted'")) throw new Error('simulated persistence loss'); return { meta: { changes: Number(statement.run(...values).changes) } }; },
  }; } } as unknown as D1Database;
  return { sqlite, db, failCompletion() { failCompletion = true; } };
}
const message = { to: 'test@local.hastabazaar.test', subject: 'Update', text: 'Current update', html: '<p>Current update</p>' };
const now = 2_000_000_000_000;
const accepted = { outcome: 'accepted' as const, transport: 'provider' as const, receipt: 'fake-provider-receipt' };
const run = (db: D1Database, mail: delivery.DeliveryMailService, extra: Partial<delivery.DurableDeliveryOptions> = {}) => delivery.deliverDurably(db, mail, message, {
  queueKind: 'business', queueId: 'notice', claimToken: crypto.randomUUID(), attemptNumber: 1, now: () => now, validate: async () => true, ...extra,
});

void test('approved retry schedule continues hourly and honors bounded jitter and longer provider delay', () => {
  assert.deepEqual([1,2,3,4,5,6,20].map(attempt => emailRetryDelayMs(attempt)), [300000,600000,1200000,2400000,3600000,3600000,3600000]);
  assert.equal(emailRetryDelayMs(7, { random: () => 1, retryAfterMs: 7_200_000 }), 7_200_000);
  assert.equal(emailRetryDelayMs(1, { random: () => 1 }), 330_000);
});
void test('accepted attempt is durable and never handed off again after queue completion loss', async () => {
  const f = fixture(); let sends = 0;
  const mail: delivery.DeliveryMailService = { send: async (_, context) => { await context?.beforeHandoff?.(); sends++; return accepted; } };
  try {
    assert.equal((await run(f.db, mail)).outcome, 'accepted');
    assert.equal((await run(f.db, mail, { attemptNumber: 2 })).outcome, 'held');
    assert.equal(sends, 1);
    assert.equal((await delivery.readDeliveryStatus(f.db,'business','notice')).status, 'accepted');
  } finally { f.sqlite.close(); }
});
void test('acceptance with lost attempt write remains held across restart', async () => {
  const f = fixture(); let sends = 0; f.failCompletion();
  const mail: delivery.DeliveryMailService = { send: async (_, context) => { await context?.beforeHandoff?.(); sends++; return accepted; } };
  try {
    assert.equal((await run(f.db, mail)).outcome, 'accepted');
    assert.equal((await run(f.db, mail, { attemptNumber: 2 })).outcome, 'held');
    assert.equal(sends, 1);
  } finally { f.sqlite.close(); }
});
void test('a broken handoff-aware adapter cannot reopen accepted delivery after persistence loss', async () => {
  const f=fixture();let sends=0;f.failCompletion();
  const mail:delivery.DeliveryMailService={handoffAware:true,send:async()=>{sends++;return accepted;}};
  try{
    assert.equal((await run(f.db,mail)).outcome,'accepted');
    assert.equal((await run(f.db,mail,{attemptNumber:2})).outcome,'held');assert.equal(sends,1);
  }finally{f.sqlite.close();}
});
void test('unknown DATA acknowledgement and legacy void are held, and capture is distinct', async () => {
  const f = fixture();
  try {
    assert.equal((await run(f.db,{send:async()=>{throw new Error('lost DATA acknowledgement');}})).outcome,'uncertain');
    assert.equal((await run(f.db,{send:async()=>accepted},{attemptNumber:2})).outcome,'held');
    assert.equal((await run(f.db,{send:async()=>{}},{queueId:'legacy'})).outcome,'uncertain');
    assert.equal((await run(f.db,{send:async()=>({outcome:'captured',transport:'capture',receipt:'fake-capture'})},{queueId:'capture'})).outcome,'captured');
    assert.equal((await delivery.readDeliveryStatus(f.db,'business','capture')).status,'captured');
  } finally { f.sqlite.close(); }
});
void test('known transient failure retries beyond five attempts without resetting history', async () => {
  const f = fixture(); let sends=0;
  const mail: delivery.DeliveryMailService = {send:async()=>{sends++;if(sends<8)throw new delivery.MailDeliveryError('temporary','provider_unavailable');return accepted;}};
  try {
    for(let n=1;n<=8;n++) assert.equal((await run(f.db,mail,{attemptNumber:n,now:()=>now+n*10_000_000})).outcome,n===8?'accepted':'retry');
    assert.equal(sends,8);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM email_delivery_attempts').get()?.n,8);
  } finally { f.sqlite.close(); }
});
void test('source resolution immediately before handoff cancels without calling provider', async () => {
  const f=fixture();let current=true,sends=0;
  try {
    const outcome=await run(f.db,{handoffAware:true,send:async(_,context)=>{current=false;await context?.beforeHandoff?.();sends++;return accepted;}},{validate:async()=>current});
    assert.equal(outcome.outcome,'cancelled');assert.equal(sends,0);
  } finally {f.sqlite.close();}
});
void test('permanent recipient and configuration failures wait for relevant corrected fingerprints', async () => {
  const f=fixture();let sends=0;
  const mail: delivery.DeliveryMailService={configurationFingerprint:'config-one',send:async()=>{sends++;throw new delivery.MailDeliveryError('permanent_recipient','recipient_rejected');}};
  try {
    assert.equal((await run(f.db,mail)).outcome,'intervention');
    assert.equal((await run(f.db,mail,{attemptNumber:2})).outcome,'held');
    assert.equal(sends,1);
    assert.equal((await delivery.deliverDurably(f.db,{...mail,send:async()=>{sends++;return accepted;}},{...message,to:'corrected@local.hastabazaar.test'},{queueKind:'business',queueId:'notice',claimToken:crypto.randomUUID(),attemptNumber:2,now:()=>now,validate:async()=>true})).outcome,'accepted');
    assert.equal(sends,2);
  } finally {f.sqlite.close();}
});

void test('SMTP DATA250 survives QUIT/cleanup failure; DATA rejection and lost acknowledgement differ', async () => {
  const settings={SMTP_HOST:'fake.invalid',SMTP_PORT:'465',SMTP_USER:'fake-user',SMTP_PASSWORD:'fake-secret',EMAIL_FROM:'test@local.hastabazaar.test'};
  const before=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));
  const allow=process.env.SMTP_RECIPIENT_ALLOWLIST;delete process.env.SMTP_RECIPIENT_ALLOWLIST;
  Object.assign(process.env,settings);
  class FakeSocket extends EventEmitter {
    destroyed=false; writes:string[]=[]; command=0;
    constructor(readonly mode:'accepted'|'rejected'|'lost'|'before354_close'|'before354_timeout'){super();queueMicrotask(()=>{this.emit('secureConnect');this.emit('data','220 fake ready\r\n');});}
    setEncoding(){} setTimeout(){} destroy(){this.destroyed=true;return this;}
    end(){throw new Error('fake cleanup failure');}
    write(data:string){this.writes.push(data);if(data==='QUIT\r\n')throw new Error('fake QUIT failure');
      if(data==='DATA\r\n'&&this.mode.startsWith('before354_')){queueMicrotask(()=>this.emit(this.mode==='before354_close'?'close':'timeout'));return true;}
      const replies=['250 ehlo','334 login','334 password','235 authenticated','250 sender','250 recipient','354 data'];
      const response=replies[this.command++];
      if(response)queueMicrotask(()=>this.emit('data',response+'\r\n'));
      else if(this.mode==='lost')queueMicrotask(()=>this.emit('close'));
      else queueMicrotask(()=>this.emit('data',this.mode==='accepted'?'250 accepted fake-id\r\n':'451 temporary failure\r\n'));
      return true;
    }
  }
  try {
    for(const mode of ['accepted','rejected','lost','before354_close','before354_timeout'] as const){
      const f=fixture();let socket:FakeSocket|undefined;
      const mail=new SmtpEmailService((()=>socket=new FakeSocket(mode)) as unknown as typeof connectTls);
      try {assert.equal((await run(f.db,mail)).outcome,mode==='accepted'?'accepted':mode==='lost'?'uncertain':'retry',mode);
        if(mode.startsWith('before354_')){
          assert.ok(socket?.writes.every(value=>!value.includes('Message-ID: <')));
          const attempt=await delivery.readDeliveryAttempt(f.db,'business','notice');assert.equal(attempt?.failureCategory,'temporary');assert.equal(attempt?.failureCode,'provider_unavailable');
          const backoff=f.sqlite.prepare('SELECT blocked_until AS untilAt FROM email_transport_backoff').get();assert.ok(Number(backoff?.untilAt)<now+6*60_000);
        }else assert.ok(socket?.writes.some(value=>value.includes('Message-ID: <')));
      }finally{f.sqlite.close();}
    }
  } finally {for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}if(allow===undefined)delete process.env.SMTP_RECIPIENT_ALLOWLIST;else process.env.SMTP_RECIPIENT_ALLOWLIST=allow;}
});
void test('provider-wide backoff gates other messages and configuration correction resumes automatically', async () => {
  const f=fixture();let sends=0;
  const mail:delivery.DeliveryMailService={transportKey:'fake-provider',configurationFingerprint:'old',send:async()=>{sends++;throw new delivery.MailDeliveryError('configuration','authentication_rejected',{providerWide:true});}};
  try {
    assert.equal((await run(f.db,mail)).outcome,'intervention');
    assert.equal((await run(f.db,mail,{queueId:'other'})).outcome,'held');assert.equal(sends,1);
    assert.equal((await run(f.db,{...mail,configurationFingerprint:'corrected',send:async()=>{sends++;return accepted;}},{attemptNumber:2})).outcome,'accepted');assert.equal(sends,2);
  }finally{f.sqlite.close();}
});
void test('unknown acceptance only resumes after verified correlated non-acceptance evidence',async()=>{
  const f=fixture();let sends=0;
  try{
    await run(f.db,{send:async()=>{throw new Error('lost acknowledgement');}});
    const row=f.sqlite.prepare('SELECT id,message_id AS messageId FROM email_delivery_attempts').get() as {id:string;messageId:string};
    const evidence={attemptId:row.id,messageId:row.messageId,transportKey:null,outcome:'not_accepted' as const,receipt:'fake-provider-negative-receipt',now};
    assert.equal(await delivery.reconcileUncertainDelivery(f.db,evidence,async()=>false),false);
    assert.equal((await run(f.db,{send:async()=>{sends++;return accepted;}},{attemptNumber:2})).outcome,'held');
    assert.equal(await delivery.reconcileUncertainDelivery(f.db,evidence,async()=>true),true);
    assert.equal((await run(f.db,{send:async()=>{sends++;return accepted;}},{attemptNumber:2})).outcome,'accepted');assert.equal(sends,1);
  }finally{f.sqlite.close();}
});
void test('accepted receipts repair the business queue transport proof without another external handoff',async()=>{
  const f=fixture();let sends=0;
  try{
    f.sqlite.exec("CREATE TABLE notification_messages(id TEXT PRIMARY KEY,status TEXT,sent_at INTEGER,delivery_transport TEXT,failure_reason TEXT,delivery_claim_token TEXT,delivery_lease_until INTEGER);INSERT INTO notification_messages VALUES('notice','failed',NULL,NULL,'delivery_failed','old-claim',1)");
    await run(f.db,{send:async()=>{sends++;return accepted;}});
    assert.equal(await delivery.recoverDeliveryReceipts(f.db,'business'),1);
    assert.deepEqual({...f.sqlite.prepare('SELECT status,delivery_transport AS transport,sent_at AS sentAt FROM notification_messages').get()},{status:'sent',transport:'provider',sentAt:now});
    assert.equal(await delivery.recoverDeliveryReceipts(f.db,'business'),0);assert.equal(sends,1);
  }finally{f.sqlite.close();}
});
void test('idle SMTP recovery probes authenticate and NOOP without a message or recipient',async()=>{
  const settings={SMTP_HOST:'fake.invalid',SMTP_PORT:'465',SMTP_USER:'fake-user',SMTP_PASSWORD:'fake-secret',EMAIL_FROM:'test@local.hastabazaar.test'};
  const before=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));Object.assign(process.env,settings);
  const writes:string[]=[];
  class ProbeSocket extends EventEmitter{
    destroyed=false;step=0;constructor(){super();queueMicrotask(()=>{this.emit('secureConnect');this.emit('data','220 ready\r\n');});}setEncoding(){}setTimeout(){}end(){}destroy(){this.destroyed=true;return this;}
    write(data:string){writes.push(data);if(data==='QUIT\r\n')return true;const reply=['250 hello','334 user','334 pass','235 authenticated','250 noop'][this.step++];queueMicrotask(()=>this.emit('data',reply+'\r\n'));return true;}
  }
  try{
    const service=new SmtpEmailService((()=>new ProbeSocket()) as unknown as typeof connectTls);
    assert.deepEqual(await service.probe(),{available:true,transport:'provider'});
    assert.ok(writes.includes('NOOP\r\n'));assert.ok(writes.every(value=>!/^DATA|^RCPT TO:|^MAIL FROM:|Message-ID:/.test(value)));
  }finally{for(const[key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
void test('capture recovery probe validates directory readiness using fake storage only',async()=>{
  const runtime=process.env.HASTABAZAAR_RUNTIME_ENV,native=process.env.HATSKALA_STAGING_NATIVE;
  process.env.HASTABAZAAR_RUNTIME_ENV='local_staging';delete process.env.HATSKALA_STAGING_NATIVE;let checks=0;
  try{const service=new LocalCaptureEmailService(async()=>{checks++;});assert.deepEqual(await service.probe(),{available:true,transport:'capture'});assert.equal(checks,1);}
  finally{if(runtime===undefined)delete process.env.HASTABAZAAR_RUNTIME_ENV;else process.env.HASTABAZAAR_RUNTIME_ENV=runtime;if(native===undefined)delete process.env.HATSKALA_STAGING_NATIVE;else process.env.HATSKALA_STAGING_NATIVE=native;}
});
void test('malformed recipient is a permanent per-recipient failure without a provider call',async()=>{
  const f=fixture();let sends=0;
  try{
    const outcome=await delivery.deliverDurably(f.db,{send:async()=>{sends++;return accepted;}},{...message,to:'bad\r\nBcc:other@local.hastabazaar.test'},{queueKind:'business',queueId:'invalid',claimToken:crypto.randomUUID(),attemptNumber:1,now:()=>now,validate:async()=>true});
    assert.equal(outcome.outcome,'intervention');assert.equal(sends,0);assert.equal((await delivery.readDeliveryAttempt(f.db,'business','invalid'))?.failureCategory,'permanent_recipient');
  }finally{f.sqlite.close();}
});
void test('legacy attempt counters with no ledger are fenced without inventing provider acceptance or another send',async()=>{
 const f=fixture();let sends=0;
 try{
  const result=await run(f.db,{send:async()=>{sends++;return accepted;}},{attemptNumber:4});
  assert.equal(result.outcome,'held');assert.equal(sends,0);
  const row=f.sqlite.prepare('SELECT phase,attempt_number AS attempts,failure_category AS category,failure_code AS code,transport,provider_receipt AS receipt,message_id AS messageId,started_at AS observedAt,handoff_at AS handoffAt FROM email_delivery_attempts').get();
  assert.equal(row?.phase,'uncertain');assert.equal(row?.attempts,3);assert.equal(row?.category,'unknown');assert.equal(row?.code,'legacy_outcome_unverified');assert.equal(row?.transport,null);assert.equal(row?.receipt,null);assert.equal(row?.handoffAt,null);assert.match(String(row?.messageId),/legacy-unverified-observation/);assert.equal(row?.observedAt,now);
 }finally{f.sqlite.close();}
});
void test('legacy expired order claims retain their status, counters and history even when the source is obsolete',async()=>{
 const f=fixture();let sends=0;
 try{
  f.sqlite.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,status TEXT);CREATE TABLE order_email_jobs(id TEXT PRIMARY KEY,order_id TEXT,order_status TEXT,created_at INTEGER,status TEXT,attempts INTEGER,next_attempt_at INTEGER,lease_until INTEGER,claim_token TEXT,sent_at INTEGER,failure_code TEXT);INSERT INTO orders VALUES('old','OLD','delivered'),('active','ACTIVE','packing');`);
  f.sqlite.prepare("INSERT INTO order_email_jobs VALUES('old','old','packing',?,'sending',3,0,?,'historical-claim',NULL,'delivery_failed')").run(now-86_400_001,now-1);
  f.sqlite.prepare("INSERT INTO order_email_jobs VALUES('active','active','packing',?,'sending',2,0,?,'current-owner',NULL,NULL)").run(now-1,now+60_000);
  const before=f.sqlite.prepare('SELECT * FROM order_email_jobs ORDER BY id').all();
  await deliverOrderEmails(f.db,{send:async()=>{sends++;return accepted;}},'https://example.test',{now});
  assert.equal(sends,0);assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_email_jobs ORDER BY id').all(),before);
  assert.equal((await delivery.readDeliveryAttempt(f.db,'order','old'))?.failureCode,'legacy_outcome_unverified');assert.equal(await delivery.readDeliveryAttempt(f.db,'order','active'),null);
 }finally{f.sqlite.close();}
});
void test('partial new rejection history cannot erase an earlier missing legacy outcome',async()=>{
 const f=fixture();let sends=0;
 try{
  await delivery.recordUnstartedDeliveryAttempt(f.db,{queueKind:'business',queueId:'notice',claimToken:crypto.randomUUID(),attemptNumber:1,now:now-1,retryAt:now});
  assert.equal((await run(f.db,{send:async()=>{sends++;return accepted;}},{attemptNumber:4})).outcome,'held');assert.equal(sends,0);
  assert.equal((await delivery.readDeliveryAttempt(f.db,'business','notice'))?.failureCode,'legacy_outcome_unverified');
 }finally{f.sqlite.close();}
});
void test('more than 100 unaccounted legacy order rows cannot crowd one fresh candidate out of its first run',async()=>{
 const f=fixture();let sends=0;
 try{
  f.sqlite.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,customer_email TEXT,status TEXT,current_total_paisa INTEGER,grand_total_paisa INTEGER,buyer_platform_fee_paisa INTEGER,current_wallet_paisa INTEGER,wallet_credit_paisa INTEGER,current_referral_discount_paisa INTEGER,current_discount_paisa INTEGER,promo_discount_paisa INTEGER,current_promo_discount_paisa INTEGER,promo_label TEXT,promo_revision INTEGER,customer_id TEXT,payment_mode TEXT,customer_phone TEXT,return_policy_snapshot_json TEXT);
  CREATE TABLE order_email_jobs(id TEXT PRIMARY KEY,order_id TEXT,order_status TEXT,created_at INTEGER,status TEXT,attempts INTEGER,next_attempt_at INTEGER,lease_until INTEGER,claim_token TEXT,sent_at INTEGER,failure_code TEXT);
  CREATE TABLE first_cod_reviews(order_id TEXT,status TEXT);CREATE TABLE shipping_jobs(id TEXT,order_id TEXT);CREATE TABLE shipping_parcels(shipping_job_id TEXT,collected_paisa INTEGER,method TEXT,rider_user_id TEXT);CREATE TABLE shipments(order_id TEXT,tracking_code TEXT);CREATE TABLE delivery_assignments(order_id TEXT,method TEXT,rider_user_id TEXT);CREATE TABLE order_cancellation_events(order_id TEXT,next_json TEXT,version INTEGER);`);
  const add=(id:string,attempts:number)=>{f.sqlite.prepare("INSERT INTO orders VALUES(?,?,?,'packing',NULL,0,0,0,0,0,NULL,0,0,NULL,NULL,NULL,'cod',NULL,NULL)").run(id,id,'test@local.hastabazaar.test');f.sqlite.prepare("INSERT INTO order_email_jobs VALUES(?,?,'packing',?,?,?,0,0,NULL,NULL,NULL)").run(id,id,now-(attempts?1000:1),attempts?'retry':'queued',attempts);};
  for(let n=0;n<125;n++)add(`legacy-${n}`,2);add('fresh',0);
  const result=await deliverOrderEmails(f.db,{send:async()=>{sends++;return accepted;}},'https://example.test',{now,limit:1});
  assert.equal(result.sent,1);assert.equal(sends,1);assert.equal(f.sqlite.prepare("SELECT status FROM order_email_jobs WHERE id='fresh'").get()?.status,'sent');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_email_jobs WHERE id LIKE 'legacy-%' AND status='retry' AND attempts=2").get()?.n,125);
 }finally{f.sqlite.close();}
});
