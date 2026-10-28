import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildEarningsAccrualStatements } from '../../lib/db/repositories/payouts';
import { createCustomerReturnRequest, reviewReturnAsAdmin, advanceReturnAsAdmin } from '../../lib/db/repositories/returns';
import { cancellationPreview, cancelSelectedParcels } from '../../lib/cancellation/repository';
import { operateParcel } from '../../lib/operations/parcels';
import { DELIVERY_PRICING_POLICY } from '../../lib/checkout/delivery-rates';
import { phaseOneMarketplacePolicy } from '../../lib/marketplace/policy';

/** Fictional full-schema rows. The caller must supply an isolated disposable database. */
async function deliveredFixture(db: D1Database, twoSellers = false, collected = true, wallet = false) {
  const prefix = 'financial-' + randomUUID();
  const id = (suffix: string) => prefix + '-' + suffix;
  for (const [suffix, role] of [['owner', 'super_admin'], ['buyer', 'customer'], ['maker-a', 'seller'], ['maker-b', 'seller']]) {
    await db.prepare("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,'Fictional financial fixture','en-NP','active',1,1)")
      .bind(id(suffix), id(suffix), id(suffix) + '@example.test').run();
    await db.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').bind(id(suffix), role).run();
  }
  for (const suffix of ['a', 'b']) {
    await db.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,
      tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,
      payout_account_reference,status,created_at,updated_at)
      VALUES (?,?,'Fictional Maker','Fictional Shop','Local',?,'PAN',?,'Maker','9800000000',?,'Bagmati','Kathmandu','Kathmandu','Ward 1',?,'approved',1,1)`)
      .bind(id('seller-' + suffix), id('maker-' + suffix), id('reg-' + suffix), id('pan-' + suffix), id(suffix) + '@example.test', id('bank-' + suffix)).run();
  }
  const goods = twoSellers ? 23500 : 100000;
  const delivery = twoSellers ? 22500 : 15000;
  const fee = twoSellers ? 1000 : 0;
  const walletPaisa = wallet ? 5000 : 0;
  const total = goods + delivery + fee - walletPaisa;
  await db.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES (?,?,'Fictional Craft',1,1,1,1)")
    .bind(id('category'), id('category')).run();
  await db.prepare(`INSERT INTO orders(id,order_number,receipt_token_hash,customer_id,customer_email,customer_phone,status,locale,
    policy_version,return_policy_snapshot_json,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,
    grand_total_paisa,wallet_credit_paisa,payment_mode,payment_status,placed_at,delivered_at,delivery_rate_snapshot_json,created_at,updated_at)
    VALUES (?,?,?,?,?,'9811111111',?,'en-NP','phase-1.0',?,'{}',?,?,?,?,?,'cod',?,90,100,?,90,100)`)
    .bind(id('order'), id('number'), id('receipt'), id('buyer'), id('buyer') + '@example.test', twoSellers ? 'dispatched' : 'delivered',
      JSON.stringify(phaseOneMarketplacePolicy.value.returns), goods, delivery, fee, total, walletPaisa, !twoSellers && collected ? 'paid' : 'pending',
      JSON.stringify({ pricingPolicy: DELIVERY_PRICING_POLICY, baseChargePaisa: 15000, storeCount: twoSellers ? 2 : 1, chargePaisa: delivery })).run();
  for (const suffix of twoSellers ? ['a', 'b'] : ['a']) {
    const amount = twoSellers ? suffix === 'a' ? 16000 : 7500 : 100000;
    const due = twoSellers ? suffix === 'a' ? 32000 - (wallet ? 3404 : 0) : 15000 - (wallet ? 1596 : 0) : 115000;
    await db.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,
      inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'Fictional Craft','Fictional native financial fixture',?,10,'Maker','NP','Wood',1,'published',1,1)`)
      .bind(id('product-' + suffix), id('seller-' + suffix), id('category'), id('product-' + suffix), id('sku-' + suffix), amount).run();
    await db.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,
      unit_price_paisa,quantity,commission_base_paisa,commission_bps,commission_paisa,line_total_paisa,return_eligible_snapshot,fulfillment_status,created_at)
      VALUES (?,?,?,?,'Fictional Maker','Fictional Craft',?,?,1,?,900,?,?,1,?,90)`)
      .bind(id('item-' + suffix), id('order'), id('product-' + suffix), id('seller-' + suffix), id('sku-' + suffix), amount, amount, amount * 9 / 100,
        amount, suffix === 'a' ? 'delivered' : 'confirmed').run();
    await db.prepare(`INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at)
      VALUES (?,?,?,'outbound',?,?,?,90,100)`)
      .bind(id('job-' + suffix), id('order'), id('seller-' + suffix), suffix === 'a' ? 'delivered' : 'pickup_requested', id('owner'), id('prepare-' + suffix)).run();
    await db.prepare(`INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,collected_paisa,remitted_paisa,method,courier_name,delivered_at,created_at)
      VALUES (?,?,?,0,'courier','Fictional Courier',?,90)`)
      .bind(id('job-' + suffix), due, suffix === 'a' && collected ? due : 0, suffix === 'a' ? 100 : null).run();
  }
  if (wallet) {
    await db.prepare('INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES (?,?,5000,1)')
      .bind(id('buyer'), randomUUID().replaceAll('-', '')).run();
    await db.prepare("INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES (?,?,?,-5000,5000,'order_spend',90)")
      .bind(id('spend'), id('buyer'), id('order')).run();
  }
  await db.prepare(`INSERT INTO payments(id,order_id,provider,method,status,amount_paisa,currency,idempotency_key,created_at,updated_at)
    VALUES (?,?,'manual_cod','cod',?,?,'NPR',?,90,100)`)
    .bind(id('payment'), id('order'), !twoSellers && collected ? 'captured' : 'pending', total, id('payment-key')).run();
  await db.prepare(`INSERT INTO order_documents(id,order_id,kind,document_number,snapshot_json,status,request_id,issued_at)
    VALUES (?,?,'order_statement',?,?,'issued',?,90)`)
    .bind(id('statement'), id('order'), id('statement-number'), JSON.stringify({ documentTitle: 'Order statement', taxDocument: false,
      orderNumber: id('number'), issuedAt: 90, currency: 'NPR', paymentMethod: 'Cash on delivery', paymentStatus: 'pending', items: [],
      itemSubtotalPaisa: goods, deliveryChargePaisa: delivery, buyerPlatformFeePaisa: fee, taxTotalPaisa: 0, grandTotalPaisa: total }), id('statement-request')).run();
  async function remit() {
    const parcel = await db.prepare('SELECT version,cod_due_paisa due FROM shipping_parcels WHERE shipping_job_id=?').bind(id('job-a')).first<{ version: number; due: number }>();
    assert.ok(parcel);
    const input = { jobId: id('job-a'), actorId: id('owner'), action: 'propose_remittance', version: parcel.version,
      amountPaisa: parcel.due, reference: id('remittance'), note: 'Fictional collected COD remittance', requestId: id('remit'), now: 130 };
    await operateParcel(db, input);
    await operateParcel(db, input);
  }
  async function ledger() {
    return (await db.prepare(`SELECT type,COUNT(*) n,SUM(amount_paisa) amount FROM seller_ledger_entries
      WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?) GROUP BY type`).bind(id('order')).all<{ type: string; n: number; amount: number }>()).results;
  }
  return { id, remit, ledger };
}

export async function refundRemittanceScenario(db: D1Database, full: boolean, beforeRemittance: boolean) {
  const f = await deliveredFixture(db);
  if (!beforeRemittance) await f.remit();
  const request = await createCustomerReturnRequest(db, { orderNumber: f.id('number'), receiptTokenHash: f.id('receipt'),
    customerId: f.id('buyer'), orderItemId: f.id('item-a'), quantity: 1, reason: 'defective', requestedResolution: 'refund',
    detail: 'Fictional product has a documented defect.', locale: 'en-NP', idempotencyKey: f.id('return'), evidence: [], now: 120 });
  await reviewReturnAsAdmin(db, { returnRequestId: request.id, actorId: f.id('owner'), actorRole: 'super_admin', action: 'approve',
    note: 'Fictional merchandise refund approved', publicMessageEn: 'Refund approved.', publicMessageNe: 'Refund approved.',
    responsibility: 'seller', outcome: 'refund', itemRefundPaisa: full ? 100000 : 50000, deliveryRefundPaisa: full ? 15000 : 0,
    requestId: f.id('refund-approve'), now: 121 });
  const input = { returnRequestId: request.id, actorId: f.id('owner'), actorRole: 'super_admin' as const,
    note: 'Fictional refund processing evidence', publicMessageEn: 'Refund processing update.', publicMessageNe: 'Refund processing update.' };
  await advanceReturnAsAdmin(db, { ...input, action: 'start_refund', requestId: f.id('refund-start'), now: 122 });
  const complete = { ...input, action: 'complete_refund' as const, reference: f.id('refund-reference'), requestId: f.id('refund-complete'), now: 123 };
  await advanceReturnAsAdmin(db, complete);
  if (beforeRemittance) {
    assert.equal((await f.ledger()).filter(row => row.type === 'sale').length, 0);
    await f.remit();
  }
  await advanceReturnAsAdmin(db, complete);
  for (let i = 0; i < 2; i++) await db.batch(buildEarningsAccrualStatements(db, { orderId: f.id('order'), now: 140 + i }));
  const entries = await f.ledger();
  if (beforeRemittance) {
    const reversal = await db.prepare("SELECT refund_id,description FROM seller_ledger_entries WHERE order_item_id=? AND type='commission_reversal'")
      .bind(f.id('item-a')).first<{ refund_id: string; description: string }>();
    assert.ok(reversal);
    assert.equal(reversal.description, 'Commission reversal for paid refund ' + reversal.refund_id);
  }
  for (const [type, amount] of [['sale', 100000], ['commission', -9000], ['commission_reversal', full ? 9000 : 4500], ['refund', full ? -115000 : -50000]] as const) {
    const entry = entries.find(row => row.type === type);
    assert.equal(Number(entry?.n), 1, type + ' must be posted once');
    assert.equal(Number(entry?.amount), amount, type + ' must preserve its recorded value');
  }
  assert.equal((await db.prepare('SELECT payment_status status FROM orders WHERE id=?').bind(f.id('order')).first<{ status: string }>())?.status,
    full ? 'refunded' : 'part_refunded');
}

export async function cancellationSettlementScenario(db: D1Database, collected: boolean, remitted: boolean, wallet = false) {
  const f = await deliveredFixture(db, true, collected, wallet);
  const expectedCash = wallet ? 28596 : 32000;
  if (remitted) await f.remit();
  const access = { orderNumber: f.id('number'), customerId: f.id('buyer') };
  const preview = await cancellationPreview(db, access, [f.id('seller-b')]);
  assert.equal(preview.next.total, expectedCash);
  const input = { sellerIds: [f.id('seller-b')], fingerprint: preview.fingerprint, requestId: f.id('cancel-b'), note: 'Cancel pending fictional seller B parcel', now: 135 };
  await cancelSelectedParcels(db, access, input);
  await cancelSelectedParcels(db, access, input);
  assert.deepEqual({ ...await db.prepare('SELECT status,payment_status FROM orders WHERE id=?').bind(f.id('order')).first() },
    { status: 'delivered', payment_status: collected ? 'paid' : 'pending' });
  assert.deepEqual({ ...await db.prepare('SELECT status,amount_paisa FROM payments WHERE order_id=?').bind(f.id('order')).first() },
    { status: collected ? 'captured' : 'pending', amount_paisa: expectedCash });
  const receipts = (await db.prepare("SELECT snapshot_json FROM order_documents WHERE order_id=? AND kind='payment_receipt'")
    .bind(f.id('order')).all<{ snapshot_json: string }>()).results;
  assert.equal(receipts.length, collected ? 1 : 0);
  if (collected) {
    const snapshot = JSON.parse(receipts[0].snapshot_json);
    assert.equal(snapshot.grandTotalPaisa, expectedCash); assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.walletCreditPaisa, wallet ? 3404 : 0);
    assert.equal(snapshot.itemSubtotalPaisa, 16000); assert.equal(snapshot.deliveryChargePaisa, 15000); assert.equal(snapshot.buyerPlatformFeePaisa, 1000);
  }
  assert.equal((await f.ledger()).filter(row => row.type === 'sale').length, remitted ? 1 : 0);
  if (collected && !remitted) await f.remit();
  await db.batch(buildEarningsAccrualStatements(db, { orderId: f.id('order'), now: 140 }));
  const sale = (await f.ledger()).find(row => row.type === 'sale');
  if (collected) { assert.equal(Number(sale?.n), 1); assert.equal(Number(sale?.amount), 16000); }
  else assert.equal(sale, undefined);
  if (wallet) {
    const restored = await db.prepare("SELECT COUNT(*) n,SUM(amount_paisa) amount FROM wallet_entries WHERE order_id=? AND kind='cancellation'")
      .bind(f.id('order')).first<{ n: number; amount: number }>();
    assert.equal(Number(restored?.n), 1); assert.equal(Number(restored?.amount), 1596);
    assert.equal(Number((await db.prepare('SELECT balance_paisa amount FROM wallet_accounts WHERE user_id=?').bind(f.id('buyer')).first<{ amount: number }>())?.amount), 1596);
  }
}
