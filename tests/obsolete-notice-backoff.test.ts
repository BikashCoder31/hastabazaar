import test from 'node:test';
import assert from 'node:assert/strict';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer} from '../lib/payments/payout-transfers';
import {reconcileObsoleteOperationalNotice} from '../lib/operations/obsolete-notices';

function notice(f:Awaited<ReturnType<typeof payoutTransferFixture>>,packetId:string,userId:string){return f.sqlite.prepare("SELECT id FROM notification_messages WHERE template_key='business.finance.payout' AND related_id=? AND recipient_user_id=? AND channel='email' ORDER BY created_at DESC,id DESC LIMIT 1").get(packetId,userId)!;}
function attempt(f:Awaited<ReturnType<typeof payoutTransferFixture>>,id:string,phase:string,now:number){f.sqlite.prepare("UPDATE notification_messages SET status='failed',delivery_attempts=1,delivery_next_attempt_at=? WHERE id=?").run(now+3600000,id);f.sqlite.prepare("INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,message_id,started_at) VALUES(?,'business',?,?,1,?,?,?)").run('attempt-'+id,id,'claim-'+id,phase,'<fictional-'+id+'@local.hastabazaar.test>',now-1000);}

void test('obsolete retry is cancelled during backoff while every possible or known provider handoff is retained',async()=>{
 const f=await payoutTransferFixture();try{
 const packet=await preparePayoutTransfer(f.db,f.ctx('t29-backoff-packet'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Prepare one original instruction to inspect only its fictional operational delivery states.'});
 const pending=notice(f,packet.id,'reviewer'),handoff=notice(f,packet.id,'payout-owner');
 await approvePayoutTransfer(f.db,f.ctx('t29-backoff-approved','0'),{packetId:packet.id,reason:'Approve this original exact packet without claiming a completed bank payment.'});
 const accepted=notice(f,packet.id,'reviewer'),captured=notice(f,packet.id,'payout-owner');
 await startPayoutTransfer(f.db,f.ctx('t29-backoff-started','1'),{packetId:packet.id,reason:'The newer processing outcome makes earlier queued preparation and approval messages obsolete.'});
 const now=Date.now();attempt(f,String(pending.id),'not_accepted',now);attempt(f,String(handoff.id),'handoff_started',now);attempt(f,String(accepted.id),'accepted',now);attempt(f,String(captured.id),'captured',now);
 assert.equal((await reconcileObsoleteOperationalNotice(f.db,String(pending.id),now)).cancelled,1);
 for(const row of [handoff,accepted,captured]){assert.equal((await reconcileObsoleteOperationalNotice(f.db,String(row.id),now)).cancelled,0);assert.equal(f.sqlite.prepare('SELECT status FROM notification_messages WHERE id=?').get(row.id)!.status,'failed');}
 assert.equal(f.sqlite.prepare('SELECT delivery_next_attempt_at FROM notification_messages WHERE id=?').get(pending.id)!.delivery_next_attempt_at,now+3600000);
 // Contact-only legacy notices are revalidated by their owning sender path;
 // this account-recipient sweep cannot infer obsolete access from NULL alone.
 const contactOnly=notice(f,packet.id,'reviewer');
 const legacyOrder=f.sqlite.prepare('SELECT id FROM orders ORDER BY id LIMIT 1').get()!;
 f.sqlite.prepare("UPDATE notification_messages SET recipient_user_id=NULL,audience_role='customer',guest_email='legacy-contact@local.hastabazaar.test',guest_order_id=?,business_event_key='fixture-legacy-contact' WHERE id=?").run(legacyOrder.id,contactOnly.id);
 assert.deepEqual(await reconcileObsoleteOperationalNotice(f.db,String(contactOnly.id),now),{cancelled:0,resumed:0});
 }finally{f.dispose();}
});

void test('validated restored access resumes the same unaccepted work; a newly acquired sender lease wins cancellation race',async()=>{
 const f=await payoutTransferFixture();try{
 f.sqlite.prepare("UPDATE users SET auth_subject=id WHERE id='reviewer' AND auth_subject IS NULL").run();
 const packet=await preparePayoutTransfer(f.db,f.ctx('t29-current-resume'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Prepare the actual original source for current authority and delivery-claim fencing.'}),row=notice(f,packet.id,'reviewer'),now=Date.now();
 f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='reviewer'").run();assert.equal((await reconcileObsoleteOperationalNotice(f.db,String(row.id),now)).cancelled,1);
 f.sqlite.prepare("UPDATE users SET status='active' WHERE id='reviewer'").run();assert.equal((await reconcileObsoleteOperationalNotice(f.db,String(row.id),now)).resumed,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages WHERE id=?').get(row.id)!.n,1);
 f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='reviewer'").run();
 const prepare=f.db.prepare.bind(f.db);let raced=false;
 f.db.prepare=((sql:string)=>{const statement=prepare(sql);if(sql.startsWith("UPDATE notification_messages SET status='cancelled'")){const run=statement.run.bind(statement);statement.run=(async()=>{raced=true;f.sqlite.prepare('UPDATE notification_messages SET delivery_claim_token=?,delivery_lease_until=? WHERE id=?').run('fictional-new-sender-claim',now+60000,row.id);return run();}) as typeof statement.run;}return statement;}) as typeof f.db.prepare;
 assert.equal((await reconcileObsoleteOperationalNotice(f.db,String(row.id),now)).cancelled,0);assert.equal(raced,true);assert.equal(f.sqlite.prepare('SELECT delivery_claim_token FROM notification_messages WHERE id=?').get(row.id)!.delivery_claim_token,'fictional-new-sender-claim');
 }finally{f.dispose();}
});
