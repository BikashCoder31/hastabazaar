/** Internal projection; callers authorize either the current owner or independent Finance. */
export async function readRecoveryCalculationReviews(db:D1Database,caseId:string){
 return (await db.prepare(`SELECT request.id,request.reason,request.evidence_reference AS evidenceReference,request.created_at AS createdAt,request.due_at AS dueAt,
  CASE WHEN answer.id IS NULL THEN 'pending' ELSE 'answered' END AS status,answer.public_message AS publicMessage,answer.created_at AS answeredAt
  FROM seller_recovery_calculation_reviews request LEFT JOIN seller_recovery_calculation_answers answer ON answer.review_id=request.id
  WHERE request.case_id=? ORDER BY request.created_at,request.id`).bind(caseId).all<{id:string;reason:string;evidenceReference:string|null;createdAt:number;dueAt:number;status:'pending'|'answered';publicMessage:string|null;answeredAt:number|null}>()).results;
}
