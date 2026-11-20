type IncomingRecoveryPosition={confirmed:number;absorbed:number;disputed:number;recovered:number;carrierRecovered:number;incoming:number;resolveDisputed:number};
export type IncomingRecoveryDispositionInput=IncomingRecoveryPosition&(
 |{kind:'carrier';originalUnpaidAvailable:number}
 |{kind:'returned_payout';returnedPrincipalAvailable:number}
);
/** Accounting only: callers must independently bind the actual incoming bank credit,
 * original paid principal/unpaid-cost proof, shared capacity and current authority.
 * One native credit includes debt relief plus any separately retained restitution.
 */
export function incomingRecoveryDisposition(input:IncomingRecoveryDispositionInput){
 const exact=(value:number)=>{if(!Number.isSafeInteger(value)||value<0)throw new Error('Use exact nonnegative incoming-money amounts.');return BigInt(value);};
 const zero=BigInt(0),maximum=BigInt(Number.MAX_SAFE_INTEGER),confirmed=exact(input.confirmed),absorbed=exact(input.absorbed),disputed=exact(input.disputed),recovered=exact(input.recovered),carrier=exact(input.carrierRecovered),incoming=exact(input.incoming),resolved=exact(input.resolveDisputed);
 const liability=confirmed-absorbed;
 if(absorbed>confirmed||recovered>liability||carrier>recovered||disputed>liability||incoming<=zero)throw new Error('Reconcile the original cost cap and retained incoming-money position.');
 if(input.kind==='carrier'){
  const unpaid=exact(input.originalUnpaidAvailable);
  if(confirmed+unpaid>maximum)throw new Error('The original cost exceeds the supported monetary range.');
  if(incoming>liability-carrier+unpaid)throw new Error('The reimbursement exceeds the remaining original cost cap. Review company-owned or excess money separately.');
 }else if(incoming>exact(input.returnedPrincipalAvailable))throw new Error('The returned money exceeds the verified remaining original payout principal.');
 const overlap=recovered+incoming-liability,restored=overlap>zero?overlap:zero,seller=recovered-carrier;
 const restoredSeller=restored<seller?restored:seller,self=restored-restoredSeller,nextRecovered=recovered+incoming-restored,remaining=liability-nextRecovered;
 if(resolved>disputed||resolved>incoming||disputed-resolved>remaining)throw new Error('Explicitly resolve the disputed portion covered by this reimbursement and retain the remaining review.');
 return {nativeCreditPaisa:Number(incoming),restoredPaisa:Number(restored),restoredSellerPaisa:Number(restoredSeller),originalUnpaidCoveredPaisa:input.kind==='carrier'?Number(self):0,returnedPrincipalExcessPaisa:input.kind==='returned_payout'?Number(self):0,recoveredPaisa:Number(nextRecovered),remainingPaisa:Number(remaining),disputedPaisa:Number(disputed-resolved)};
}
