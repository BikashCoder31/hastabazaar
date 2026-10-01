import {normalizeDistrict} from './nepal-address';
export interface DeliveryRates {version:string;zones:{valley:number;terai:number;nationwide:number};districts:Record<string,number>}
export const DEFAULT_DELIVERY_RATES:DeliveryRates={version:'initial-150-180-250',zones:{valley:15000,terai:18000,nationwide:25000},districts:{}};
export const DELIVERY_PRICING_POLICY = 'base_plus_half_per_additional_store_v1' as const;

export interface DeliveryPricingSnapshot {
 pricingPolicy:typeof DELIVERY_PRICING_POLICY;
 baseChargePaisa:number;
 storeCount:number;
 chargePaisa:number;
}

export type DeliveryPricingSnapshotResult=
 | {kind:'legacy'}
 | {kind:'invalid'}
 | {kind:'current';snapshot:DeliveryPricingSnapshot};

export function deliveryChargeForStores(baseChargePaisa: number, storeCount: number) {
 if(!Number.isSafeInteger(baseChargePaisa)||baseChargePaisa<0||!Number.isSafeInteger(storeCount)||storeCount<0)throw new Error('Invalid delivery pricing input.');
 if(!storeCount)return 0;
 const numerator=BigInt(baseChargePaisa)*BigInt(storeCount+1);
 const charge=Number((numerator+BigInt(1))/BigInt(2));
 if(!Number.isSafeInteger(charge))throw new Error('Delivery charge is too large.');
 return charge;
}
export function readDeliveryPricingSnapshot(value:string|null,recordedChargePaisa:number):DeliveryPricingSnapshotResult{
 if(!value)return {kind:'legacy'};
 let raw:unknown;
 try{raw=JSON.parse(value);}catch{return {kind:'invalid'};}
 if(!raw||typeof raw!=='object')return {kind:'invalid'};
 if(!('pricingPolicy' in raw))return {kind:'legacy'};
 const snapshot=raw as Record<string,unknown>;
 if(snapshot.pricingPolicy!==DELIVERY_PRICING_POLICY||!Number.isSafeInteger(snapshot.baseChargePaisa)||Number(snapshot.baseChargePaisa)<0||!Number.isSafeInteger(snapshot.storeCount)||Number(snapshot.storeCount)<1||!Number.isSafeInteger(snapshot.chargePaisa)||snapshot.chargePaisa!==recordedChargePaisa)return {kind:'invalid'};
 const parsed={pricingPolicy:DELIVERY_PRICING_POLICY,baseChargePaisa:Number(snapshot.baseChargePaisa),storeCount:Number(snapshot.storeCount),chargePaisa:Number(snapshot.chargePaisa)};
 return deliveryChargeForStores(parsed.baseChargePaisa,parsed.storeCount)===parsed.chargePaisa?{kind:'current',snapshot:parsed}:{kind:'invalid'};
}
export function validateDeliveryRates(value:unknown):Omit<DeliveryRates,'version'>{
 const r=value as DeliveryRates;if(!r||!r.zones||!r.districts||Array.isArray(r.districts)||typeof r.districts!=='object')throw new Error('Enter zone rates and district overrides.');
 const valid=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=100000000;
 if(!['valley','terai','nationwide'].every(z=>valid(r.zones[z as keyof DeliveryRates['zones']])))throw new Error('Rates must be nonnegative amounts up to NPR 1,000,000.');
 const districts:Record<string,number>={};for(const [key,amount] of Object.entries(r.districts)){const canonical=normalizeDistrict(key);if(!canonical||!valid(amount)||canonical in districts)throw new Error('Use recognized, unique districts and valid amounts.');districts[canonical]=amount;}
 return {zones:{valley:r.zones.valley,terai:r.zones.terai,nationwide:r.zones.nationwide},districts};
}
