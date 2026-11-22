import { fixtureWithOverrides } from './helpers/fixture-delegation';
import assert from 'node:assert/strict';
import test from 'node:test';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {requestSellerPayout,processPayoutRequest} from '../lib/db/repositories/payouts';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {recordCustomerRefundReversal,retainCustomerRefundRecovery} from '../lib/payments/customer-refund-reversal';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {resolveRuntimeEnvironment} from '../lib/staging/environment';
const environment=resolveRuntimeEnvironment({runtimeEnvironment:'test',nodeEnvironment:'test'});

void test('Overview reads original Finance work, follows request→candidate→packet without duplicates and omits private payloads',async()=>{
 const loadedFixtureModule=await import('../lib/admin/finance-work-items').catch(()=>null);assert.equal(typeof loadedFixtureModule?.readFinanceWorkItems,'function','The Overview needs native Finance work outside the shared task store.');assert.equal(typeof loadedFixtureModule?.readFinanceWorkSourceState,'function','Source disappearance cannot prove completion.');
 const f=await payoutTransferFixture();try{
  f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('finance-work-additional-earned',?,'sale',5000,1,'Explicit independent additional fictional original earnings',1)").run(f.sellerId);
  const requestId=await requestSellerPayout(f.db,{sellerId:f.sellerId,actorId:'payout-owner',note:'FICTIONAL-PRIVATE-SELLER-REQUEST-NOTE',requestId:'finance-work-original-request',now:Date.now()});
  const native=f.sqlite.prepare('SELECT created_at,first_finance_due_at FROM payout_requests WHERE id=?').get(requestId)!;
  let result=await loadedFixtureModule!.readFinanceWorkItems(f.db,'reviewer',environment,{returnTo:'/admin/workspace?filter=finance'});const request=result.items.find(item=>item.family==='payout_request'&&item.id===requestId)!;
  assert.ok(request);assert.equal(request.startedAt,native.created_at);assert.equal(request.dueAt,native.first_finance_due_at);assert.equal(request.nativeRevision,null);assert.equal(request.ownerId,null);assert.equal(request.actionRequired,true);assert.equal(request.completed,false);assert.equal(new URL(request.href,'https://fixture.invalid').searchParams.get('request'),requestId);
  assert.equal((await loadedFixtureModule!.readFinanceWorkSourceState(f.db,'reviewer',environment,{family:'payout_request',id:requestId}))!.completed,false);
  assert.ok(result.items.some(item=>item.family==='refund_obligation'&&item.id===f.obligationId));assert.ok(result.items.some(item=>item.family==='payout_candidate'&&item.id===f.payoutId));
  const serialized=JSON.stringify(result);for(const secret of ['FICTIONAL-PRIVATE-SELLER-REQUEST-NOTE','TEST-PAYOUT-001','TEST-MANUAL-0001','FICTIONAL-PRIVATE-BENEFICIARY-EVIDENCE'])assert.ok(!serialized.includes(secret),secret);
  await processPayoutRequest(f.db,{id:requestId,actorId:'reviewer',actorRole:'super_admin',action:'prepare',note:'Prepare this exact original eligible request with native source guards.',requestId:'finance-work-request-prepared',now:Date.now()});
  const payoutId=String(f.sqlite.prepare('SELECT payout_id FROM payout_requests WHERE id=?').get(requestId)!.payout_id);
  result=await loadedFixtureModule!.readFinanceWorkItems(f.db,'reviewer',environment);assert.equal(result.items.filter(item=>item.family==='payout_request'&&item.id===requestId).length,0);assert.equal(result.items.filter(item=>item.family==='payout_candidate'&&item.id===payoutId).length,1);
  const candidate=result.items.find(item=>item.family==='payout_candidate'&&item.id===payoutId)!;assert.equal(candidate.origin.requestId,requestId);assert.equal(candidate.startedAt,native.created_at);
  const reviewed=await loadedFixtureModule!.readFinanceWorkSourceState(f.db,'reviewer',environment,{family:'payout_request',id:requestId});assert.equal(reviewed!.completed,true);assert.ok(reviewed!.followUpHref?.includes(encodeURIComponent(payoutId)));
  assert.equal((await loadedFixtureModule!.readFinanceWorkSourceState(f.db,'reviewer',environment,{family:'payout_candidate',id:payoutId,sourceKind:'registered'}))!.completed,false);
  let origins=0;const failedDb=fixtureWithOverrides(f.db, {prepare:(sql:string)=>{if(sql.startsWith('SELECT created_at createdAt FROM')&&++origins===2)throw new Error('Fictional source read outage after one native payout projected');return f.db.prepare(sql);},batch:f.db.batch.bind(f.db)}) as D1Database;
  const partialFailure=await loadedFixtureModule!.readFinanceWorkItems(failedDb,'reviewer',environment);assert.ok(partialFailure.coverage.filter(row=>row.family==='payout_candidate'||row.family==='payout_packet').every(row=>row.state==='unavailable'));assert.ok(!partialFailure.items.some(row=>row.family==='payout_candidate'||row.family==='payout_packet'));assert.ok(partialFailure.items.some(row=>row.id===f.obligationId));
  const packet=await preparePayoutTransfer(f.db,f.ctx('finance-work-native-packet'),{model:'registered',payoutId,accountVersionId:f.accountVersionId,reason:'Bind the actual original request to one exact verified instruction.'});
  result=await loadedFixtureModule!.readFinanceWorkItems(f.db,'reviewer',environment);assert.equal(result.items.filter(item=>item.family==='payout_candidate'&&item.id===payoutId).length,0);const active=result.items.filter(item=>item.family==='payout_packet'&&item.id===packet.id);assert.equal(active.length,1);assert.equal(active[0].origin.requestId,requestId);assert.equal(active[0].startedAt,native.created_at);assert.equal(active[0].nativeRevision,0);
  const denied=await loadedFixtureModule!.readFinanceWorkItems(f.db,'customer',environment);assert.deepEqual(denied.items,[]);assert.deepEqual(denied.recentDecisions,[]);assert.ok(denied.coverage.every(family=>family.state==='unavailable'));assert.ok(!JSON.stringify(denied).includes(packet.id));
  assert.equal(await loadedFixtureModule!.readFinanceWorkSourceState(f.db,'reviewer',environment,{family:'payout_packet',id:'unavailable-original-packet'}),null);assert.equal(await loadedFixtureModule!.readFinanceWorkSourceState(f.db,'customer',environment,{family:'payout_packet',id:packet.id}),null);
  const waiting=await loadedFixtureModule!.readFinanceWorkSourceState(f.db,'reviewer',environment,{family:'payout_candidate',id:payoutId,sourceKind:'registered'});assert.equal(waiting!.completed,false);assert.deepEqual(waiting!.followUp,{family:'payout_packet',id:packet.id,sourceKind:'registered'});
  await approvePayoutTransfer(f.db,f.ctx('finance-work-approve','0'),{packetId:packet.id,reason:'Approve this exact fictional original instruction and verified source.'});await startPayoutTransfer(f.db,f.ctx('finance-work-start','1'),{packetId:packet.id,reason:'Record one actual fictional original instruction as processing.'});
  await recordPayoutTransferOutcome(f.db,f.ctx('finance-work-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:5000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-FINANCE-WORK-PAID',evidenceReference:'FICTIONAL-FINANCE-WORK-ACTUAL-DEBIT',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the completed fictional bank debit for this exact original obligation.'});
  const done=await loadedFixtureModule!.readFinanceWorkSourceState(f.db,'reviewer',environment,{family:'payout_candidate',id:payoutId,sourceKind:'registered'});assert.equal(done!.completed,true);assert.equal(done!.followUp,undefined);assert.equal((await loadedFixtureModule!.readFinanceWorkSourceState(f.db,'reviewer',environment,{family:'payout_packet',id:packet.id,sourceKind:'registered'}))!.completed,true);
  const history=await loadedFixtureModule!.readFinanceWorkItems(f.db,'reviewer',environment,{limit:100}),paid=history.recentDecisions.filter(row=>row.family==='payout_packet'&&row.sourceId===packet.id&&row.action==='payout.transfer.paid');assert.equal(paid.length,1);assert.equal(paid[0].recordKind,'live');assert.ok(history.recentDecisions.some(row=>row.family==='payout_request'&&row.sourceId===requestId&&row.action==='payout.request.prepared'));assert.equal(history.decisionsCoverage,'partial');
 }finally{f.dispose();}
});

void test('historical completed refund is not a completion proof after actual bank return or while its linked reissue remains open',async()=>{
 const {readFinanceWorkItems,readFinanceWorkSourceState}=await import('../lib/admin/finance-work-items'),f=await approvedSellerRecoveryFixture();try{
  const key={family:'refund_obligation' as const,id:f.obligationId,sourceKind:'return_refund'};assert.equal((await readFinanceWorkSourceState(f.db,'reviewer',environment,key))!.completed,true);
  const packet=f.sqlite.prepare("SELECT id,revision FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
  const credit=await recordBankReceipt(f.db,f.ctx('finance-state-returned-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-FINANCE-STATE-RETURNED',bankAt:Date.now()-1,amountMinor:f.cashPaisa,currency:'NPR',payerReference:'The bank returned this exact original customer refund.',payerUserId:'customer',evidenceReference:'FICTIONAL-FINANCE-STATE-BANK-RETURN',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently verify the returned original refund credit and factual payer.'});
  const returned=await recordCustomerRefundReversal(f.db,f.ctx('finance-state-returned-record',String(packet.revision)),{packetId:String(packet.id),receiptId:credit.id,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-FINANCE-STATE-RETURN-PROOF',reason:'Record the actual original customer refund returned by the bank.'});
  assert.equal((await readFinanceWorkSourceState(f.db,'reviewer',environment,key))!.completed,false);let view=await readFinanceWorkItems(f.db,'reviewer',environment,{limit:100});assert.equal(view.items.find(row=>row.id===f.obligationId)!.status,'returned_for_review');
  assert.equal(view.recentDecisions.some(row=>row.sourceId===f.obligationId&&row.completed),false);
  const retry=await f.m.openRefundObligation(f.db,f.ctx('finance-state-original-reissue'),{kind:'receipt_return',sourceId:credit.id,reason:'Reserve only the actual returned credit for its original customer.'});
  const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);await retainCustomerRefundRecovery(f.db,f.ctx('finance-state-retain',String(review.case.revision)),{caseId:f.recoveryId,reversalId:returned.id,retryObligationId:retry.id,reviewDigest:review.reviewDigest,stillValidObligationConfirmed:true,evidenceReference:'FICTIONAL-FINANCE-STATE-VALID-ENTITLEMENT',reason:'The independently reviewed original entitlement remains valid and needs this actual reissue.',publicMessage:'The original refund remains due and its actual returned credit is reserved for reissue.'});
  const state=await readFinanceWorkSourceState(f.db,'reviewer',environment,key);assert.equal(state!.completed,false);assert.equal(state!.status,'retry_pending');assert.deepEqual(state!.followUp,{family:'refund_obligation',id:retry.id,sourceKind:'receipt_return'});
  view=await readFinanceWorkItems(f.db,'reviewer',environment,{limit:100});assert.ok(!view.items.some(row=>row.id===f.obligationId));assert.equal(view.items.filter(row=>row.id===retry.id).length,1);assert.equal(f.sqlite.prepare('SELECT state FROM refund_obligations WHERE id=?').get(f.obligationId)!.state,'completed');assert.equal(f.sqlite.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').get(packet.id)!.state,'paid');
 }finally{f.dispose();}
});

void test('Finance projection final authority fence suppresses sources after access is revoked during its native reads',async()=>{
 const loadedFixtureModule=await import('../lib/admin/finance-work-items').catch(()=>null);assert.equal(typeof loadedFixtureModule?.readFinanceWorkItems,'function');
 const f=await payoutTransferFixture();try{
  let revoked=false;const db=fixtureWithOverrides(f.db, {prepare:f.db.prepare.bind(f.db),batch:async<T>(statements:D1PreparedStatement[])=>{const result=await f.db.batch<T>(statements);if(!revoked){revoked=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role IN('admin','super_admin')").run();}return result;}}) as D1Database;
  const result=await loadedFixtureModule!.readFinanceWorkItems(db,'reviewer',environment);assert.equal(revoked,true);assert.deepEqual(result.items,[]);assert.deepEqual(result.recentDecisions,[]);assert.ok(result.coverage.every(family=>family.state==='unavailable'));
 }finally{f.dispose();}
});

void test('a newly personal payout is not exposed after the protected workspace read completed',async()=>{
 const {readFinanceWorkItems}=await import('../lib/admin/finance-work-items');const f=await payoutTransferFixture();try{
  let privateRead=false,changed=false;const db=fixtureWithOverrides(f.db, {prepare:(sql:string)=>{if(sql.includes("'payout.transfer.private_review'"))privateRead=true;return f.db.prepare(sql);},batch:async<T>(statements:D1PreparedStatement[])=>{const result=await f.db.batch<T>(statements);if(privateRead&&!changed){changed=true;f.sqlite.prepare('UPDATE seller_profiles SET user_id=? WHERE id=?').run('reviewer',f.sellerId);}return result;}}) as D1Database;
  // Hostile persisted ownership between read phases: not a claim that raw SQL is a supported handoff.
  const result=await readFinanceWorkItems(db,'reviewer',environment);assert.equal(changed,true);assert.ok(!result.items.some(row=>row.origin.payoutId===f.payoutId));
 }finally{f.dispose();}
});
