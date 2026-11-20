/** Amounts are integer paisa from authoritative current offers, after product markdowns. */
export function calculateBenefitTotals(input:{merchandisePaisa:number;promoPaisa:number;referralPaisa:number;creditPaisa:number;deliveryPaisa:number;customerFeePaisa:number}){
 for(const amount of Object.values(input))if(!Number.isSafeInteger(amount)||amount<0)throw new RangeError('Review the current benefit amounts.');
 if(input.promoPaisa>0&&input.referralPaisa>0)throw new RangeError('Choose one promo or referral discount.');
 const merchandise=BigInt(input.merchandisePaisa),discount=BigInt(input.promoPaisa)+BigInt(input.referralPaisa),credit=BigInt(input.creditPaisa);
 if(discount+credit>merchandise)throw new RangeError('Discounts and shopping credit apply only to eligible merchandise.');
 const cashMerchandise=merchandise-discount-credit,payable=cashMerchandise+BigInt(input.deliveryPaisa)+BigInt(input.customerFeePaisa);
 if(payable>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('Review the current order total.');
 return Object.freeze({...input,discountPaisa:Number(discount),cashMerchandisePaisa:Number(cashMerchandise),payablePaisa:Number(payable)});
}
