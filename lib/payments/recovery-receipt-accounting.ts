export const RECOVERY_RECEIPT_REVERSAL_BLOCKER='An actual repayment receipt was reversed. Reconcile allocation attribution and its native settlement before further collection or payout.';
/** SQL fragments accept internal SQL expressions only, never user-supplied text.
 * Recorded bank facts remain immutable. Only a completed, bounded disposition
 * changes the counted actual collection; an unfinished attribution still pauses
 * every affected recovery rather than guessing which allocation was reversed. */
export function reversedRecoveryAllocationSql(allocation:string){
 return `COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=${allocation}),0)`;
}
export function actualRecoveryAllocationSql(alias:string){return `(${alias}.amount_paisa-${reversedRecoveryAllocationSql(alias+'.id')})`;}
export function pendingRecoveryReceiptReversalSql(receipt:string){
 return `EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=${receipt}
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed'))`;
}
export function verifiedRecoveryReceiptSql(alias:string){
 return `(${alias}.status IN('verified','reversed') AND NOT ${pendingRecoveryReceiptReversalSql(alias+'.id')})`;
}
