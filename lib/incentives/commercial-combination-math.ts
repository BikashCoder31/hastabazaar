import {calculateBenefitTotals} from './benefit-combinations';
import {calculateMarketplaceFee} from '../marketplace/fee-waivers';
/** Illustration only: no eligibility, agreement, balance, budget or publication decision. */
export function previewCommercialCombination(input:{merchandisePaisa:number;deliveryPaisa:number;promoPaisa:number;referralPaisa:number;creditPaisa:number;customerFeePaisa:number|null;waiver:boolean;model:'registered'|'sale_linked'|'fixed_supplier';feeBps:number|null;fixedSupplierPaisa:number}){
 if(input.customerFeePaisa===null||!Number.isSafeInteger(input.customerFeePaisa)||input.customerFeePaisa<0)throw new RangeError('The current customer-charge source is unavailable. No replacement is assumed.');
 const waivedPaisa=input.waiver?input.customerFeePaisa:0,totals=calculateBenefitTotals({merchandisePaisa:input.merchandisePaisa,deliveryPaisa:input.deliveryPaisa,promoPaisa:input.promoPaisa,referralPaisa:input.referralPaisa,creditPaisa:input.creditPaisa,customerFeePaisa:input.customerFeePaisa-waivedPaisa});
 let feePaisa:number|null=null,businessBase:bigint;
 if(input.model==='fixed_supplier'){if(!Number.isSafeInteger(input.fixedSupplierPaisa)||input.fixedSupplierPaisa<0)throw new RangeError('Enter the explicit assumed original supplier amount.');businessBase=BigInt(input.merchandisePaisa)-BigInt(input.fixedSupplierPaisa);}
 else{if(input.model!=='registered'&&input.model!=='sale_linked'||input.feeBps===null||!Number.isInteger(input.feeBps)||input.feeBps<0||input.feeBps>10000)throw new RangeError('The current commercial fee source is unavailable. No percentage is assumed.');feePaisa=calculateMarketplaceFee(input.merchandisePaisa,input.feeBps,null).netPaisa;businessBase=BigInt(feePaisa);}
 const contribution=businessBase+BigInt(totals.customerFeePaisa)-BigInt(totals.discountPaisa);if(contribution>BigInt(Number.MAX_SAFE_INTEGER)||contribution<BigInt(-Number.MAX_SAFE_INTEGER))throw new RangeError('Review the illustrated amounts.');
 return{...totals,waivedPaisa,feePaisa,operatingContributionPaisa:Number(contribution)};
}
