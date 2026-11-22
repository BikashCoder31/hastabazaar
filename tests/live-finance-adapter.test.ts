import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {getManagedFinanceWorkspace} from '../lib/managed-commerce/finance-workspace';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {getSellerReadiness} from '../lib/sellers/readiness';
void test('actual admin finance exposes earned original live money and prepares, recovers and safely cancels one actual reservation after an order-only hold',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  const api=await import('../lib/managed-commerce/live-finance-api');
  const initial=await api.readLiveManagedFinance(f.db,'reviewer',f.sellerId,Date.now());assert.equal(initial.preview.amountPaisa,69000);assert.equal(initial.summary.earnedPaisa,69000);
  const workspace=await getManagedFinanceWorkspace(f.db,{actorId:'reviewer',sellerId:f.sellerId,now:Date.now()});assert.equal(workspace.makers[0].live!.preview.amountPaisa,69000);assert.equal(workspace.makers[0].summary.balancePaisa,0,'Retained simulation totals must stay separate.');
  const release={sourceFormId:'system.managed-live-finance',action:'release',requestId:'actual-api-release',expectedRevision:null,input:{reason:'Review maturity using the original actual delivered and paid source facts.'}};
  assert.equal((await api.runLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,release)).id,f.sellerId);
  const releaseReceipt=await api.recoverLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,release.requestId);assert.deepEqual(Object.keys(releaseReceipt!).sort(),['id','recordKind','released'],'Private original entitlement IDs stay in the native receipt, not the browser outcome.');
  const now=Date.now(),fee=await createBusinessSettingDraft(f.db,{key:'managed_sale_linked_platform_retention_bps',value:1525,actorId:'reviewer',reason:'Publish a genuinely new effective fee without changing existing original earned money.',requestId:'finance-new-order-fee',now});
  await publishBusinessSettingDraft(f.db,{id:fee.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:now,reason:'Current new-order terms need fresh consent while the original payout stays governed by its saved terms.',requestId:'finance-new-order-fee-publish',now});
  assert.equal((await getSellerReadiness(f.db,f.sellerId,Date.now())).newOrders,false);assert.equal((await api.readLiveManagedFinance(f.db,'reviewer',f.sellerId,Date.now())).preview.amountPaisa,69000);
  f.sqlite.prepare("UPDATE seller_participation_profiles SET participation_route='registered_seller' WHERE seller_id=?").run(f.sellerId);
  const ctx={sourceFormId:'system.managed-live-finance',action:'prepare',requestId:'actual-api-prepare',expectedRevision:null,input:{scheduledFor:Date.now(),expectedAmountPaisa:initial.preview.amountPaisa,expectedSnapshot:initial.preview.snapshotDigest,reason:'Prepare only the exact independently reconciled original live earnings for protected bank execution.'}};
  const saved=await api.runLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,ctx);assert.equal(saved.recordKind,'live');assert.equal((await api.recoverLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,ctx.requestId))!.id,saved.id);assert.deepEqual(await api.runLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,ctx),saved);
  const current=await api.readLiveManagedFinance(f.db,'reviewer',f.sellerId,Date.now());assert.equal(current.summary.reservedPaisa,69000);assert.equal(current.payments.length,1);assert.equal(current.payments[0].canCancel,true);
  const cancel={sourceFormId:'system.managed-live-finance',action:'cancel',requestId:'actual-api-cancel',expectedRevision:String(current.payments[0].updatedAt),input:{payoutId:saved.id,reason:'Retire only the unchanged unsent original reservation before any bank instruction.'}};
  const cancelled=await api.runLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,cancel);assert.equal(cancelled.status,'rejected');assert.equal((await api.recoverLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,cancel.requestId))!.id,saved.id);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_payouts WHERE record_kind='live'").get()!.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_transfer_packets').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,0);
 }finally{f.dispose();}
});
void test('actual finance API denies current role/party conflicts, forged fields and direct mark-paid without admitting simulation records',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  const api=await import('../lib/managed-commerce/live-finance-api');
  await assert.rejects(api.readLiveManagedFinance(f.db,f.ownerId,f.sellerId,Date.now()),{status:403});
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'super_admin',?)").run(f.buyerId,Date.now());
  await assert.rejects(api.readLiveManagedFinance(f.db,f.buyerId,f.sellerId,Date.now()),{status:403});
  const preview=await api.readLiveManagedFinance(f.db,'reviewer',f.sellerId,Date.now()),body={sourceFormId:'system.managed-live-finance',action:'prepare',requestId:'forgery-live-api',expectedRevision:null,input:{scheduledFor:Date.now(),expectedAmountPaisa:preview.preview.amountPaisa,expectedSnapshot:preview.preview.snapshotDigest,reason:'Review the exact original actual source and current beneficiary without a client override.'}};
  await assert.rejects(api.runLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,{...body,input:{...body.input,destinationReference:'CLIENT-OVERRIDE'}}),{status:400});
  await assert.rejects(api.runLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,{...body,action:'mark_paid'}),{status:400});
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();await assert.rejects(api.runLiveManagedFinanceAction(f.db,'reviewer',f.sellerId,body),{status:403});
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_payouts').get()!.n,0);
 }finally{f.dispose();}
});
