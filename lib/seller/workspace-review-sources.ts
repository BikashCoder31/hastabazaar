/** Snapshot proof only. Native review adapters still decide status, next party and permitted actions. */
export const sellerReviewSnapshotSql = `SELECT t.id,(SELECT fee_case.route FROM commission_terms_cases fee_case WHERE fee_case.id=t.source_id AND t.source_type='commission_terms') AS termsRoute,json_array(t.id,t.source_type,t.source_revision,t.revision,t.updated_at,
 CASE t.source_type
 WHEN 'seller_application' THEN (SELECT json_array(s.status,p.application_stage,s.user_id) FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=t.source_id)
 WHEN 'seller_document' THEN (SELECT json_array(d.status,d.review_request_id,s.user_id) FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id WHERE d.id=t.source_id)
 WHEN 'document_change' THEN (SELECT json_array(r.status,s.user_id) FROM seller_document_change_requests r JOIN seller_profiles s ON s.id=r.seller_id WHERE r.id=t.source_id)
 WHEN 'product_review' THEN (SELECT json_array(p.status,p.seller_id,(SELECT a.id FROM audit_logs a WHERE a.subject_type='product' AND a.subject_id=p.id AND a.action IN('product.submitted','product.resubmitted') ORDER BY a.created_at DESC,a.id DESC LIMIT 1)) FROM products p WHERE p.id=t.source_id)
 WHEN 'protected_change' THEN (SELECT json_array(c.status,c.version,c.active_permission_id,s.user_id) FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=t.source_id)
 WHEN 'public_profile' THEN (SELECT json_array(c.id,c.status,c.version,s.user_id) FROM seller_public_profile_revisions c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.case_id=t.source_id ORDER BY c.sequence DESC LIMIT 1)
 WHEN 'public_profile_correction' THEN (SELECT json_array(c.status,c.version,s.user_id) FROM seller_public_profile_corrections c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=t.source_id)
 WHEN 'commission_terms' THEN (SELECT json_array(c.revision,c.state,s.user_id) FROM commission_terms_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=t.source_id)
 WHEN 'product_priority' THEN (SELECT json_array(c.state,c.revision,p.seller_id) FROM product_priority_cases c JOIN products p ON p.id=c.product_id WHERE c.id=t.source_id)
 ELSE (SELECT json_array(c.state,c.revision,d.owner_id) FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id WHERE c.id=t.source_id) END) AS stamp
 FROM review_tasks t JOIN users actor ON actor.id=? WHERE
 (t.source_type='seller_application' AND EXISTS(SELECT 1 FROM seller_profiles s WHERE s.id=t.source_id AND s.user_id=actor.id))
 OR (t.source_type='seller_document' AND EXISTS(SELECT 1 FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id WHERE d.id=t.source_id AND s.user_id=actor.id))
 OR (t.source_type='document_change' AND EXISTS(SELECT 1 FROM seller_document_change_requests r JOIN seller_profiles s ON s.id=r.seller_id WHERE r.id=t.source_id AND s.user_id=actor.id))
 OR (t.source_type='product_review' AND EXISTS(SELECT 1 FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=t.source_id AND s.user_id=actor.id))
 OR (t.source_type='protected_change' AND EXISTS(SELECT 1 FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=t.source_id AND s.user_id=actor.id))
 OR (t.source_type='public_profile' AND EXISTS(SELECT 1 FROM seller_public_profile_revisions c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.case_id=t.source_id AND s.user_id=actor.id))
 OR (t.source_type='public_profile_correction' AND EXISTS(SELECT 1 FROM seller_public_profile_corrections c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=t.source_id AND s.user_id=actor.id))
 OR (t.source_type='commission_terms' AND EXISTS(SELECT 1 FROM commission_terms_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=t.source_id AND s.user_id=actor.id))
 OR (t.source_type='product_priority' AND EXISTS(SELECT 1 FROM product_priority_cases c JOIN products p ON p.id=c.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE c.id=t.source_id AND s.user_id=actor.id))
 OR (t.source_type IN('product_intake_help','product_intake_review') AND EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id WHERE c.id=t.source_id AND d.owner_id=actor.id))`;
