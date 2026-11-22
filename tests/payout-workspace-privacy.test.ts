import assert from 'node:assert/strict';
import test from 'node:test';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
import {resolveRuntimeEnvironment} from '../lib/staging/environment';
void test('Finance prepares from masked verified records; full retained bank details require current Super Admin authority and an access receipt',async()=>{
 const f=await payoutTransferFixture();try{
 const path='../lib/payments/payout-workspace';const {getPayoutFinanceWorkspace}=await import(path);
 const environment=resolveRuntimeEnvironment({runtimeEnvironment:'local_staging',nodeEnvironment:'development',appOrigin:'http://localhost:3018'});
 f.sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('finance-viewer','finance-viewer@local.hastabazaar.test','Fictional Finance','active',1,1); INSERT INTO user_roles(user_id,role,assigned_at) VALUES('finance-viewer','admin',1); INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('finance-viewer','["payout.prepare"]',1,'reviewer',1)`);
 const ordinary=await getPayoutFinanceWorkspace(f.db,'finance-viewer',environment);assert.equal(ordinary.superAdmin,false);assert.equal(ordinary.candidates.length,1);assert.equal(ordinary.candidates[0].amountPaisa,20000);
 assert.doesNotMatch(JSON.stringify(ordinary),/TEST-PAYOUT-001|TEST-MANUAL-0001|FICTIONAL-INDEPENDENT-BANK-OWNERSHIP/);
 const packet=await preparePayoutTransfer(f.db,f.ctx('private-workspace-prepare'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Prepare one exact original packet for privacy and evidence review.'});
 const restricted=await getPayoutFinanceWorkspace(f.db,'reviewer',environment);assert.equal(restricted.packets[0].id,packet.id);assert.match(JSON.stringify(restricted),/TEST-PAYOUT-001/);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='payout.transfer.private_review'").get()!.n,1);
 assert.doesNotMatch(JSON.stringify(await getPayoutFinanceWorkspace(f.db,'finance-viewer',environment)),/TEST-PAYOUT-001|TEST-MANUAL-0001/);
 await assert.rejects(getPayoutFinanceWorkspace(f.db,'payout-owner',environment));
 f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='finance-viewer'");await assert.rejects(getPayoutFinanceWorkspace(f.db,'finance-viewer',environment));
 }finally{f.dispose();}
});
void test('former retained registered owner cannot read processing uncertain or paid packet after ownership changes',async()=>{
 const f=await payoutTransferFixture();try{
  const {getPayoutFinanceWorkspace}=await import('../lib/payments/payout-workspace');
  const environment=resolveRuntimeEnvironment({runtimeEnvironment:'local_staging',nodeEnvironment:'development',appOrigin:'http://localhost:3018'});
  const packet=await preparePayoutTransfer(f.db,f.ctx('retained-owner-prepare'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Retain the actual original owner before a later current ownership change.'});
  f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('payout-owner','super_admin',1); UPDATE seller_profiles SET user_id='reviewer' WHERE id='payout-seller'");
  const prepared=await getPayoutFinanceWorkspace(f.db,'payout-owner',environment);assert.equal(prepared.packets.some(r=>r.id===packet.id),false,'Prepared original owner remains excluded when current owner is reviewer.');assert.doesNotMatch(JSON.stringify(prepared.packets),/TEST-PAYOUT-001/);
  f.sqlite.exec("UPDATE seller_profiles SET user_id='payout-owner' WHERE id='payout-seller'");
  const originalPrepare=f.db.prepare.bind(f.db);
  f.db.prepare=((sql:string)=>{const statement=originalPrepare(sql);if(sql.includes('p.source_snapshot_json AS snapshot')){const originalAll=statement.all.bind(statement);statement.all=(async()=>{const result=await originalAll();return {...result,results:result.results.map(row=>({...(row as Record<string,unknown>),snapshot:'{"model":"registered"}'}))};}) as typeof statement.all;}return statement;}) as typeof f.db.prepare;
  assert.equal((await getPayoutFinanceWorkspace(f.db,'reviewer',environment)).packets.some(r=>r.id===packet.id),false,'Malformed native retained source fails closed without altering immutable storage.');
  f.db.prepare=originalPrepare;
  await approvePayoutTransfer(f.db,f.ctx('retained-owner-approve','0'),{packetId:packet.id,reason:'Independently approve the original verified payout instruction and available source.'});
  await startPayoutTransfer(f.db,f.ctx('retained-owner-start','1'),{packetId:packet.id,reason:'Begin the single original instruction before the later ownership change.'});
  f.sqlite.exec("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('new-payout-owner','new-payout-owner@local.hastabazaar.test','New Fictional Owner','active',1,1); UPDATE seller_profiles SET user_id='new-payout-owner' WHERE id='payout-seller'");
  const excluded=async(state:string)=>{const work=await getPayoutFinanceWorkspace(f.db,'payout-owner',environment);assert.equal(work.packets.some(r=>r.id===packet.id),false,state);assert.doesNotMatch(JSON.stringify(work.packets),/TEST-PAYOUT-001|retained-owner|TEST-MANUAL/);assert.ok((await getPayoutFinanceWorkspace(f.db,'reviewer',environment)).packets.some(r=>r.id===packet.id));};
  await excluded('processing');
  await recordPayoutTransferOutcome(f.db,f.ctx('retained-owner-uncertain','2'),{packetId:packet.id,outcome:'uncertain',evidenceReference:'FICTIONAL-ORIGINAL-BANK-INQUIRY',reason:'The independent original bank response remains uncertain; retain its existing reservation.'});
  await excluded('uncertain');
  await recordPayoutTransferOutcome(f.db,f.ctx('retained-owner-paid','3'),{packetId:packet.id,outcome:'paid',amountPaisa:20000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-RETAINED-OWNER-PAID',evidenceReference:'FICTIONAL-ORIGINAL-PAID-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual original completed debit to its retained exact beneficiary.'});
  await excluded('paid');
 }finally{f.dispose();}
});
