import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceiptGroups, formatBillNumber, documentDate, amountInWords, mergeRecordedReceiptItems, withReceiptGroups } from '../lib/documents/billing';
import type { OrderDocumentSnapshot } from '../lib/db/repositories/orders';
import {allocateCancellationItems} from '../lib/cancellation/accounting';

function snapshot(): OrderDocumentSnapshot {
  const company={reference:'company',kind:'company' as const,legalName:'Hasta Bazaar Private Limited',pan:'624749646',
    address:'Birgunj, Nepal',taxMode:'PAN' as const};
  const seller={reference:'seller-two',kind:'registered' as const,legalName:'Shop Two Trading',pan:'123456789',
    address:'Lalitpur, Nepal',taxMode:'PAN' as const};
  return {documentTitle:'Order Invoice',taxDocument:false,orderNumber:'HB-TEST-001',issuedAt:1000,currency:'NPR',
    paymentMethod:'Cash on delivery',paymentStatus:'paid',itemSubtotalPaisa:300000,deliveryChargePaisa:15000,
    buyerPlatformFeePaisa:1000,taxTotalPaisa:0,grandTotalPaisa:316000,
    billing:{version:'approved-2026-10-21',company,customer:{email:'buyer@local.hastabazaar.test',phone:'9800000000'},
      deliveryAddress:{recipientName:'Buyer',phone:'9800000000',province:'Madhesh',district:'Parsa',municipality:'Birgunj',locality:'Ward 11'}},
    items:[{orderItemId:'line-one',sellerId:'maker-one',productName:'Notebook',sellerName:'Company store',makerName:'Maker One',
      sku:'HB-ONE',sellerSku:'MCH-1',quantity:1,unitPricePaisa:100000,lineTotalPaisa:100000,issuer:company},
    {orderItemId:'line-two',sellerId:'maker-two',productName:'Basket',sellerName:'Company store',makerName:'Maker Two',
      sku:'HB-TWO',sellerSku:'MCH-1',quantity:1,unitPricePaisa:100000,lineTotalPaisa:100000,issuer:company},
    {orderItemId:'line-three',sellerId:'seller-two',productName:'Cup',sellerName:'Shop Two',
      sku:'HB-THREE',sellerSku:'MCH-1',quantity:1,unitPricePaisa:100000,lineTotalPaisa:100000,issuer:seller}]};
}

void test('approved receipt groups company makers together and keeps the registered seller separate',()=>{
  const original=snapshot(); const before=JSON.stringify(original);
  const groups=buildReceiptGroups(original);
  assert.equal(groups.length,2);
  assert.deepEqual(groups.map(g=>g.items.length),[2,1]);
  assert.equal(groups[0]?.totalPaisa,216000);
  assert.equal(groups[1]?.totalPaisa,100000);
  assert.equal(groups.reduce((n,g)=>n+g.totalPaisa,0),original.grandTotalPaisa);
  assert.equal(groups[0]?.items[1]?.makerName,'Maker Two');
  assert.equal(groups[1]?.items[0]?.sellerSku,'MCH-1');
  assert.equal(JSON.stringify(original),before);
});

void test('legacy documents and incomplete or incompatible issuer evidence never gain a new receipt identity',()=>{
  const legacy=snapshot(); delete legacy.billing;
  assert.deepEqual(buildReceiptGroups(legacy),[]);
  const missing=snapshot(); missing.items=[{...missing.items[0]!,issuer:undefined}];
  assert.throws(()=>buildReceiptGroups(missing),/issuer/i);
  const incompatible=snapshot(); incompatible.items=[{...incompatible.items[0]!,issuer:{...incompatible.items[0]!.issuer!,taxMode:'VAT'}}];
  assert.throws(()=>buildReceiptGroups(incompatible),/seller.*bill|PAN/i);
});

void test('receipt numbers preserve two digit opening sequence and date uses Nepal time without BS or AD labels',()=>{
  assert.equal(formatBillNumber(1),'01');assert.equal(formatBillNumber(2),'02');assert.equal(formatBillNumber(100),'100');
  assert.throws(()=>formatBillNumber(0));assert.throws(()=>formatBillNumber(1.5));
  assert.equal(documentDate(Date.parse('2026-10-20T18:15:00Z')),'21 October 2026');
  assert.equal(amountInWords(256000),'Two thousand five hundred sixty Nepalese rupees only.');
});

void test('cancellation receipt merge retains recorded seller identities by line id even when SKU and names collide',()=>{
  const original=snapshot();
  const remaining=[{orderItemId:'line-two',productName:'Basket',sellerName:'Company store',sku:'HB-TWO',quantity:1,
    unitPricePaisa:100000,lineTotalPaisa:100000}];
  const merged=mergeRecordedReceiptItems(original.items,remaining);
  assert.equal(merged[0]?.sellerId,'maker-two');
  assert.equal(merged[0]?.makerName,'Maker Two');
  assert.equal(merged[0]?.sellerSku,'MCH-1');
  assert.equal(merged.length,1);
});

void test('registered-only and cancellation of the last company item retain every collected charge',()=>{
  const original=snapshot();original.items=original.items.filter(item=>item.issuer?.kind==='registered');
  original.itemSubtotalPaisa=100000;original.grandTotalPaisa=116000;
  const groups=buildReceiptGroups(original);
  assert.equal(groups.length,2);
  assert.equal(groups.find(group=>group.scope==='order_charges')?.totalPaisa,16000);
  assert.equal(groups.reduce((sum,group)=>sum+group.totalPaisa,0),original.grandTotalPaisa);
  assert.equal(groups.find(group=>group.issuer.kind==='registered')?.deliveryPaisa,0);
});

void test('fractional promotions and wallet allocation conserve recorded money without duplicate charges',()=>{
  for(const [promotion,wallet] of [[1,1],[99999,200001],[300000,0],[0,300000]]){
    const original=snapshot();original.promoDiscountPaisa=promotion;original.walletCreditPaisa=wallet;
    original.grandTotalPaisa-=promotion+wallet;
    const allocations=allocateCancellationItems(original.items.map(item=>({id:item.orderItemId!,sellerId:item.sellerId!,amount:item.lineTotalPaisa})),wallet,promotion);
    original.items=original.items.map(item=>({...item,billingPromotionPaisa:allocations.find(a=>a.id===item.orderItemId)!.discount,
      billingWalletPaisa:allocations.find(a=>a.id===item.orderItemId)!.wallet}));
    const groups=buildReceiptGroups(original);
    assert.equal(groups.reduce((sum,g)=>sum+g.promotionPaisa,0),promotion);
    assert.equal(groups.reduce((sum,g)=>sum+g.walletPaisa,0),wallet);
    assert.equal(groups.reduce((sum,g)=>sum+g.totalPaisa,0),original.grandTotalPaisa);
    assert.ok(groups.every(g=>g.totalPaisa>=0));
  }
});

void test('receipt discounts follow sealed line allocation instead of issuer ordering',()=>{
  const original=snapshot();original.promoDiscountPaisa=1;original.grandTotalPaisa--;
  original.items=original.items.map((item,index)=>({...item,billingPromotionPaisa:index===2?1:0,billingWalletPaisa:0}));
  const groups=buildReceiptGroups(original);
  assert.equal(groups.find(g=>g.key==='seller-two')!.promotionPaisa,1);
  assert.equal(groups.find(g=>g.key==='company')!.promotionPaisa,0);
});

void test('an unsupported issuer retains all aggregate payment evidence for review',()=>{
  const original=snapshot();original.items[0]!.issuer={...original.items[0]!.issuer!,taxMode:'VAT'};
  const result=withReceiptGroups(original);
  assert.deepEqual(result.billing?.receiptGroups,[]);
  assert.match(result.billing?.receiptReviewReason??'',/bill format/);
  assert.deepEqual(result.items,original.items);
  assert.equal(result.grandTotalPaisa,original.grandTotalPaisa);
});

void test('native integer strings produce numeric receipts and conserve mixed issuer wallet deductions',()=>{
  const original=snapshot();original.walletCreditPaisa=3000;original.promoDiscountPaisa=3;original.grandTotalPaisa-=3003;
  original.items=original.items.map(item=>({...item,billingWalletPaisa:1000,billingPromotionPaisa:1}));
  const native=JSON.parse(JSON.stringify(original, (key,value)=>key.endsWith('Paisa')?String(value):value)) as OrderDocumentSnapshot;
  const receipt=withReceiptGroups(native);
  assert.equal(receipt.billing?.receiptReviewReason,undefined);
  assert.equal(receipt.buyerPlatformFeePaisa,1000);
  assert.equal(receipt.deliveryChargePaisa,15000);
  assert.equal(receipt.grandTotalPaisa,312997);
  assert.deepEqual(receipt.billing?.receiptGroups,buildReceiptGroups(original));
  const zeroFee=snapshot();zeroFee.buyerPlatformFeePaisa='0' as unknown as number;zeroFee.grandTotalPaisa=315000;
  assert.equal(buildReceiptGroups(zeroFee).reduce((sum,g)=>sum+g.totalPaisa,0),315000);
});

void test('receipt money rejects malformed and unsafe values without publishing groups',()=>{
  for(const value of [null,true,'',' ','1.0','1e3','01','-1',1.5,-1,NaN,Infinity,'9007199254740992',9007199254740992]) {
    for(const field of ['buyerPlatformFeePaisa','walletCreditPaisa','grandTotalPaisa'] as const) {
      const original=snapshot();original[field]=value as number;
      assert.throws(()=>buildReceiptGroups(original),/money|financial/i);
      assert.deepEqual(withReceiptGroups(original).billing?.receiptGroups,[]);
    }
    const original=snapshot();original.items=[{...original.items[0]!,lineTotalPaisa:value as number}];
    assert.throws(()=>buildReceiptGroups(original),/money|financial/i);
  }
});

void test('receipt arithmetic detects unsafe aggregates and inconsistent captured totals',()=>{
  const original=snapshot();original.grandTotalPaisa--;
  assert.throws(()=>buildReceiptGroups(original),/financial/i);
  const unsafe=snapshot();unsafe.items=unsafe.items.map(item=>({...item,lineTotalPaisa:Number.MAX_SAFE_INTEGER}));
  assert.throws(()=>buildReceiptGroups(unsafe),/money|financial/i);
  const exact=snapshot();exact.items=[{...exact.items[0]!,lineTotalPaisa:Number.MAX_SAFE_INTEGER,unitPricePaisa:Number.MAX_SAFE_INTEGER}];
  exact.itemSubtotalPaisa=Number.MAX_SAFE_INTEGER;exact.grandTotalPaisa=Number.MAX_SAFE_INTEGER;exact.deliveryChargePaisa=0;exact.buyerPlatformFeePaisa=0;
  assert.equal(buildReceiptGroups(exact)[0]!.totalPaisa,Number.MAX_SAFE_INTEGER);
});
