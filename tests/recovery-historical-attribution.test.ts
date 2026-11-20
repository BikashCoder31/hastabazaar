import test from 'node:test';
import assert from 'node:assert/strict';
import {sellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {recoverySourceDispositionSql} from '../lib/payments/recovery-source-disposition';
import {openSellerRecovery,getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';
import {historicalManagedRecoveryFixture} from './helpers/historical-managed-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {readHistoricalRecoveryCandidates} from '../lib/payments/recovery-historical';
import {historicalRegisteredRecoveryFixture} from './helpers/historical-registered-recovery-fixture';
import {runRecoveryCommand,recoverRecoveryCommand,parseRecoveryCommand} from '../lib/payments/recovery-commands';

for(const model of ['registered','managed'] as const)void test(`${model} unreviewed historical deduction candidates never become confirmed collected money on opening`,async()=>{
 const f=await(model==='registered'?sellerRecoveryFixture():managedRecoveryFixture());try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const historicalSql=recoverySourceDispositionSql(model).historicalSql;
 // A read-boundary test double supplies an unreviewed candidate, not a verified legacy
 // payment. Actual attribution/native source proof requires separate integration tests.
 const db={prepare(sql:string){return sql===historicalSql?{bind(){return{first:async()=>({amount:5000})};}} as unknown as D1PreparedStatement:f.db.prepare(sql);},batch:f.db.batch.bind(f.db)} as D1Database;
 const before=f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n;
 const opened=await openSellerRecovery(db,f.ctx('unreviewed-history-'+model),{kind:'refund',id:f.refundId,reason:'Open an unresolved historical deduction for explicit original-source attribution, not new collection.'});
 const current=await getSellerRecoveryReview(db,'reviewer',opened.id);
 assert.equal(current.case.historicalRecoveredPaisa,0);assert.equal(current.position.recoveredPaisa,0);assert.equal(current.position.collectiblePaisa,0);
 assert.equal(current.source.historicalNettingPaisa,5000);assert.equal(current.source.blockerCode,'historical_netting');
 const statement=await getSellerRecoveryStatement(db,current.source.ownerId,opened.id);assert.equal(statement.recovered.earnings,0);assert.equal(statement.reconciliation,true);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,before);
 }finally{f.dispose();}
});

void test('one original managed deduction shared by two real refunds is attributed once across both cases',async()=>{
 const f=await historicalManagedRecoveryFixture({twoRefunds:true});try{
 assert.ok(f.secondRefundId);
 const first=await openSellerRecovery(f.db,f.ctx('shared-history-first'),{kind:'refund',id:f.refundId,reason:'Review the first actually refunded unit against the shared original payout deduction.'});
 const second=await openSellerRecovery(f.db,f.ctx('shared-history-second'),{kind:'refund',id:f.secondRefundId,reason:'Review the second actually refunded unit against the same original payout deduction.'});
 async function attribute(id:string,requestId:string){const review=await getSellerRecoveryReview(f.db,'reviewer',id),candidate=(await readHistoricalRecoveryCandidates(f.db,review.source))[0];
  assert.equal(candidate.capacityPaisa,f.originalPaidPaisa);assert.equal(review.source.confirmedPaisa,f.originalPaidPaisa/2);
  return recovery.reviewSellerRecoveryHistory(f.db,f.ctx(requestId,String(review.case.revision)),{caseId:id,reviewDigest:review.reviewDigest,candidate,amountPaisa:f.originalPaidPaisa/2,evidenceReference:'FICTIONAL-SHARED-HISTORICAL-DEDUCTION',reason:'Attribute this separately refunded unit within the one actual shared deduction pool.',publicMessage:'The original deduction attributable to this refunded unit is confirmed.',environment:f.context.environment});}
 await attribute(first.id,'shared-history-first-reviewed');
 const partial=await getSellerRecoveryReview(f.db,'reviewer',first.id);
 assert.equal(partial.position.recoveredPaisa,f.originalPaidPaisa/2);assert.equal(partial.case.state,'reconciliation');assert.ok(partial.source.blocker);
 await assert.rejects(recovery.approveSellerRecovery(f.db,f.ctx('shared-history-no-new-cap','1'),{caseId:first.id,reviewDigest:partial.reviewDigest,evidenceReference:'FICTIONAL-SHARED-POOL-STILL-OPEN',reason:'A partially assigned shared native pool must remain owned reconciliation.'}));
 await attribute(second.id,'shared-history-second-reviewed');
 const complete=await getSellerRecoveryReview(f.db,'reviewer',first.id);
 await recovery.reviewSellerRecoveryHistory(f.db,f.ctx('shared-history-first-complete','1'),{caseId:first.id,reviewDigest:complete.reviewDigest,candidate:null,amountPaisa:0,evidenceReference:'FICTIONAL-SHARED-HISTORY-COMPLETE',reason:'Explicitly complete the first case after the other original refund consumed its actual share.',publicMessage:'The shared original deduction is fully reconciled; your remaining balance is zero.',environment:f.context.environment});
 for(const id of [first.id,second.id]){const review=await getSellerRecoveryReview(f.db,'reviewer',id);assert.equal(review.case.state,'recovered');assert.equal(review.case.approvedCapPaisa,0);assert.equal(review.position.remainingPaisa,0);assert.equal(review.position.recoveredPaisa,f.originalPaidPaisa/2);assert.equal(review.source.blocker,null);}
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_historical_attributions').get()!.n,f.originalPaidPaisa);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

void test('a historically instructed payout without actual bank completion is never a paid deduction candidate',async()=>{
 const f=await historicalManagedRecoveryFixture({pendingBank:true});try{
 const source=await recovery.readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId});
 assert.deepEqual(await readHistoricalRecoveryCandidates(f.db,source),[]);assert.equal(source.historicalNettingPaisa,0);assert.equal(source.blockerCode,'payout_reconciliation');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_payout_allocations WHERE payout_id=? AND disposition='reserved'").get(f.historicalPayoutId)!.n,3);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_historical_attributions').get()!.n,0);
 }finally{f.dispose();}
});

void test('registered historical review uses protected commands, current independent approval and a private-safe owner statement',async()=>{
 const f=await historicalRegisteredRecoveryFixture();try{
 const opened=await openSellerRecovery(f.db,f.ctx('registered-historical-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the original paid registered deduction before any new collection.'});
 const view=await getSellerRecoveryReview(f.db,'reviewer',opened.id),candidate=(await readHistoricalRecoveryCandidates(f.db,view.source))[0];
 assert.equal(candidate.kind,'registered_refund_group');assert.equal(candidate.payoutId,f.historicalPayoutId);assert.equal(candidate.scopeId,f.refundId);assert.equal(candidate.nativeProof,true);assert.equal(candidate.capacityPaisa,f.originalPaidPaisa);
 const body={sourceFormId:'system.recovery-finance',action:'history',requestId:'registered-historical-reviewed',expectedRevision:'0',input:{caseId:opened.id,reviewDigest:view.reviewDigest,candidate,amountPaisa:f.originalPaidPaisa,evidenceReference:'FICTIONAL-PRIVATE-ORIGINAL-HISTORY-PROOF',reason:'FICTIONAL-PRIVATE-HISTORICAL-REASON: verify the original bank, native deduction and exact case allocation.',publicMessage:'Your original payout deduction is confirmed. There is no remaining balance.'}};
 for(const bad of [{...body,input:{...body.input,amountPaisa:'100'}},{...body,input:{...body.input,candidate:{...candidate,actorId:'reviewer'}}},{...body,input:{...body.input,environment:{kind:'production'}}}])assert.throws(()=>parseRecoveryCommand(bad,'staff'));
 assert.throws(()=>parseRecoveryCommand(body,'seller'));
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)").run();
 await assert.rejects(runRecoveryCommand(f.db,'registered-owner',body,'staff'),/interest|independent/i);
 const ledger=f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n;
 const result=await runRecoveryCommand(f.db,'reviewer',body,'staff');assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);
 assert.deepEqual(await runRecoveryCommand(f.db,'reviewer',body,'staff'),result);
 await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,input:{...body.input,amountPaisa:1}},'staff'),(error:unknown)=>error instanceof recovery.SellerRecoveryError&&error.status===409);
 const statement=await getSellerRecoveryStatement(f.db,'registered-owner',opened.id);
 assert.equal(statement.recovered.earnings,f.originalPaidPaisa);assert.equal(statement.position.remainingPaisa,0);assert.equal(statement.events.at(-1)!.message,body.input.publicMessage);
 assert.equal(statement.followup.phase,'closed');assert.equal(statement.agreement,null);
 for(const privateValue of ['FICTIONAL-PRIVATE-ORIGINAL-HISTORY-PROOF','FICTIONAL-PRIVATE-HISTORICAL-REASON','historicalReview','nativeProof','candidate'])assert.equal(JSON.stringify(statement).includes(privateValue),false);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n,ledger);
 f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
 await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),/permission/i);
 await assert.rejects(runRecoveryCommand(f.db,'reviewer',body,'staff'),/permission/i);
 }finally{f.dispose();}
});

void test('revoking the reviewer at commit rolls back historical attribution, event, notice and projection',async()=>{
 const f=await historicalManagedRecoveryFixture();try{
 const opened=await openSellerRecovery(f.db,f.ctx('historical-revoked-open'),{kind:'refund',id:f.refundId,reason:'Review actual historical attribution under current independent authority.'});
 const current=await getSellerRecoveryReview(f.db,'reviewer',opened.id),candidate=(await readHistoricalRecoveryCandidates(f.db,current.source))[0];let revoked=false;
 const db={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){if(!revoked){revoked=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();}return f.db.batch(statements);}} as D1Database;
 await assert.rejects(recovery.reviewSellerRecoveryHistory(db,f.ctx('historical-revoked-decision','0'),{caseId:opened.id,reviewDigest:current.reviewDigest,candidate,amountPaisa:f.originalPaidPaisa,evidenceReference:'FICTIONAL-REVOKED-REVIEW-EVIDENCE',reason:'The actual current role must still authorize the final historical attribution commit.',publicMessage:'Finance reviewed the original deduction and its bank proof.',environment:f.context.environment}));
 assert.equal(revoked,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_historical_attributions').get()!.n,0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_recovery_events WHERE action='history_reviewed'").get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').get(opened.id)!.revision,0);
 }finally{f.dispose();}
});

void test('historical attribution keeps an owner dispute open and a later correction restores its collected portion exactly once',async()=>{
 const f=await historicalManagedRecoveryFixture();try{
 const opened=await openSellerRecovery(f.db,f.ctx('historical-dispute-open'),{kind:'refund',id:f.refundId,reason:'Review actual past deductions while preserving independent owner review rights.'});
 const original=await getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await recovery.disputeSellerRecovery(f.db,{...f.ctx('historical-owner-dispute','0'),actorId:original.source.ownerId},{caseId:opened.id,amountPaisa:1000,reason:'Please review the original disputed portion even though the historical payout already deducted it.',evidenceReference:null});
 const current=await getSellerRecoveryReview(f.db,'reviewer',opened.id),dueAt=current.case.nextActionAt,candidate=(await readHistoricalRecoveryCandidates(f.db,current.source))[0];
 await recovery.reviewSellerRecoveryHistory(f.db,f.ctx('historical-disputed-attribution','1'),{caseId:opened.id,reviewDigest:current.reviewDigest,candidate,amountPaisa:f.originalPaidPaisa,evidenceReference:'FICTIONAL-DISPUTED-HISTORICAL-ATTRIBUTION',reason:'Recognize actual historical money without deciding the outstanding owner dispute.',publicMessage:'The original deduction is confirmed. Your disputed portion remains under review.',environment:f.context.environment});
 const reviewed=await getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(reviewed.case.state,'disputed');assert.equal(reviewed.case.disputedPaisa,1000);assert.equal(reviewed.case.nextActionAt,dueAt);assert.equal(reviewed.position.remainingPaisa,0);
 const input={caseId:opened.id,newConfirmedPaisa:f.originalPaidPaisa-1000,resolveDisputedPaisa:1000,reviewDigest:reviewed.reviewDigest,evidenceReference:'FICTIONAL-ORIGINAL-HISTORICAL-CORRECTION',reason:'Accept the original disputed portion and restore the amount already deducted through one native correction.',publicMessage:'Your reviewed responsibility is reduced. The excess original deduction is restored to your earnings.',environment:f.context.environment};
 const result=await recovery.correctSellerRecoveryLiability(f.db,f.ctx('historical-correction','2'),input);assert.deepEqual(await recovery.correctSellerRecoveryLiability(f.db,f.ctx('historical-correction','2'),input),result);
 const after=await getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(after.case.historicalRecoveredPaisa,f.originalPaidPaisa);assert.equal(after.case.restoredPaisa,1000);assert.equal(after.position.recoveredPaisa,f.originalPaidPaisa-1000);assert.equal(after.position.remainingPaisa,0);assert.equal(after.case.disputedPaisa,0);
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM managed_settlement_entries WHERE reason_code='recovery_correction'").get()!.n,1000);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_historical_attributions').get()!.n,1);
 }finally{f.dispose();}
});

void test('explicit historical review recognizes only actual past money and grants no new collection authority',async()=>{
 const f=await historicalManagedRecoveryFixture();try{
 const opened=await openSellerRecovery(f.db,f.ctx('historical-review-open'),{kind:'refund',id:f.refundId,reason:'Review the genuine fictional past deduction before any further collection.'});
 const {readHistoricalRecoveryCandidates}=await import('../lib/payments/recovery-historical');
 const current=await getSellerRecoveryReview(f.db,'reviewer',opened.id),candidate=(await readHistoricalRecoveryCandidates(f.db,current.source))[0];
 const ledgerBefore=f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n;
 const input={caseId:opened.id,reviewDigest:current.reviewDigest,candidate,amountPaisa:f.originalPaidPaisa,evidenceReference:'FICTIONAL-HISTORICAL-ATTRIBUTION-REVIEW',reason:'Attribute the actual original native deduction once, with its exact paid bank and source proof.',publicMessage:'Finance confirmed the original deduction. No further balance remains.',environment:f.context.environment};
 const result=await recovery.reviewSellerRecoveryHistory(f.db,f.ctx('historical-review','0'),input);
 assert.deepEqual(await recovery.reviewSellerRecoveryHistory(f.db,f.ctx('historical-review','0'),input),result);
 const after=await getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(after.case.historicalRecoveredPaisa,f.originalPaidPaisa);assert.equal(after.position.recoveredPaisa,f.originalPaidPaisa);
 assert.equal(after.case.state,'recovered');assert.equal(after.case.approvedCapPaisa,0);assert.equal(after.case.approvedAt,null);assert.equal(after.source.blocker,null);
 assert.equal(after.position.remainingPaisa,0);assert.equal(after.position.collectiblePaisa,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,ledgerBefore);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_historical_attributions').get()!.n,1);
 await assert.rejects(recovery.reviewSellerRecoveryHistory(f.db,f.ctx('historical-duplicate','1'),{...input,amountPaisa:1,reviewDigest:after.reviewDigest}));
 }finally{f.dispose();}
});

void test('a genuine fictional historical managed deduction remains uncollected in the case until explicit attribution',async()=>{
 const f=await historicalManagedRecoveryFixture();try{
 const opened=await openSellerRecovery(f.db,f.ctx('historical-real-case'),{kind:'refund',id:f.refundId,reason:'Reconcile the actual original historical native payout deduction without charging the seller twice.'});
 const current=await getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(current.source.historicalNettingPaisa,f.originalPaidPaisa);assert.equal(current.source.blockerCode,'historical_netting');
 assert.equal(current.case.historicalRecoveredPaisa,0);assert.equal(current.position.collectiblePaisa,0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_payout_allocations WHERE payout_id=? AND amount_paisa<0 AND disposition='paid'").get(f.historicalPayoutId)!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 const path='../lib/payments/recovery-historical',m=await import(path),candidates=await m.readHistoricalRecoveryCandidates(f.db,current.source);
 assert.equal(candidates.length,1);assert.equal(candidates[0].kind,'managed_allocation');assert.equal(candidates[0].payoutId,f.historicalPayoutId);
 assert.equal(candidates[0].scopeId,f.entitlementId);assert.equal(candidates[0].capacityPaisa,f.originalPaidPaisa);assert.equal(candidates[0].nativeProof,true);
 }finally{f.dispose();}
});
