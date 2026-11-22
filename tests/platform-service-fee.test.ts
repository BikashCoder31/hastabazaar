import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBusinessSettingKey, validateBusinessSettingValue } from '../lib/configuration/definitions';
import { getEffectiveBusinessSetting, createBusinessSettingDraft } from '../lib/db/repositories/business-settings';
import { saveBusinessSettingChange } from '../lib/db/repositories/business-settings';
import { parseReviewedCheckoutQuote, assertReviewedCheckoutQuote } from '../lib/checkout/reviewed-quote';
import { commissionDatabase } from './helpers/commission-database';
import { historicalCommissionDatabase } from './helpers/commission-database';
import { readyCheckoutSeller, seedCheckoutBuyer } from './helpers/checkout-contact';
import { createCodOrder } from '../lib/db/repositories/orders';
import { getPlatformServiceFee } from '../lib/db/repositories/platform-service-fee';
import { withReviewedPromoQuote } from './helpers/promo-checkout-fixture';
import { readAccountingSources } from '../lib/accounting/source-queries';
import { parseAccountingQuery } from '../lib/accounting/filters';
import { listParcels, operateParcel, prepareSellerParcels } from '../lib/operations/parcels';
import { transitionSellerFulfillment } from '../lib/db/repositories/fulfillment';
import { quoteOrderCredit } from '../lib/db/repositories/wallet';
import { getSellerFinanceSummary } from '../lib/db/repositories/payouts';
import { authorizeLawfulFeeRefund } from '../lib/payments/refund-obligations';
import { SERVICE_FEE_REFUND_ACTION, recordLawfulServiceFeeRefund } from '../lib/db/repositories/platform-service-fee-refunds';
import { executeFixtureRefund } from './helpers/execute-fixture-refund';
import { confirmFixtureRemittance } from './helpers/verified-cod-remittance';
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
  await readyCheckoutSeller(f, 'seller-a', 'user-a', 'owner');
  await readyCheckoutSeller(f, 'seller-b', 'user-b', 'owner');
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

const feeContext = (requestId: string, actorId = 'owner') => ({
  actorId, requestId, expectedRevision: null, now: Date.now(),
});

function feeAuthorization(orderId: string) {
  return {
    orderId, amountPaisa: 1000,
    legalBasis: 'Required consumer remedy following independent fictional case review.',
    caseReference: 'FICTIONAL-LEGAL-CASE',
    evidenceReference: 'FICTIONAL-RETAINED-LEGAL-DECISION',
  };
}

async function deliverFeeOrder(db: D1Database, orderId: string) {
  if ((await getFirstCodReview(db, orderId))?.status === 'pending') {
    await confirmFirstCodReview(db, {
      orderId, actorId: 'owner', requestId: 'fee-review-cod',
      reason: 'Verify the original fictional customer COD order.', now: Date.now(),
    });
  }
  const preparation = {
    orderId, sellerId: 'seller-a', actorId: 'user-a',
    note: 'Prepare the original fictional merchandise.', now: Date.now(),
  };
  await transitionSellerFulfillment(db, { ...preparation, action: 'start_packing', requestId: 'fee-pack-items' });
  await transitionSellerFulfillment(db, { ...preparation, action: 'ready_for_pickup', requestId: 'fee-items-ready' });
  await prepareSellerParcels(db, { orderId, actorId: 'owner', requestId: 'fee-prepare-parcel', now: Date.now() });
  for (const action of ['assign', 'dispatch', 'deliver']) {
    const parcels = await listParcels(db, orderId);
    assert.equal(parcels.length, 1);
    const parcel = parcels[0]!;
    await operateParcel(db, {
      jobId: parcel.id, actorId: 'owner', action, version: parcel.version,
      note: 'Record the original fictional merchandise delivery.', requestId: 'fee-parcel-' + action, now: Date.now(),
      ...(action === 'assign' ? { method: 'courier', courierName: 'Fictional Courier', trackingCode: 'FICTIONAL-FEE-DELIVERY' } : {}),
    });
  }
}

async function recordFeeOrderCash(db: D1Database, orderId: string, amountPaisa: number, action: 'collect' | 'propose_remittance') {
  const [parcel] = await listParcels(db, orderId);
  assert.ok(parcel);
  assert.equal(parcel.status, 'delivered');
  assert.equal(parcel.codDuePaisa, amountPaisa);
  const reference = 'FICTIONAL-FEE-' + action;
  await operateParcel(db, {
    jobId: parcel.id, actorId: 'owner', action, version: parcel.version,
    note: 'Retain the exact fictional cash movement and evidence.',
    requestId: 'fee-parcel-' + action, now: Date.now(), amountPaisa, reference,
  });
  const [retained] = await listParcels(db, orderId);
  assert.equal(retained?.collectedPaisa, amountPaisa);
  if (action === 'propose_remittance') {
    assert.equal(retained?.remittedPaisa, 0, 'A carrier claim alone cannot release earnings');
    await confirmFixtureRemittance(db, {
      jobId: parcel.id, actorId: 'owner', requestId: 'fee-confirm-company-cash', amountPaisa, reference,
    });
    const [reconciled] = await listParcels(db, orderId);
    assert.equal(reconciled?.remittedPaisa, amountPaisa);
  }
}

type FeeFixture = Awaited<ReturnType<typeof orderFixture>>;

function feeAudits(f: FeeFixture) {
  return f.sqlite.prepare('SELECT * FROM audit_logs WHERE action=?').all(SERVICE_FEE_REFUND_ACTION);
}

function assertFeePacket(
  f: FeeFixture, orderId: string, sourceId: string, packet: { packetId: string; obligationId: string },
  paid: boolean,
) {
  const stored = f.sqlite.prepare(`SELECT p.state AS packetState,p.revision,p.amount_paisa AS amountPaisa,
    p.prepared_by AS preparer,p.approved_by AS approver,p.started_by AS starter,p.recorded_by AS recorder,
    r.state AS obligationState,r.cash_paisa AS cashPaisa,r.wallet_paisa AS walletPaisa,r.source_kind AS sourceKind,
    r.order_id AS orderId,r.source_id AS sourceId,r.customer_id AS buyer,
    d.status AS destinationStatus,d.submitted_by AS destinationOwner,d.verified_by AS destinationVerifier,
    s.verified_by AS fundingVerifier,a.status AS accountStatus,
    s.cash_paisa-s.restricted_paisa AS verifiedCompanyFunds
    FROM outgoing_payment_packets p JOIN refund_obligations r ON r.id=p.obligation_id
    JOIN refund_destination_versions d ON d.id=p.destination_version_id AND d.obligation_id=r.id
    JOIN company_funding_statements s ON s.id=p.funding_statement_id AND s.account_version_id=p.account_version_id
    JOIN company_payment_account_versions a ON a.id=p.account_version_id
    WHERE p.id=? AND r.id=?`).get(packet.packetId, packet.obligationId);
  assert.deepEqual({ ...stored }, {
    packetState: paid ? 'paid' : 'processing', revision: paid ? 3 : 2, amountPaisa: 1000,
    preparer: 'owner', approver: 'owner', starter: 'owner', recorder: paid ? 'owner' : null,
    obligationState: paid ? 'completed' : 'processing', cashPaisa: 1000, walletPaisa: 0, sourceKind: 'service_fee',
    orderId, sourceId, buyer: 'checkout-buyer',
    destinationStatus: 'verified', destinationOwner: 'checkout-buyer', destinationVerifier: 'owner',
    fundingVerifier: 'owner', accountStatus: 'verified', verifiedCompanyFunds: 100000000,
  });
  assert.equal(f.sqlite.prepare('SELECT state FROM lawful_fee_refund_authorizations WHERE id=?').get(sourceId)?.state, paid ? 'paid' : 'authorized');
  const outgoing = f.sqlite.prepare('SELECT * FROM company_outgoing_bank_identities').all();
  const audits = feeAudits(f);
  assert.equal(outgoing.length, paid ? 1 : 0);
  assert.equal(audits.length, paid ? 1 : 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refunds').get()?.n, 0, 'Fee refunds stay separate from merchandise and delivery refunds');
  if (paid) {
    const bank = outgoing[0]!;
    const audit = audits[0]!;
    const payload = JSON.parse(String(audit.next_json));
    assert.equal(bank.packet_kind, 'refund');
    assert.equal(bank.packet_id, packet.packetId);
    assert.equal(bank.amount_paisa, 1000);
    assert.match(String(bank.transaction_identity), /^FICTIONAL-PAID-/);
    assert.equal(audit.subject_type, 'order');
    assert.equal(audit.subject_id, orderId);
    assert.equal(audit.actor_id, 'owner');
    assert.equal(payload.kind, 'lawful_platform_service_fee_refund_v1');
    assert.equal(payload.status, 'paid');
    assert.equal(payload.liability, 'platform');
    assert.equal(payload.executionPacketId, packet.packetId);
    assert.equal(payload.refundObligationId, packet.obligationId);
    assert.equal(payload.request.amountPaisa, 1000);
    assert.equal(payload.request.paymentReference, bank.transaction_identity);
    assert.equal(payload.savedFeePaisa, 1000);
    assert.equal(payload.request.orderId, orderId);
    assert.equal(payload.request.actorId, 'owner');
    const authorization = f.sqlite.prepare('SELECT case_reference,legal_basis FROM lawful_fee_refund_authorizations WHERE id=?').get(sourceId);
    assert.equal(payload.request.caseReference, authorization?.case_reference);
    assert.equal(payload.request.legalBasis, authorization?.legal_basis);
  }
}

void test('lawful fee refunds require current Super Admin, payment evidence, a legal basis and an atomic saved-fee cap', async () => {
  const f = await orderFixture();
  try {
    const reviewed = await withReviewedPromoQuote(f.database, 'cart', f.input, 100);
    const placed = await createCodOrder(f.database, 'token', 'receipt', reviewed, 100, 'checkout-buyer');
    const order = f.sqlite.prepare('SELECT id,customer_id FROM orders WHERE order_number=?').get(placed.orderNumber);
    assert.equal(order?.customer_id, 'checkout-buyer');
    const orderId = String(order?.id);
    assert.equal(placed.grandTotalPaisa, 216000);
    const input = feeAuthorization(orderId);
    await deliverFeeOrder(f.database, orderId);
    await assert.rejects(authorizeLawfulFeeRefund(f.database, feeContext('fee-before-collection'), input), /actual collected fee or original cash capacity/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM lawful_fee_refund_authorizations').get()?.n, 0);
    await recordFeeOrderCash(f.database, orderId, placed.grandTotalPaisa, 'collect');

    await assert.rejects(authorizeLawfulFeeRefund(f.database, feeContext('fee-staff-denied', 'staff'), input), /current staff permission/i);
    await assert.rejects(authorizeLawfulFeeRefund(f.database, feeContext('fee-no-basis'), { ...input, legalBasis: '' }), /documented legal basis/i);
    await assert.rejects(recordLawfulServiceFeeRefund(f.database, {
      ...input, actorId: 'owner', paymentReference: 'FICTIONAL-REFERENCE-ONLY', requestId: 'fee-reference-only', now: Date.now(),
    }), /verified actual execution packet/i);
    const context = feeContext('fee-legal-authorize');
    const authorized = await authorizeLawfulFeeRefund(f.database, context, input);
    assert.deepEqual(await authorizeLawfulFeeRefund(f.database, context, input), authorized);
    assert.equal(feeAudits(f).length, 0, 'Authorization does not record a paid fee');

    const packet = await executeFixtureRefund(f.database, {
      actorId: 'owner', kind: 'service_fee', sourceId: authorized.id, customerId: 'checkout-buyer', deferCompletion: true,
    });
    assertFeePacket(f, orderId, authorized.id, packet, false);
    await assert.rejects(packet.complete(f.database, { actorId: 'staff', requestId: 'fee-staff-paid-denied' }), /current staff permission/i);
    assertFeePacket(f, orderId, authorized.id, packet, false);
    const paid = await packet.complete();
    assert.deepEqual(paid, { id: packet.packetId, revision: 3, state: 'paid' });
    assert.deepEqual(await packet.complete(), paid);
    assertFeePacket(f, orderId, authorized.id, packet, true);
    await assert.rejects(authorizeLawfulFeeRefund(f.database, feeContext('fee-over-cap'), {
      ...input, caseReference: 'FICTIONAL-SECOND-CASE', amountPaisa: 1,
    }), /remaining actual collected fee/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM lawful_fee_refund_authorizations').get()?.n, 1);
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
      let batchReached = false;
      if(duringCommit){
        const batch=f.database.batch.bind(f.database);
        f.database.batch=(async statements=>{
          f.database.batch=batch;
          batchReached=true;
          publish();
          return batch(statements);
        }) as D1Database['batch'];
      }
      else publish();
      await assert.rejects(createCodOrder(f.database,'token','receipt',quote,100,'checkout-buyer'),{
        message: duringCommit
          ? /^Availability or delivery rates changed while placing your order\./
          : /^Your checkout quote or policies changed\./,
      });
      assert.equal(batchReached,duringCommit);
      assert.equal((await getPlatformServiceFee(f.database,100)).chargedPaisa,0);
      for(const table of ['orders','payments','seller_ledger_entries','order_policy_acceptances'])assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n,0,table);
      assert.equal(f.sqlite.prepare('SELECT inventory_quantity FROM products').get()?.inventory_quantity,10);
    }finally{await f.dispose();}
  }
});

void test('a fee refund works with saved shopping credit without altering wallet or commission records', async () => {
  const f = await orderFixture();
  try {
    f.sqlite.prepare("INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES ('checkout-buyer','FEE-TEST',5000,1)").run();
    // The shared promo quote helper defaults to its own customer ID. Quote this actual buyer's credit.
    const reviewed = await withReviewedPromoQuote(f.database, 'cart', f.input, 100);
    const credit = await quoteOrderCredit(f.database, {
      userId: 'checkout-buyer', subtotalPaisa: 200000, useWallet: true,
      phone: f.input.customerPhone, now: 100, readOnly: true,
    });
    assert.equal(credit.walletPaisa, 5000);
    const placed = await createCodOrder(f.database, 'token', 'receipt', {
      ...reviewed, useWallet: true, reviewedQuote: {
        ...reviewed.reviewedQuote, walletPaisa: credit.walletPaisa,
        payablePaisa: reviewed.reviewedQuote.payablePaisa - credit.walletPaisa,
      },
    }, 100, 'checkout-buyer');
    const order = f.sqlite.prepare('SELECT id,customer_id,wallet_credit_paisa,buyer_platform_fee_paisa FROM orders WHERE order_number=?').get(placed.orderNumber)!;
    assert.equal(order.customer_id, 'checkout-buyer');
    const orderId = String(order.id);
    assert.equal(order.wallet_credit_paisa, 5000);
    assert.equal(order.buyer_platform_fee_paisa, 1000);
    assert.equal(placed.grandTotalPaisa, 211000);
    await deliverFeeOrder(f.database, orderId);
    await recordFeeOrderCash(f.database, orderId, placed.grandTotalPaisa, 'collect');

    const statuses = () => f.sqlite.prepare('SELECT o.payment_status AS orderStatus,p.status AS paymentStatus FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=?').get(orderId);
    const walletEntries = () => f.sqlite.prepare('SELECT * FROM wallet_entries WHERE user_id=? ORDER BY id').all('checkout-buyer');
    const walletAccount = () => f.sqlite.prepare('SELECT * FROM wallet_accounts WHERE user_id=?').get('checkout-buyer');
    const merchandise = () => f.sqlite.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(orderId);
    const termsSnapshot = () => String(f.sqlite.prepare('SELECT terms_snapshot_json FROM order_policy_acceptances WHERE order_id=?').get(orderId)?.terms_snapshot_json);
    const originalTerms = termsSnapshot();
    const { registeredSettlementTerms } = JSON.parse(originalTerms);
    assert.equal(registeredSettlementTerms.deliveryHoldDays, 7);
    assert.equal(registeredSettlementTerms.reserveBps, 0);
    const deliveredAt = Number(f.sqlite.prepare('SELECT delivered_at FROM orders WHERE id=?').get(orderId)?.delivered_at);
    assert.ok(Number.isSafeInteger(deliveredAt) && deliveredAt > 0);
    const maturity = deliveredAt + registeredSettlementTerms.deliveryHoldDays * 86_400_000;
    const earnings = (now = maturity) => getSellerFinanceSummary(f.database, 'seller-a', now);
    assert.equal(statuses()?.orderStatus, 'paid');
    assert.equal(statuses()?.paymentStatus, 'captured');
    assert.equal((await earnings()).grossSalesPaisa, 0, 'Collection alone cannot release merchandise earnings before remittance');
    const before = { wallet: walletEntries(), account: walletAccount(), items: merchandise() };
    assert.ok(before.wallet.length > 0);
    assert.equal(before.account?.balance_paisa, 0);
    assert.equal(before.items.length, 1);
    assert.equal(before.items[0]?.commission_bps, 900);
    assert.equal(before.items[0]?.commission_base_paisa, 200000);
    assert.equal(before.items[0]?.commission_paisa, 18000);
    const authorized = await authorizeLawfulFeeRefund(f.database, feeContext('fee-credit-authorize'), feeAuthorization(orderId));
    const packet = await executeFixtureRefund(f.database, {
      actorId: 'owner', kind: 'service_fee', sourceId: authorized.id, customerId: 'checkout-buyer',
    });
    assertFeePacket(f, orderId, authorized.id, packet, true);
    assert.equal(statuses()?.orderStatus, 'part_refunded');
    assert.equal(statuses()?.paymentStatus, 'part_refunded');
    assert.equal((await earnings()).grossSalesPaisa, 0, 'Original COD remittance remains required');

    // Complete actual fictional remittance after the fee-only refund to test new earnings accrual.
    await recordFeeOrderCash(f.database, orderId, placed.grandTotalPaisa, 'propose_remittance');
    assert.deepEqual(walletEntries(), before.wallet);
    assert.deepEqual(walletAccount(), before.account);
    assert.deepEqual(merchandise(), before.items);
    assert.equal(termsSnapshot(), originalTerms);
    assert.equal(statuses()?.orderStatus, 'part_refunded');
    assert.equal(statuses()?.paymentStatus, 'part_refunded');
    const ledger = f.sqlite.prepare('SELECT type,amount_paisa,available_at FROM seller_ledger_entries WHERE seller_id=? ORDER BY type').all('seller-a');
    assert.deepEqual(ledger.map(row => [row.type, row.amount_paisa, row.available_at]), [
      ['commission', -18000, maturity],
      ['sale', 200000, maturity],
    ]);
    const pending = await earnings(maturity - 1);
    assert.equal(pending.availablePaisa, 0);
    assert.equal(pending.pendingPaisa, 182000);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_capability_holds WHERE seller_id='seller-a' AND capability='payouts' AND released_at IS NULL").get()?.n, 0);
    assert.deepEqual(await earnings(), {
      availablePaisa: 182000, pendingPaisa: 0, grossSalesPaisa: 200000, commissionPaisa: -18000,
      commissionReversalPaisa: 0, refundPaisa: 0, paidPaisa: 0,
    });
    const now = Date.now();
    const report = await readAccountingSources(f.database, parseAccountingQuery(new URLSearchParams('period=all'), now), now, 'local_staging');
    assert.equal(report.metrics.find(m => m.key === 'service_fee_charged')?.amountPaisa, '1000');
    assert.equal(report.metrics.find(m => m.key === 'service_fee_refunded')?.amountPaisa, '1000');
    assert.equal(report.metrics.find(m => m.key === 'seller_commission_earned')?.amountPaisa, '18000');
  } finally { await f.dispose(); }
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
   const retained = (await listParcels(f.database,id)).find(parcel=>parcel.sellerId==='seller-a');
   assert.ok(retained);
   assert.equal(retained.status,'delivered');
   assert.equal(retained.collectedPaisa,0);
   if(collected)await operateParcel(f.database,{
    jobId:retained.id,actorId:'owner',action:'collect',version:retained.version,
    amountPaisa:retained.codDuePaisa,reference:'FICTIONAL-RETAINED-COLLECTION',
    note:'Record the actual collection on the retained fictional parcel.',
    requestId:'fee-delivered-collect',now:103,
   });
   const access={orderNumber:result.orderNumber,customerId:'checkout-buyer'};
   const preview=await cancellationPreview(f.database,access,['seller-b']);
   assert.equal(preview.next.parcels.find(parcel=>parcel.sellerId==='seller-a')?.amount,216000);
   assert.ok(retained.codDuePaisa<216000);
   assert.equal(preview.advancedCustody,false);
   assert.equal(preview.reviewRequired,collected);
   assert.equal(preview.executionBlocked,collected);
   if(collected){
    const parcel = () => f.sqlite.prepare('SELECT cod_due_paisa,collected_paisa,remitted_paisa,version FROM shipping_parcels WHERE shipping_job_id=?').get(retained.id);
    const before = parcel();
    assert.equal(before?.cod_due_paisa,retained.codDuePaisa);
    assert.equal(before?.collected_paisa,retained.codDuePaisa);
    const reviewId='fee-delivered-review';
    const request={sellerIds:['seller-b'],fingerprint:preview.fingerprint,note:'Review the original collected charge before cancelling.',now:104};
    assert.deepEqual(await cancelSelectedParcels(f.database,access,{...request,requestId:reviewId}),{status:'review_requested',id:reviewId});
    const staff={orderNumber:result.orderNumber,actorId:'owner'};
    await assert.rejects(cancelSelectedParcels(f.database,staff,{...request,requestId:'review:'+reviewId,reviewId}),{
     message:/^Keep this case open for the actual custody, refund or collected-charge reconciliation\./,
    });
    assert.equal(f.sqlite.prepare('SELECT status FROM order_cancellation_reviews WHERE id=?').get(reviewId)?.status,'pending');
    assert.deepEqual(parcel(),before);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM order_cancellation_events').get()?.n,0);
    assert.equal(f.sqlite.prepare("SELECT inventory_quantity FROM products WHERE id='product-b'").get()?.inventory_quantity,9);
    assert.equal(f.sqlite.prepare("SELECT fulfillment_status FROM order_items WHERE order_id=? AND seller_id='seller-b'").get(id)?.fulfillment_status,'confirmed');
   }else{
    await cancelSelectedParcels(f.database,access,{sellerIds:['seller-b'],fingerprint:preview.fingerprint,requestId:'fee-delivered-cancel',note:'Cancel the second uncollected fictional parcel',now:103});
    assert.equal(f.sqlite.prepare("SELECT cod_due_paisa FROM shipping_parcels WHERE shipping_job_id IN (SELECT id FROM shipping_jobs WHERE seller_id='seller-a')").get()?.cod_due_paisa,216000);
    assert.equal((await getOrderReceipt(f.database,result.orderNumber,null,'checkout-buyer'))?.grandTotalPaisa,216000);
   }
  }finally{await f.dispose();}
 }
});

void test('explicit effective 12 percent commission excludes the customer fee and keeps an 88 percent seller share',async()=>{
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

void test('competing lawful fee refund or revoked authority is rejected at the commit boundary', async () => {
  for (const scenario of ['authorization-cap', 'paid-outcome-race', 'paid-authority-revoked'] as const) {
    const f = await orderFixture();
    try {
      const reviewed = await withReviewedPromoQuote(f.database, 'cart', f.input, 100);
      const placed = await createCodOrder(f.database, 'token', 'receipt', reviewed, 100, 'checkout-buyer');
      const order = f.sqlite.prepare('SELECT id,customer_id FROM orders WHERE order_number=?').get(placed.orderNumber);
      assert.equal(order?.customer_id, 'checkout-buyer');
      const orderId = String(order?.id);
      assert.equal(placed.grandTotalPaisa, 216000);
      await deliverFeeOrder(f.database, orderId);
      await recordFeeOrderCash(f.database, orderId, placed.grandTotalPaisa, 'collect');
      const authorization = feeAuthorization(orderId);
      const original = f.database.batch.bind(f.database);
      let boundaryReached = false;
      const beforeNextBatch = (interleave: () => Promise<void>) => {
        f.database.batch = (async statements => {
          f.database.batch = original;
          boundaryReached = true;
          await interleave();
          return original(statements);
        }) as D1Database['batch'];
      };
      const orderStatus = () => f.sqlite.prepare('SELECT payment_status FROM orders WHERE id=?').get(orderId)?.payment_status;
      const unchanged = () => ({
        items: f.sqlite.prepare('SELECT * FROM order_items ORDER BY id').all(),
        wallet: f.sqlite.prepare('SELECT * FROM wallet_entries ORDER BY id').all(),
        ledger: f.sqlite.prepare('SELECT * FROM seller_ledger_entries ORDER BY id').all(),
        parcel: f.sqlite.prepare('SELECT * FROM shipping_parcels ORDER BY shipping_job_id').all(),
      });
      const before = unchanged();

      if (scenario === 'authorization-cap') {
        const losing = { ...authorization, caseReference: 'FICTIONAL-LOSING-LEGAL-CASE' };
        const winning = { ...authorization, caseReference: 'FICTIONAL-WINNING-LEGAL-CASE' };
        const winningContext = feeContext('fee-cap-winning-authorize');
        beforeNextBatch(async () => {
          await authorizeLawfulFeeRefund(f.database, winningContext, winning);
        });
        await assert.rejects(
          authorizeLawfulFeeRefund(f.database, feeContext('fee-cap-losing-authorize'), losing),
          /CHECK constraint failed.*valid\s*=\s*1/i,
        );
        assert.ok(boundaryReached);
        const winner = await authorizeLawfulFeeRefund(f.database, winningContext, winning);
        const rows = f.sqlite.prepare('SELECT id,case_reference,amount_paisa,state FROM lawful_fee_refund_authorizations').all();
        assert.deepEqual(rows.map(row => ({ ...row })), [{
          id: winner.id, case_reference: winning.caseReference, amount_paisa: 1000, state: 'authorized',
        }]);
        assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refund_obligations').get()?.n, 0);
        assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM outgoing_payment_packets').get()?.n, 0);
        assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM company_outgoing_bank_identities').get()?.n, 0);
        assert.equal(feeAudits(f).length, 0);
        assert.equal(orderStatus(), 'paid');
      } else {
        const authorized = await authorizeLawfulFeeRefund(f.database, feeContext('fee-race-authorize'), authorization);
        const packet = await executeFixtureRefund(f.database, {
          actorId: 'owner', kind: 'service_fee', sourceId: authorized.id, customerId: 'checkout-buyer', deferCompletion: true,
        });
        assertFeePacket(f, orderId, authorized.id, packet, false);
        const winning = { requestId: 'fee-race-winning-outcome' };
        const revoke = scenario === 'paid-authority-revoked';
        const attempt = revoke ? 'fee-revoked-outcome' : 'fee-race-losing-outcome';
        beforeNextBatch(async () => {
          if (revoke) {
            const changed = f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'").run();
            assert.equal(Number(changed.changes), 1);
          } else {
            // Reconcile the same actual debit once using a competing command identity.
            assert.deepEqual(await packet.complete(f.database, winning), { id: packet.packetId, revision: 3, state: 'paid' });
          }
        });
        await assert.rejects(packet.complete(f.database, { requestId: attempt }), revoke
          ? /CHECK constraint failed.*valid\s*=\s*1/i
          : /UNIQUE constraint failed: company_outgoing_bank_identities\./i);
        assert.ok(boundaryReached);
        assertFeePacket(f, orderId, authorized.id, packet, !revoke);
        if (revoke) {
          assert.equal(orderStatus(), 'paid');
          await assert.rejects(packet.complete(f.database, { requestId: 'fee-revoked-still-denied' }), /current staff permission/i);
        } else {
          assert.equal(orderStatus(), 'part_refunded');
          assert.deepEqual(await packet.complete(f.database, winning), { id: packet.packetId, revision: 3, state: 'paid' });
          assert.equal(feeAudits(f)[0]?.request_id, winning.requestId + '-fee');
        }
        assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refund_obligations').get()?.n, 1);
        assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM outgoing_payment_packets').get()?.n, 1);
      }
      for (const request of ['fee-cap-losing-authorize', 'fee-race-losing-outcome', 'fee-revoked-outcome']) {
        assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE request_id=? AND command_key IS NOT NULL').get(request)?.n, 0);
      }
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM refunds').get()?.n, 0);
      assert.deepEqual(unchanged(), before, scenario);
    } finally { await f.dispose(); }
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
