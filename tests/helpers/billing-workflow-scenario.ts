import {recordCompanyCashReceipt} from '../../lib/payments/cash-receipts';
import {reconcileCodReceipt} from '../../lib/payments/cod-reconciliation';
import {verifySellerDocument} from '../../lib/sellers/document-review';
import {resolvePublishedForm} from '../../lib/forms/runtime';
import {validateSellerFormSubmission} from '../../lib/forms/submission';
import assert from 'node:assert/strict';


import {seedCheckoutBuyer,seedVerifiedCheckoutContact} from './checkout-contact';
import {parseProductSubmission} from '../../lib/products/submission';
import {createProductSubmission,getSellerProductForRevision,reviseAndResubmitProduct} from '../../lib/db/repositories/products';
import {createCodOrder} from '../../lib/db/repositories/orders';
import {transitionSellerFulfillment} from '../../lib/db/repositories/fulfillment';
import {getFirstCodReview,confirmFirstCodReview} from '../../lib/orders/first-cod-review';
import {prepareSellerParcels,listParcels,operateParcel} from '../../lib/operations/parcels';
import type {FormAnswerSnapshot} from '../../lib/forms/types';
import { parseAccountingQuery } from '../../lib/accounting/filters';
import { readAccountingSources } from '../../lib/accounting/source-queries';

export async function assertBillingProductWorkflow(db: D1Database,mode:{nativeCore?:boolean;beforeCheckout?:(checkout:(key:string)=>ReturnType<typeof createCodOrder>)=>Promise<void>}={}) {
    const placedAt=Date.now()-1000;


    await db.batch([
      db.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','craft','Craft',1,1,1,1)"),
      db.prepare("INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('gift','gift','Gift',1,1,1,1)"),
      ...(mode.nativeCore?[]:[db.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES ('product-v1','seller.product-submission',1,1,'published','{"formId":"seller.product-submission","fields":[]}','Fixture','owner',1,'owner',1,'owner',1,'product-publish')`)]),
      db.prepare("UPDATE seller_profiles SET applicant_type='individual',tax_registration_number='123456789' WHERE id='seller-a'"),
    ]);
    const form=new FormData();
    for(const [key,value] of Object.entries({categoryId:'cat',nameEn:'Fictional notebook',descriptionEn:'Handmade notebook',price:'1000',inventoryQuantity:'10',preparationDays:'1',sellerSku:'SAME-SELLER-CODE'}))form.set(key,value);
    form.append('occasionIds','gift');const parsed=parseProductSubmission(form);assert.ok(parsed.input);
    const input=parsed.input;
    const config=mode.nativeCore?await resolvePublishedForm(db,'seller.product-submission'):null,checked=config?await validateSellerFormSubmission(db,'seller.product-submission',config.version,[]):null;
    const answers:FormAnswerSnapshot=checked?.answers??{formId:'seller.product-submission',version:1,answers:[]};
    const options={productId:'product-a',sellerId:'seller-a',actorId:'user-a',slug:'notebook-a',input,
      images:Array.from({length:4},(_,n)=>({id:`image-a-${n}`,objectKey:`public/fixture/a-${n}`,originalName:'fixture.jpg',mimeType:'image/jpeg',sizeBytes:100,altEn:'Fictional image',altNe:null,sortOrder:n})),now:10,
      form:{requestId:'create-a',versionId:checked?.versionId??'product-v1',answers}};
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
    // Current public catalogue requires genuine independent verification even
    // when this isolated scenario deliberately preserves historical fee totals.
    const supplier=await db.prepare("SELECT applicant_type AS applicantType,tax_mode AS taxMode FROM seller_profiles WHERE id='seller-a'").first<{applicantType:string;taxMode:string}>();
    assert.ok(supplier&&['individual','company'].includes(supplier.applicantType));
    for(const kind of ['representative_identity','pan_certificate',...(supplier.applicantType==='company'?['business_registration']:[]),...(supplier.taxMode==='VAT'?['vat_certificate']:[])]){
      const id='billing-fixture-'+kind;
      await db.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES(?,'seller-a',?,?,'fictional.png','image/png',20,'pending',2)").bind(id,kind,'private/seller-documents/seller-a/'+id).run();
      await verifySellerDocument(db,{sellerId:'seller-a',documentId:id,actorId:'owner',reason:'Independently verify the exact fictional registered supplier evidence.',commandId:'verify-'+id,now:3,expectedReviewId:null});
    }
    await seedCheckoutBuyer(db);
    await seedVerifiedCheckoutContact(db,'checkout-buyer','9811111111',2);
    for(const table of ['account_email_verifications','account_phone_verifications']) {
      const verification=await db.prepare(`SELECT verified_at FROM ${table} WHERE user_id=?`).bind('checkout-buyer').all<{verified_at:number}>();
      assert.equal(verification.results.length,1);
      assert.equal(Number(verification.results[0].verified_at),2);
    }
    await db.batch([db.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','cart-hash','NPR',1,1)"),
      db.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('cart-line','cart','product-a',1,1,1)")]);
    const checkout=(key:string)=>createCodOrder(db,'cart-hash','receipt-hash',{customerAuthSubject:'checkout-buyer',customerEmail:'buyer@example.test',customerPhone:'9811111111',locale:'en-NP',termsAccepted:true,idempotencyKey:key,
      address:{recipientName:'Fictional buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional lane'}},placedAt,'checkout-buyer');
    if(mode.beforeCheckout)await mode.beforeCheckout(checkout);
    const result=await checkout('checkout-billing');
    const record=await db.prepare("SELECT d.snapshot_json AS json,o.id FROM order_documents d JOIN orders o ON o.id=d.order_id WHERE o.order_number=? AND d.kind='order_statement'").bind(result.orderNumber).first<{json:string;id:string}>();assert.ok(record);
    const saved=JSON.parse(record.json);assert.equal(saved.items[0].sellerSku,'FINAL-CODE');assert.equal(saved.items[0].sku,first.sku);
    assert.equal(saved.items[0].listPricePaisa,110000);assert.equal(saved.items[0].variant,'A5 / Blue');assert.equal(saved.billing.receiptIssuance,'pending_clearance');
    if(mode.nativeCore){
      assert.equal(saved.grandTotalPaisa,115000);assert.equal(saved.buyerPlatformFeePaisa,0);assert.equal(saved.deliveryChargePaisa,15000);
      assert.equal((await db.prepare("SELECT COUNT(*) n FROM order_documents WHERE order_id=? AND kind='payment_receipt'").bind(record.id).first<{n:number}>())?.n,0,'Pending fiscal clearance is not a payment receipt');
      await revise('AFTER-ORIGINAL','after-original');
      assert.equal((await getSellerProductForRevision(db,'seller-a','product-a'))?.sellerSku,'AFTER-ORIGINAL');
      assert.equal((await db.prepare("SELECT snapshot_json AS json FROM order_documents WHERE order_id=? AND kind='order_statement'").bind(record.id).first<{json:string}>())?.json,record.json,'Later native core SKU cannot rewrite original order facts');
      assert.equal((await db.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='seller.product-submission'").first<{n:number}>())?.n,0);
      return;
    }
    await db.batch([db.prepare("UPDATE seller_profiles SET legal_name='Later name' WHERE id='seller-a'"),
      db.prepare("UPDATE products SET size='Changed',compare_at_price_paisa=500000 WHERE id='product-a'")]);
    if((await getFirstCodReview(db,record.id))?.status==='pending')await confirmFirstCodReview(db,{orderId:record.id,actorId:'owner',reason:'Independently confirm this exact fictional buyer COD instruction.',requestId:'billing-first-cod',now:placedAt+40});
    for(const [index,action]of (['start_packing','ready_for_pickup'] as const).entries())await transitionSellerFulfillment(db,{orderId:record.id,sellerId:'seller-a',actorId:'user-a',action,note:'Record the fictional supplier preparation of this original order.',requestId:'billing-preparation-'+action,now:placedAt+50+index});
    await prepareSellerParcels(db,{orderId:record.id,actorId:'owner',requestId:'billing-native-parcel',now:placedAt+60});
    for(const initial of await listParcels(db,record.id))for(const[index,action]of (['assign','dispatch','deliver','collect'] as const).entries()){
      const parcel=(await listParcels(db,record.id)).find(value=>value.id===initial.id);assert.ok(parcel);
      await operateParcel(db,{jobId:parcel.id,actorId:'owner',action,version:parcel.version,note:'Record actual fictional parcel custody or customer COD collection.',requestId:'billing-parcel-'+parcel.sellerId+'-'+action,now:placedAt+100+index*10,...(action==='assign'?{method:'courier',courierName:'Fictional Billing Courier',trackingCode:'FICTIONAL-BILLING-CUSTODY'}:{}),...(action==='collect'?{amountPaisa:parcel.codDuePaisa,reference:'FICTIONAL-BILLING-CUSTOMER-CASH'}:{})});
    }
    assert.equal(String((await db.prepare("SELECT COALESCE(SUM(amount_paisa),0) n FROM parcel_cash_records WHERE kind='collection' AND status='posted' AND shipping_job_id IN(SELECT id FROM shipping_jobs WHERE order_id=?)").bind(record.id).first<{n:number|string}>())?.n),'115000','Customer cash is still carrier custody before actual company handover');
    assert.equal(String((await db.prepare("SELECT COUNT(*) n FROM company_money_receipts WHERE kind='cash_handover'").first<{n:number|string}>())?.n),'0','Parcel collection alone is not company receipt');
    const beforeCompanyCash=await readAccountingSources(db,parseAccountingQuery(new URLSearchParams('period=all&section=sellers'),Date.now()+1000),Date.now()+1000,'Fictional carrier custody before company receipt');
    assert.equal(beforeCompanyCash.metrics.find(metric=>metric.key==='seller_commission_earned')?.amountPaisa,'0','Carrier collection cannot stand in for actual company receipt');
    for(const initial of await listParcels(db,record.id)){
      const reference='FICTIONAL-BILLING-CARRIER-HANDOVER';
      await operateParcel(db,{jobId:initial.id,actorId:'owner',action:'propose_remittance',version:initial.version,amountPaisa:initial.collectedPaisa,reference,note:'Retain the carrier handover claim separately from independently received company cash.',requestId:'billing-carrier-claim-'+initial.id,now:Date.now()});
      const claim=await db.prepare("SELECT id FROM parcel_cash_records WHERE shipping_job_id=? AND kind='remittance' AND status='pending' AND evidence_reference=?").bind(initial.id,reference).first<{id:string}>();assert.ok(claim);
      const observedAt=Date.now(),cash=await recordCompanyCashReceipt(db,{actorId:'owner',requestId:'billing-company-cash-'+initial.id,expectedRevision:null,now:observedAt},{handoverIdentity:'FICTIONAL-BILLING-HANDOVER-'+initial.id,collectorName:'Fictional Billing Courier',collectorUserId:null,custodyReference:'FICTIONAL-AUTHORIZED-BILLING-CUSTODY',amountPaisa:initial.collectedPaisa,occurredAt:observedAt-1,evidenceReference:'FICTIONAL-INDEPENDENT-COUNTED-BILLING-CASH',actualHandoverConfirmed:true,reason:'Independently count actual fictional company cash; do not infer a bank deposit.'});
      const parcel=(await listParcels(db,record.id)).find(value=>value.id===initial.id);assert.ok(parcel);
      const context={actorId:'owner',requestId:'billing-cash-reconciled-'+initial.id,expectedRevision:String(parcel.version),now:Date.now()},input={jobId:parcel.id,receiptId:cash.id,expectedReceiptRevision:0,amountPaisa:initial.collectedPaisa,cashRecordId:claim.id,deductions:[],evidenceReference:'FICTIONAL-EXACT-BILLING-CASH-ALLOCATION',reason:'Match the independently received cash to the exact collected original parcel.'};
      await reconcileCodReceipt(db,context,input);await reconcileCodReceipt(db,context,input);
    }
    assert.equal(String((await db.prepare("SELECT COUNT(*) n FROM company_money_receipts WHERE kind<>'cash_handover' OR account_version_id IS NOT NULL").first<{n:number|string}>())?.n),'0','Counted company cash never implies a bank deposit');
    const receipt=JSON.parse((await db.prepare("SELECT snapshot_json AS json FROM order_documents WHERE order_id=? AND kind='payment_receipt'").bind(record.id).first<{json:string}>())!.json);
    assert.equal(receipt.billing.receiptIssuance,'pending_clearance');
    assert.equal(String((await db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='billing.receipt.numbered'").first<{n:number|string}>())?.n),'0','Actual cash receipt does not grant commercial numbering clearance');
    assert.equal(receipt.items[0].sellerSku,'FINAL-CODE');assert.equal(receipt.items[0].sku,first.sku);assert.equal(receipt.items[0].variant,'A5 / Blue');
    assert.equal(receipt.items[0].issuer.legalName,saved.items[0].issuer.legalName);
    assert.equal(receipt.buyerPlatformFeePaisa,0);
    assert.equal(receipt.deliveryChargePaisa,15000);
    assert.equal(receipt.grandTotalPaisa,115000);
    assert.equal(receipt.billing.receiptGroups.reduce((sum:number,g:{totalPaisa:number})=>sum+g.totalPaisa,0),receipt.grandTotalPaisa);
    assert.ok(receipt.billing.receiptGroups.every((g:{billSequence?:number})=>g.billSequence===undefined));
    assert.equal((await db.prepare("SELECT snapshot_json AS json FROM order_documents WHERE order_id=? AND kind='order_statement'").bind(record.id).first<{json:string}>())!.json,record.json);

    // Exercise the populated accounting UNION on both SQLite and actual MariaDB.
    // Native parcel collection is real fictional cash custody, not a bank deposit.
    // Both the commission and the recorded customer collection must be reported.
    assert.equal(String(receipt.grandTotalPaisa),'115000');
    const payment=await db.prepare("SELECT status,amount_paisa AS amount FROM payments WHERE order_id=?").bind(record.id).first<{status:string;amount:number|string}>();
    assert.equal(payment?.status,'captured');
    assert.equal(String(payment?.amount),'115000');
    const now=Date.now()+1000;
    const accounting=await readAccountingSources(db,parseAccountingQuery(new URLSearchParams('period=all&section=sellers'),now),now,'Disposable billing workflow');
    assert.ok(accounting.coverage.length>=10);
    assert.ok(accounting.coverage.every(source=>source.available),JSON.stringify(accounting.issues));
    assert.equal(accounting.metrics.find(metric=>metric.key==='seller_commission_earned')?.amountPaisa,'9000');
    assert.equal(accounting.metrics.find(metric=>metric.key==='cod_collected')?.amountPaisa,'115000');
    assert.ok(accounting.rows.some(row=>row.sourceKind==='seller_ledger_entry'&&row.amountPaisa==='-9000'));
    const originalItem=await db.prepare('SELECT id FROM order_items WHERE order_id=?').bind(record.id).first<{id:string}>();assert.ok(originalItem);
    return{orderId:record.id,orderItemId:originalItem.id,productId:'product-a',buyerId:'checkout-buyer',sellerId:'seller-a',ownerId:'user-a',moderatorId:'owner'};

}
