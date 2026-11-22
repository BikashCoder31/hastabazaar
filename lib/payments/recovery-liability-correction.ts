/** A reduction in the original responsibility is distinct from commercial absorption.
 * Its single native credit covers both extinguished debt and restored overcollection.
 * Restored incoming money stays allocated: this never releases receipt capacity.
 */
export function recoveryLiabilityCorrection(input:{confirmed:number;absorbed:number;recovered:number;disputed:number;newConfirmed:number;resolveDisputed:number}){
 const exact=(value:number)=>{if(!Number.isSafeInteger(value)||value<0)throw new Error('Use exact nonnegative correction amounts.');return BigInt(value);};
 const confirmed=exact(input.confirmed),absorbed=exact(input.absorbed),recovered=exact(input.recovered),disputed=exact(input.disputed),next=exact(input.newConfirmed),resolved=exact(input.resolveDisputed);
 const zero=BigInt(0),positive=(n:bigint)=>n>zero?n:zero;
 if(next>=confirmed||absorbed>confirmed||recovered>confirmed-absorbed||disputed>confirmed-absorbed)throw new Error('Reconcile the original liability and collection before reducing responsibility.');
 const nextAbsorbed=absorbed<next?absorbed:next,nextLiability=next-nextAbsorbed;
 const nativeCredit=confirmed-absorbed-nextLiability,nextDisputed=disputed-resolved;
 if(resolved>disputed||resolved>nativeCredit||nextDisputed>nextLiability)throw new Error('Explicitly resolve the disputed portion affected by this correction.');
 const restored=positive(recovered-nextLiability),remaining=positive(nextLiability-recovered);
 return {confirmedPaisa:Number(next),absorbedPaisa:Number(nextAbsorbed),disputedPaisa:Number(nextDisputed),releasedAbsorptionPaisa:Number(absorbed-nextAbsorbed),
  nativeCreditPaisa:Number(nativeCredit),restoredPaisa:Number(restored),recoveredPaisa:Number(recovered-restored),remainingPaisa:Number(remaining),debtEliminatedPaisa:Number(nativeCredit-restored)};
}
