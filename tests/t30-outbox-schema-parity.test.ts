import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getTableConfig} from 'drizzle-orm/sqlite-core';
import {notificationMessages} from '../db/schema';
import {DatabaseSync} from 'node:sqlite';

void test('generated outbox ORM retains every canonical0033 business-delivery column and its queue index',()=>{
 const source=readFileSync('drizzle/0033_business_notifications.sql','utf8'),table=getTableConfig(notificationMessages),columns=new Map(table.columns.map(column=>[column.name,column]));
 const originals=[...source.matchAll(/ALTER TABLE notification_messages ADD COLUMN ([a-z_]+) (TEXT|INTEGER)([^;]*);/g)];assert.equal(originals.length,6);
 for(const[,name,type,tail]of originals){const column=columns.get(name);assert.ok(column,'Missing canonical0033 outbox column: '+name);assert.equal(column.notNull,/NOT NULL/.test(tail),name+' nullability');if(type==='INTEGER')assert.equal(column.default,0,name+' bounded delivery default');}
 assert.ok(table.indexes.some(index=>index.config.name==='idx_business_notification_queue'),'Preserve the canonical channel/status/retry/lease queue index');
});

void test('ORM and additive Maria catchup retain actual0035 registered/guest recipient shapes without rebuilding history',async()=>{
 const source=readFileSync('drizzle/0035_guest_business_notifications.sql','utf8'),table=getTableConfig(notificationMessages),columns=new Map(table.columns.map(column=>[column.name,column]));
 assert.equal(columns.get('recipient_user_id')!.notNull,false);assert.ok(columns.has('guest_email'));assert.ok(columns.has('guest_order_id'));assert.ok(table.checks.some(check=>check.name==='notification_recipient_shape'));
 const{notificationRuntimeMariaSource}=await import('../lib/operations/notification-schema.mjs');
 const maria=notificationRuntimeMariaSource(readFileSync('drizzle/0033_business_notifications.sql','utf8'),source);
 assert.equal(readFileSync('deployment/babal/mariadb-notification-runtime-compatibility.sql','utf8'),maria);
  assert.doesNotMatch(maria,/^--\S/m,'MariaDB line comments require whitespace after the two dashes');
 assert.doesNotMatch(maria,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|UPDATE notification_messages SET)\b/i);assert.match(maria,/BEFORE INSERT ON notification_messages/);assert.match(maria,/BEFORE UPDATE ON notification_messages/);
  assert.match(maria,/BINARY NEW\.audience_role=BINARY 'customer'/);assert.match(maria,/BINARY NEW\.channel=BINARY 'email'/);
 const sqlite=new DatabaseSync(':memory:');try{
  const create=source.slice(0,source.indexOf('--> statement-breakpoint'));sqlite.exec("CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users(id) VALUES('recipient');");sqlite.exec(create);
  const insert=sqlite.prepare("INSERT INTO notification_messages_guest_new(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,request_id,created_at,business_event_key,guest_email,guest_order_id) VALUES(?,?,?,?, 'business.order','Subject','Subject','Body','Body',?,1,?,?,?)");
  insert.run('registered','recipient','staff','in_app','registered',null,null,null);
  insert.run('guest',null,'customer','email','guest','business.order','guest@local.hastabazaar.test','fictional-order');
  insert.run('original-empty',null,'customer','email','original-empty','','','');
  for(const[id,audience,channel,event,email,order]of [['staff-guest','staff','email','business.order','guest@local.hastabazaar.test','fictional-order'],['bell-guest','customer','in_app','business.order','guest@local.hastabazaar.test','fictional-order'],['no-event','customer','email',null,'guest@local.hastabazaar.test','fictional-order'],['no-email','customer','email','business.order',null,'fictional-order'],['no-order','customer','email','business.order','guest@local.hastabazaar.test',null]])assert.throws(()=>insert.run(id,null,audience,channel,id,event,email,order));
  for(const[id,audience,channel]of [['role-case','CUSTOMER','email'],['channel-case','customer','EMAIL'],['role-space','customer ','email'],['channel-space','customer','email ']])assert.throws(()=>insert.run(id,null,audience,channel,id,'business.order','guest@local.hastabazaar.test','fictional-order'));
  assert.throws(()=>sqlite.prepare("UPDATE notification_messages_guest_new SET channel='in_app' WHERE id='guest'").run());
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM notification_messages_guest_new').get()!.n,3);
 }finally{sqlite.close();}
});
