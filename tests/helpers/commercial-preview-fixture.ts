import {readonlyBatchDatabase} from './readonly-batch-database';
import {publishedOfferFixture} from './public-offer-fixture';
import {getPublicOfferSet} from '../../lib/products/public-offers';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../../lib/db/repositories/business-settings';
import {getCustomerFeeWaiverState,mutateCustomerFeeWaiver} from '../../lib/db/repositories/customer-fee-waivers';
import {saveFormDraft,publishFormDraft} from '../../lib/db/repositories/form-catalog';
import {resolvePublishedForm} from '../../lib/forms/runtime';
import {validateSellerFormSubmission} from '../../lib/forms/submission';
import {savePromoDraft,publishPromo} from '../../lib/db/repositories/promo-codes';
import {issueGiftCard,redeemGiftCard} from '../../lib/db/repositories/gift-cards';

export async function commercialPreviewFixture(){const f=await publishedOfferFixture();try{
 const at=f.now+120000;f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','customer',1)").run();
 const fee=await createBusinessSettingDraft(f.db,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:700},actorId:'reviewer',reason:'Explicit fictional current customer-charge source for the readonly sample.',requestId:'preview-current-fee-draft',now:f.now+20});await publishBusinessSettingDraft(f.db,{id:fee.id,actorId:'reviewer',expectedRevision:fee.revision,effectiveFrom:f.now+20,reason:'Publish the explicit fictional customer charge before the sample time.',requestId:'preview-current-fee-publish',now:f.now+20});
 const formId='staff.promo-code' as const,draft=await saveFormDraft(f.db,{formId,actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId,fields:[]},reason:'Use the genuine protected promo form in this isolated sample.',requestId:'preview-promo-form-draft',now:f.now+21});await publishFormDraft(f.db,{formId,draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:0,reason:'Publish only the native fictional promo contract.',requestId:'preview-promo-form-publish',now:f.now+21});const config=await resolvePublishedForm(f.db,formId);
 const promoContext=async(requestId:string,expectedVersion:number)=>{const form=await validateSellerFormSubmission(f.db,formId,config.version,[],requestId);return{actorId:'reviewer',authSubject:'reviewer',requestId,expectedVersion,now:f.now+22,reason:'Explicit native fictional sample promotion; no real delivery or order.',form:{formId,versionId:form.versionId,answers:form.answers}};};
 const saved=await savePromoDraft(f.db,await promoContext('preview-promo-draft',0),{code:'T31PREVIEW',label:'Fictional capped native preview',kind:'percentage',percentBps:1000,maxDiscountPaisa:20000,minimumSubtotalPaisa:10000,startsAt:f.now,endsAt:f.now+600000,totalUseLimit:20,perCustomerUseLimit:5,budgetPaisa:500000});const promo=await publishPromo(f.db,await promoContext('preview-promo-publish',saved.version),saved.campaignId);
 async function waiver(name:string,startsAt:number){let state=await getCustomerFeeWaiverState(f.db);const saved=await mutateCustomerFeeWaiver(f.db,{actorId:'reviewer',authSubject:'reviewer',requestId:'preview-waiver-'+name+'-draft',expectedRevision:state.revision,now:f.now+23,reason:'Explicit fictional overlapping original fee-waiver source.'},{type:'create',terms:{name,description:'One actual positive customer charge only.',startsAt,endsAt:f.now+600000}});state=await getCustomerFeeWaiverState(f.db);return mutateCustomerFeeWaiver(f.db,{actorId:'reviewer',authSubject:'reviewer',requestId:'preview-waiver-'+name+'-publish',expectedRevision:state.revision,now:f.now+24,reason:'Publish this original fictional customer-fee campaign.'},{type:'publish',campaignId:saved.id});}
 const first=await waiver('earlier',f.now-100),second=await waiver('later',f.now);
 const gift=await issueGiftCard(f.db,{actorId:'reviewer',amountPaisa:10000,requestId:'preview-owned-wallet-issue',now:f.now+25});await redeemGiftCard(f.db,{userId:'reviewer',code:gift.code!,requestId:'preview-owned-wallet-redeem',now:f.now+26});
 const offerSet=await getPublicOfferSet(f.db,f.productId,Date.now());if(!offerSet)throw Error('Genuine public sample offers must exist.');
 const input={at,district:'Kathmandu',lines:[{productId:f.productId,offerId:'medium',versionId:offerSet.versionId,publicVersionId:offerSet.publicVersionId,quantity:2}],promo:{campaignId:promo.campaignId,revision:promo.revision},useWallet:true};
 return{...f,db:readonlyBatchDatabase(f.db,f.sqlite),at,first,second,fee,promo,offerSet,input,actor:{id:'reviewer',authSubject:'reviewer'},promoContext};
 }catch(error){f.dispose();throw error;}}
