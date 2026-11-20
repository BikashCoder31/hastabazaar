import type {CustomerServiceFeeSnapshot} from '../checkout/platform-service-fee';
export interface CommercialPreviewVersion{versionId:string;revision:number}
export interface CommercialPreviewLineInput{productId:string;offerId:string|null;versionId:string;publicVersionId:string|null;quantity:number}
export interface CommercialPreviewInput{
 at:number;district:string;lines:CommercialPreviewLineInput[];useWallet:boolean;
 promo?:{campaignId:string;revision:number};referralCode?:string;
 proposed?:{registeredFee?:CommercialPreviewVersion;managedFee?:CommercialPreviewVersion;customerFee?:CommercialPreviewVersion;waiver?:{campaignId:string;revision:number;state:'published'|'paused'}};
}
export interface CommercialPreviewSource{kind:string;id:string;revision:number|null;status:string;proposed:boolean;label:string}
export interface CommercialPreviewChoice extends Omit<CommercialPreviewLineInput,'quantity'>{label:string;sellerId:string;pricePaisa:number;compareAtPricePaisa:number|null;available:number;orderable:boolean}
export interface CommercialPreviewChoices{
 observedAt:number;offers:CommercialPreviewChoice[];nextCursor:string|null;
 versions:Array<CommercialPreviewSource&{target:'registeredFee'|'managedFee'|'customerFee'}>;
 promos:Array<CommercialPreviewSource&{campaignId:string}>;
 waivers:Array<CommercialPreviewSource&{campaignId:string;startsAt:number;endsAt:number}>;
 ownCustomerContext:'available'|'unavailable';
}
export interface CommercialPreviewResult{
 observedAt:number;sampleAt:number;hypothetical:true;isCheckoutQuote:false;
 eligibility:{status:'eligible_at_snapshot'|'blocked'|'unavailable';reasons:string[]};
 lines:Array<CommercialPreviewChoice&{quantity:number;route:string;subtotalPaisa:number;fee:{basePaisa:number;rateBps:number;amountPaisa:number;sellerBeforeAdjustmentsPaisa:number;sourceId:string}|null}>;
 merchandisePaisa:number;customerFee:CustomerServiceFeeSnapshot|null;
 incentive:{kind:'promo'|'referral';campaignId:string;revision:number|null;discountPaisa:number;remainingBudgetPaisa:number|null;proposed:boolean}|null;
 wallet:{status:'not_selected'|'recorded'|'no_account'|'unavailable';availablePaisa:number|null;usedPaisa:number};
 delivery:{versionId:string;district:string;storeCount:number;chargedPaisa:number}|null;
 totals:{payablePaisa:number;discountPaisa:number;creditPaisa:number;customerFeePaisa:number;operatingContributionPaisa:number}|null;
 sources:CommercialPreviewSource[];warnings:string[];
}
