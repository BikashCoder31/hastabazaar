import {incomingRecoveryDisposition} from './recovery-incoming-disposition';
/** The current carrier command covers only confirmed recovery, preserving its native cap. */
export function carrierRecoveryDisposition(input:{confirmed:number;absorbed:number;disputed:number;recovered:number;carrierRecovered:number;incoming:number;resolveDisputed:number}){
 const result=incomingRecoveryDisposition({...input,kind:'carrier',originalUnpaidAvailable:0});
 return {nativeCreditPaisa:result.nativeCreditPaisa,restoredPaisa:result.restoredPaisa,recoveredPaisa:result.recoveredPaisa,remainingPaisa:result.remainingPaisa,disputedPaisa:result.disputedPaisa};
}

/** Incomplete internal assembly must never become payable or collectible. */
export function carrierDispositionPendingSql(caseId:string){
 return `EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews carrier_review WHERE carrier_review.case_id=${caseId} AND (
  NOT EXISTS(SELECT 1 FROM seller_recovery_allocations applied WHERE applied.id=carrier_review.allocation_id AND applied.case_id=carrier_review.case_id AND applied.method='carrier' AND applied.receipt_id=carrier_review.receipt_id AND applied.amount_paisa=carrier_review.amount_paisa AND applied.request_id=carrier_review.request_id)
  OR carrier_review.restored_paisa<>COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_carrier_restorations restored WHERE restored.review_id=carrier_review.id),0)))`;
}
