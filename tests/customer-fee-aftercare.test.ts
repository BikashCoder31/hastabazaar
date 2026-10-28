import assert from 'node:assert/strict';
import test from 'node:test';
import { createCodOrder, getOrderReceipt } from '../lib/db/repositories/orders';
import { getPlatformServiceFee } from '../lib/db/repositories/platform-service-fee';
import { mutateCustomerFeeWaiver } from '../lib/db/repositories/customer-fee-waivers';
import { saveBusinessSettingChange } from '../lib/db/repositories/business-settings';
import { recordLawfulServiceFeeRefund } from '../lib/db/repositories/platform-service-fee-refunds';
import { cancellationPreview, cancelSelectedParcels } from '../lib/cancellation/repository';
import { prepareSellerParcels } from '../lib/operations/parcels';
import { confirmFirstCodReview, getFirstCodReview } from '../lib/orders/first-cod-review';
import { transitionAdminFulfillment } from '../lib/db/repositories/fulfillment';
import { createCustomerReturnRequest, reviewReturnAsAdmin, advanceReturnAsAdmin } from '../lib/db/repositories/returns';
import { AT, terms, customerFeeCheckoutFixture, feeWaiverContext as context } from './helpers/customer-fee-waiver-fixture';
import { getCheckoutPolicyContext } from '../lib/checkout/policy-context';
import { quoteOrderCredit } from '../lib/db/repositories/wallet';
import { savePromoDraft, publishPromo } from '../lib/db/repositories/promo-codes';
import { quoteCheckoutPromo } from '../lib/incentives/quote-intent';

async function checkout(waived: boolean, multi = false, incentive?: 'promo'|'referral') {
  const f = await customerFeeCheckoutFixture();
  if (multi) f.sqlite.exec(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES('product-b','seller-b','cat','craft-b','SKU-B','Craft B','Fictional craft',100000,10,'Maker','NP','Wood','published',1,1); INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('line-b','cart','product-b',1,1,1);`);
  f.sqlite.exec("UPDATE products SET return_eligible=1; UPDATE seller_profiles SET tax_registration_number=CASE WHEN id='seller-a' THEN '123456789' ELSE '987654321' END; INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES('checkout-buyer','AFTERCARE',5000,1)");
  if(incentive==='promo') {
    f.sqlite.exec(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES('aftercare-promo-form','staff.promo-code',1,1,'published','{"formId":"staff.promo-code","fields":[]}','Fictional fixture','owner',1,'owner',1,'owner',1,'aftercare-promo-form')`);
    const promoContext={actorId:'owner',authSubject:'owner',requestId:'aftercare-promo-draft',expectedVersion:0,now:AT,reason:'Fictional merchandise discount',form:{formId:'staff.promo-code' as const,versionId:'aftercare-promo-form',answers:{formId:'staff.promo-code' as const,version:1,answers:[]}}};
    const draft=await savePromoDraft(f.database,promoContext,{code:'AFTERCARE',label:'Merchandise saving',kind:'fixed',fixedPaisa:1000,minimumSubtotalPaisa:0,startsAt:AT-10,endsAt:AT+1000,totalUseLimit:20,perCustomerUseLimit:1,budgetPaisa:20000});
    await publishPromo(f.database,{...promoContext,requestId:'aftercare-promo-publish',expectedVersion:1},draft.campaignId);
  } else if(incentive==='referral') {
    f.sqlite.exec("UPDATE referral_campaign SET enabled=1,friend_discount_paisa=1000,reward_paisa=500,minimum_subtotal_paisa=2000; INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES('user-a','ABCDEF0123456789',0,1)");
  }
  let campaign;
  if (waived) {
    const draft = await mutateCustomerFeeWaiver(f.database, context('aftercare-create', 0, { now: AT }), { type: 'create', terms });
    campaign = await mutateCustomerFeeWaiver(f.database, context('aftercare-publish', 1, { now: AT }), { type: 'publish', campaignId: draft.id });
  }
  const serviceFee=await getPlatformServiceFee(f.database,AT);
  const promo=incentive==='promo'?await quoteCheckoutPromo(f.database,'checkout-buyer','token','AFTERCARE',AT):null;
  const referralCode=incentive==='referral'?'ABCDEF0123456789':undefined;
  const credit=await quoteOrderCredit(f.database,{userId:'checkout-buyer',subtotalPaisa:multi?200000:100000,useWallet:true,referralCode,phone:f.input.customerPhone,now:AT,readOnly:true,...(promo?{merchandiseDiscountPaisa:promo.discountPaisa}:{})});
  const result = await createCodOrder(f.database, 'token', 'receipt', { ...f.input, useWallet: true, ...(promo?{promoCode:promo.code,promoRevision:promo.revision,promoQuoteIntent:promo.quoteIntent}:{}),...(referralCode?{referralCode}:{}),reviewedQuote:{
    lines:[{id:'line-a',sellerId:'seller-a',pricePaisa:100000,quantity:1},...(multi?[{id:'line-b',sellerId:'seller-b',pricePaisa:100000,quantity:1}]:[])],
    deliveryPaisa:multi?22500:15000,walletPaisa:5000,referralPaisa:credit.discountPaisa,promoPaisa:promo?.discountPaisa??0,payablePaisa:(multi?217500:110000)+serviceFee.chargedPaisa-credit.discountPaisa-(promo?.discountPaisa??0),
    policyContext:await getCheckoutPolicyContext(),referralCampaign:referralCode?credit.campaignSnapshot:null,serviceFee,
  } }, AT, 'checkout-buyer');
  const orderId = String(f.sqlite.prepare('SELECT id FROM orders').get()!.id);
  return { ...f, ...result, orderId, campaign };
}
type Fixture = Awaited<ReturnType<typeof checkout>>;
function original(f: Fixture) {
  return Object.fromEntries(['order_customer_service_fees', 'order_item_marketplace_fees', 'order_policy_acceptances', 'managed_commercial_snapshots'].map(table => [table, f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
}
const legal = (f: Fixture, amountPaisa: number, requestId: string) => ({ orderId: f.orderId, amountPaisa, actorId: 'owner', legalBasis: 'Mandatory consumer remedy confirmed by legal case review', caseReference: 'CASE-AFTERCARE', paymentReference: 'BANK-AFTERCARE', requestId, now: AT + 50 });

void test('new receipt and document preserve original customer evidence after policy and campaign publication', async (t) => {
  t.mock.method(Date,'now',()=>AT);
  const f = await checkout(true);
  try {
    const before = original(f);
    const document = String(f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE kind='order_statement'").get()!.snapshot_json);
    const snapshot = JSON.parse(document);
    assert.deepEqual(snapshot.customerServiceFee, { orderId: f.orderId, source: 'customer_v2', standardPaisa: 1000, waivedPaisa: 1000, netPaisa: 0, campaign: { id: f.campaign!.id, revision: 2, name: 'Customer launch' }, policyVersionId: null });
    await mutateCustomerFeeWaiver(f.database, context('aftercare-edit', 2, { now: AT + 1 }), { type: 'revise', campaignId: f.campaign!.id, terms: { ...terms, name: 'Future campaign title' } });
    await saveBusinessSettingChange(f.database, { key: 'platform_service_fee_policy', value: { enabled: true, amountPaisa: 2500 }, actorId: 'owner', reason: 'Future fictional customer fee', requestId: 'aftercare-policy', now: AT + 1, effectiveFrom: null, expectedVersion: 0 });
    const receipt = await getOrderReceipt(f.database, f.orderNumber, 'receipt', 'checkout-buyer');
    assert.deepEqual(receipt?.customerServiceFee, snapshot.customerServiceFee);
    assert.equal(receipt?.originalBuyerPlatformFeePaisa, 0);
    assert.equal(receipt?.buyerPlatformFeePaisa, 0);
    assert.equal(receipt?.refundedPlatformServiceFeePaisa, 0);
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM order_items').get()!.commission_bps, 1200);
    assert.equal(String(f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE kind='order_statement'").get()!.snapshot_json), document);
    assert.deepEqual(original(f), before);
  } finally { await f.dispose(); }
});

for (const waived of [true, false]) void test(`${waived ? 'waived' : 'charged'} uncollected partial and full cancellation use actual net without changing original documents`, async (t) => {
  t.mock.method(Date,'now',()=>AT);
  const f = await checkout(waived, true);
  try {
    const saved = original(f), document = String(f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE kind='order_statement'").get()!.snapshot_json);
    if (await getFirstCodReview(f.database, f.orderId)) await confirmFirstCodReview(f.database, { orderId: f.orderId, actorId: 'owner', reason: 'Fictional buyer confirmed this order', requestId: 'aftercare-cod', now: AT + 1 });
    await prepareSellerParcels(f.database, { orderId: f.orderId, actorId: 'owner', requestId: 'aftercare-parcels', now: AT + 2 });
    assert.equal(f.sqlite.prepare('SELECT SUM(cod_due_paisa) AS n FROM shipping_parcels').get()!.n, waived ? 217500 : 218500);
    const access = { orderNumber: f.orderNumber, customerId: 'checkout-buyer' };
    for (const [index, seller] of ['seller-b', 'seller-a'].entries()) {
      const preview = await cancellationPreview(f.database, access, [seller]);
      await cancelSelectedParcels(f.database, access, { sellerIds: [seller], fingerprint: preview.fingerprint, requestId: 'aftercare-cancel-' + index, note: 'Fictional uncollected parcel cancellation', now: AT + 3 + index });
      const receipt = (await getOrderReceipt(f.database, f.orderNumber, 'receipt', 'checkout-buyer'))!;
      assert.equal(receipt.buyerPlatformFeePaisa, index === 0 && !waived ? 1000 : 0);
      assert.equal(receipt.originalBuyerPlatformFeePaisa, waived ? 0 : 1000);
      assert.equal(receipt.customerServiceFee.waivedPaisa, waived ? 1000 : 0);
      assert.equal(receipt.customerServiceFee.netPaisa, waived ? 0 : 1000);
      assert.equal(receipt.refundedPlatformServiceFeePaisa, 0);
      if (index === 1) assert.equal(receipt.grandTotalPaisa, 0);
    }
    assert.equal(f.sqlite.prepare('SELECT balance_paisa FROM wallet_accounts').get()!.balance_paisa, 5000);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refunds').get()!.n, 0);
    assert.equal(String(f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE kind='order_statement'").get()!.snapshot_json), document);
    assert.deepEqual(original(f), saved);
  } finally { await f.dispose(); }
});

for (const waived of [true, false]) void test(`${waived ? 'waived' : 'charged'} delivered merchandise return keeps fee relief, credit and seller allocation separate`, async (t) => {
  t.mock.method(Date,'now',()=>AT);
  const f = await checkout(waived);
  try {
    const saved = original(f);
    f.sqlite.exec("UPDATE orders SET status='dispatched'; UPDATE order_items SET fulfillment_status='dispatched'");
    await transitionAdminFulfillment(f.database, { orderId: f.orderId, actorId: 'owner', action: 'deliver', note: 'Fictional delivery received', requestId: 'aftercare-deliver', now: AT + 10 });
    const paymentReceipt=JSON.parse(String(f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE kind='payment_receipt'").get()!.snapshot_json));
    assert.equal(paymentReceipt.customerServiceFee.waivedPaisa,waived?1000:0);
    assert.equal(paymentReceipt.billing.receiptGroups.filter((group:{customerServiceFee?:unknown})=>group.customerServiceFee).length,1);
    assert.equal(paymentReceipt.billing.receiptGroups.reduce((sum:number,group:{serviceFeePaisa:number})=>sum+group.serviceFeePaisa,0),waived?0:1000);
    const documents = f.sqlite.prepare('SELECT id,snapshot_json FROM order_documents ORDER BY id').all();
    const itemId = String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id);
    const request = await createCustomerReturnRequest(f.database, { orderNumber: f.orderNumber, receiptTokenHash: 'receipt', customerId: 'checkout-buyer', orderItemId: itemId, quantity: 1, reason: 'defective', requestedResolution: 'refund', detail: 'Fictional item has a verified manufacturing defect.', locale: 'en-NP', idempotencyKey: 'aftercare-return', evidence: [], now: AT + 11 });
    const options = { returnRequestId: request.id, actorId: 'owner', actorRole: 'super_admin' as const, note: 'Fictional return processing evidence', publicMessageEn: 'Return approved.', publicMessageNe: 'Return approved.' };
    await reviewReturnAsAdmin(f.database, { ...options, action: 'approve', responsibility: 'seller', outcome: 'refund', itemRefundPaisa: 100000, deliveryRefundPaisa: 0, requestId: 'aftercare-review', now: AT + 12 });
    await advanceReturnAsAdmin(f.database, { ...options, action: 'start_refund', requestId: 'aftercare-start', now: AT + 13 });
    const completed = { ...options, action: 'complete_refund' as const, reference: 'AFTERCARE-REFUND', requestId: 'aftercare-complete', now: AT + 14 };
    await advanceReturnAsAdmin(f.database, completed);
    await advanceReturnAsAdmin(f.database, completed);
    const refund = f.sqlite.prepare('SELECT amount_paisa,wallet_credit_paisa,referral_discount_paisa,promo_discount_paisa,commission_reversal_paisa FROM refunds').get()!;
    assert.deepEqual({ ...refund }, { amount_paisa: 100000, wallet_credit_paisa: 5000, referral_discount_paisa: 0, promo_discount_paisa: 0, commission_reversal_paisa: 12000 });
    assert.equal(Number(refund.amount_paisa)-Number(refund.wallet_credit_paisa),95000,'actual cash refund excludes restored wallet credit');
    const wallet = f.sqlite.prepare('SELECT * FROM wallet_entries ORDER BY id').all();
    const seller = f.sqlite.prepare('SELECT * FROM seller_ledger_entries ORDER BY id').all();
    if (waived) await assert.rejects(recordLawfulServiceFeeRefund(f.database, legal(f, 1, 'aftercare-zero-fee')), /saved.*fee|exceeds/i);
    else {
      const first = await recordLawfulServiceFeeRefund(f.database, legal(f, 1000, 'aftercare-lawful'));
      assert.deepEqual(await recordLawfulServiceFeeRefund(f.database, legal(f, 1000, 'aftercare-lawful')), first);
      await assert.rejects(recordLawfulServiceFeeRefund(f.database, legal(f, 1, 'aftercare-over-cap')), /remaining|fee/i);
    }
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM wallet_entries ORDER BY id').all(), wallet);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM seller_ledger_entries ORDER BY id').all(), seller);
    assert.deepEqual(f.sqlite.prepare('SELECT id,snapshot_json FROM order_documents ORDER BY id').all(), documents);
    assert.deepEqual(original(f), saved);
    const receipt = (await getOrderReceipt(f.database, f.orderNumber, 'receipt', 'checkout-buyer'))!;
    assert.equal(receipt.customerServiceFee.waivedPaisa, waived ? 1000 : 0);
    assert.equal(receipt.refundedPlatformServiceFeePaisa, waived ? 0 : 1000);
  } finally { await f.dispose(); }
});

void test('concurrent lawful customer fee refunds enforce the remaining actual collected fee at commit', async (t) => {
  t.mock.method(Date,'now',()=>AT);
  const f = await checkout(false);
  try {
    f.sqlite.exec("UPDATE orders SET status='delivered',payment_status='paid'");
    const originalBatch = f.database.batch.bind(f.database);
    let first = true;
    f.database.batch = (async statements => {
      if (first) { first = false; await recordLawfulServiceFeeRefund(f.database, legal(f, 700, 'aftercare-winning')); }
      return originalBatch(statements);
    }) as D1Database['batch'];
    await assert.rejects(recordLawfulServiceFeeRefund(f.database, legal(f, 700, 'aftercare-competing')), /remaining|authority/i);
    await recordLawfulServiceFeeRefund(f.database, legal(f, 300, 'aftercare-remainder'));
    assert.equal(f.sqlite.prepare("SELECT SUM(json_extract(next_json,'$.request.amountPaisa')) AS n FROM audit_logs WHERE action='platform_service_fee.refunded'").get()!.n, 1000);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refunds').get()!.n, 0);
    assert.equal((await getPlatformServiceFee(f.database, AT)).chargedPaisa, 1000);
  } finally { await f.dispose(); }
});

for(const incentive of ['promo','referral'] as const) for(const waived of [true,false]) void test(`${incentive} merchandise savings stay separate from ${waived?'waived':'lawfully refunded'} customer fee`,async(t)=>{
  t.mock.method(Date,'now',()=>AT);
  const f=await checkout(waived,false,incentive);
  try {
    const receipt=(await getOrderReceipt(f.database,f.orderNumber,'receipt','checkout-buyer'))!;
    assert.equal(receipt.grandTotalPaisa,waived?109000:110000);
    assert.equal(receipt.originalWalletCreditPaisa,5000);
    assert.equal(receipt.originalPromoDiscountPaisa,incentive==='promo'?1000:0);
    assert.equal(receipt.originalReferralDiscountPaisa,incentive==='referral'?1000:0);
    assert.equal(f.sqlite.prepare('SELECT commission_paisa FROM order_items').get()!.commission_paisa,12000);
    f.sqlite.exec("UPDATE orders SET status='delivered',payment_status='paid'");
    const conserved=()=>Object.fromEntries(['wallet_accounts','wallet_entries','referral_redemptions','promo_redemptions','promo_campaigns','order_policy_acceptances','order_documents','order_items','order_customer_service_fees'].map(table=>[table,f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
    const before=conserved();
    if(waived)await assert.rejects(recordLawfulServiceFeeRefund(f.database,legal(f,1,'aftercare-incentive-waived')),/fee|exceeds/i);
    else await recordLawfulServiceFeeRefund(f.database,legal(f,1000,'aftercare-incentive-lawful'));
    assert.deepEqual(conserved(),before);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refunds').get()!.n,0);
  } finally {await f.dispose();}
});
