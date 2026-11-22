import {MailDeliveryError} from '../lib/email/delivery-attempts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createExceptionWork,updateExceptionWork} from '../lib/operations/exception-work';
import {getNotificationPanel} from '../lib/operations/notification-panel';
import {deliverBusinessEmails} from '../lib/operations/business-notifications';
import {fakeProviderMail} from './helpers/fake-provider-mail';
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE users(id TEXT PRIMARY KEY,auth_subject TEXT,email TEXT,status TEXT);CREATE TABLE user_roles(user_id TEXT,role TEXT);CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT,status TEXT,review_request_id TEXT);CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT,status TEXT,review_request_id TEXT);CREATE TABLE audit_logs(id TEXT)',
  );
  sqlite.exec('CREATE TABLE seller_participation_profiles(seller_id TEXT,application_stage TEXT)');
  sqlite.exec(
    'CREATE TABLE notification_messages(id TEXT PRIMARY KEY,recipient_user_id TEXT,audience_role TEXT,channel TEXT,template_key TEXT,subject_en TEXT,subject_ne TEXT,body_en TEXT,body_ne TEXT,related_type TEXT,related_id TEXT,status TEXT,provider_reference TEXT,failure_reason TEXT,request_id TEXT UNIQUE,created_at INTEGER,sent_at INTEGER,read_at INTEGER)',
  );
  sqlite.exec(readFileSync('drizzle/0031_staff_permissions.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0033_business_notifications.sql', 'utf8'));
  sqlite.exec(
    readFileSync('drizzle/0035_guest_business_notifications.sql', 'utf8'),
  );
  sqlite.exec('ALTER TABLE notification_messages ADD COLUMN delivery_transport TEXT');
  sqlite.exec(readFileSync('drizzle/0077_seller_registration_intakes.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0147_durable_email_delivery.sql','utf8'));
  for (const [id, role] of [
    ['sa', 'super_admin'],
    ['admin', 'admin'],
    ['restricted', 'admin'],
    ['owner', 'seller'],
    ['other', 'customer'],
  ]) {
    sqlite
      .prepare("INSERT INTO users VALUES (?,?,?,'active')")
      .run(id, id, id + '@example.test');
    sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run(id, role);
  }
  sqlite
    .prepare(
      "INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('restricted','[]',1,'sa',1)",
    )
    .run();
  sqlite.exec(
    "INSERT INTO seller_profiles VALUES ('seller-1','owner','approved',NULL);INSERT INTO products VALUES ('product-1','seller-1','submitted','mutation-1')",
  );
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const statement = sqlite.prepare(sql);
      return {
        bind(...v: SQLInputValue[]) {
          values = v;
          return this;
        },
        async first() {
          return statement.get(...values) ?? null;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        async run() {
          return {
            meta: { changes: Number(statement.run(...values).changes) },
          };
        },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { sqlite, db };
}

export function preparedFixture(){
 const f=fixture();
 f.sqlite.exec(`ALTER TABLE users ADD COLUMN display_name TEXT;
 DROP TABLE audit_logs; CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,request_id TEXT UNIQUE,created_at INTEGER);
 CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT,status TEXT);
 CREATE TABLE parcel_cash_records(id TEXT PRIMARY KEY,shipping_job_id TEXT,status TEXT);
 CREATE TABLE operation_transaction_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1));
 CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,customer_id TEXT);
 CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT);
 CREATE TABLE return_requests(id TEXT PRIMARY KEY,order_item_id TEXT,status TEXT,reviewed_by TEXT);
 CREATE TABLE complaints(id TEXT PRIMARY KEY,order_id TEXT,status TEXT,assigned_to TEXT,escalated_to TEXT);
 CREATE TABLE rider_profiles(user_id TEXT PRIMARY KEY,status TEXT);
 CREATE TABLE rider_reports(id TEXT PRIMARY KEY,shipping_job_id TEXT,rider_user_id TEXT,status TEXT,assignment_version INTEGER);
 CREATE TABLE shipping_parcels(shipping_job_id TEXT PRIMARY KEY,rider_user_id TEXT,method TEXT,version INTEGER);
 INSERT INTO shipping_jobs VALUES ('failed-job','original-order','delivery_failed');
 INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES ('admin','["order.manage"]',1,'sa',1);`);
 f.sqlite.exec(readFileSync('drizzle/0034_exception_work.sql','utf8'));return f;
}
const input={actorId:'sa',jobId:'failed-job',kind:'failed_delivery',nextAction:'Inspect the failed source parcel.',note:'Genuine isolated failed parcel evidence.',requestId:'create-case',now:1000};
export async function assign(f:ReturnType<typeof preparedFixture>){
 const id=await createExceptionWork(f.db,input);
 const command={id,actorId:'sa',version:0,ownerId:'admin',nextAction:'Review delivery evidence with the assignee.',note:'Assign the current operations reviewer.',requestId:'assign-case',now:1100};
 await updateExceptionWork(f.db,command);await updateExceptionWork(f.db,command);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()?.n,4);
 return id;
}
const panel=(f:ReturnType<typeof preparedFixture>,id:string,role:'admin'|'super_admin',permissions:('order.manage')[]=[])=>getNotificationPanel(f.db,{userId:id,audience:'staff',staff:{role,permissions}});
void test('real exception producer keeps current oversight and assignee copies, deduplicates replay, and rejects closed or version-stale sources',async()=>{
 const f=preparedFixture();try{
  const id=await assign(f);
  for(const [user,role] of [['sa','super_admin'],['admin','admin']] as const){const p=await panel(f,user,role,['order.manage']);assert.equal(p.items.length,1);assert.equal(p.items[0].relatedId,id);assert.equal(p.unreadCount,1);}
  assert.equal((await panel(f,'restricted','admin',[])).items.length,0);
  f.sqlite.exec("UPDATE exception_work_items SET version=version+1");
  assert.equal((await panel(f,'sa','super_admin')).items.length,0);assert.equal((await panel(f,'admin','admin',['order.manage'])).items.length,0);
  f.sqlite.exec("UPDATE exception_work_items SET version=1,status='resolved'");
  assert.equal((await panel(f,'sa','super_admin')).items.length,0);
 }finally{f.sqlite.close();}
});
void test('current Super Admin oversight is not an assignee requirement; revoked and inactive oversight copies disappear',async()=>{
 const f=preparedFixture();try{
  await assign(f);f.sqlite.exec("DELETE FROM user_roles WHERE user_id='sa'");
  assert.equal((await panel(f,'sa','super_admin')).items.length,0);
  f.sqlite.exec("INSERT INTO user_roles VALUES ('sa','super_admin');UPDATE users SET status='disabled' WHERE id='sa'");
  assert.equal((await panel(f,'sa','super_admin')).items.length,0);
  assert.equal((await panel(f,'admin','admin',[])).items.length,0);
 }finally{f.sqlite.close();}
});
void test('actual email processor retains eligible oversight and assignee copies with fake-provider receipts, and cancels stale versions',async()=>{
 for(const stale of [false,true]){const f=preparedFixture();try{
  await assign(f);if(stale)f.sqlite.exec('UPDATE exception_work_items SET version=version+1');
  const sends:string[]=[];
  const result=await deliverBusinessEmails(f.db,fakeProviderMail({send:async message=>{sends.push(message.to);}}),'https://example.test',{now:2000});
  assert.equal(result.accepted,stale?0:2);assert.equal(result.cancelled,stale?2:0);assert.equal(result.failed,0);
  assert.deepEqual(sends.sort(),stale?[]:['admin@example.test','sa@example.test']);
 }finally{f.sqlite.close();}}
});

void test('fake provider temporary failures retain exact queue IDs and retry once with durable acceptance receipts',async()=>{
 const f=preparedFixture();try{
  await assign(f);const original=f.sqlite.prepare("SELECT id,request_id FROM notification_messages WHERE channel='email' ORDER BY id").all();
  const failed=await deliverBusinessEmails(f.db,fakeProviderMail({send:async()=>{throw new MailDeliveryError('temporary','delivery_failed');}}),'https://example.test',{now:2000});
  assert.equal(failed.failed,2);assert.equal(failed.accepted,0);
  const timing=f.sqlite.prepare("SELECT MIN(delivery_next_attempt_at) earliest,MAX(delivery_next_attempt_at) latest FROM notification_messages WHERE channel='email'").get();const retry=Number(timing?.latest);assert.ok(Number(timing?.earliest)>2000);
  const mail=fakeProviderMail({send:async()=>{}});
  assert.equal((await deliverBusinessEmails(f.db,mail,'https://example.test',{now:Number(timing?.earliest)-1})).accepted,0);
  assert.equal((await deliverBusinessEmails(f.db,mail,'https://example.test',{now:Number(retry)+1})).accepted,2);
  assert.deepEqual(f.sqlite.prepare("SELECT id,request_id FROM notification_messages WHERE channel='email' ORDER BY id").all(),original);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM email_delivery_attempts WHERE phase='accepted'").get()?.n,2);
  assert.equal((await deliverBusinessEmails(f.db,mail,'https://example.test',{now:Number(retry)+2})).accepted,0);
 }finally{f.sqlite.close();}
});
