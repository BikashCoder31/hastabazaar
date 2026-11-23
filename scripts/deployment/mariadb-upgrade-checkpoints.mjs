// Run immediately after the corresponding companion, with writers still paused.
// Each query reports a single count of mismatches and only reads the copy.
export const convergenceColumns = {
  orders: ['cancellation_version', 'delivery_rate_snapshot_json'],
  return_requests: ['original_seal_intact', 'recorded_at', 'intake_channel', 'intake_recorded_by',
    'received_evidence_reference', 'delivered_at_snapshot'],
  notification_messages: ['source_event_id', 'source_revision', 'delivery_transport', 'business_event_key',
    'required_permission', 'delivery_attempts', 'delivery_next_attempt_at', 'delivery_lease_until',
    'delivery_claim_token', 'guest_email', 'guest_order_id'],
};

export const upgradeCheckpoints = {
  63: `SELECT (SELECT COUNT(*) FROM seller_profiles s LEFT JOIN seller_protected_revisions r ON r.seller_id=s.id
    WHERE r.seller_id IS NULL OR r.identity_revision<>0 OR r.bank_revision<>0) + (SELECT COUNT(*) FROM seller_protected_revisions r
    LEFT JOIN seller_profiles s ON s.id=r.seller_id WHERE s.id IS NULL);`,
  64: `SELECT COUNT(*) FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id
    LEFT JOIN seller_public_profile_states r ON r.seller_id=s.id
    WHERE r.seller_id IS NULL OR r.provenance<>'legacy_baseline'
    OR NOT (BINARY r.display_name <=> BINARY COALESCE(p.public_name,s.trading_name))
    OR NOT (BINARY r.public_city <=> BINARY COALESCE(p.public_city,s.municipality))
    OR NOT (BINARY r.about <=> BINARY COALESCE(s.business_description,''));`,
  65: `SELECT (SELECT COUNT(*) FROM review_tasks WHERE source_type='public_profile_correction' AND has_deadline<>0)
    + (SELECT COUNT(*) FROM seller_profiles s LEFT JOIN review_tasks r ON r.source_type='seller_application'
       AND r.source_id=s.id AND r.source_revision=s.id WHERE r.id IS NULL)
    + (SELECT COUNT(*) FROM seller_documents d LEFT JOIN review_tasks r ON r.source_type='seller_document'
       AND r.source_id=d.id AND r.source_revision=d.id WHERE r.id IS NULL AND d.protected_change_id IS NULL
       AND d.kind IN ('representative_identity','pan_certificate'));`,
  66: `SELECT (SELECT COUNT(*) FROM company_payment_account_current)<>1 OR NOT EXISTS
    (SELECT 1 FROM company_payment_account_current WHERE currency='NPR' AND version_id IS NULL
     AND revision=0 AND updated_at=0);`,
  69: `SELECT (SELECT COUNT(*) FROM commission_terms_scan_state)<>1 OR NOT EXISTS
    (SELECT 1 FROM commission_terms_scan_state WHERE id='default' AND \`cursor\`='' AND revision=0);`,
  82: `SELECT (SELECT COUNT(*) FROM return_requests r LEFT JOIN return_handling h ON h.case_id=r.id
      LEFT JOIN review_tasks t ON t.source_type='return_request' AND t.source_id=r.id AND t.source_revision=r.id
      WHERE h.case_id IS NULL OR t.id IS NULL OR h.first_received_at<>r.requested_at
        OR h.first_due_at<>r.requested_at+86400000 OR NOT (h.first_action_at <=>
          (SELECT MIN(created_at) FROM return_request_events WHERE return_request_id=r.id
            AND action IN ('admin_approve','admin_reject','admin_request_changes'))))
    + (SELECT COUNT(*) FROM complaints c LEFT JOIN review_tasks t ON t.source_type='complaint'
      AND t.source_id=c.id AND t.source_revision=c.id WHERE t.id IS NULL OR c.first_due_at IS NULL
        OR c.first_due_at<>c.created_at+86400000 OR NOT (c.first_action_at <=>
          (SELECT MIN(created_at) FROM complaint_events WHERE complaint_id=c.id AND action IN
            ('admin_investigate','admin_request_customer','admin_escalate','admin_resolve','admin_close','admin_reopen'))));`,
  93: `SELECT (SELECT COUNT(*) FROM outgoing_payment_packets WHERE state='paid' AND amount_paisa>0)
    - (SELECT COUNT(*) FROM outgoing_payment_packets p JOIN company_outgoing_bank_identities i
      ON i.packet_kind='refund' AND i.packet_id=p.id WHERE p.state='paid' AND p.amount_paisa>0
      AND i.amount_paisa=p.amount_paisa AND i.identity_hash=p.transaction_identity_hash
      AND i.account_version_id=p.account_version_id AND i.transaction_identity=p.transaction_identity
      AND i.bank_at=p.bank_at AND i.recorded_at=p.recorded_at)
    + (SELECT COUNT(*) FROM company_outgoing_bank_identities i LEFT JOIN outgoing_payment_packets p
      ON i.packet_id=p.id AND p.state='paid' AND p.amount_paisa>0 WHERE p.id IS NULL OR i.packet_kind<>'refund');`,
  115: `SELECT (SELECT COUNT(*) FROM operation_transaction_guards WHERE id='recovery-history-0136-capacity')
    + (SELECT COUNT(*) FROM (SELECT kind,payout_id,scope_id,MAX(native_deduction_paisa) AS principal,
        SUM(amount_paisa) AS used FROM seller_recovery_historical_attributions GROUP BY kind,payout_id,scope_id) a
      LEFT JOIN seller_recovery_historical_pools p USING (kind,payout_id,scope_id)
      WHERE p.kind IS NULL OR p.principal_paisa<>a.principal OR p.used_paisa<>a.used OR p.used_paisa>p.principal_paisa)
    + (SELECT COUNT(*) FROM seller_recovery_historical_pools p WHERE NOT EXISTS
      (SELECT 1 FROM seller_recovery_historical_attributions a WHERE a.kind=p.kind
        AND a.payout_id=p.payout_id AND a.scope_id=p.scope_id));`,
  117: `SELECT (SELECT COUNT(*) FROM (SELECT c.payout_model,u.seller_id,u.scope_id,SUM(u.amount_paisa) AS used
        FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id
        GROUP BY c.payout_model,u.seller_id,u.scope_id) a
      LEFT JOIN seller_recovery_original_unpaid_pools p USING (payout_model,seller_id,scope_id)
      WHERE p.scope_id IS NULL OR p.used_paisa<>a.used)
    + (SELECT COUNT(*) FROM seller_recovery_original_unpaid_pools p WHERE NOT EXISTS
      (SELECT 1 FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id
        WHERE c.payout_model=p.payout_model AND u.seller_id=p.seller_id AND u.scope_id=p.scope_id));`,
};
