import {fixedOriginalUnpaidSql} from './recovery-fixed-original';
/** Actual carrier coverage of an already-used original unpaid component is
 * separate from collection of the additional seller deficit. */
export function carrierUnpaidGrossSql(c:string,dialect:'sqlite'|'mariadb'='sqlite'){
 return `CASE WHEN ${c}.payout_model='fixed' THEN ${fixedOriginalUnpaidSql(c+'.id',dialect)}
 WHEN ${c}.payout_model IN('registered','managed') THEN COALESCE((SELECT unpaid.amount_paisa FROM seller_recovery_original_unpaid_reviews unpaid WHERE unpaid.case_id=${c}.id),0) ELSE 0 END`;
}
export function carrierUnpaidAvailableSql(c:string,dialect:'sqlite'|'mariadb'='sqlite'){
 return `(${carrierUnpaidGrossSql(c,dialect)})-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=${c}.id),0)-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=${c}.id),0)`;
}
export function carrierUnpaidDispositionPendingSql(caseId:string){
 return `EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.case_id=${caseId} AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=review.allocation_id AND a.case_id=review.case_id AND a.method='carrier' AND a.receipt_id=review.receipt_id AND a.amount_paisa=review.amount_paisa AND a.request_id=review.request_id AND a.actor_id=review.actor_id))`;
}
