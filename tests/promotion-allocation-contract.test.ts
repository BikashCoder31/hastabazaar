import assert from 'node:assert/strict';
import test from 'node:test';
import {parseReviewedCheckoutQuote,ReviewedCheckoutChangedError} from '../lib/checkout/reviewed-quote';
import {customerServiceFeeSnapshot} from '../lib/checkout/customer-service-fee';
import {calculateSellerCommissionPaisa} from '../lib/marketplace/policy';
import {incentiveReportDatabase} from './helpers/incentive-report-database';
import {seedIncentiveCustomer,seedIncentiveInventory,incentiveOrder,incentiveItem} from './helpers/incentive-db';
import {splitCreditRefund} from '../lib/db/repositories/wallet';

const quote=()=>({lines:[{id:'one',sellerId:'fictional-seller',pricePaisa:100000,quantity:1}],deliveryPaisa:10000,walletPaisa:20000,referralPaisa:0,promoPaisa:10000,payablePaisa:80000,policyContext:'a'.repeat(64),referralCampaign:null});
void test('reviewed combinations reject promo/referral stacking even when arithmetic balances',()=>{
 const input=quote();assert.throws(()=>parseReviewedCheckoutQuote({...input,referralPaisa:1000,payablePaisa:79000}),ReviewedCheckoutChangedError);
});
void test('reviewed credit cannot cover delivery or customer fees after merchandise is exhausted',()=>{
 const input=quote();assert.throws(()=>parseReviewedCheckoutQuote({...input,walletPaisa:95000,payablePaisa:5000}),ReviewedCheckoutChangedError);
});
void test('approved illustrative payable retains one fee waiver and no second product markdown',()=>{
 const campaign={id:'fictional-waiver',revision:1,name:'Fictional fee relief'} as Parameters<typeof customerServiceFeeSnapshot>[2];
 const fee=customerServiceFeeSnapshot({enabled:true,amountPaisa:1000},'fictional-fee',campaign),saved=parseReviewedCheckoutQuote({...quote(),serviceFee:fee});
 assert.equal(saved.payablePaisa,80000);assert.equal(saved.serviceFee?.chargedPaisa,0);assert.equal(saved.lines[0].pricePaisa,100000);assert.equal(fee.waivedPaisa,1000);assert.equal(calculateSellerCommissionPaisa(saved.lines[0].pricePaisa,1200),12000);
});
void test('referral and credit refunds preserve sealed rounding instead of moving a paisa between original lines',async()=>{
 const f=await incentiveReportDatabase();try{await seedIncentiveCustomer(f.db);await seedIncentiveInventory(f.db);await incentiveOrder(f.db,'original',2,1).run();await incentiveItem(f.db,'line-a','original',0,1).run();await incentiveItem(f.db,'line-b','original',0,1).run();
 f.sqlite.exec("UPDATE orders SET item_subtotal_paisa=20000,grand_total_paisa=20497 WHERE id='original'");
 const snapshot={billing:{version:'approved-2026-10-21'},items:[{orderItemId:'line-a',lineTotalPaisa:10000,billingWalletPaisa:1,billingPromotionPaisa:1},{orderItemId:'line-b',lineTotalPaisa:10000,billingWalletPaisa:0,billingPromotionPaisa:1}]};
 await f.db.prepare("INSERT INTO order_documents(id,order_id,kind,document_number,snapshot_json,status,request_id,issued_at) VALUES('original-statement','original','order_statement','Fictional statement',?,'issued','fictional-statement',1)").bind(JSON.stringify(snapshot)).run();
 assert.deepEqual(await splitCreditRefund(f.db,'original',10000,'line-a'),{basePaisa:0,walletPaisa:1,discountPaisa:1});assert.deepEqual(await splitCreditRefund(f.db,'original',10000,'line-b'),{basePaisa:0,walletPaisa:0,discountPaisa:1});await assert.rejects(splitCreditRefund(f.db,'original',10001,'line-b'));
 }finally{f.dispose();}
});
