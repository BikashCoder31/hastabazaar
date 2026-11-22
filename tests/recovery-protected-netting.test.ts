import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {requestProtectedChange} from '../lib/sellers/protected-change-requests';
import {protectedCapabilityState} from '../lib/sellers/protected-change-policy';
import * as recovery from '../lib/payments/seller-recovery';

async function ready() {
 const f=await approvedSellerRecoveryFixture();
 const terms=await recovery.getSellerRecoveryPlanTerms(f.db,'registered-owner',f.recoveryId);
 const proposal=await recovery.proposeSellerRecoveryPlan(f.db,{...f.ctx('hold-owner-terms','1'),actorId:'registered-owner'},{caseId:f.recoveryId,termsDigest:terms.termsDigest,termsAccepted:true,nettingAuthorized:true,installments:[{amountPaisa:f.originalPaidPaisa,dueAt:Date.now()+7*86400000}],contactDetails:'Contact through my verified seller inbox.',nextReviewAt:Date.now()+3*86400000});
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await recovery.approveSellerRecoveryPlan(f.db,f.ctx('hold-plan-decision','2'),{caseId:f.recoveryId,proposalId:proposal.id,reviewDigest:review.reviewDigest,reason:'Approve only this explicitly accepted original liability arrangement.'});
 f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('hold-future-earning','registered','sale',10000,1,'Fictional future eligible earning',1)").run();
 return f;
}
async function hold(f:Awaited<ReturnType<typeof ready>>,kind:'bank'|'identity',currentUnusable=false) {
 const revisions=f.sqlite.prepare("SELECT identity_revision,bank_revision FROM seller_protected_revisions WHERE seller_id='registered'").get()!;
 await requestProtectedChange(f.db,{sellerId:'registered',actorId:'registered-owner',kind,fields:kind==='bank'?['bankAccountNumber']:['legalName'],reason:'Request a protected correction with current source review.',expectedIdentityRevision:Number(revisions.identity_revision),expectedBankRevision:Number(revisions.bank_revision),requestId:`hold-${kind}`,now:Date.now(),currentUnusable});
}
for(const currentUnusable of [false,true])void test(`bank-only hold preserves approved internal netting and external payout hold (unusable=${currentUnusable})`,async()=>{
 const f=await ready();try{
 await hold(f,'bank',currentUnusable);
 assert.equal((await protectedCapabilityState(f.db,'registered')).payoutsHeld,true);
 const before=f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n;
 const result=await recovery.applySellerRecoveryEarnings(f.db,f.ctx('bank-held-netting','3'),{caseId:f.recoveryId});
 assert.equal(result.amountPaisa,10000);
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n,before);
 assert.equal((await protectedCapabilityState(f.db,'registered')).payoutsHeld,true);
 }finally{f.dispose();}
});
for(const atCommit of [false,true])void test(`identity uncertainty blocks approved netting without changing any money (atCommit=${atCommit})`,async()=>{
 const f=await ready();try{
 await hold(f,'bank');
 if(!atCommit)await hold(f,'identity');
 const db=Object.create(f.db) as D1Database;
 if(atCommit){let injected=false;db.batch=async statements=>{if(!injected){injected=true;await hold(f,'identity');}return f.db.batch(statements);};}
 await assert.rejects(recovery.applySellerRecoveryEarnings(db,f.ctx('identity-held-netting','3'),{caseId:f.recoveryId}));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.revision,3);
 }finally{f.dispose();}
});
