import assert from 'node:assert/strict';
import test from 'node:test';
import {agreedSellerRecoveryFixture,approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';
import {agreeRecovery} from './helpers/recovery-agreement-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import * as fixed from '../lib/managed-commerce/fixed-supply';
import {recoverRecoveryCommand} from '../lib/payments/recovery-commands';

for(const interest of ['retained_customer','current_customer','current_seller'] as const)void test(`${interest} cannot review or replay a recovery even with Super Admin authority`,async()=>{
 const f=await approvedSellerRecoveryFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  if(interest==='retained_customer')f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run('foreign',f.orderId);
  else if(interest==='current_customer')f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run('reviewer',f.orderId);
  else f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();
  const actor=interest==='retained_customer'?'customer':'reviewer';
  if(actor==='customer')f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('customer','super_admin',1)").run();
  await assert.rejects(recovery.getSellerRecoveryReview(f.db,actor,f.recoveryId),/personal interest/i);
  if(actor==='reviewer')await assert.rejects(recoverRecoveryCommand(f.db,actor,'approved-fixture-decision','staff'),/personal interest/i);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

for(const change of ['customer','seller','permission'] as const)void test(`netting rechecks ${change} at the money write boundary`,async()=>{
 const f=await agreedSellerRecoveryFixture();try{
  f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('boundary-earning','registered','sale',10000,1,'Fictional independently earned amount',1)").run();
  const before=f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n;
  f.setBeforeBatch(()=>{
   if(change==='customer')f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run('reviewer',f.orderId);
   else if(change==='seller')f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();
   else f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();
  });
  await assert.rejects(recovery.applySellerRecoveryEarnings(f.db,f.ctx('boundary-netting-'+change,'3'),{caseId:f.recoveryId}));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.revision,3);
  assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n,before);
 }finally{f.dispose();}
});

async function priorityFixture(olderNetting:boolean){
 const f=await fixedRecoveryFixture();try{
  const ctx=(prefix:string)=>(key:string,revision:string|null=null)=>f.ctx(prefix+'-'+key,revision);
  let older:string;
  if(olderNetting)older=await agreeRecovery(f.db,ctx('older'),{kind:'supplier_adjustment',id:f.adjustmentId});
  else{
   older=(await recovery.openSellerRecovery(f.db,f.ctx('older-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Review the actual original supplier liability with a cash-only approved method.'})).id;
   const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',older);
   await recovery.approveSellerRecovery(f.db,f.ctx('older-cash-approve','0'),{caseId:older,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-OLDER-CASH-ONLY',reason:'Approve cash repayment without assuming any accepted earnings netting authority.'});
  }
  await fixed.addFixedSupplyAdjustment(f.db,{recordId:f.recordId,actorId:'reviewer',kind:'defect',amountPaisa:10000,reason:'A second independently inspected original supply defect has a separately approved amount.',requestId:'second-original-defect',now:Date.now(),environment:f.environment});
  const second=f.sqlite.prepare('SELECT id FROM managed_supplier_adjustments WHERE obligation_id=? AND id<>?').get(f.recordId,f.adjustmentId)!;
  const newer=await agreeRecovery(f.db,ctx('newer'),{kind:'supplier_adjustment',id:String(second.id)});
  // Distinct approval times make chronology deterministic without depending on execution speed.
  f.sqlite.prepare('UPDATE seller_recovery_cases SET approved_at=approved_at-10000,revision=revision+1 WHERE id=?').run(older);
  const future=await fixed.createFixedSupplyRecord(f.db,{sellerId:f.sellerId,productId:'cup',quantity:3,agreedUnitPaisa:10000,createdBy:f.actorId,agreementVersion:'FICTIONAL-FIXED-RECOVERY',agreementLanguage:'en',payoutBeneficiaryReference:f.sources.beneficiaryReference,requestId:'priority-future-supply',now:Date.now(),environment:f.environment});
  await fixed.decideFixedSupplyRecord(f.db,{recordId:future,actorId:'reviewer',action:'accept',quantityAccepted:3,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'FICTIONAL-PRIORITY-FUTURE-GOODS',reason:'Independently inspect and accept the future goods under their original supplier terms.',requestId:'priority-future-accepted',now:Date.now(),environment:f.environment});
  return {...f,older,newer,future};
 }catch(error){f.dispose();throw error;}
}

void test('oldest eligible approved case consumes future earnings first and both cases share the same pool',async()=>{
 const f=await priorityFixture(true);try{
  await assert.rejects(recovery.applySellerRecoveryEarnings(f.db,f.ctx('newer-out-of-order','3'),{caseId:f.newer,environment:f.environment}),/older approved recovery/i);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
  const first=await recovery.applySellerRecoveryEarnings(f.db,f.ctx('oldest-first','4'),{caseId:f.older,environment:f.environment});
  assert.equal(first.amountPaisa,20000);
  const second=await recovery.applySellerRecoveryEarnings(f.db,f.ctx('newer-after-oldest','3'),{caseId:f.newer,environment:f.environment});
  assert.equal(second.amountPaisa,10000);
  assert.equal((await fixed.getFixedSupplyBalance(f.db,f.future)).balancePaisa,0);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations').get()!.n,30000);
 }finally{f.dispose();}
});

void test('an older approved cash-only case does not block a newer eligible seller-authorized netting arrangement',async()=>{
 const f=await priorityFixture(false);try{
  const result=await recovery.applySellerRecoveryEarnings(f.db,f.ctx('eligible-after-cash-only','3'),{caseId:f.newer,environment:f.environment});
  assert.equal(result.amountPaisa,10000);
  assert.equal((await recovery.getSellerRecoveryReview(f.db,'reviewer',f.older)).position.remainingPaisa,20000);
  assert.equal((await fixed.getFixedSupplyBalance(f.db,f.future)).balancePaisa,20000);
 }finally{f.dispose();}
});

void test('registered recovery cannot consume another legal seller earnings and retained agreement currency stays NPR',async()=>{
 const f=await agreedSellerRecoveryFixture();try{
  f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('foreign-earned','maker','sale',100000,1,'Fictional unrelated seller earnings',1)").run();
  await assert.rejects(recovery.applySellerRecoveryEarnings(f.db,f.ctx('foreign-earned-denied','3'),{caseId:f.recoveryId}),/No eligible/i);
  const proposal=f.sqlite.prepare('SELECT * FROM seller_recovery_proposals WHERE case_id=?').get(f.recoveryId)!;
  const changed={...proposal,id:'wrong-currency-proposal',case_revision:99,request_id:'wrong-currency-proposal',currency:'USD'};
  const columns=Object.keys(changed);
  assert.throws(()=>f.sqlite.prepare(`INSERT INTO seller_recovery_proposals(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...Object.values(changed)),/CHECK constraint failed/i);
  assert.equal(f.sqlite.prepare("SELECT amount_paisa FROM seller_ledger_entries WHERE id='foreign-earned'").get()!.amount_paisa,100000);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

void test('fixed recovery cannot substitute registered-model earnings of the same seller for an accepted future supply obligation',async()=>{
 const f=await fixedRecoveryFixture();try{
  const caseId=await agreeRecovery(f.db,f.ctx,{kind:'supplier_adjustment',id:f.adjustmentId});
  f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('wrong-model-earned',?,'sale',100000,1,'Fictional independent registered-model balance',1)").run(f.sellerId);
  await assert.rejects(recovery.applySellerRecoveryEarnings(f.db,f.ctx('wrong-model-denied','3'),{caseId,environment:f.environment}),/No eligible/i);
  assert.equal(f.sqlite.prepare("SELECT amount_paisa FROM seller_ledger_entries WHERE id='wrong-model-earned'").get()!.amount_paisa,100000);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});
