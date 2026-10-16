import assert from 'node:assert/strict';
import test from 'node:test';
import { earnedMaker } from './helpers/company-store-financial-fixture';
import { getManagedFinanceWorkspace } from '../lib/managed-commerce/finance-workspace';
import { programReadinessItems } from '../components/admin/program-readiness-checklist';

void test('program checklist links every blocked requirement to its responsible action',()=>{
  const items=programReadinessItems({companyReady:false,simulation:true,activation:false,makers:0,approvedProducts:0,publishedProducts:0,payablePaisa:0});
  assert.equal(items.length,5);
  for(const item of items) {assert.equal(item.ready,false);assert.ok(item.owner);assert.match(item.href,/^#(program-settings|maker-applications|program-products|maker-payments)$/);assert.ok(item.detail);}
});

void test('finance workspace reads current balances without releasing earnings or creating payments',async()=>{
  const f=await earnedMaker();
  try {
    const before=JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_entitlements ORDER BY id').all());
    const audits=f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n;
    const workspace=await getManagedFinanceWorkspace(f.db,{actorId:'reviewer',now:f.financialNow});
    assert.equal(workspace.makers[0].summary.payablePaisa,91000);
    assert.equal(workspace.makers[0].preview.amountPaisa,91000);
    assert.equal(workspace.makers[0].acceptedTermsReady,true);
    assert.equal(workspace.makers[0].paymentCount,0);
    assert.equal(workspace.nextCursor,null);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM managed_entitlements ORDER BY id').all()),before);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n,audits);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n,0);
    await assert.rejects(getManagedFinanceWorkspace(f.db,{actorId:'maker-owner',now:f.now}),/Super Admin|permission|active/i);
    f.sqlite.prepare("UPDATE seller_participation_profiles SET participation_route='registered_seller' WHERE seller_id=?").run(f.sellerId);
    const historical=await getManagedFinanceWorkspace(f.db,{actorId:'reviewer',now:f.financialNow});
    assert.equal(historical.makers[0].summary.payablePaisa,91000);
    assert.equal(historical.makers[0].route,'registered_seller');
  } finally {f.sqlite.close();}
});
