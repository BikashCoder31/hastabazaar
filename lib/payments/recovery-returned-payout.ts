/** A partially assembled returned-principal disposition is never payable or collectible. */
export function returnedPayoutDispositionPendingSql(caseId:string){
 return `EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews returned_review WHERE returned_review.case_id=${caseId} AND (
  NOT EXISTS(SELECT 1 FROM seller_recovery_allocations applied WHERE applied.id=returned_review.allocation_id AND applied.case_id=returned_review.case_id AND applied.method='returned_payout' AND applied.receipt_id=returned_review.receipt_id AND applied.amount_paisa=returned_review.amount_paisa AND applied.request_id=returned_review.request_id)
  OR returned_review.restored_paisa<>COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_payout_return_restorations restored WHERE restored.review_id=returned_review.id),0)
  OR returned_review.principal_excess_paisa<>COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_payout_return_restorations restored WHERE restored.review_id=returned_review.id AND restored.kind='returned_principal'),0)))`;
}
