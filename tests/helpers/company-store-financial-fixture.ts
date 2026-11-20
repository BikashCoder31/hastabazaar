import {verifiedPayoutSources} from './verified-payout-sources';
import assert from 'node:assert/strict';
import {verifySellerDocument} from '../../lib/sellers/document-review';
import { readyMaker } from './company-store-lifecycle-fixture';
import { activateManagedMakerForSimulation } from '../../lib/managed-commerce/activation';
import { reviewProduct } from '../../lib/db/repositories/products';
import {buildManagedCommercialSnapshot} from '../../lib/managed-commerce/snapshots';
import {getEffectiveBusinessSetting} from '../../lib/db/repositories/business-settings';
import { seedCheckoutBuyer } from './checkout-contact';
import { accrueManagedEntitlements, applyManagedRefundAdjustment } from '../../lib/db/repositories/managed-settlements';
export async function earnedMaker(mature: boolean | 'calculated' = true, now = Date.now()-30*86400000, quantity:1|2=1) {
  const f = await readyMaker(now);
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  for(const doc of f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id=? AND kind='representative_identity' AND status<>'verified'").all(f.sellerId))
    await verifySellerDocument(f.db,{sellerId:f.sellerId,documentId:String(doc.id),actorId:'reviewer',reason:'Independently review actual fictional representative proof before accepting orders.',commandId:'settlement-verify-'+doc.id,now:f.now+1,expectedReviewId:null});
  await activateManagedMakerForSimulation(f.db, f.activation);
  await reviewProduct(f.db, { productId: 'cup', actorId: 'reviewer', action: 'publish', reason: 'Publish isolated settlement product', requestId: 'settlement-product', now: f.now + 4 });
  // Explicit historical economic fixture. Managed live checkout remains gated; this does not
  // bypass readiness or claim a new public order succeeded under simulated activation.
  await seedCheckoutBuyer(f.db,'buyer','buyer@local.hastabazaar.test','9811111111',f.now);
  const orderId='historical-managed-order',itemId='historical-managed-item',entitlementId='historical-managed-entitlement',snapshotId='historical-managed-snapshot';
  const hold=await getEffectiveBusinessSetting(f.db,'seller_delivery_hold_days',f.now);
  const snapshot=buildManagedCommercialSnapshot({sellerId:f.sellerId,commercialModel:'managed_sale_linked_percentage_v1',legalSellerReference:f.activation.legalSellerReference,invoiceIssuerReference:f.activation.invoiceIssuerReference,payoutBeneficiaryReference:f.activation.payoutBeneficiaryReference,agreementVersion:f.accepted.agreementVersion,agreementLanguage:f.accepted.language,termsSettingVersionId:f.accepted.settingVersionIds.retention,deliveryHoldDays:hold.value,holdSettingVersionId:hold.versionId,productValuePaisa:100000,makerFundedDiscountPaisa:0,platformFundedDiscountPaisa:0,platformRetentionBps:f.accepted.retentionBps,acceptedManagedDetailId:f.accepted.detailId});
  f.sqlite.prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
   VALUES(?,'FICTIONAL-HISTORICAL-MANAGED','buyer','buyer@local.hastabazaar.test','9811111111','placed','en-NP','explicit-historical-fixture','{}',100000,0,100000,'cod','unpaid',?,?)`).run(orderId,f.now,f.now);
  f.sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,commission_rule_version,created_at)
   VALUES(?,?,'cup',?,'Fictional maker','Fictional cup','FICTIONAL-CUP',?,?,0,0,100000,'managed-sale-linked',?)`).run(itemId,orderId,f.sellerId,100000/quantity,quantity,f.now);
  f.sqlite.prepare(`INSERT INTO managed_commercial_snapshots(id,order_item_id,seller_id,participation_route,commercial_model,legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,agreement_version,agreement_language,terms_setting_version_id,delivery_hold_days,hold_setting_version_id,product_value_paisa,maker_funded_discount_paisa,platform_funded_discount_paisa,eligible_base_paisa,platform_retention_bps,platform_retained_paisa,maker_entitlement_paisa,simulation_label,created_at,accepted_managed_detail_id)
   VALUES(?,?,?,'managed_maker',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(snapshotId,itemId,f.sellerId,snapshot.commercialModel,snapshot.legalSellerReference,snapshot.invoiceIssuerReference,snapshot.payoutBeneficiaryReference,snapshot.agreementVersion,snapshot.agreementLanguage,snapshot.termsSettingVersionId,snapshot.deliveryHoldDays,snapshot.holdSettingVersionId,snapshot.productValuePaisa,0,0,snapshot.eligibleBasePaisa,snapshot.platformRetentionBps,snapshot.platformRetainedPaisa,snapshot.makerEntitlementPaisa,snapshot.simulationLabel,f.now,snapshot.acceptedManagedDetailId);
  f.sqlite.prepare("INSERT INTO managed_entitlements(id,snapshot_id,seller_id,status,calculated_paisa,created_at,updated_at) VALUES(?,?,?,'calculated',?,?,?)").run(entitlementId,snapshotId,f.sellerId,snapshot.makerEntitlementPaisa,f.now,f.now);
  const financialNow = f.now + 8 * 86_400_000;
  if (mature !== 'calculated') {
    f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=? WHERE id=?").run(f.now + 7, orderId);
    f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE id=?").run(itemId);
    assert.equal(await accrueManagedEntitlements(f.db, { orderId, actorId: 'reviewer', requestId: 'earn-fictional', now: mature ? financialNow : f.now + 8 }), 1);
  }
  const payoutSources=await verifiedPayoutSources(f,f.sellerId);
  const context = { sellerId: f.sellerId, actorId: 'reviewer', destinationReference: payoutSources.beneficiaryReference,
    requestId: 'prepare-fictional-payment', reason: 'Fictional completed paid sale reviewed for settlement.', now: financialNow,
    scheduledFor: financialNow, environment: f.activation.environment };
  return { ...f, financialNow, orderId, itemId, entitlementId, context, payoutSources };
}
type Earned = Awaited<ReturnType<typeof earnedMaker>>;
export async function refund(f: Earned, base = 30000) {
  f.sqlite.prepare(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at) VALUES('return-one',?,'Fictional refund','Fictional evidence','resolved',?)`).run(f.itemId, f.financialNow);
  f.sqlite.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,commission_base_refunded_paisa,reason,requested_at)
    VALUES('refund-one',?,'return-one','paid',?,?,'Fictional paid refund',?)`).run(f.orderId, base, base, f.financialNow);
  await applyManagedRefundAdjustment(f.db, { entitlementId: f.entitlementId, refundId: 'refund-one', refundedEligibleBasePaisa: base,
    actorId: 'reviewer', reasonCode: 'refund', requestId: 'fictional-refund-adjustment', now: f.financialNow });
}



/** A second explicit historical sale with the same retained original contract; no live checkout is enabled. */
export async function appendHistoricalManagedSale(f:Earned,suffix:string,deliveredAt:number,now:number){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const orderId='historical-order-'+suffix,itemId='historical-item-'+suffix,snapshotId='historical-snapshot-'+suffix,entitlementId='historical-entitlement-'+suffix;
 function copy(table:string,original:Record<string,import('node:sqlite').SQLOutputValue>,changes:Record<string,import('node:sqlite').SQLInputValue>){const row={...original,...changes},stored=new Set(f.sqlite.prepare('PRAGMA table_xinfo('+table+')').all().filter(c=>c.hidden===0).map(c=>String(c.name))),keys=Object.keys(row).filter(k=>stored.has(k));f.sqlite.prepare('INSERT INTO '+table+'('+keys.map(k=>'"'+k+'"').join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));}
 copy('orders',f.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(f.orderId)!,{id:orderId,order_number:'FICTIONAL-HISTORICAL-'+suffix,status:'delivered',payment_status:'paid',delivered_at:deliveredAt,created_at:deliveredAt-2,updated_at:deliveredAt});
 copy('order_items',f.sqlite.prepare('SELECT * FROM order_items WHERE id=?').get(f.itemId)!,{id:itemId,order_id:orderId,fulfillment_status:'delivered',created_at:deliveredAt-2});
 copy('managed_commercial_snapshots',f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots WHERE order_item_id=?').get(f.itemId)!,{id:snapshotId,order_item_id:itemId,created_at:deliveredAt-2});
 const amount=Number(f.sqlite.prepare('SELECT maker_entitlement_paisa AS n FROM managed_commercial_snapshots WHERE id=?').get(snapshotId)!.n);
 f.sqlite.prepare("INSERT INTO managed_entitlements(id,snapshot_id,seller_id,status,calculated_paisa,created_at,updated_at) VALUES(?,?,?,'calculated',?,?,?)").run(entitlementId,snapshotId,f.sellerId,amount,deliveredAt-2,deliveredAt-2);
 await accrueManagedEntitlements(f.db,{orderId,actorId:'reviewer',requestId:'accrue-'+suffix,now});return orderId;
}
