import assert from 'node:assert/strict';


import {seedCheckoutBuyer,seedVerifiedCheckoutContact} from './checkout-contact';
import {parseProductSubmission} from '../../lib/products/submission';
import {createProductSubmission,getSellerProductForRevision,reviseAndResubmitProduct} from '../../lib/db/repositories/products';
import {createCodOrder} from '../../lib/db/repositories/orders';
import {transitionAdminFulfillment} from '../../lib/db/repositories/fulfillment';
import type {FormAnswerSnapshot} from '../../lib/forms/types';
import { parseAccountingQuery } from '../../lib/accounting/filters';
import { readAccountingSources } from '../../lib/accounting/source-queries';

export async function assertBillingProductWorkflow(db: D1Database) {


    await db.batch([
      db.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','craft','Craft',1,1,1,1)"),
      db.prepare("INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('gift','gift','Gift',1,1,1,1)"),
      db.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES ('product-v1','seller.product-submission',1,1,'published','{"formId":"seller.product-submission","fields":[]}','Fixture','owner',1,'owner',1,'owner',1,'product-publish')`),
      db.prepare("UPDATE seller_profiles SET tax_registration_number='123456789' WHERE id='seller-a'"),
    ]);
    const form=new FormData();
    for(const [key,value] of Object.entries({categoryId:'cat',nameEn:'Fictional notebook',descriptionEn:'Handmade notebook',price:'1000',inventoryQuantity:'10',preparationDays:'1',sellerSku:'SAME-SELLER-CODE'}))form.set(key,value);
    form.append('occasionIds','gift');const parsed=parseProductSubmission(form);assert.ok(parsed.input);
    const input=parsed.input;
    const answers:FormAnswerSnapshot={formId:'seller.product-submission',version:1,answers:[]};
    const options={productId:'product-a',sellerId:'seller-a',actorId:'user-a',slug:'notebook-a',input,
      images:Array.from({length:4},(_,n)=>({id:`image-a-${n}`,objectKey:`public/fixture/a-${n}`,originalName:'fixture.jpg',mimeType:'image/jpeg',sizeBytes:100,altEn:'Fictional image',altNe:null,sortOrder:n})),now:10,
      form:{requestId:'create-a',versionId:'product-v1',answers}};
    await createProductSubmission(db,options);await createProductSubmission(db,options);
    await assert.rejects(createProductSubmission(db,{...options,input:{...input,sellerSku:'CHANGED'}}));
    const first=await getSellerProductForRevision(db,'seller-a','product-a');assert.ok(first);
    assert.equal(first.sellerSku,'SAME-SELLER-CODE');assert.match(first.sku,/^HB-[A-F0-9]{32}$/);
    assert.equal(await getSellerProductForRevision(db,'seller-b','product-a'),null);
    await createProductSubmission(db,{...options,productId:'product-b',sellerId:'seller-b',actorId:'user-b',slug:'notebook-b',
      images:options.images.map((m,n)=>({...m,id:'image-b-'+n,objectKey:'public/fixture/b-'+n})),form:{...options.form,requestId:'create-b'}});
    assert.equal((await getSellerProductForRevision(db,'seller-b','product-b'))?.sellerSku,first.sellerSku);
    assert.notEqual((await getSellerProductForRevision(db,'seller-b','product-b'))?.sku,first.sku);
    const revise=async(sellerSku:string|null|undefined,requestId:string)=>{
      await db.prepare("UPDATE products SET status='needs_changes' WHERE id='product-a'").run();
      const current=(await getSellerProductForRevision(db,'seller-a','product-a'))!;
      await reviseAndResubmitProduct(db,{productId:'product-a',sellerId:'seller-a',actorId:'user-a',input:{...input,sellerSku},images:[],previousInventory:current.inventoryQuantity,
        expectedReviewRequestId:current.reviewRequestId,now:20,form:{...options.form,requestId}});
    };
    await revise(undefined,'keep');assert.equal((await getSellerProductForRevision(db,'seller-a','product-a'))?.sellerSku,first.sellerSku);
    await revise(null,'clear');assert.equal((await getSellerProductForRevision(db,'seller-a','product-a'))?.sellerSku,null);
    await revise('FINAL-CODE','final');assert.equal((await getSellerProductForRevision(db,'seller-a','product-a'))?.sku,first.sku);
    await db.prepare("UPDATE products SET status='published',compare_at_price_paisa=110000,size='A5',colour='Blue' WHERE id='product-a'").run();
    await seedCheckoutBuyer(db);
    await seedVerifiedCheckoutContact(db,'checkout-buyer','9811111111',2);
    for(const table of ['account_email_verifications','account_phone_verifications']) {
      const verification=await db.prepare(`SELECT verified_at FROM ${table} WHERE user_id=?`).bind('checkout-buyer').all<{verified_at:number}>();
      assert.equal(verification.results.length,1);
      assert.equal(Number(verification.results[0].verified_at),2);
    }
    await db.batch([db.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','cart-hash','NPR',1,1)"),
      db.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('cart-line','cart','product-a',1,1,1)")]);
    const result=await createCodOrder(db,'cart-hash','receipt-hash',{customerAuthSubject:'checkout-buyer',customerEmail:'buyer@example.test',customerPhone:'9811111111',locale:'en-NP',termsAccepted:true,idempotencyKey:'checkout-billing',
      address:{recipientName:'Fictional buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional lane'}},1800000000000,'checkout-buyer');
    const record=await db.prepare("SELECT d.snapshot_json AS json,o.id FROM order_documents d JOIN orders o ON o.id=d.order_id WHERE o.order_number=? AND d.kind='order_statement'").bind(result.orderNumber).first<{json:string;id:string}>();assert.ok(record);
    const saved=JSON.parse(record.json);assert.equal(saved.items[0].sellerSku,'FINAL-CODE');assert.equal(saved.items[0].sku,first.sku);
    assert.equal(saved.items[0].listPricePaisa,110000);assert.equal(saved.items[0].variant,'A5 / Blue');assert.equal(saved.billing.receiptIssuance,'pending_clearance');
    await db.batch([db.prepare("UPDATE seller_profiles SET legal_name='Later name' WHERE id='seller-a'"),
      db.prepare("UPDATE products SET size='Changed',compare_at_price_paisa=500000 WHERE id='product-a'"),
      db.prepare("UPDATE orders SET status='dispatched' WHERE id=?").bind(record.id),
      db.prepare("UPDATE order_items SET fulfillment_status='dispatched' WHERE order_id=?").bind(record.id)]);
    await transitionAdminFulfillment(db,{orderId:record.id,actorId:'staff',action:'deliver',note:'Fictional delivery evidence.',requestId:'billing-deliver',now:1800000000100});
    const receipt=JSON.parse((await db.prepare("SELECT snapshot_json AS json FROM order_documents WHERE order_id=? AND kind='payment_receipt'").bind(record.id).first<{json:string}>())!.json);
    assert.equal(receipt.items[0].sellerSku,'FINAL-CODE');assert.equal(receipt.items[0].sku,first.sku);assert.equal(receipt.items[0].variant,'A5 / Blue');
    assert.equal(receipt.items[0].issuer.legalName,saved.items[0].issuer.legalName);
    assert.equal(receipt.buyerPlatformFeePaisa,0);
    assert.equal(receipt.deliveryChargePaisa,15000);
    assert.equal(receipt.grandTotalPaisa,115000);
    assert.equal(receipt.billing.receiptGroups.reduce((sum:number,g:{totalPaisa:number})=>sum+g.totalPaisa,0),receipt.grandTotalPaisa);
    assert.ok(receipt.billing.receiptGroups.every((g:{billSequence?:number})=>g.billSequence===undefined));
    assert.equal((await db.prepare("SELECT snapshot_json AS json FROM order_documents WHERE order_id=? AND kind='order_statement'").bind(record.id).first<{json:string}>())!.json,record.json);

    // Exercise the populated accounting UNION on both SQLite and actual MariaDB.
    // Legacy delivery captures payment without a parcel cash posting, so accounting
    // must report the earned commission without inventing a cash collection.
    assert.equal(String(receipt.grandTotalPaisa),'115000');
    const payment=await db.prepare("SELECT status,amount_paisa AS amount FROM payments WHERE order_id=?").bind(record.id).first<{status:string;amount:number|string}>();
    assert.equal(payment?.status,'captured');
    assert.equal(String(payment?.amount),'115000');
    const now=1800000000200;
    const accounting=await readAccountingSources(db,parseAccountingQuery(new URLSearchParams('period=all&section=sellers'),now),now,'Disposable billing workflow');
    assert.ok(accounting.coverage.length>=10);
    assert.ok(accounting.coverage.every(source=>source.available),JSON.stringify(accounting.issues));
    assert.equal(accounting.metrics.find(metric=>metric.key==='seller_commission_earned')?.amountPaisa,'9000');
    assert.equal(accounting.metrics.find(metric=>metric.key==='cod_collected')?.amountPaisa,'0');
    assert.ok(accounting.rows.some(row=>row.sourceKind==='seller_ledger_entry'&&row.amountPaisa==='-9000'));

}
