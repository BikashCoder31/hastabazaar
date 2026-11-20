import {calculateSellerCommissionPaisa,roundHalfUpRatio} from '../marketplace/policy';
import {calculateManagedSaleLinkedAmounts} from '../managed-makers/settlement';
import {productSavings} from './discount';

export type PriceScenario={route:'registered'|'sale_linked';versionId:string;basisPoints:number;effectiveAt:number;observedAt:number;accepted:boolean}|{route:'fixed_supplier';versionId:string;effectiveAt:number;observedAt:number;accepted:boolean;agreedSupplierPaisa:number|null};
export interface KnownPriceDeduction{id:string;label:string;amountPaisa:number}
export interface PriceGuidanceInput{sellingPaisa:number;scenario:PriceScenario|null;costPaisa:number|null;targetPaisa:number|null;deductions:readonly KnownPriceDeduction[]}
const max=BigInt(Number.MAX_SAFE_INTEGER);
function money(value:number,positive=false){if(!Number.isSafeInteger(value)||value<(positive?1:0))throw new RangeError('Use supported nonnegative integer paisa.');return value;}
function exact(value:bigint){if(value>max||value< -max)throw new RangeError('This estimate exceeds supported money precision.');return Number(value);}
export function optionalPrivateMoney(raw:string){if(raw==='')return null;if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw new RangeError('Enter a nonnegative NPR amount with at most two decimal places.');const [whole,fraction='']=raw.split('.');return money(Number(whole+fraction.padEnd(2,'0')));}
export function calculatePriceGuidance(input:PriceGuidanceInput){
 money(input.sellingPaisa,true);if(input.costPaisa!==null)money(input.costPaisa);if(input.targetPaisa!==null)money(input.targetPaisa);
 if(input.deductions.length>20||new Set(input.deductions.map(item=>item.id)).size!==input.deductions.length)throw new RangeError('Keep known deductions separate and do not count one twice.');
 const deductions=input.deductions.map(item=>({id:item.id,label:item.label,amountPaisa:money(item.amountPaisa)})),deducted=deductions.reduce((sum,item)=>sum+BigInt(item.amountPaisa),BigInt(0));exact(deducted);
 const unavailable={state:'unavailable' as const,feePaisa:null,afterFeePaisa:null,afterKnownDeductionsPaisa:null,profitPaisa:null,belowTarget:null,acceptanceRequired:false,scenario:input.scenario,deductions};
 const scenario=input.scenario;if(!scenario)return unavailable;
 if(!['registered','sale_linked','fixed_supplier'].includes(scenario.route)||!scenario.versionId||!Number.isSafeInteger(scenario.effectiveAt)||scenario.effectiveAt<0||!Number.isSafeInteger(scenario.observedAt)||scenario.observedAt<0||typeof scenario.accepted!=='boolean')throw new RangeError('Use an identified authoritative pricing scenario.');
 if(scenario.route==='fixed_supplier'){if(scenario.agreedSupplierPaisa!==null)money(scenario.agreedSupplierPaisa);return {...unavailable,state:'fixed_supplier' as const,agreedSupplierPaisa:scenario.agreedSupplierPaisa};}
 const feePaisa=scenario.route==='registered'?calculateSellerCommissionPaisa(input.sellingPaisa,scenario.basisPoints):calculateManagedSaleLinkedAmounts({eligibleBasePaisa:input.sellingPaisa,platformRetentionBps:scenario.basisPoints}).platformRetainedPaisa;
 const afterFeePaisa=input.sellingPaisa-feePaisa,afterKnownDeductionsPaisa=exact(BigInt(afterFeePaisa)-deducted),profitPaisa=input.costPaisa===null?null:exact(BigInt(afterKnownDeductionsPaisa)-BigInt(input.costPaisa));
 return {state:'estimated' as const,sellingPaisa:input.sellingPaisa,feePaisa,afterFeePaisa,afterKnownDeductionsPaisa,profitPaisa,belowTarget:profitPaisa!==null&&input.targetPaisa!==null?profitPaisa<input.targetPaisa:null,acceptanceRequired:!scenario.accepted,scenario,deductions};
}
/** Binary search evaluates actual rounded route amounts; it does not invert a display percentage. */
export function suggestTargetPrice(input:Omit<PriceGuidanceInput,'sellingPaisa'> & {incrementPaisa:number}){
 money(input.incrementPaisa,true);if(input.costPaisa===null||input.targetPaisa===null||!input.scenario||input.scenario.route==='fixed_supplier'||input.scenario.basisPoints===10000)throw new RangeError('A supported percentage scenario, entered cost and target are required.');
 money(input.costPaisa);money(input.targetPaisa);let low=BigInt(1),high=max/BigInt(input.incrementPaisa);
 const evaluate=(units:bigint)=>calculatePriceGuidance({...input,sellingPaisa:Number(units*BigInt(input.incrementPaisa))});
 if((evaluate(high).profitPaisa??-1)<input.targetPaisa)throw new RangeError('No supported price reaches this target under the selected scenario.');
 while(low<high){const middle=(low+high)/BigInt(2);if((evaluate(middle).profitPaisa??-1)>=input.targetPaisa)high=middle;else low=middle+BigInt(1);}
 const sellingPaisa=Number(low*BigInt(input.incrementPaisa)),estimate=evaluate(low);return {sellingPaisa,estimate};
}
export function priceFromDiscount(originalPaisa:number,percentage:string){
 money(originalPaisa,true);if(!/^\d+(?:\.\d{1,2})?$/.test(percentage))throw new RangeError('Use a percentage above zero and below 100.');const basis=optionalPrivateMoney(percentage)!;if(basis<=0||basis>=10000)throw new RangeError('Use a percentage above zero and below 100.');return money(roundHalfUpRatio(originalPaisa,10000-basis,10000),true);
}
/** Explicit allowlist. This projection can never carry calculator costs, targets or policy details. */
export function publicPricePreview(input:{offerId:string;versionId:string;physicalIdentity:string;sellingPaisa:number|null;compareAtPaisa:number|null;reference:{approved:boolean;offerId:string;versionId:string;physicalIdentity:string;sellingPaisa:number;compareAtPaisa:number}|null}){
 const selling=typeof input.sellingPaisa==='number'&&Number.isSafeInteger(input.sellingPaisa)&&input.sellingPaisa>0?input.sellingPaisa:null;
 const proof=input.reference,savings=selling!==null&&proof?.approved&&proof.offerId===input.offerId&&proof.versionId===input.versionId&&proof.physicalIdentity===input.physicalIdentity&&proof.sellingPaisa===selling&&proof.compareAtPaisa===input.compareAtPaisa?productSavings(selling,input.compareAtPaisa):null;
 return {offerId:input.offerId,sellingPaisa:selling,compareAtPaisa:savings?input.compareAtPaisa:null,savings};
}
