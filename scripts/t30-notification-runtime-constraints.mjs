import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {splitFixtureSql} from './portable-mariadb-fixture.mjs';

/** Caller supplies only the authenticated helper's fresh owned fixture connection. */
export async function verifyT30NotificationRuntimeConstraints(connection){
 const[scope]=await connection.query('SELECT DATABASE() AS name');assert.match(String(scope[0]?.name),/^fixture_[a-f0-9]{8}_[a-z][a-z0-9_]{0,24}$/,'Only the already selected owned portable fixture database is permitted.');
 const[metadata]=await connection.query("SELECT COLUMN_NAME name,IS_NULLABLE nullable,COLUMN_DEFAULT defaultValue FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notification_messages'");
 const columns=new Map(metadata.map(row=>[row.name,row]));
 for(const name of ['business_event_key','required_permission','delivery_attempts','delivery_next_attempt_at','delivery_lease_until','delivery_claim_token','guest_email','guest_order_id'])assert.ok(columns.has(name),'Actual original outbox field: '+name);
 assert.equal(columns.get('recipient_user_id').nullable,'YES');
 for(const name of ['delivery_attempts','delivery_next_attempt_at','delivery_lease_until']){assert.equal(columns.get(name).nullable,'NO');assert.equal(String(columns.get(name).defaultValue),'0');}
 const[index]=await connection.query("SELECT COLUMN_NAME name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notification_messages' AND INDEX_NAME='idx_business_notification_queue' ORDER BY SEQ_IN_INDEX");assert.deepEqual(index.map(row=>row.name),['channel','status','delivery_next_attempt_at','delivery_lease_until']);
 await connection.execute("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('notification-compat-owner','notification-compat-owner@local.hastabazaar.test','Fictional compatibility owner','active',1,1)");
 const sql="INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,request_id,created_at,business_event_key,guest_email,guest_order_id,status,provider_reference,sent_at) VALUES(?,?,?,?,'business.fixture.guard','Fictional subject','Fictional subject','Fixture only','Fixture only',?,1,?,?,?,?,'Fictional retained receipt',17)";
 const insert=(id,recipient,audience,channel,event,email,order,status='queued')=>connection.execute(sql,[id,recipient,audience,channel,id,event,email,order,status]);
 await insert('compat-retained','notification-compat-owner','staff','in_app',null,null,null,'sent');
 const[before]=await connection.query("SELECT * FROM notification_messages WHERE id='compat-retained'");
 const statements=splitFixtureSql(await readFile('deployment/babal/mariadb-notification-runtime-compatibility.sql','utf8'));
 for(const statement of statements)await connection.query(statement);
 const[after]=await connection.query("SELECT * FROM notification_messages WHERE id='compat-retained'");assert.deepEqual(after,before,'Reapplying additive source must preserve the complete historical row and provider fact.');
 await insert('compat-guest',null,'customer','email','business.fixture.guard','guest@local.hastabazaar.test','fictional-retained-order');
 // Original0035 constrains NULL shape, not email syntax or commercial ownership. Existing
 // protected producers/recipient checks remain responsible for actual delivery eligibility.
 await insert('compat-original-empty',null,'customer','email','','','');
 const invalid=[
  ['staff','staff','email','business.fixture.guard','guest@local.hastabazaar.test','fictional-order'],
  ['bell','customer','in_app','business.fixture.guard','guest@local.hastabazaar.test','fictional-order'],
  ['sms','customer','sms','business.fixture.guard','guest@local.hastabazaar.test','fictional-order'],
  ['event','customer','email',null,'guest@local.hastabazaar.test','fictional-order'],
  ['email','customer','email','business.fixture.guard',null,'fictional-order'],
  ['order','customer','email','business.fixture.guard','guest@local.hastabazaar.test',null],
  ['role-case','CUSTOMER','email','business.fixture.guard','guest@local.hastabazaar.test','fictional-order'],
  ['channel-case','customer','EMAIL','business.fixture.guard','guest@local.hastabazaar.test','fictional-order'],
  ['role-space','customer ','email','business.fixture.guard','guest@local.hastabazaar.test','fictional-order'],
  ['channel-space','customer','email ','business.fixture.guard','guest@local.hastabazaar.test','fictional-order'],
 ];
 for(const[id,...values]of invalid)await assert.rejects(insert('compat-invalid-'+id,null,...values),error=>/notification_recipient_shape/.test(error.message));
 for(const[column,value]of [['channel','in_app'],['channel','EMAIL'],['audience_role','customer '],['business_event_key',null],['guest_email',null],['guest_order_id',null]])await assert.rejects(connection.execute('UPDATE notification_messages SET `'+column+'`=? WHERE id=?',[value,'compat-guest']),error=>/notification_recipient_shape/.test(error.message));
 await assert.rejects(insert('compat-missing-fk','nonexistent-fixture-user','staff','email',null,null,null),error=>error.code==='ER_NO_REFERENCED_ROW_2');
 return{columns:8,registeredPositive:true,guestPositive:true,originalEmptyShapePreserved:true,negativeInserts:invalid.length,negativeUpdates:6,foreignKeyDenied:true,retainedRowUnchanged:true,reappliedStatements:statements.length};
}
