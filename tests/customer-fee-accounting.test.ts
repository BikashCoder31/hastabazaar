import assert from 'node:assert/strict';
import test from 'node:test';
import * as repository from '../lib/db/repositories/customer-service-fees';
import { accountingFixture } from './helpers/accounting-fixture';
import { readAccountingSources } from '../lib/accounting/source-queries';
import { parseAccountingQuery } from '../lib/accounting/filters';
import { accountingColumns } from '../lib/accounting/source-manifest';
import { getOrderDocument } from '../lib/db/repositories/orders';

// These permissive in-memory rows deliberately mix history with new evidence.
async function fixture() {
  const f = await accountingFixture();
  for (const [id, fee] of [['old-nine', 37], ['old-other', 0], ['new-waived', 0], ['new-paid', 1000]] as const) {
    f.insert('orders', { id, order_number: id, receipt_token_hash: 'legacy-receipt', buyer_platform_fee_paisa: fee, status: 'delivered', payment_status: 'paid', created_at: 100 });
    for (let line = 0; line < 3; line++) f.insert('order_items', { id: `${id}-${line}`, order_id: id, seller_id: line ? 'seller-b' : 'seller-a', commission_bps: id === 'old-nine' ? 900 : id === 'old-other' ? 1300 : 1200, commission_paisa: 8, line_total_paisa: 101, commission_base_paisa: 101, seller_discount_paisa: 0, fulfillment_status: 'delivered' });
  }
  for(const [id,bps,fee] of [['old-nine',900,37],['old-other',1300,0]] as const)
    f.insert('order_documents',{id:id+'-document',order_id:id,kind:'order_statement',status:'issued',snapshot_json:JSON.stringify({sellerCommissionBps:bps,buyerPlatformFeePaisa:fee,documentTitle:'Original order statement'})});
  f.insert('order_item_marketplace_fees', { order_item_id: 'old-nine-0', standard_bps: 900, base_paisa: 101, standard_paisa: 9, waived_paisa: 9, net_paisa: 0, campaign_id: 'old-seller', campaign_revision: 2, created_at: 100 });
  f.insert('customer_fee_waiver_campaigns', { id: 'customer', revision: 3, created_at: 1, updated_at: 200 });
  for (const [revision, name] of [[2, 'Original customer launch'], [3, 'Later campaign name']] as const) f.insert('customer_fee_waiver_revisions', { campaign_id: 'customer', revision, name, state: 'published', starts_at: 1, ends_at: 1000, created_at: 1 });
  for (const id of ['new-waived', 'new-paid']) f.insert('order_customer_service_fees', { order_id: id, policy_enabled: 1, policy_amount_paisa: 1000, policy_version_id: 'original-policy', standard_paisa: 1000, waived_paisa: id === 'new-waived' ? 1000 : 0, net_paisa: id === 'new-waived' ? 0 : 1000, campaign_id: id === 'new-waived' ? 'customer' : null, campaign_revision: id === 'new-waived' ? 2 : null, created_at: 100 });
  return f;
}

void test('historical fee reads preserve recorded buyer charges, original rates and saved campaign revision without writes', async () => {
  assert.equal(typeof repository.readOrderCustomerServiceFees, 'function');
  const f = await fixture();
  try {
    const before = f.fingerprint();
    const views = await repository.readOrderCustomerServiceFees(f.db, ['old-nine', 'old-other', 'new-waived', 'new-paid', 'absent']);
    assert.deepEqual(views.get('old-nine'), { orderId: 'old-nine', source: 'legacy_recorded', standardPaisa: 37, waivedPaisa: 0, netPaisa: 37, campaign: null, policyVersionId: null });
    assert.deepEqual(views.get('old-other'), { orderId: 'old-other', source: 'legacy_recorded', standardPaisa: 0, waivedPaisa: 0, netPaisa: 0, campaign: null, policyVersionId: null });
    assert.deepEqual(views.get('new-waived'), { orderId: 'new-waived', source: 'customer_v2', standardPaisa: 1000, waivedPaisa: 1000, netPaisa: 0, campaign: { id: 'customer', revision: 2, name: 'Original customer launch' }, policyVersionId: 'original-policy' });
    assert.equal(views.get('new-paid')?.netPaisa, 1000);
    assert.equal(views.has('absent'), false);
    for(const id of ['old-nine','old-other']) {
      const document=await getOrderDocument(f.db,id,id+'-document','legacy-receipt');
      assert.ok(document,'Original historical document must exist');
      assert.equal(document?.snapshot.buyerPlatformFeePaisa,id==='old-nine'?37:0);
      assert.equal(document?.snapshot.customerServiceFee,undefined,'never backfill old accepted JSON with new fee evidence');
      assert.equal((document.snapshot as unknown as {sellerCommissionBps:number}).sellerCommissionBps,id==='old-nine'?900:1300);
    }
    assert.equal(f.fingerprint(), before);
    const queryCount = f.queries.length;
    assert.equal((await repository.readOrderCustomerServiceFees(f.db, [])).size, 0);
    assert.equal(f.queries.length, queryCount);
    const many = Array.from({ length: 201 }, (_, i) => 'history-' + i);
    for (const id of many) f.insert('orders', { id, buyer_platform_fee_paisa: 1 });
    assert.equal((await repository.readOrderCustomerServiceFees(f.db, [...many, ...many])).size, 201);
    assert.equal(f.queries.length - queryCount, 3, 'deduplicate and bound reads to 90 IDs');
  } finally { f.dispose(); }
});

void test('missing customer fee source columns fail closed instead of reporting confirmed zero relief',async()=>{
  for(const table of ['customer_fee_waiver_control','customer_fee_waiver_campaigns','customer_fee_waiver_revisions','customer_fee_waiver_requests','order_customer_service_fees']) {
    const f=await accountingFixture();
    try {
      f.sqlite.exec(`DROP TABLE ${table}`);
      const report=await readAccountingSources(f.db,parseAccountingQuery(new URLSearchParams('period=all'),300),300,'local_staging');
      for(const key of ['service_fee_standard','service_fee_campaign_waived','service_fee_charged','service_fee_current']) {
        const metric=report.metrics.find(m=>m.key===key);
        assert.equal(metric?.amountPaisa,null,table+':'+key);
        assert.equal(metric?.status,'unavailable',table+':'+key);
      }
      assert.equal(report.rows.filter(r=>r.sourceKind==='order_service_fee').length,0);
      assert.ok(report.issues.some(issue=>issue.code==='source_unavailable'));
    } finally {f.dispose();}
  }
});

void test('multi-seller accounting aggregates gross relief once per order and drills into zero-net waivers', async () => {
  const f = await fixture();
  try {
    const before = f.fingerprint();
    const report = await readAccountingSources(f.db, parseAccountingQuery(new URLSearchParams('period=all&section=cash'), 300), 300, 'local_staging');
    const amount = (key: string) => report.metrics.find(m => m.key === key)?.amountPaisa;
    assert.equal(amount('service_fee_standard'), '2037');
    assert.equal(amount('service_fee_campaign_waived'), '1000');
    assert.equal(amount('service_fee_charged'), '1037');
    assert.equal(amount('service_fee_current'), '1037');
    assert.equal(amount('service_fee_refunded'), '0');
    const rows = report.rows.filter(row => row.sourceKind === 'order_service_fee');
    assert.equal(rows.length, 3);
    assert.equal(rows.find(row => row.sourceId === 'new-waived')?.amountPaisa, '0');
    assert.equal(rows.find(row => row.sourceId === 'new-waived')?.model, 'Original customer launch');
    assert.equal(f.fingerprint(), before);
  } finally { f.dispose(); }
});

void test('customer fee source readiness inventories every new field while retaining legacy fee sources', () => {
  for (const [table, columns] of Object.entries({
    customer_fee_waiver_control: 'id,revision',
    customer_fee_waiver_campaigns: 'id,revision,created_at,updated_at',
    customer_fee_waiver_revisions: 'campaign_id,revision,state,name,description,starts_at,ends_at,created_by,request_id,created_at',
    customer_fee_waiver_requests: 'request_id,actor_id,auth_subject,command_json,response_json,created_at',
    order_customer_service_fees: 'order_id,policy_enabled,policy_amount_paisa,policy_version_id,standard_paisa,waived_paisa,net_paisa,campaign_id,campaign_revision,created_at',
  })) assert.deepEqual(accountingColumns[table]?.split(',').sort(), columns.split(',').sort(), table);
  assert.ok(accountingColumns.order_item_marketplace_fees);
});
