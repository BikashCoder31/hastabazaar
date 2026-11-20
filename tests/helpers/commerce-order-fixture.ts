import {confirmFixtureRemittance} from './verified-cod-remittance';
import {historicalCommissionDatabase} from './commission-database';
import {seedCheckoutBuyer,readyCheckoutSeller} from './checkout-contact';
import {createCodOrder,createManualBankOrder} from '../../lib/db/repositories/orders';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount,publishCompanyReceivingAccount} from '../../lib/payments/company-accounts';
import {companyDetails} from '../../lib/content/company-details';
import {prepareSellerParcels,operateParcel,listParcels} from '../../lib/operations/parcels';
import {confirmFirstCodReview,getFirstCodReview} from '../../lib/orders/first-cod-review';
export async function commerceOrderFixture(twoSellers = false, wallet = 0, manualBank = false) {
  const f = await historicalCommissionDatabase(false);
  try {
    if (twoSellers) f.sqlite.prepare("DELETE FROM business_setting_versions WHERE id='historical-no-service-fee'").run();
    await readyCheckoutSeller(f,'seller-a','user-a','owner');
    if(twoSellers)await readyCheckoutSeller(f,'seller-b','user-b','owner');
    await seedCheckoutBuyer(f.database);
    if (wallet) f.sqlite.prepare("INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES ('checkout-buyer','FINANCIAL-WALLET',?,1)").run(wallet);
    f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','craft','Craft',1,1,1,1);
      INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','token','NPR',1,1);
      INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,return_eligible,created_at,updated_at)
      VALUES ('product-a','seller-a','cat','craft-a','SKU-A','Craft A','Fictional craft A',${twoSellers ? 16000 : 100000},10,'Maker A','NP','Wood','published',1,1,1);
      INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('line-a','cart','product-a',1,1,1);`);
    if (twoSellers) f.sqlite.exec(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,return_eligible,created_at,updated_at)
      VALUES ('product-b','seller-b','cat','craft-b','SKU-B','Craft B','Fictional craft B',7500,10,'Maker B','NP','Wood','published',1,1,1);
      INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('line-b','cart','product-b',1,1,1);`);
    let accountVersionId:string|null=null;
    if(manualBank){
      const ctx=(requestId:string,expectedRevision:string|null)=>({actorId:'owner',requestId,expectedRevision,now:Date.now()});
      const draft=await saveCompanyAccountDraft(f.database,ctx('manual-draft',null),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional Bank',branch:'Fictional Branch',accountNumber:'TEST-TWO-SELLERS',currency:'NPR',purpose:'both'},evidenceReference:'FICTIONAL-COMPANY-OWNERSHIP',conflictUserIds:[],reason:'Verify fictional company ownership for the isolated two-seller fixture.'});
      accountVersionId=draft.versionId;
      await submitCompanyAccountForReview(f.database,ctx('manual-submit','0'),{versionId:accountVersionId,reason:'Submit the fictional source account for isolated verification.'});
      await verifyCompanyAccount(f.database,ctx('manual-verify','1'),{versionId:accountVersionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-OWNERSHIP',reason:'Check the actual fictional company owner and currency.'});
      await publishCompanyReceivingAccount(f.database,ctx('manual-publish','2'),{versionId:accountVersionId,expectedReceivingRevision:0,reason:'Publish only inside this isolated in-memory financial fixture.'});
    }
    const placed = await (manualBank?createManualBankOrder:createCodOrder)(f.database, 'token', 'receipt', {
      customerAuthSubject: 'checkout-buyer', customerEmail: 'buyer@example.test', customerPhone: '9811111111',
      locale: 'en-NP', termsAccepted: true, idempotencyKey: 'financial-transition-order',
      useWallet: wallet > 0,
      address: { recipientName: 'Fictional Buyer', phone: '9811111111', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Ward 1' },
    }, manualBank?Date.now():100, 'checkout-buyer');
    const orderId = String(f.sqlite.prepare('SELECT id FROM orders').get()!.id);
    if (await getFirstCodReview(f.database, orderId)) await confirmFirstCodReview(f.database, {
      orderId, actorId: 'owner', reason: 'Confirmed isolated fictional COD order', requestId: 'first-cod', now: 101,
    });
    if(!manualBank)await prepareSellerParcels(f.database, { orderId, actorId: 'owner', requestId: 'prepare', now: 102 });
    let sequence = 0;
    async function operate(action: string, extra: Record<string, unknown> = {}) {
      const p = (await listParcels(f.database, orderId)).find(row => row.sellerId === 'seller-a')!;
      const input = { jobId: p.id, actorId: 'owner', action, version: p.version, note: 'Isolated financial transition fixture',
        requestId: 'parcel-' + sequence, now: 103 + sequence++, ...extra };
      await operateParcel(f.database, input);
      return input;
    }
    async function confirmRemittance(extra:{amountPaisa:number;reference:string;now?:number}){const input=await operate('propose_remittance',extra);await confirmFixtureRemittance(f.database,{jobId:input.jobId,actorId:input.actorId,requestId:input.requestId,...extra});return input;}
    async function deliver() {
      await operate('assign', { method: 'courier', courierName: 'Fictional Courier', trackingCode: 'LOCAL-FIXTURE' });
      f.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE seller_id='seller-a'").run();
      await operate('dispatch');
      await operate('deliver');
    }
    return { ...f, orderId, placed, accountVersionId, operate, confirmRemittance, deliver, access: { orderNumber: placed.orderNumber, customerId: 'checkout-buyer' } };
  } catch (error) { await f.dispose(); throw error; }
}

