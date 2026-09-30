import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import mysql, { type Pool } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import { createCustomerReturnRequest, reviewReturnAsAdmin, advanceReturnAsAdmin } from '../lib/db/repositories/returns';
import { accrueManagedEntitlements, getManagedFinanceSummary } from '../lib/db/repositories/managed-settlements';
import { createCodOrder } from '../lib/db/repositories/orders';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';

// Explicit opt-in: this harness only writes fictional rows in the coordinator's
// isolated loopback MariaDB database. It never creates/imports schema or deletes data.
const enabled = process.env.HATSKALA_NATIVE_COMMERCE === '1';
const pools: Pool[] = [];
const originalCreatePool = mysql.createPool;
if (enabled) {
  assert.equal(process.env.DB_HOST, '127.0.0.1');
  assert.equal(process.env.DB_PORT, '13327');
  assert.equal(process.env.DB_NAME, 'hastabazaar_audit');
  assert.equal(process.env.DB_USER, 'audit_fixture');
  assert.equal(process.env.HASTABAZAAR_RUNTIME_ENV, 'local_staging');
  // Capture the actual pool for teardown; all database traffic still uses the
  // unmodified production adapter and real independent MySQL connections.
  mysql.createPool = (...args: Parameters<typeof mysql.createPool>) => {
    const pool = originalCreatePool(...args); pools.push(pool); return pool;
  };
}
after(async () => { await Promise.all(pools.map(pool => pool.end())); mysql.createPool = originalCreatePool; });
const db = env.DB;
const now = Date.now();
const policy = {generalRequestWindowDays:7,sealedGoodsWindowDays:15,deliveryDamageEvidenceWindowHours:48,
  changeOfMindEnabled:true,highValueRefundThresholdPaisa:1000000,refundInitiationBusinessDays:2,codRefundEstimateBusinessDays:[3,7]};

async function fixture(label: string) {
  const prefix = `native-${label}-${crypto.randomUUID().slice(0,8)}`;
  const phone='98'+String(crypto.getRandomValues(new Uint32Array(1))[0]%100000000).padStart(8,'0');
  const admin=prefix+'-admin',owner=prefix+'-owner',seller=prefix+'-seller',buyer=prefix+'-buyer',order=prefix+'-order';
  for (const [id,role] of [[admin,'admin'],[owner,'seller'],[buyer,'customer']]) {
    await db.prepare(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES (?,?,?,'SIMULATED native commerce user','en-NP','active',?,?)`).bind(id,id,id+'@example.test',now,now).run();
    await db.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)').bind(id,role,now).run();
  }
  await db.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,
    tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,
    payout_account_reference,status,approved_at,seller_agreement_version,seller_agreement_accepted_at,created_at,updated_at)
    VALUES (?,?,'SIMULATED Maker','SIMULATED Shop','Local',?,'PAN',?,'SIMULATED Representative','9800000000',?,
      'Madhesh','Dhanusha','Janakpur','Ward 1','SIM-PAYOUT','approved',?,?,?,?,?)`)
    .bind(seller,owner,prefix+'-REG',prefix+'-PAN',owner+'@example.test',now-100*86400000,SELLER_AGREEMENT_VERSION,now,now,now).run();
  await db.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES (?,?,'SIMULATED native',1,1,?,?)")
    .bind(prefix+'-category',prefix+'-category',now,now).run();
  const items: string[] = [], products: string[]=[];
  for(let index=0;index<2;index++) {
    const product=prefix+'-product-'+index,item=prefix+'-item-'+index;items.push(item);products.push(product);
    await db.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,
      producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'SIMULATED native item','SIMULATED native fixture',100000,2,'SIMULATED Maker','NP','Natural fibre',1,'published',?,?)`)
      .bind(product,seller,prefix+'-category',product,product,now,now).run();
  }
  await db.prepare(`INSERT INTO orders(id,order_number,receipt_token_hash,customer_email,customer_phone,status,locale,currency,policy_version,
    return_policy_snapshot_json,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,
    tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,delivered_at,created_at,updated_at)
    VALUES (?,?,?,?,?,'delivered','en-NP','NPR','phase-1.0',?,'{}',200000,0,60000,0,0,260000,'cod','paid',?,?,?,?)`)
    .bind(order,order,prefix+'-receipt',buyer+'@example.test',phone,JSON.stringify(policy),now-86400000,now-1000,now,now).run();
  for(let index=0;index<2;index++) await db.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,
    product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,seller_discount_paisa,commission_base_paisa,commission_bps,commission_paisa,
    tax_paisa,line_total_paisa,return_eligible_snapshot,fulfillment_status,created_at)
    VALUES (?,?,?,?,'SIMULATED Shop','SIMULATED native item',?,100000,1,0,100000,1200,12000,0,100000,1,'delivered',?)`)
    .bind(items[index],order,products[index],seller,products[index],now).run();
  await db.prepare(`INSERT INTO payments(id,order_id,provider,method,status,amount_paisa,currency,idempotency_key,created_at,updated_at)
    VALUES (?,?,'manual_cod','cod','captured',260000,'NPR',?,?,?)`).bind(prefix+'-payment',order,prefix+'-payment-key',now,now).run();
  return {prefix,admin,owner,seller,buyer,order,items,products,phone,receipt:prefix+'-receipt'};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function createReturn(f:Fixture,index=0) {
  return createCustomerReturnRequest(db,{orderNumber:f.order,receiptTokenHash:f.receipt,orderItemId:f.items[index],quantity:1,
    reason:'defective',requestedResolution:'refund',detail:'SIMULATED native defective delivered item.',locale:'en-NP',
    idempotencyKey:f.prefix+'-return-'+index,evidence:[],now});
}
function review(f:Fixture,id:string,requestId:string,deliveryRefundPaisa=0) {
  return {returnRequestId:id,actorId:f.admin,actorRole:'admin' as const,action:'approve' as const,
    note:'SIMULATED native review.',publicMessageEn:'Approved.',publicMessageNe:'Approved.',responsibility:'seller' as const,
    outcome:'refund' as const,itemRefundPaisa:0,deliveryRefundPaisa,requestId,now};
}
function simultaneousBatches(database:D1Database,count=2):D1Database {
  let reached=0;let release!:()=>void;
  const ready=new Promise<void>(resolve=>{release=resolve;});
  return {prepare:database.prepare.bind(database),batch:async(statements:D1PreparedStatement[])=>{
    reached++;if(reached===count)release();await ready;return database.batch(statements);
  }} as D1Database;
}
function beforeBatch(database:D1Database,interleave:()=>Promise<unknown>):D1Database {
  return {prepare:database.prepare.bind(database),batch:async(statements:D1PreparedStatement[])=>{
    await interleave();return database.batch(statements);
  }} as D1Database;
}

void test('native F02 independent competing approvals reserve one current delivery allowance',{skip:!enabled},async()=>{
  const f=await fixture('f02');
  await db.prepare('UPDATE orders SET current_delivery_paisa=40000,current_subtotal_paisa=200000,current_total_paisa=240000,current_wallet_paisa=0,current_discount_paisa=0 WHERE id=?').bind(f.order).run();
  const [a,b]=[await createReturn(f),await createReturn(f,1)];
  await assert.rejects(reviewReturnAsAdmin(db,review(f,a.id,f.prefix+'-oversized',60000)),/remaining delivery charge/);
  const concurrent=simultaneousBatches(db);
  const results=await Promise.allSettled([reviewReturnAsAdmin(concurrent,review(f,a.id,f.prefix+'-approve-a',40000)),reviewReturnAsAdmin(concurrent,review(f,b.id,f.prefix+'-approve-b',40000))]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const failure=results.find(result=>result.status==='rejected') as PromiseRejectedResult;
  assert.match(String(failure.reason),/stale-delivery-refund-capacity/);
  assert.equal((await db.prepare('SELECT SUM(delivery_amount_paisa) AS n FROM refunds WHERE order_id=?').bind(f.order).first<{n:number}>())?.n,40000);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM return_requests WHERE order_item_id IN (?,?) AND status='requested'").bind(...f.items).first<{n:number}>())?.n,1);
});

void test('native F03 real checkout consumes the last unit before replacement batch and all return effects roll back',{skip:!enabled},async()=>{
  const f=await fixture('f03'),created=await createReturn(f);
  await reviewReturnAsAdmin(db,{...review(f,created.id,f.prefix+'-approve'),outcome:'replacement'});
  await db.prepare('UPDATE users SET phone=? WHERE id=?').bind('+977'+f.phone,f.buyer).run();
  await db.prepare('INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES (?,?,?)').bind(f.buyer,f.buyer+'@example.test',now).run();
  await db.prepare('INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES (?,?,?)').bind(f.buyer,'+977'+f.phone,now).run();
  await db.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES (?,?,'NPR',?,?)").bind(f.prefix+'-cart',f.prefix+'-cart-token',now,now).run();
  await db.prepare('INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,?,?,1,?,?)').bind(f.prefix+'-cart-item',f.prefix+'-cart',f.products[0],now,now).run();
  const beforeNotifications=(await db.prepare('SELECT COUNT(*) AS n FROM notification_messages WHERE related_id=?').bind(created.id).first<{n:number}>())!.n;
  const raced=beforeBatch(db,()=>createCodOrder(db,f.prefix+'-cart-token',f.prefix+'-new-receipt',{
    customerEmail:f.buyer+'@example.test',customerAuthSubject:f.buyer,customerPhone:f.phone,locale:'en-NP',termsAccepted:true,
    idempotencyKey:crypto.randomUUID(),address:{recipientName:'SIMULATED Buyer',phone:f.phone,province:'Madhesh',district:'Dhanusha',municipality:'Janakpur',locality:'Ward 1'},
  },now,f.buyer));
  await assert.rejects(advanceReturnAsAdmin(raced,{returnRequestId:created.id,actorId:f.admin,actorRole:'admin',action:'resolve_replacement',
    note:'SIMULATED native stock race.',publicMessageEn:'Replaced.',publicMessageNe:'Replaced.',reference:f.prefix+'-replacement',requestId:f.prefix+'-resolve',now}),/lost-return-inventory-transition/);
  assert.equal((await db.prepare('SELECT status FROM return_requests WHERE id=?').bind(created.id).first<{status:string}>())?.status,'approved');
  assert.equal(await db.prepare('SELECT id FROM return_outcomes WHERE return_request_id=?').bind(created.id).first(),null);
  assert.equal(await db.prepare('SELECT id FROM return_request_events WHERE request_id=?').bind(f.prefix+'-resolve').first(),null);
  assert.equal(await db.prepare('SELECT id FROM audit_logs WHERE request_id=?').bind(f.prefix+'-resolve').first(),null);
  assert.equal(await db.prepare("SELECT id FROM inventory_adjustments WHERE product_id=? AND reason LIKE '%SIMULATED native stock race%'").bind(f.products[0]).first(),null);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM notification_messages WHERE related_id=?').bind(created.id).first<{n:number}>())?.n,beforeNotifications);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM seller_ledger_entries WHERE order_item_id=?').bind(f.items[0]).first<{n:number}>())?.n,0);
  assert.equal((await db.prepare('SELECT inventory_quantity AS n FROM products WHERE id=?').bind(f.products[0]).first<{n:number}>())?.n,0);
});

void test('native F07 independent accrual requests claim and credit one managed entitlement',{skip:!enabled},async()=>{
  const f=await fixture('f07');
  const snapshot=f.prefix+'-snapshot',entitlement=f.prefix+'-entitlement';
  await db.prepare(`INSERT INTO managed_commercial_snapshots(id,order_item_id,seller_id,participation_route,commercial_model,
    legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,agreement_version,agreement_language,
    delivery_hold_days,product_value_paisa,eligible_base_paisa,platform_retention_bps,platform_retained_paisa,maker_entitlement_paisa,simulation_label,created_at)
    VALUES (?,?,?,'managed_maker','managed_sale_linked_percentage_v1','SIM-LEGAL','SIM-INVOICE','SIM-PAYOUT','SIM-AGREEMENT','en',7,100000,100000,900,9000,91000,'SIMULATED - NOT VALID FOR PRODUCTION',?)`)
    .bind(snapshot,f.items[0],f.seller,now).run();
  await db.prepare("INSERT INTO managed_entitlements(id,snapshot_id,seller_id,status,calculated_paisa,created_at,updated_at) VALUES (?,?,?,'calculated',91000,?,?)")
    .bind(entitlement,snapshot,f.seller,now,now).run();
  const concurrent=simultaneousBatches(db);
  const amounts=await Promise.all([accrueManagedEntitlements(concurrent,{orderId:f.order,actorId:f.admin,requestId:f.prefix+'-accrue-a',now}),accrueManagedEntitlements(concurrent,{orderId:f.order,actorId:f.admin,requestId:f.prefix+'-accrue-b',now})]);
  assert.deepEqual(amounts.sort(),[0,1]);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM managed_settlement_entries WHERE entitlement_id=? AND type='earned'").bind(entitlement).first<{n:number}>())?.n,1);
  assert.equal((await getManagedFinanceSummary(db,f.seller,now)).balancePaisa,91000);
  const audits=await db.prepare('SELECT next_json AS data FROM audit_logs WHERE request_id IN (?,?)')
    .bind(f.prefix+'-accrue-a',f.prefix+'-accrue-b').all<{data:string}>();
  assert.deepEqual(audits.results.map(row=>JSON.parse(row.data).count).sort(),[0,1]);
});
