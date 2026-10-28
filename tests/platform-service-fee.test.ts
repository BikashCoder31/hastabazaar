import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBusinessSettingKey, validateBusinessSettingValue } from '../lib/configuration/definitions';
import { getEffectiveBusinessSetting, createBusinessSettingDraft } from '../lib/db/repositories/business-settings';
import { saveBusinessSettingChange } from '../lib/db/repositories/business-settings';
import { parseReviewedCheckoutQuote, assertReviewedCheckoutQuote } from '../lib/checkout/reviewed-quote';
import { commissionDatabase } from './helpers/commission-database';
import { historicalCommissionDatabase } from './helpers/commission-database';
import { seedCheckoutBuyer } from './helpers/checkout-contact';
import { createCodOrder } from '../lib/db/repositories/orders';
import { getPlatformServiceFee } from '../lib/db/repositories/platform-service-fee';
import { withReviewedPromoQuote } from './helpers/promo-checkout-fixture';
import { readAccountingSources } from '../lib/accounting/source-queries';
import { parseAccountingQuery } from '../lib/accounting/filters';
import { prepareSellerParcels } from '../lib/operations/parcels';
import { confirmFirstCodReview, getFirstCodReview } from '../lib/orders/first-cod-review';
import { cancellationPreview, cancelSelectedParcels } from '../lib/cancellation/repository';
import { getOrderReceipt } from '../lib/db/repositories/orders';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';
import { parseServiceFeeSnapshot, serviceFeeSnapshot, type LegacyPlatformServiceFeeSnapshot } from '../lib/checkout/platform-service-fee';

async function orderFixture() {
  const f = await historicalCommissionDatabase(true);
  // Explicitly use current launch fee with historical seller terms, independently.
  f.sqlite.prepare("DELETE FROM business_setting_versions WHERE id='historical-no-service-fee'").run();
  await seedCheckoutBuyer(f.database);
  f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','craft','Craft',1,1,1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES ('product','seller-a','cat','craft','SKU','Craft','Fictional craft',100000,10,'Maker','NP','Wood','published',1,1);
    INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','token','NPR',1,1);
    INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('line','cart','product',2,1,1);`);
  const input = { customerAuthSubject: 'checkout-buyer', customerEmail: 'buyer@example.test', customerPhone: '9811111111', locale: 'en-NP' as const, termsAccepted: true, idempotencyKey: 'service-fee-order',
    address: { recipientName: 'Fictional Buyer', phone: '9811111111', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Ward 1' } };
  return { ...f, input };
}

void test('checkout charges once, snapshots fee and commission, and replay preserves both after disabling', async () => {
  const f = await orderFixture();
  try {
    const input = await withReviewedPromoQuote(f.database, 'cart', f.input, 100);
    const placed = await createCodOrder(f.database, 'token', 'receipt', input, 100, 'checkout-buyer');
    const order = f.sqlite.prepare('SELECT * FROM orders').get()!;
    assert.equal(order.buyer_platform_fee_paisa, 1000);
    assert.equal(order.grand_total_paisa, 216000);
    const report = await readAccountingSources(f.database, parseAccountingQuery(new URLSearchParams('period=all'), 102), 102, 'local_staging');
    assert.equal(report.metrics.find(m=>m.key==='service_fee_charged')?.amountPaisa, '1000');
    f.sqlite.prepare('UPDATE orders SET tax_total_paisa=500,grand_total_paisa=grand_total_paisa+500').run();
    const legacyTaxReport=await readAccountingSources(f.database,parseAccountingQuery(new URLSearchParams('period=all'),102),102,'local_staging');
    assert.equal(legacyTaxReport.metrics.find(m=>m.key==='service_fee_current')?.amountPaisa,'1000','Tax or another historical charge must never be called a service fee');
    f.sqlite.prepare('UPDATE orders SET tax_total_paisa=0,grand_total_paisa=grand_total_paisa-500').run();
    assert.deepEqual(JSON.parse(String(order.return_policy_snapshot_json)).serviceFee, await getPlatformServiceFee(f.database, 100));
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM order_items').get()?.commission_bps, 900);
    f.sqlite.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES('disabled-fee','platform_service_fee_policy',1,'{"enabled":false,"amountPaisa":2500}','published',1,'controlled',101,'Disable new customer charges','owner',101,'disabled-fee')`).run();
    assert.equal((await getPlatformServiceFee(f.database, 101)).chargedPaisa, 0);
    assert.deepEqual(await createCodOrder(f.database, 'token', 'receipt', input, 102, 'checkout-buyer'), placed);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM orders').get(), order);
  } finally { await f.dispose(); }
});

void test('lawful fee refunds require current Super Admin, payment evidence, a legal basis and an atomic saved-fee cap', async () => {
  const refundModule = await import('../lib/db/repositories/platform-service-fee-refunds').catch(() => null);
  assert.ok(refundModule, 'A lawful fee refund must have a guarded working record path');
  const f = await orderFixture();
  try {
    await createCodOrder(f.database, 'token', 'receipt', f.input, 100, 'checkout-buyer');
    const order = f.sqlite.prepare('SELECT id FROM orders').get()!;
    const input = { orderId: String(order.id), amountPaisa: 1000, actorId: 'owner', legalBasis: 'Required consumer remedy following case review', caseReference: 'CASE-TEST-1', paymentReference: 'BANK-TEST-1', requestId: 'fee-legal-refund-1', now: 120 };
    await assert.rejects(refundModule.recordLawfulServiceFeeRefund(f.database, input), /collected|paid/i);
    f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='part_refunded'").run();
    await assert.rejects(refundModule.recordLawfulServiceFeeRefund(f.database, { ...input, actorId: 'staff' }), /permission|super admin/i);
    await assert.rejects(refundModule.recordLawfulServiceFeeRefund(f.database, { ...input, legalBasis: '' }), /legal/i);
    const result = await refundModule.recordLawfulServiceFeeRefund(f.database, input);
    assert.deepEqual(await refundModule.recordLawfulServiceFeeRefund(f.database, input), result);
    await assert.rejects(refundModule.recordLawfulServiceFeeRefund(f.database, { ...input, requestId: 'fee-legal-refund-2', amountPaisa: 1 }), /fee|remaining/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refunds').get()?.n, 0, 'Fee refunds must not masquerade as merchandise or delivery refunds');
    const refund = JSON.parse(String(f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE action='platform_service_fee.refunded'").get()?.next_json));
    assert.equal(refund.request.amountPaisa, 1000); assert.equal(refund.savedFeePaisa, 1000);
    assert.equal(f.sqlite.prepare('SELECT commission_bps FROM order_items').get()?.commission_bps, 900);
  } finally { await f.dispose(); }
});

const key = 'platform_service_fee_policy' as Parameters<typeof parseBusinessSettingKey>[0];
void test('customer fee defaults to enabled NPR 10 and has a strict enable switch', async () => {
  const settingKey = parseBusinessSettingKey(key);
  const f = await commissionDatabase();
  try {
    assert.deepEqual((await getEffectiveBusinessSetting(f.database, settingKey, 100)).value, { enabled: true, amountPaisa: 1000 });
    assert.deepEqual(validateBusinessSettingValue(settingKey, { enabled: false, amountPaisa: 1000 }), { enabled: false, amountPaisa: 1000 });
    for (const value of [{ enabled: 1, amountPaisa: 1000 }, { enabled: true, amountPaisa: -1 }, { enabled: true, amountPaisa: 1.5 }, { enabled: true, amountPaisa: Number.MAX_SAFE_INTEGER }, { enabled: true, amountPaisa: 1000, refundable: true }]) {
      assert.throws(() => validateBusinessSettingValue(settingKey, value));
    }
  } finally { await f.dispose(); }
});

void test('Admin cannot draft a fee change even through direct repository access', async () => {
  const f = await commissionDatabase();
  try {
    await assert.rejects(createBusinessSettingDraft(f.database, { key: parseBusinessSettingKey(key), value: { enabled: false, amountPaisa: 1000 }, actorId: 'staff', reason: 'Attempted fee disable', requestId: 'fee-admin-draft', now: 100 }), /super admin/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM business_setting_versions').get()?.n, 0);
  } finally { await f.dispose(); }
});

void test('Super Admin can schedule disabling, keep the amount, and re-enable a changed fee for future orders', async () => {
  const f=await orderFixture();
  try {
    await saveBusinessSettingChange(f.database,{key:'platform_service_fee_policy',value:{enabled:false,amountPaisa:2500},actorId:'owner',reason:'Temporarily disable customer fee',requestId:'fee-disable-schedule',now:50,effectiveFrom:100,expectedVersion:0});
    assert.equal((await getPlatformServiceFee(f.database,99)).chargedPaisa,1000);
    const policy=await getPlatformServiceFee(f.database,100);
    assert.equal(policy.chargedPaisa,0);assert.equal(policy.amountPaisa,2500);
    const quote=await withReviewedPromoQuote(f.database,'cart',f.input,100);
    const result=await createCodOrder(f.database,'token','receipt',quote,100,'checkout-buyer');
    assert.equal(result.grandTotalPaisa,215000);
    assert.equal(f.sqlite.prepare('SELECT buyer_platform_fee_paisa FROM orders').get()?.buyer_platform_fee_paisa,0);
    await saveBusinessSettingChange(f.database,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:2500},actorId:'owner',reason:'Enable revised customer fee',requestId:'fee-enable-schedule',now:101,effectiveFrom:null,expectedVersion:1});
    assert.equal((await getPlatformServiceFee(f.database,101)).chargedPaisa,2500);
    assert.deepEqual(await createCodOrder(f.database,'token','receipt',quote,102,'checkout-buyer'),result);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM business_setting_versions WHERE setting_key='platform_service_fee_policy'").get()?.n,2);
  } finally {await f.dispose();}
});

void test('stale customer fee review and a commit-time setting publication cannot place an order', async () => {
  for(const duringCommit of [false,true]) {
    const f=await orderFixture();
    try {
      const quote=await withReviewedPromoQuote(f.database,'cart',f.input,100);
      const publish=()=>f.sqlite.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
        VALUES('changed-fee','platform_service_fee_policy',1,'{"enabled":false,"amountPaisa":1000}','published',1,'controlled',99,'Changed customer fee','owner',99,'changed-fee')`).run();
      if(duringCommit){const batch=f.database.batch.bind(f.database);let once=false;f.database.batch=(async statements=>{if(!once){once=true;publish();}return batch(statements);}) as D1Database['batch'];}
      else publish();
      await assert.rejects(createCodOrder(f.database,'token','receipt',quote,100,'checkout-buyer'),/review|changed/i);
      for(const table of ['orders','payments','seller_ledger_entries','order_policy_acceptances'])assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n,0,table);
      assert.equal(f.sqlite.prepare('SELECT inventory_quantity FROM products').get()?.inventory_quantity,10);
    }finally{await f.dispose();}
  }
});

void test('a fee refund works with saved shopping credit without altering wallet or commission records', async () => {
  const {recordLawfulServiceFeeRefund}=await import('../lib/db/repositories/platform-service-fee-refunds');
  const f=await orderFixture();
  try {
    f.sqlite.prepare("INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES ('checkout-buyer','FEE-TEST',5000,1)").run();
    await createCodOrder(f.database,'token','receipt',{...f.input,useWallet:true},100,'checkout-buyer');
    const order=f.sqlite.prepare('SELECT id,wallet_credit_paisa FROM orders').get()!;
    assert.equal(order.wallet_credit_paisa,5000);
    f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid'").run();
    const before=f.sqlite.prepare('SELECT * FROM wallet_entries').all();
    await recordLawfulServiceFeeRefund(f.database,{orderId:String(order.id),amountPaisa:1000,actorId:'owner',legalBasis:'Mandatory remedy confirmed in legal case review',caseReference:'CASE-CREDIT',paymentReference:'BANK-CREDIT',requestId:'fee-refund-credit',now:120});
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM wallet_entries').all(),before);
    assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders').get()?.payment_status,'paid','Fee-only refund must not hold merchandise earnings');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refunds').get()?.n,0);
    const report=await readAccountingSources(f.database,parseAccountingQuery(new URLSearchParams('period=all'),121),121,'local_staging');
    assert.equal(report.metrics.find(m=>m.key==='service_fee_refunded')?.amountPaisa,'1000');
  } finally {await f.dispose();}
});

void test('one fee reconciles across seller parcels and survives partial cancellation without changing original records',async()=>{
 const f=await orderFixture();
 try{
  f.sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES ('product-b','seller-b','cat','craft-b','SKU-B','Craft B','Fictional craft B',100000,10,'Maker B','NP','Wood','published',1,1)`).run();
  f.sqlite.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('line-b','cart','product-b',1,1,1)").run();
  const result=await createCodOrder(f.database,'token','receipt',await withReviewedPromoQuote(f.database,'cart',f.input),100,'checkout-buyer');
  const row=f.sqlite.prepare('SELECT id FROM orders').get()!;
  if(await getFirstCodReview(f.database,String(row.id)))await confirmFirstCodReview(f.database,{orderId:String(row.id),actorId:'owner',reason:'Confirmed isolated fictional COD order',requestId:'fee-cod-confirm',now:101});
  await prepareSellerParcels(f.database,{orderId:String(row.id),actorId:'owner',requestId:'fee-prepare-parcels',now:102});
  assert.equal(f.sqlite.prepare('SELECT SUM(cod_due_paisa) AS total FROM shipping_parcels').get()?.total,result.grandTotalPaisa);
  const access={orderNumber:result.orderNumber,customerId:'checkout-buyer'};
  const preview=await cancellationPreview(f.database,access,['seller-b']);
  await cancelSelectedParcels(f.database,access,{sellerIds:['seller-b'],fingerprint:preview.fingerprint,requestId:'fee-part-cancel',note:'Cancel the second fictional seller parcel',now:103});
  const receipt=await getOrderReceipt(f.database,result.orderNumber,null,'checkout-buyer');
  assert.equal(receipt?.buyerPlatformFeePaisa,1000);assert.equal(receipt?.grandTotalPaisa,216000);
  assert.equal(receipt?.originalGrandTotalPaisa,result.grandTotalPaisa);
  const rest=await cancellationPreview(f.database,access,['seller-a']);
  await cancelSelectedParcels(f.database,access,{sellerIds:['seller-a'],fingerprint:rest.fingerprint,requestId:'fee-full-cancel',note:'Cancel remaining uncollected fictional parcel',now:104});
  const cancelled=await getOrderReceipt(f.database,result.orderNumber,null,'checkout-buyer');
  assert.equal(cancelled?.grandTotalPaisa,0);assert.equal(cancelled?.buyerPlatformFeePaisa,0);
  assert.equal(f.sqlite.prepare('SELECT buyer_platform_fee_paisa FROM orders').get()?.buyer_platform_fee_paisa,1000);
 }finally{await f.dispose();}
});

void test('cancellation can update delivered but uncollected COD and cannot increase a collected parcel balance',async()=>{
 for(const collected of [false,true]){
  const f=await orderFixture();
  try{
   f.sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES ('product-b','seller-b','cat','craft-b','SKU-B','Craft B','Fictional craft B',100000,10,'Maker B','NP','Wood','published',1,1)`).run();
   f.sqlite.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('line-b','cart','product-b',1,1,1)").run();
   const result=await createCodOrder(f.database,'token','receipt',f.input,100,'checkout-buyer');
   const id=String(f.sqlite.prepare('SELECT id FROM orders').get()?.id);
   if(await getFirstCodReview(f.database,id))await confirmFirstCodReview(f.database,{orderId:id,actorId:'owner',reason:'Confirmed isolated fictional COD order',requestId:'fee-delivered-confirm',now:101});
   await prepareSellerParcels(f.database,{orderId:id,actorId:'owner',requestId:'fee-delivered-parcels',now:102});
   f.sqlite.prepare("UPDATE shipping_jobs SET status='delivered' WHERE seller_id='seller-a'").run();
   f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE seller_id='seller-a'").run();
   // A fully delivered parcel can still await its first cash collection.
   if(collected)f.sqlite.prepare("UPDATE shipping_parcels SET collected_paisa=cod_due_paisa WHERE shipping_job_id IN (SELECT id FROM shipping_jobs WHERE seller_id='seller-a')").run();
   const access={orderNumber:result.orderNumber,customerId:'checkout-buyer'};
   if(collected){
    await assert.rejects(cancellationPreview(f.database,access,['seller-b']),/collected.*cannot be increased/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM order_cancellation_events').get()?.n,0);
   }else{
    const preview=await cancellationPreview(f.database,access,['seller-b']);
    await cancelSelectedParcels(f.database,access,{sellerIds:['seller-b'],fingerprint:preview.fingerprint,requestId:'fee-delivered-cancel',note:'Cancel the second uncollected fictional parcel',now:103});
    assert.equal(f.sqlite.prepare("SELECT cod_due_paisa FROM shipping_parcels WHERE shipping_job_id IN (SELECT id FROM shipping_jobs WHERE seller_id='seller-a')").get()?.cod_due_paisa,216000);
    assert.equal((await getOrderReceipt(f.database,result.orderNumber,null,'checkout-buyer'))?.grandTotalPaisa,216000);
   }
  }finally{await f.dispose();}
 }
});

void test('current 12 percent commission excludes the customer fee and keeps an 88 percent seller share',async()=>{
 const f=await orderFixture();
 try{
  f.sqlite.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
    VALUES('current-twelve','independent_seller_commission_bps',2,'1200','published',1,'controlled',50,'Explicit current commission fixture','owner',50,'current-twelve')`).run();
  f.sqlite.prepare(`INSERT INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at)
    VALUES('current-twelve-accept','seller-a',?,'en','current-twelve',1200,'current-twelve-accept','user-a',51)`).run(SELLER_AGREEMENT_VERSION);
  await createCodOrder(f.database,'token','receipt',f.input,100,'checkout-buyer');
  const item=f.sqlite.prepare('SELECT commission_bps,commission_base_paisa,commission_paisa,line_total_paisa FROM order_items').get()!;
  assert.equal(item.commission_bps,1200);assert.equal(item.commission_base_paisa,200000);assert.equal(item.commission_paisa,24000);
  assert.equal(Number(item.line_total_paisa)-Number(item.commission_paisa),176000);
  assert.equal(f.sqlite.prepare('SELECT grand_total_paisa FROM orders').get()?.grand_total_paisa,216000);
 }finally{await f.dispose();}
});

void test('competing lawful fee refund or revoked authority is rejected at the commit boundary',async()=>{
 const {recordLawfulServiceFeeRefund}=await import('../lib/db/repositories/platform-service-fee-refunds');
 for(const revoke of [false,true]){
  const f=await orderFixture();
  try{
   await createCodOrder(f.database,'token','receipt',f.input,100,'checkout-buyer');
   f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid'").run();
   const id=String(f.sqlite.prepare('SELECT id FROM orders').get()?.id);
   const input={orderId:id,amountPaisa:1000,actorId:'owner',legalBasis:'Required remedy following independent legal case review',caseReference:'CASE-RACE',paymentReference:'BANK-RACE',requestId:'stale-lawful-refund',now:120};
   const original=f.database.batch.bind(f.database);let first=true;
   f.database.batch=(async statements=>{
    if(first){first=false;if(revoke)f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'").run();
    else await recordLawfulServiceFeeRefund(f.database,{...input,requestId:'winning-lawful-refund'});}
    return original(statements);
   }) as D1Database['batch'];
   await assert.rejects(recordLawfulServiceFeeRefund(f.database,input),/authority|remaining/i);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='platform_service_fee.refunded'").get()?.n,revoke?0:1);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refunds').get()?.n,0);
  }finally{await f.dispose();}
 }
});

const legacy = { lines: [{ id: 'line', sellerId: 'seller', pricePaisa: 10000, quantity: 2 }], deliveryPaisa: 5000, walletPaisa: 1000, referralPaisa: 0, promoPaisa: 2000, payablePaisa: 22000, policyContext: 'a'.repeat(64), referralCampaign: null };
void test('reviewed total includes one saved service fee and rejects tampering or stale policy', () => {
  const serviceFee = { enabled: true, amountPaisa: 1000, chargedPaisa: 1000, versionId: null, rule: 'non_refundable_except_law_v1' };
  const quote = { ...legacy, serviceFee, payablePaisa: 23000 };
  assert.deepEqual(parseReviewedCheckoutQuote(quote), quote);
  assert.throws(() => parseReviewedCheckoutQuote({ ...quote, payablePaisa: 22000 }), /review/i);
  assert.throws(() => parseReviewedCheckoutQuote({ ...quote, serviceFee: { ...serviceFee, chargedPaisa: 0 } }), /review/i);
  assert.throws(() => assertReviewedCheckoutQuote(quote, { ...quote, serviceFee: { ...serviceFee, versionId: 'new-version' } }), /review/i);
  assert.deepEqual(parseReviewedCheckoutQuote(legacy), legacy, 'Historical replay digest shape must stay unchanged');
});

const customerFee = {
  enabled: true, amountPaisa: 1000, chargedPaisa: 0, versionId: 'fee-v1',
  rule: 'non_refundable_except_law_v1', schemaVersion: 2, standardPaisa: 1000,
  waivedPaisa: 1000, campaign: { id: 'customer-launch', revision: 3, name: 'Customer launch waiver' },
};

void test('saved customer fees parse full waiver, ordinary, disabled and zero snapshots', () => {
  for (const saved of [
    customerFee,
    { ...customerFee, amountPaisa: 1500, standardPaisa: 1500, waivedPaisa: 1500 },
    { ...customerFee, chargedPaisa: 1000, waivedPaisa: 0, campaign: null },
    { ...customerFee, enabled: false, standardPaisa: 0, waivedPaisa: 0, campaign: null },
    { ...customerFee, amountPaisa: 0, standardPaisa: 0, waivedPaisa: 0, campaign: null },
  ]) assert.deepEqual(parseServiceFeeSnapshot(saved), saved);
});

void test('saved customer fees reject malformed amounts and incomplete or unexplained attribution', () => {
  for (const invalid of [
    null, [], {},
    { ...customerFee, extra: true },
    { ...customerFee, schemaVersion: 1 },
    { ...customerFee, schemaVersion: undefined },
    { ...customerFee, standardPaisa: undefined },
    { ...customerFee, waivedPaisa: undefined },
    { ...customerFee, campaign: undefined },
    { ...customerFee, versionId: '' },
    { ...customerFee, rule: 'refundable' },
    { ...customerFee, enabled: false },
    { ...customerFee, standardPaisa: 999 },
    { ...customerFee, waivedPaisa: 999, chargedPaisa: 1 },
    { ...customerFee, waivedPaisa: 1001, chargedPaisa: -1 },
    { ...customerFee, chargedPaisa: 1000 },
    { ...customerFee, campaign: null },
    { ...customerFee, waivedPaisa: 0, chargedPaisa: 1000 },
    { ...customerFee, amountPaisa: 0, standardPaisa: 0, waivedPaisa: 0 },
    { ...customerFee, campaign: { ...customerFee.campaign, revision: undefined } },
    { ...customerFee, campaign: { ...customerFee.campaign, revision: 0 } },
    { ...customerFee, campaign: { ...customerFee.campaign, revision: 1.5 } },
    { ...customerFee, campaign: { ...customerFee.campaign, revision: Number.MAX_SAFE_INTEGER + 1 } },
    { ...customerFee, campaign: { ...customerFee.campaign, name: '  ' } },
    { ...customerFee, campaign: { ...customerFee.campaign, id: '' } },
    { ...customerFee, campaign: { ...customerFee.campaign, extra: true } },
  ]) assert.throws(() => parseServiceFeeSnapshot(invalid), JSON.stringify(invalid));
  for (const field of ['amountPaisa', 'standardPaisa', 'waivedPaisa', 'chargedPaisa'])
    for (const amount of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '1000'])
      assert.throws(() => parseServiceFeeSnapshot({ ...customerFee, [field]: amount }), field + ': ' + String(amount));
});

void test('legacy fee snapshots retain exactly their original five fields and reject unexplained zero charges', () => {
  const original: LegacyPlatformServiceFeeSnapshot = serviceFeeSnapshot({ enabled: true, amountPaisa: 1000 }, null);
  assert.deepEqual(original, {
    enabled: true, amountPaisa: 1000, chargedPaisa: 1000,
    versionId: null, rule: 'non_refundable_except_law_v1',
  });
  assert.deepEqual(parseServiceFeeSnapshot(original), original);
  for (const saved of [
    { ...original, enabled: false, chargedPaisa: 0 },
    { ...original, amountPaisa: 0, chargedPaisa: 0 },
  ]) assert.deepEqual(parseServiceFeeSnapshot(saved), saved);
  for (const invalid of [
    { ...original, chargedPaisa: 0 },
    { ...original, standardPaisa: 1000 },
    { ...original, waivedPaisa: 1000 },
    { ...original, campaign: customerFee.campaign },
    { ...original, extra: true },
  ]) assert.throws(() => parseServiceFeeSnapshot(invalid));
});
