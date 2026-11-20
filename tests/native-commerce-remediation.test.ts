import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import mysql, { type Pool } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import { createCustomerReturnRequest, reviewReturnAsAdmin, decideHighValueRefund } from '../lib/db/repositories/returns';
import { accrueManagedEntitlements, getManagedFinanceSummary } from '../lib/db/repositories/managed-settlements';
import { createCodOrder } from '../lib/db/repositories/orders';
import { prepareSellerParcels, operateParcel, listParcels } from '../lib/operations/parcels';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';
import { assertNativeFixtureScope } from './helpers/native-fixture-scope';
import { cancellationPreview, cancelSelectedParcels } from '../lib/cancellation/repository';
import { allocateOriginalDelivery, ORIGINAL_DELIVERY_ALLOCATION } from '../lib/returns/delivery-allocation';
import { getReturnHandling, recordReturnHandling } from '../lib/returns/handling';
import { getRegisteredSellerTerms, prepareSellerCommissionAcceptance } from '../lib/db/repositories/marketplace-settings';
import { saveBusinessSettingChange } from '../lib/db/repositories/business-settings';
import { verifySellerDocument } from '../lib/sellers/document-review';
import { recordRefundPacketOutcome } from '../lib/payments/refund-obligations';
import { seedVerifiedCheckoutContact } from './helpers/checkout-contact';
import { executeFixtureRefund } from './helpers/execute-fixture-refund';

// Explicit opt-in: this harness only writes fictional rows in the coordinator's
// isolated loopback MariaDB database. It never creates/imports schema or deletes data.
const enabled = process.env.HATSKALA_NATIVE_COMMERCE === '1';
const pools: Pool[] = [];
const originalCreatePool = mysql.createPool;
if (enabled) {
  await assertNativeFixtureScope();
  // Capture the actual pool for teardown; all database traffic still uses the
  // unmodified production adapter and real independent MySQL connections.
  mysql.createPool = (config: string | mysql.PoolOptions) => {
    const pool = typeof config === 'string' ? originalCreatePool(config) : originalCreatePool(config);
    pools.push(pool); return pool;
  };
}
after(async () => { await Promise.all(pools.map(pool => pool.end())); mysql.createPool = originalCreatePool; });
const db = env.DB;
const now = Date.now();
const financeActor = 'native-commerce-reviewer';
const policy = {generalRequestWindowDays:7,sealedGoodsWindowDays:15,deliveryDamageEvidenceWindowHours:48,
  changeOfMindEnabled:true,highValueRefundThresholdPaisa:1000000,refundInitiationBusinessDays:2,codRefundEstimateBusinessDays:[3,7]};

async function fixture(label: string) {
  if (!await db.prepare('SELECT id FROM users WHERE id=?').bind(financeActor).first()) {
    await db.batch([
      db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'Fictional commerce reviewer','active',?,?)").bind(financeActor,financeActor,financeActor+'@example.test',now,now),
      db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'super_admin',?)").bind(financeActor,now),
    ]);
  }
  const prefix = `native-${label}-${crypto.randomUUID().slice(0,8)}`;
  const phone='98'+String(crypto.getRandomValues(new Uint32Array(1))[0]%100000000).padStart(8,'0');
  const admin=prefix+'-admin',owner=prefix+'-owner',seller=prefix+'-seller',buyer=prefix+'-buyer',order=prefix+'-order';
  for (const [id,role] of [[admin,'admin'],[owner,'seller'],[buyer,'customer']]) {
    await db.prepare(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES (?,?,?,'SIMULATED native commerce user','en-NP','active',?,?)`).bind(id,id,id+'@example.test',now,now).run();
    await db.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)').bind(id,role,now).run();
  }
  await db.prepare(`INSERT INTO seller_profiles(id,user_id,applicant_type,legal_name,trading_name,registration_authority,registration_number,tax_mode,
    tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,
    payout_account_reference,status,approved_at,seller_agreement_version,seller_agreement_accepted_at,created_at,updated_at)
    VALUES (?,?,'individual','SIMULATED Maker','SIMULATED Shop','Local',?,'PAN',?,'SIMULATED Representative','9800000000',?,
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

async function saveOriginalDelivery(f: Fixture) {
  const original = await db.prepare('SELECT delivery_charge_paisa AS delivery,placed_at AS placed FROM orders WHERE id=?')
    .bind(f.order).first<{delivery:number;placed:number}>();
  assert.ok(original);
  const items = (await db.prepare('SELECT id,seller_id AS sellerId,line_total_paisa AS amount,quantity FROM order_items WHERE order_id=? ORDER BY id')
    .bind(f.order).all<{id:string;sellerId:string;amount:number;quantity:number}>()).results;
  const shares = allocateOriginalDelivery(original.delivery,items);
  assert.deepEqual([...shares.values()],[30000,30000]);
  await db.batch(items.map(item=>db.prepare('INSERT INTO order_delivery_allocations(order_item_id,order_id,seller_id,amount_paisa,original_quantity,policy_version,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(item.id,f.order,item.sellerId,shares.get(item.id)!,item.quantity,ORIGINAL_DELIVERY_ALLOCATION,original.placed)));
}

async function readyCheckoutSeller(f: Fixture) {
  if (!await db.prepare("SELECT id FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps'").first()) {
    await saveBusinessSettingChange(db,{key:'independent_seller_commission_bps',value:1200,actorId:financeActor,
      reason:'Fictional historical current seller commission already completed its full notice interval.',requestId:'native-commerce-current-commission',
      now:now-1296000002,effectiveFrom:now-1,expectedVersion:0});
  }
  for (const kind of ['representative_identity','pan_certificate']) {
    const id=f.prefix+'-'+kind;
    await db.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES (?,?,?,?,'fictional.pdf','application/pdf',100,'pending',?)")
      .bind(id,f.seller,kind,'private/seller-documents/'+f.seller+'/'+id,now).run();
    await verifySellerDocument(db,{sellerId:f.seller,documentId:id,actorId:financeActor,reason:'Independently verify exact fictional registered seller evidence.',commandId:'verify-'+id,now,expectedReviewId:null});
  }
  const terms=await getRegisteredSellerTerms(db,now);
  const accepted=await prepareSellerCommissionAcceptance(db,{sellerId:f.seller,actorId:f.owner,context:terms.context,requestId:f.prefix+'-terms',now,mode:'approved_seller'});
  await db.batch([db.prepare('UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=? WHERE id=?').bind(terms.agreementVersion,now,f.seller),...accepted.statements]);
}

async function executeReturnRefund(f: Fixture, caseId: string, target = db) {
  const source=await target.prepare('SELECT id FROM refunds WHERE return_request_id=?').bind(caseId).first<{id:string}>();
  assert.ok(source);
  return executeFixtureRefund(target,{actorId:financeActor,kind:'return_refund',sourceId:source.id,customerId:f.buyer,deferCompletion:true});
}

async function collectOriginalOrder(f: Fixture) {
  await db.prepare("UPDATE orders SET customer_id=?,status='confirmed',payment_status='pending',delivered_at=NULL WHERE id=?").bind(f.buyer,f.order).run();
  await db.prepare("UPDATE payments SET status='pending' WHERE order_id=?").bind(f.order).run();
  await db.prepare("UPDATE order_items SET fulfillment_status='confirmed' WHERE order_id=?").bind(f.order).run();
  await seedVerifiedCheckoutContact(db,f.buyer,f.phone,now);
  await prepareSellerParcels(db,{orderId:f.order,actorId:f.admin,requestId:f.prefix+'-original-parcels',now});
  for (const initial of await listParcels(db,f.order)) {
    for (const action of ['assign','dispatch','deliver','collect'] as const) {
      const parcel=(await listParcels(db,f.order)).find(row=>row.id===initial.id)!;
      if (action==='dispatch')await db.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=? AND seller_id=?").bind(f.order,parcel.sellerId).run();
      await operateParcel(db,{jobId:parcel.id,actorId:f.admin,action,version:parcel.version,now,
        note:'Record actual fictional original courier and COD collection.',requestId:f.prefix+'-'+parcel.id+'-'+action,
        ...(action==='assign'?{method:'courier' as const,courierName:'Fictional Original Courier',trackingCode:'FICTIONAL-'+parcel.id}:{}),
        ...(action==='collect'?{amountPaisa:parcel.codDuePaisa,reference:f.prefix+'-original-cash'}:{})});
    }
  }
  assert.ok((await listParcels(db,f.order)).every(parcel=>parcel.collectedPaisa===parcel.codDuePaisa));
}
async function createReturn(f:Fixture,index=0,customerId?:string) {
  return createCustomerReturnRequest(db,{orderNumber:f.order,receiptTokenHash:f.receipt,orderItemId:f.items[index],quantity:1,
    reason:'defective',requestedResolution:'refund',detail:'SIMULATED native defective delivered item.',locale:'en-NP',
    idempotencyKey:f.prefix+'-return-'+index,evidence:[],now,customerId});
}
function review(f:Fixture,id:string,requestId:string,deliveryRefundPaisa=0) {
  return {returnRequestId:id,actorId:f.admin,actorRole:'admin' as const,action:'approve' as const,
    note:'SIMULATED native review.',publicMessageEn:'Approved.',publicMessageNe:'Approved.',responsibility:'seller' as const,
    outcome:'refund' as const,itemRefundPaisa:0,deliveryRefundPaisa,requestId,now};
}
function withBatch(database:D1Database,batch:(statements:D1PreparedStatement[])=>Promise<D1Result[]>):D1Database {
  return Object.assign(Object.create(database),{prepare:database.prepare.bind(database),batch});
}

function simultaneousBatches(database:D1Database,label:string):D1Database {
  let reached=0,release!:()=>void,reject!:(error:Error)=>void;
  let timer:ReturnType<typeof setTimeout>;
  const ready=new Promise<void>((resolve,fail)=>{release=resolve;reject=fail;});
  return withBatch(database,async statements=>{
    if(++reached===1)timer=setTimeout(()=>reject(new Error(`Both ${label} commands must reach an actual batch.`)),10000);
    else if(reached===2){clearTimeout(timer);release();}
    await ready;
    return database.batch(statements);
  });
}

function beforeBatch(database:D1Database,interleave:()=>Promise<unknown>):D1Database {
  return withBatch(database,async statements=>{await interleave();return database.batch(statements);});
}

void test('native F02 independent competing approvals reserve one current delivery allowance',{skip:!enabled},async()=>{
  const f=await fixture('f02');
  await saveOriginalDelivery(f);
  await db.prepare('UPDATE orders SET current_delivery_paisa=40000,current_subtotal_paisa=200000,current_total_paisa=240000,current_wallet_paisa=0,current_discount_paisa=0 WHERE id=?').bind(f.order).run();
  const [a,b]=[await createReturn(f),await createReturn(f,1)];
  await assert.rejects(reviewReturnAsAdmin(db,review(f,a.id,f.prefix+'-oversized',60000)),/exact attributable original delivery/);
  const concurrent=simultaneousBatches(db,'delivery approval');
  const results=await Promise.allSettled([reviewReturnAsAdmin(concurrent,review(f,a.id,f.prefix+'-approve-a',30000)),reviewReturnAsAdmin(concurrent,review(f,b.id,f.prefix+'-approve-b',30000))]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const failure=results.find(result=>result.status==='rejected') as PromiseRejectedResult;
  assert.match(String(failure.reason),/stale-delivery-refund-capacity/);
  assert.equal((await db.prepare('SELECT SUM(delivery_amount_paisa) AS n FROM refunds WHERE order_id=?').bind(f.order).first<{n:number}>())?.n,30000);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM return_requests WHERE order_item_id IN (?,?) AND status='requested'").bind(...f.items).first<{n:number}>())?.n,1);
  const totals=await db.prepare('SELECT delivery_charge_paisa AS originalDelivery,grand_total_paisa AS originalTotal,current_delivery_paisa AS currentDelivery,current_total_paisa AS currentTotal FROM orders WHERE id=?').bind(f.order).first();
  assert.deepEqual({...totals},{originalDelivery:60000,originalTotal:260000,currentDelivery:40000,currentTotal:240000});
});

void test('native F03 real checkout consumes the last unit before replacement batch and all return effects roll back',{skip:!enabled},async()=>{
  const f=await fixture('f03'),created=await createReturn(f);
  await reviewReturnAsAdmin(db,{...review(f,created.id,f.prefix+'-approve'),outcome:'replacement'});
  await readyCheckoutSeller(f);
  await db.prepare('UPDATE users SET phone=? WHERE id=?').bind('+977'+f.phone,f.buyer).run();
  await db.prepare('INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES (?,?,?)').bind(f.buyer,f.buyer+'@example.test',now).run();
  await db.prepare('INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES (?,?,?)').bind(f.buyer,'+977'+f.phone,now).run();
  await db.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES (?,?,'NPR',?,?)").bind(f.prefix+'-cart',f.prefix+'-cart-token',now,now).run();
  await db.prepare('INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,?,?,1,?,?)').bind(f.prefix+'-cart-item',f.prefix+'-cart',f.products[0],now,now).run();
  const beforeNotifications=(await db.prepare('SELECT COUNT(*) AS n FROM notification_messages WHERE related_id=?').bind(created.id).first<{n:number}>())!.n;
  let purchased=false;
  const raced=beforeBatch(db,async()=>{await createCodOrder(db,f.prefix+'-cart-token',f.prefix+'-new-receipt',{
    customerEmail:f.buyer+'@example.test',customerAuthSubject:f.buyer,customerPhone:f.phone,locale:'en-NP',termsAccepted:true,
    idempotencyKey:crypto.randomUUID(),address:{recipientName:'SIMULATED Buyer',phone:f.phone,province:'Madhesh',district:'Dhanusha',municipality:'Janakpur',locality:'Ward 1'},
  },now,f.buyer);purchased=true;});
  const handling=await getReturnHandling(db,created.id);
  assert.ok(handling);
  await assert.rejects(recordReturnHandling(raced,{actorId:f.admin,expectedRevision:String(handling.revision),requestId:f.prefix+'-resolve',now:Date.now()},
    {caseId:created.id,action:'prepare_replacement',occurredAt:handling.now,publicMessage:'Prepare the customer-agreed fictional replacement.',privateNote:'SIMULATED native stock race.',evidenceReference:'FICTIONAL-REPLACEMENT-EVIDENCE',customerAgreementReference:'FICTIONAL-CUSTOMER-AGREEMENT',promisedAt:Date.now()+86400000}),
    (error:unknown)=>typeof error==='object'&&error!==null&&'errno' in error&&error.errno===4025&&'message' in error&&/operation_transaction_guards.*valid/.test(String(error.message)));
  assert.equal(purchased,true,'The independent checkout must consume the last unit before replacement commits.');
  assert.equal(await db.prepare('SELECT id FROM return_replacement_shipments WHERE case_id=?').bind(created.id).first(),null);
  assert.equal(await db.prepare('SELECT id FROM return_stock_actions WHERE case_id=?').bind(created.id).first(),null);
  assert.equal((await getReturnHandling(db,created.id))?.revision,handling.revision);
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
  const concurrent=simultaneousBatches(db,'managed accrual');
  const amounts=await Promise.all([accrueManagedEntitlements(concurrent,{orderId:f.order,actorId:f.admin,requestId:f.prefix+'-accrue-a',now}),accrueManagedEntitlements(concurrent,{orderId:f.order,actorId:f.admin,requestId:f.prefix+'-accrue-b',now})]);
  assert.deepEqual(amounts.sort((a,b)=>a-b),[0,1]);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM managed_settlement_entries WHERE entitlement_id=? AND type='earned'").bind(entitlement).first<{n:number}>())?.n,1);
  assert.equal((await getManagedFinanceSummary(db,f.seller,now)).balancePaisa,91000);
  const audits=await db.prepare('SELECT next_json AS data FROM audit_logs WHERE request_id IN (?,?)')
    .bind(f.prefix+'-accrue-a',f.prefix+'-accrue-b').all<{data:string}>();
  assert.deepEqual(audits.results.map(row=>JSON.parse(row.data).count as number).sort((a,b)=>a-b),[0,1]);
});


void test('native F06 first parcel refund waits for collected whole-order facts and competing accrual credits net once',{skip:!enabled},async()=>{
  const f=await fixture('f06'),other=await fixture('f06-other');
  await db.prepare("UPDATE orders SET customer_id=?,status='confirmed',payment_status='pending',delivered_at=NULL WHERE id=?").bind(f.buyer,f.order).run();
  await db.prepare("UPDATE payments SET status='pending' WHERE order_id=?").bind(f.order).run();
  await db.prepare("UPDATE order_items SET fulfillment_status='confirmed' WHERE order_id=?").bind(f.order).run();
  await db.prepare('UPDATE order_items SET seller_id=?,product_id=? WHERE id=?').bind(other.seller,other.products[0],f.items[1]).run();
  await saveOriginalDelivery(f);
  await seedVerifiedCheckoutContact(db,f.buyer,f.phone,now);
  await db.prepare("UPDATE order_items SET commission_paisa=0,commission_bps=0,commission_rule_version='managed-sale-linked' WHERE id=?").bind(f.items[0]).run();
  const snapshot=f.prefix+'-snapshot',entitlement=f.prefix+'-entitlement';
  await db.prepare(`INSERT INTO managed_commercial_snapshots(id,order_item_id,seller_id,participation_route,commercial_model,
    legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,agreement_version,agreement_language,
    delivery_hold_days,product_value_paisa,eligible_base_paisa,platform_retention_bps,platform_retained_paisa,maker_entitlement_paisa,simulation_label,created_at)
    VALUES (?,?,?,'managed_maker','managed_sale_linked_percentage_v1','SIM-LEGAL','SIM-INVOICE','SIM-PAYOUT','SIM-AGREEMENT','en',7,100000,100000,900,9000,91000,'SIMULATED - NOT VALID FOR PRODUCTION',?)`)
    .bind(snapshot,f.items[0],f.seller,now).run();
  await db.prepare("INSERT INTO managed_entitlements(id,snapshot_id,seller_id,status,calculated_paisa,created_at,updated_at) VALUES (?,?,?,'calculated',91000,?,?)")
    .bind(entitlement,snapshot,f.seller,now,now).run();
  await prepareSellerParcels(db,{orderId:f.order,actorId:f.admin,requestId:f.prefix+'-parcels',now});
  const parcels=await listParcels(db,f.order);
  const first=parcels.find(p=>p.sellerId===f.seller)!,second=parcels.find(p=>p.sellerId===other.seller)!;
  let sequence=0;
  const op=async(id:string,action:'assign'|'dispatch'|'deliver'|'collect',extra:Record<string,unknown>={},database=db)=>{
    const current=(await listParcels(db,f.order)).find(p=>p.id===id)!;
    return operateParcel(database,{jobId:id,actorId:f.admin,action,version:current.version,
      note:'SIMULATED native deferred managed lifecycle.',requestId:f.prefix+'-parcel-'+sequence++,now,...extra});
  };
  for(const parcel of [first,second]){
    await op(parcel.id,'assign',{method:'courier',courierName:'SIMULATED Courier',trackingCode:'SIM-'+parcel.id,trackingUrl:'https://example.test/tracking'});
    await db.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=? AND seller_id=?").bind(f.order,parcel.sellerId).run();
    await op(parcel.id,'dispatch');
  }
  await op(first.id,'deliver');await op(first.id,'collect',{amountPaisa:first.codDuePaisa,reference:f.prefix+'-first-cash'});
  const created=await createReturn(f,0,f.buyer);
  await reviewReturnAsAdmin(db,{...review(f,created.id,f.prefix+'-review',30000),itemRefundPaisa:50000});
  const refund=await db.prepare('SELECT id,item_amount_paisa AS merchandise,delivery_amount_paisa AS delivery,amount_paisa AS cash FROM refunds WHERE return_request_id=?')
    .bind(created.id).first<{id:string;merchandise:number;delivery:number;cash:number}>();
  assert.ok(refund);
  assert.deepEqual([refund.merchandise,refund.delivery,refund.cash],[50000,30000,80000]);
  const execution=await executeReturnRefund(f,created.id);
  const paid=await execution.complete();
  assert.deepEqual(await execution.complete(),paid);
  const costs=(await db.prepare('SELECT component,party,seller_id AS seller,amount_paisa AS amount FROM refund_cost_allocations WHERE refund_id=? ORDER BY component')
    .bind(refund.id).all<{component:string;party:string;seller:string;amount:number}>()).results;
  assert.ok(costs.some(row=>row.component==='original_delivery'&&row.party==='seller'&&row.seller===f.seller&&row.amount===30000));
  const outgoing=await db.prepare("SELECT amount_paisa AS cash FROM company_outgoing_bank_identities WHERE packet_kind='refund' AND packet_id=?")
    .bind(execution.packetId).all<{cash:number}>();
  assert.deepEqual(outgoing.results.map(row=>row.cash),[80000]);
  assert.equal((await getManagedFinanceSummary(db,f.seller,now)).balancePaisa,0);
  await op(second.id,'deliver');assert.equal((await getManagedFinanceSummary(db,f.seller,now)).balancePaisa,0);
  let batches=0;
  const competing=withBatch(db,async statements=>{
    if(++batches!==2)return db.batch(statements);
    const concurrent=simultaneousBatches(db,'final parcel accrual');
    const [result]=await Promise.all([concurrent.batch(statements),accrueManagedEntitlements(concurrent,{orderId:f.order,actorId:f.admin,requestId:f.prefix+'-competing-accrual',now})]);
    return result;
  });
  await op(second.id,'collect',{amountPaisa:second.codDuePaisa,reference:f.prefix+'-second-cash'},competing);
  assert.equal((await getManagedFinanceSummary(db,f.seller,now)).balancePaisa,15500);
  assert.deepEqual((await db.prepare('SELECT type,amount_paisa AS amount FROM managed_settlement_entries WHERE entitlement_id=? ORDER BY amount_paisa DESC').bind(entitlement).all<{type:string;amount:number}>()).results.map(row=>({...row})),[{type:'earned',amount:91000},{type:'dispute_adjustment',amount:-30000},{type:'refund_adjustment',amount:-45500}]);
  assert.equal((await db.prepare('SELECT payment_status AS status FROM orders WHERE id=?').bind(f.order).first<{status:string}>())?.status,'part_refunded');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM seller_ledger_entries WHERE order_item_id=?').bind(f.items[0]).first<{n:number}>())?.n,0);
  const invoices=await db.prepare('SELECT snapshot_json AS snapshot FROM managed_invoice_groups WHERE order_id=?').bind(f.order).all<{snapshot:string}>();
  assert.equal(invoices.results.length,1);
  assert.equal(JSON.parse(invoices.results[0]!.snapshot).productTotalPaisa,100000);
  assert.equal(JSON.parse(invoices.results[0]!.snapshot).taxDocument,false);
});


void test('native F04 high-value checker blocks requester owner and owner-change decisions with rollback',{skip:!enabled},async()=>{
  const f=await fixture('f04'),checker=f.prefix+'-checker';
  await saveOriginalDelivery(f);
  await db.prepare("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,'SIMULATED high-value checker','en-NP','active',?,?)")
    .bind(checker,checker,checker+'@example.test',now,now).run();
  for(const role of ['super_admin','customer'])await db.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)').bind(checker,role,now).run();
  await db.prepare('UPDATE orders SET customer_id=?,return_policy_snapshot_json=? WHERE id=?').bind(checker,JSON.stringify({...policy,highValueRefundThresholdPaisa:50000}),f.order).run();
  const created=await createReturn(f,0,checker);
  await reviewReturnAsAdmin(db,{...review(f,created.id,f.prefix+'-admin-review',30000),itemRefundPaisa:100000});
  const decision=(approve:boolean,requestId:string)=>({returnRequestId:created.id,actorId:checker,approve,
    note:'SIMULATED high-value owner review.',publicMessageEn:'Reviewed.',publicMessageNe:'Reviewed.',requestId,now});
  for(const approve of [true,false])await assert.rejects(decideHighValueRefund(db,decision(approve,f.prefix+'-self-'+approve)),/cannot review/);
  for(const identity of ['owner','requester']){
    await db.prepare('UPDATE orders SET customer_id=NULL WHERE id=?').bind(f.order).run();
    await db.prepare('UPDATE return_requests SET requested_by=NULL WHERE id=?').bind(created.id).run();
    const requestId=f.prefix+'-race-'+identity;
    const raced=beforeBatch(db,()=>identity==='owner'
      ? db.prepare('UPDATE orders SET customer_id=? WHERE id=?').bind(checker,f.order).run()
      : db.prepare('UPDATE return_requests SET requested_by=? WHERE id=?').bind(checker,created.id).run());
    await assert.rejects(decideHighValueRefund(raced,decision(identity==='owner',requestId)),/stale-high-value-return-owner/);
    assert.equal(await db.prepare('SELECT id FROM audit_logs WHERE request_id=?').bind(requestId).first(),null);
    assert.equal(await db.prepare('SELECT id FROM return_request_events WHERE request_id=?').bind(requestId).first(),null);
  }
  const state=await db.prepare('SELECT c.status,f.status AS refundStatus,f.high_value_approved_by AS checker FROM return_requests c JOIN refunds f ON f.return_request_id=c.id WHERE c.id=?').bind(created.id).first();
  assert.deepEqual({...state},{status:'pending_high_value_approval',refundStatus:'pending_high_value_approval',checker:null});
  await db.prepare('UPDATE orders SET customer_id=NULL WHERE id=?').bind(f.order).run();
  await db.prepare('UPDATE return_requests SET requested_by=NULL WHERE id=?').bind(created.id).run();
  const independent=decision(true,f.prefix+'-independent');await decideHighValueRefund(db,independent);await decideHighValueRefund(db,independent);
  assert.equal((await db.prepare('SELECT status FROM refunds WHERE return_request_id=?').bind(created.id).first<{status:string}>())?.status,'approved');
});

void test('native F02 failed refund restart and new approval retain distinct original delivery reservations',{skip:!enabled},async()=>{
  const f=await fixture('f02-restart');
  await saveOriginalDelivery(f);
  await collectOriginalOrder(f);
  const a=await createReturn(f,0,f.buyer),b=await createReturn(f,1,f.buyer);
  await reviewReturnAsAdmin(db,review(f,a.id,f.prefix+'-approve-a',30000));
  const original=await executeReturnRefund(f,a.id);
  await recordRefundPacketOutcome(db,{actorId:financeActor,requestId:f.prefix+'-confirmed-no-debit',expectedRevision:'2',now:Date.now()},
    {packetId:original.packetId,outcome:'failed',failureBasis:'no_debit',evidenceReference:'FICTIONAL-ORIGINAL-NO-DEBIT',reason:'Independent fictional bank evidence confirms the original instruction made no debit.'});
  assert.equal((await db.prepare('SELECT status FROM refunds WHERE return_request_id=?').bind(a.id).first<{status:string}>())?.status,'failed');
  await assert.rejects(reviewReturnAsAdmin(db,review(f,b.id,f.prefix+'-would-steal-original',60000)),/exact attributable original delivery/);
  const concurrent=simultaneousBatches(db,'delivery approval and retry packet');
  const retryDb=withBatch(db,statements=>{
    const preparesPacket=statements.some(statement=>(statement as D1PreparedStatement&{sql?:string}).sql?.startsWith('INSERT INTO outgoing_payment_packets'));
    return (preparesPacket?concurrent:db).batch(statements);
  });
  const [retry]=await Promise.all([
    executeReturnRefund(f,a.id,retryDb),
    reviewReturnAsAdmin(concurrent,review(f,b.id,f.prefix+'-parallel-approval',30000)),
  ]);
  assert.equal(retry.obligationId,original.obligationId);
  assert.notEqual(retry.packetId,original.packetId);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM outgoing_payment_packets WHERE obligation_id=? AND state='processing'").bind(original.obligationId).first<{n:number}>())?.n,1);
  await assert.rejects(executeReturnRefund(f,a.id),/current original obligation|pending payment attempt/);
  const other=await executeReturnRefund(f,b.id);
  const firstPaid=await retry.complete();
  assert.deepEqual(await retry.complete(),firstPaid);
  const secondPaid=await other.complete();
  assert.deepEqual(await other.complete(),secondPaid);
  assert.deepEqual((await db.prepare("SELECT delivery_amount_paisa AS delivery FROM refunds WHERE order_id=? AND status='paid' ORDER BY return_request_id")
    .bind(f.order).all<{delivery:number}>()).results.map(row=>row.delivery),[30000,30000]);
  assert.equal((await db.prepare('SELECT delivery_charge_paisa AS original FROM orders WHERE id=?').bind(f.order).first<{original:number}>())?.original,60000);
  const failed=await db.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').bind(original.packetId).first<{state:string}>();
  assert.equal(failed?.state,'failed');
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM refund_obligations WHERE source_kind='return_refund' AND source_id=(SELECT id FROM refunds WHERE return_request_id=?)")
    .bind(a.id).first<{n:number}>())?.n,1);
  const wireCount=await db.prepare("SELECT COUNT(*) AS n FROM company_outgoing_bank_identities WHERE packet_kind='refund' AND packet_id IN (?,?)")
    .bind(retry.packetId,other.packetId).first<{n:number}>();
  assert.equal(wireCount?.n,2);
});

void test('native real email-only COD checkout cancellation restores stock once and preserves original totals on replay', {skip: !enabled}, async () => {
  const f = await fixture('release-cancellation');
  await readyCheckoutSeller(f);
  await db.prepare('UPDATE users SET phone=? WHERE id=?').bind('+977' + f.phone, f.buyer).run();
  await db.prepare('INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES (?,?,?)').bind(f.buyer, f.buyer + '@example.test', now).run();
  assert.equal(await db.prepare('SELECT user_id FROM account_phone_verifications WHERE user_id=?').bind(f.buyer).first(), null);
  const cart = f.prefix + '-cart', token = f.prefix + '-cart-token', receipt = f.prefix + '-new-receipt';
  await db.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES (?,?,'NPR',?,?)").bind(cart, token, now, now).run();
  await db.prepare('INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,?,?,1,?,?)').bind(f.prefix + '-cart-item', cart, f.products[0], now, now).run();
  const checkout = {customerEmail: f.buyer + '@example.test', customerAuthSubject: f.buyer, customerPhone: f.phone, locale: 'en-NP' as const,
    termsAccepted: true as const, idempotencyKey: crypto.randomUUID(), address: {recipientName: 'SIMULATED buyer', phone: f.phone,
      province: 'Madhesh', district: 'Dhanusha', municipality: 'Janakpur', locality: 'Ward 1'}};
  const purchased = await createCodOrder(db, token, receipt, checkout, now, f.buyer, undefined, 'email_only');
  assert.deepEqual(await createCodOrder(db, token, receipt, checkout, now, f.buyer, undefined, 'email_only'), purchased);
  const order = await db.prepare('SELECT id,grand_total_paisa AS original FROM orders WHERE order_number=?').bind(purchased.orderNumber).first<{id: string; original: number}>();
  assert.ok(order);
  assert.equal((await db.prepare('SELECT inventory_quantity AS n FROM products WHERE id=?').bind(f.products[0]).first<{n: number}>())?.n, 0);
  const access = {orderNumber: purchased.orderNumber, customerId: f.buyer, receiptTokenHash: receipt};
  await assert.rejects(cancellationPreview(db, {...access, customerId: 'another-fictional-customer', receiptTokenHash: null}, [f.seller]));
  const preview = await cancellationPreview(db, access, [f.seller]);
  const cancel = {sellerIds: [f.seller], fingerprint: preview.fingerprint, requestId: f.prefix + '-cancel', note: 'SIMULATED native cancellation', now};
  await cancelSelectedParcels(db, access, cancel); await cancelSelectedParcels(db, access, cancel);
  const after = await db.prepare('SELECT status,grand_total_paisa AS original,current_total_paisa AS current FROM orders WHERE id=?').bind(order.id).first();
  assert.deepEqual({...after}, {status: 'cancelled', original: order.original, current: 0});
  assert.equal((await db.prepare('SELECT inventory_quantity AS n FROM products WHERE id=?').bind(f.products[0]).first<{n: number}>())?.n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM order_cancellation_events WHERE order_id=?').bind(order.id).first<{n: number}>())?.n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM seller_ledger_entries l JOIN order_items i ON i.id=l.order_item_id WHERE i.order_id=?').bind(order.id).first<{n: number}>())?.n, 0);
});
