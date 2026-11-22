import assert from 'node:assert/strict';
import {publishedOfferFixture} from './public-offer-fixture';
import {seedVerifiedCheckoutContact} from './checkout-contact';
import {saveFormDraft,publishFormDraft} from '../../lib/db/repositories/form-catalog';
import {getPublicOfferSet} from '../../lib/products/public-offers';
import {addOfferCartLine} from '../../lib/cart/offer-cart';
import {getCart} from '../../lib/db/repositories/cart';
import {CART_COOKIE,hashOpaqueToken} from '../../lib/cart/session';
import {getDeliveryRates} from '../../lib/db/repositories/delivery-rates';
import {getPlatformServiceFee} from '../../lib/db/repositories/platform-service-fee';
import {getDeliveryEstimate} from '../../lib/checkout/validation';
import {getCheckoutPolicyContext} from '../../lib/checkout/policy-context';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount,publishCompanyReceivingAccount} from '../../lib/payments/company-accounts';
import {companyDetails} from '../../lib/content/company-details';

export async function publicCheckoutFixture(options:{bank?:boolean}={}){
 const f=await publishedOfferFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  await seedVerifiedCheckoutContact(f.db,'customer','9811111111',Date.now());
  const formId='commerce.checkout',published=(f.sqlite.prepare("SELECT COALESCE(MAX(version),0) n FROM form_config_versions WHERE form_id=? AND status='published'").get(formId)!.n)as number;
  const draft=await saveFormDraft(f.db,{formId,actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:published,config:{formId,fields:[]},reason:'Publish the real supported checkout form in this isolated fixture.',requestId:'public-checkout-form-draft',now:Date.now()});
  const form=await publishFormDraft(f.db,{formId,draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:published,reason:'Review this actual original form before public checkout submission.',requestId:'public-checkout-form-published',now:Date.now()});
  let accountVersionId:string|null=null;
  if(options.bank){const ctx=(requestId:string,expectedRevision:string|null=null)=>({actorId:'reviewer',requestId,expectedRevision,now:Date.now()});
   const bank=await saveCompanyAccountDraft(f.db,ctx('public-bank-draft'),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional original bank',branch:'Fictional branch',accountNumber:'TEST-PUBLIC-CHECKOUT',currency:'NPR',purpose:'receiving'},evidenceReference:'FICTIONAL-EXACT-COMPANY-OWNERSHIP',conflictUserIds:[],reason:'Retain original fictional company receiving-account ownership evidence.'});
   await submitCompanyAccountForReview(f.db,ctx('public-bank-submit','0'),{versionId:bank.versionId,reason:'Submit this original company receiving account for verification.'});
   await verifyCompanyAccount(f.db,ctx('public-bank-verified','1'),{versionId:bank.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-COMPANY-NPR-OWNERSHIP',reason:'Independently verify the exact fictional company account and NPR currency.'});
   await publishCompanyReceivingAccount(f.db,ctx('public-bank-selected','2'),{versionId:bank.versionId,expectedReceivingRevision:0,reason:'Select this verified actual fictional NPR receiving account for instructions.'});accountVersionId=bank.versionId;
  }
  const token='fictional-public-checkout-'+crypto.randomUUID(),cartHash=await hashOpaqueToken(token),offers=(await getPublicOfferSet(f.db,f.productId))!,medium=offers.offers.find(o=>o.id==='medium')!;
  await addOfferCartLine(f.db,cartHash,{productId:f.productId,offerId:medium.id,versionId:offers.versionId,publicVersionId:offers.publicVersionId,pricePaisa:medium.pricePaisa,quantity:1,requestId:'public-checkout-real-medium'},Date.now());
  const cart=await getCart(f.db,cartHash);assert.equal(cart.hasUnavailableItems,false);assert.equal(cart.items[0].offerId,'medium');
  const rates=await getDeliveryRates(f.db),serviceFee=await getPlatformServiceFee(f.db),address={recipientName:'Fictional original buyer',phone:'9811111111',province:'Bagmati' as const,district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional locality'},delivery=getDeliveryEstimate(address.district,cart.items.map(i=>i.preparationDays),rates,new Set(cart.items.map(i=>i.sellerId)).size)!;
  const policyContext=await getCheckoutPolicyContext(),body={customerEmail:'customer@local.hastabazaar.test',customerPhone:'9811111111',locale:'en-NP',termsAccepted:true,idempotencyKey:crypto.randomUUID(),paymentMethod:options.bank?'manual_bank':'cod',address,deliveryRateVersion:rates.version,formVersion:form.version,customAnswers:[],reviewedQuote:{lines:cart.items.map(i=>({id:i.id,sellerId:i.sellerId,pricePaisa:i.pricePaisa!,quantity:i.quantity,offerId:i.offerId!,offerVersionId:i.offerVersionId!,publicVersionId:i.publicVersionId!,revision:i.revision!})),deliveryPaisa:delivery.chargePaisa,walletPaisa:0,referralPaisa:0,promoPaisa:0,payablePaisa:cart.itemSubtotalPaisa+delivery.chargePaisa+serviceFee.chargedPaisa,policyContext,referralCampaign:null,serviceFee}};
  const origin='https://public-checkout.test',request=(value:unknown=body)=>new Request(origin+'/api/checkout',{method:'POST',headers:{origin,'content-type':'application/json',cookie:CART_COOKIE+'='+token},body:JSON.stringify(value)});
  return{...f,body,request,token,cartHash,accountVersionId,policyContext,cart,rates,serviceFee};
 }catch(error){f.dispose();throw error;}
}
