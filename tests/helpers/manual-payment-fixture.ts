import assert from 'node:assert/strict';
import {getDeliveryRates,saveDeliveryRates} from '../../lib/db/repositories/delivery-rates';
import {publishedOfferFixture} from './public-offer-fixture';
import {seedVerifiedCheckoutContact} from './checkout-contact';
import {companyDetails} from '../../lib/content/company-details';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount,publishCompanyReceivingAccount} from '../../lib/payments/company-accounts';
import {getPublicOfferSet} from '../../lib/products/public-offers';
import {addOfferCartLine} from '../../lib/cart/offer-cart';

export async function manualOrderFixture(options:{walletPaisa?:number;method?:'cod'|'manual_bank';secondOffer?:boolean;freeDelivery?:boolean;serviceFee?:boolean;immediateSettlement?:boolean}={}){
 const f=await publishedOfferFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  if(options.immediateSettlement){const at=Date.now()-1;f.sqlite.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
   SELECT 'recovery-original-zero-hold','seller_delivery_hold_days',COALESCE(MAX(version),0)+1,'0','published',1,'controlled',?,'Explicit prospective zero-day settlement in an isolated fixture','reviewer',?,'recovery-fixture-hold' FROM business_setting_versions WHERE setting_key='seller_delivery_hold_days'`).run(at,at);}
  if(options.serviceFee)f.sqlite.prepare("DELETE FROM business_setting_versions WHERE id='historical-no-service-fee'").run();
  if(options.freeDelivery){const original=await getDeliveryRates(f.db);await saveDeliveryRates(f.db,{actorId:'reviewer',expectedVersion:original.version,rates:{zones:{valley:0,terai:0,nationwide:0},districts:{}},reason:'Explicit fictional free-delivery policy for isolated original-tender checks.',now:Date.now()});}
  const now=Date.now(),ctx=(requestId:string,expectedRevision:string|null)=>({actorId:'reviewer',requestId,expectedRevision,now});
  const saved=await saveCompanyAccountDraft(f.db,ctx('manual-bank-draft',null),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional Test Bank',branch:'Fictional Branch',accountNumber:'TEST-MANUAL-0001',currency:'NPR',purpose:'both'},evidenceReference:'FICTIONAL-COMPANY-OWNERSHIP',conflictUserIds:[],reason:'Record actual fictional company evidence for isolated payment testing.'});
  await submitCompanyAccountForReview(f.db,ctx('manual-bank-submit','0'),{versionId:saved.versionId,reason:'Submit the exact fictional company account for verification.'});
  await verifyCompanyAccount(f.db,ctx('manual-bank-verify','1'),{versionId:saved.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-BANK-VERIFICATION',reason:'Independently check fictional ownership and currency evidence.'});
  await publishCompanyReceivingAccount(f.db,ctx('manual-bank-enable','2'),{versionId:saved.versionId,expectedReceivingRevision:0,reason:'Enable this verified fictional account for isolated instructions.'});
  await seedVerifiedCheckoutContact(f.db,'customer','9811111111',now);const set=(await getPublicOfferSet(f.db,f.productId))!;
  await addOfferCartLine(f.db,'manual-bank-cart',{productId:f.productId,offerId:'medium',versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:80000,quantity:1,requestId:'manual-bank-cart-add'},now);
  if(options.secondOffer)await addOfferCartLine(f.db,'manual-bank-cart',{productId:f.productId,offerId:'large',versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:100000,quantity:1,requestId:'manual-bank-second-offer-add'},now);
  if(options.walletPaisa)f.sqlite.prepare("INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES('customer','MANUALTESTCREDIT',?,?)").run(options.walletPaisa,now);
  const input={useWallet:Boolean(options.walletPaisa),customerAuthSubject:'customer',customerEmail:'customer@local.hastabazaar.test',customerPhone:'9811111111',locale:'en-NP' as const,termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Fictional Buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional locality'}};
  const path='../../lib/db/repositories/orders',orders=await import(path);assert.equal(typeof orders.createManualBankOrder,'function');
  const order=await (options.method==='cod'?orders.createCodOrder:orders.createManualBankOrder)(f.db,'manual-bank-cart','manual-bank-receipt',input,now,'customer');
  const row=f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)!;
  return {...f,now,input,order,orderId:String(row.id),accountVersionId:saved.versionId};
 }catch(error){f.dispose();throw error;}
}

