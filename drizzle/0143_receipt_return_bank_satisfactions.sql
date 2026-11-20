-- Additive source only. Never apply to canonical data merely to pass startup.
CREATE TABLE receipt_return_bank_satisfactions(
 id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES seller_recovery_receipt_reversal_reviews(id),reversal_id TEXT NOT NULL REFERENCES company_receipt_reversals(id),receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),
 receipt_use_id TEXT NOT NULL REFERENCES manual_receipt_uses(id),use_revision INTEGER NOT NULL,obligation_id TEXT NOT NULL REFERENCES refund_obligations(id),obligation_revision INTEGER NOT NULL,customer_id TEXT NOT NULL REFERENCES users(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),original_payer_returned_confirmed INTEGER NOT NULL CHECK(original_payer_returned_confirmed=1),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(review_id,receipt_use_id)
);
--> statement-breakpoint
CREATE TABLE receipt_return_bank_satisfaction_pools(receipt_use_id TEXT PRIMARY KEY REFERENCES manual_receipt_uses(id),used_paisa INTEGER NOT NULL CHECK(used_paisa>0 AND used_paisa<=9007199254740991));
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_satisfaction_source BEFORE INSERT ON receipt_return_bank_satisfactions
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN company_receipt_reversals reversal ON reversal.id=review.reversal_id JOIN company_money_receipts receipt ON receipt.id=review.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id JOIN manual_receipt_uses used ON used.id=NEW.receipt_use_id JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE review.id=NEW.review_id AND review.state='planned' AND review.reversal_id=NEW.reversal_id AND reversal.receipt_id=NEW.receipt_id AND receipt.id=NEW.receipt_id AND review.actor_id=NEW.actor_id AND review.request_id=NEW.request_id AND control.revision=review.receipt_revision+1 AND actor.status='active' AND receipt.kind='bank_credit' AND receipt.currency='NPR'
 AND EXISTS(SELECT 1 FROM json_each(review.plan_json,'$.returnSatisfactions') planned WHERE json_extract(planned.value,'$.id')=NEW.id AND json_extract(planned.value,'$.receiptUseId')=NEW.receipt_use_id AND json_extract(planned.value,'$.useRevision')=NEW.use_revision AND json_extract(planned.value,'$.obligationId')=NEW.obligation_id AND json_extract(planned.value,'$.obligationRevision')=NEW.obligation_revision AND json_extract(planned.value,'$.customerId')=NEW.customer_id AND json_extract(planned.value,'$.amountPaisa')=NEW.amount_paisa AND json_extract(planned.value,'$.originalPayerReturnedConfirmed')=1))
BEGIN SELECT RAISE(ABORT,'never_paid_original_payer_bank_return_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_satisfaction_original BEFORE INSERT ON receipt_return_bank_satisfactions
WHEN NOT EXISTS(SELECT 1 FROM manual_receipt_uses used JOIN company_money_receipts receipt ON receipt.id=used.receipt_id JOIN refund_obligations original ON original.id=NEW.obligation_id WHERE used.id=NEW.receipt_use_id AND receipt.id=NEW.receipt_id AND used.revision=NEW.use_revision AND original.revision=NEW.obligation_revision AND used.kind='return' AND used.state='reserved' AND used.receipt_id=receipt.id AND original.id=used.target_id AND original.receipt_use_id=used.id AND original.source_kind='receipt_return' AND original.source_id=receipt.id AND original.receipt_id=receipt.id AND original.customer_id=receipt.payer_user_id AND original.customer_id=NEW.customer_id AND original.currency='NPR' AND original.wallet_paisa=0 AND original.cash_paisa=used.amount_minor AND original.state IN('open','blocked'))
BEGIN SELECT RAISE(ABORT,'never_paid_original_payer_bank_return_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_satisfaction_interest BEFORE INSERT ON receipt_return_bank_satisfactions
WHEN NOT EXISTS(SELECT 1 FROM company_money_receipts receipt JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN users actor ON actor.id=NEW.actor_id WHERE receipt.id=NEW.receipt_id AND actor.id<>original.customer_id AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_payment_account_versions account WHERE (account.id=receipt.account_version_id OR EXISTS(SELECT 1 FROM outgoing_payment_packets prior WHERE prior.obligation_id=original.id AND prior.account_version_id=account.id)) AND EXISTS(SELECT 1 FROM json_each(account.conflicts_json) response_scope WHERE response_scope.value=actor.id))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id WHERE (EXISTS(SELECT 1 FROM seller_recovery_allocations allocation WHERE allocation.receipt_id=receipt.id AND allocation.case_id=c.id) OR EXISTS(SELECT 1 FROM customer_refund_reversals returned JOIN refund_obligations paid ON paid.id=returned.obligation_id WHERE returned.receipt_id=receipt.id AND paid.source_kind='return_refund' AND paid.source_id=c.refund_id)) AND (seller.user_id=actor.id OR json_extract(c.original_source_json,'$.ownerId')=actor.id OR json_extract(c.original_source_json,'$.customerId')=actor.id OR EXISTS(SELECT 1 FROM refunds linked_refund JOIN orders linked_order ON linked_order.id=linked_refund.order_id WHERE linked_refund.id=c.refund_id AND linked_order.customer_id=actor.id))))
BEGIN SELECT RAISE(ABORT,'never_paid_original_payer_bank_return_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_satisfaction_nonpayment BEFORE INSERT ON receipt_return_bank_satisfactions
WHEN NOT EXISTS(SELECT 1 FROM refund_obligations original WHERE original.id=NEW.obligation_id AND NOT EXISTS(SELECT 1 FROM outgoing_payment_packets attempt WHERE attempt.obligation_id=original.id AND NOT (attempt.state='void' AND attempt.started_at IS NULL AND attempt.evidence_reference IS NOT NULL OR attempt.state='failed' AND attempt.evidence_reference IS NOT NULL AND EXISTS(SELECT 1 FROM refund_obligation_events outcome WHERE outcome.obligation_id=original.id AND outcome.action='packet_failed' AND json_extract(outcome.private_details_json,'$.packetId')=attempt.id AND json_extract(outcome.private_details_json,'$.failureBasis') IN('not_sent','no_debit','debit_returned'))))
 AND NOT EXISTS(SELECT 1 FROM outgoing_payment_packets attempt JOIN company_outgoing_bank_identities bank ON bank.packet_kind='refund' AND bank.packet_id=attempt.id WHERE attempt.obligation_id=original.id))
BEGIN SELECT RAISE(ABORT,'never_paid_original_payer_bank_return_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_satisfaction_cap BEFORE INSERT ON receipt_return_bank_satisfactions
WHEN NOT EXISTS(SELECT 1 FROM manual_receipt_uses used JOIN company_receipt_reversals reversal ON reversal.id=NEW.reversal_id WHERE used.id=NEW.receipt_use_id AND NEW.amount_paisa<=reversal.amount_minor AND NEW.amount_paisa<=used.amount_minor-COALESCE((SELECT used_paisa FROM receipt_return_bank_satisfaction_pools pool WHERE pool.receipt_use_id=used.id),0)-COALESCE((SELECT used_paisa FROM receipt_return_bank_loss_pools pool WHERE pool.receipt_use_id=used.id),0))
BEGIN SELECT RAISE(ABORT,'never_paid_original_payer_bank_return_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_satisfaction_update BEFORE UPDATE ON receipt_return_bank_satisfactions BEGIN SELECT RAISE(ABORT,'receipt_return_bank_satisfaction_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_satisfaction_delete BEFORE DELETE ON receipt_return_bank_satisfactions BEGIN SELECT RAISE(ABORT,'receipt_return_bank_satisfaction_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_satisfaction_pool_insert BEFORE INSERT ON receipt_return_bank_satisfaction_pools
WHEN NOT EXISTS(SELECT 1 FROM receipt_return_bank_satisfaction_pools existing WHERE existing.receipt_use_id=NEW.receipt_use_id) AND (NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.id=NEW.receipt_use_id AND used.kind='return' AND used.state='reserved' AND NEW.used_paisa<=used.amount_minor) OR NEW.used_paisa<>COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied WHERE satisfied.receipt_use_id=NEW.receipt_use_id),0))
BEGIN SELECT RAISE(ABORT,'receipt_return_bank_satisfaction_cap_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_satisfaction_pool_update BEFORE UPDATE ON receipt_return_bank_satisfaction_pools
WHEN NEW.receipt_use_id<>OLD.receipt_use_id OR NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.id=NEW.receipt_use_id AND used.kind='return' AND used.state='reserved' AND NEW.used_paisa<=used.amount_minor) OR NEW.used_paisa<>COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied WHERE satisfied.receipt_use_id=NEW.receipt_use_id),0)
BEGIN SELECT RAISE(ABORT,'receipt_return_bank_satisfaction_cap_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_satisfaction_pool_delete BEFORE DELETE ON receipt_return_bank_satisfaction_pools BEGIN SELECT RAISE(ABORT,'receipt_return_bank_satisfaction_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_satisfaction_pool_consume AFTER INSERT ON receipt_return_bank_satisfactions BEGIN INSERT INTO receipt_return_bank_satisfaction_pools(receipt_use_id,used_paisa) VALUES(NEW.receipt_use_id,NEW.amount_paisa) ON CONFLICT(receipt_use_id) DO UPDATE SET used_paisa=used_paisa+NEW.amount_paisa; END;
--> statement-breakpoint
DROP VIEW manual_receipt_bank_backing;
--> statement-breakpoint
CREATE VIEW manual_receipt_bank_backing AS SELECT used.id receipt_use_id,used.amount_minor-COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss JOIN seller_recovery_receipt_reversal_reviews reviewed ON reviewed.id=loss.review_id WHERE loss.receipt_use_id=used.id AND reviewed.state='completed'),0)-COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied JOIN seller_recovery_receipt_reversal_reviews reviewed ON reviewed.id=satisfied.review_id WHERE satisfied.receipt_use_id=used.id AND reviewed.state='completed'),0) amount_paisa FROM manual_receipt_uses used;
--> statement-breakpoint
CREATE TRIGGER receipt_return_remaining_packet_insert BEFORE INSERT ON outgoing_payment_packets
WHEN EXISTS(SELECT 1 FROM refund_obligations original WHERE original.id=NEW.obligation_id AND original.source_kind='receipt_return' AND (original.state<>'open' OR NEW.amount_paisa<>original.cash_paisa-COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied JOIN seller_recovery_receipt_reversal_reviews reviewed ON reviewed.id=satisfied.review_id WHERE satisfied.obligation_id=original.id AND reviewed.state='completed'),0)))
BEGIN SELECT RAISE(ABORT,'receipt_return_remaining_cash_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_remaining_packet_update BEFORE UPDATE ON outgoing_payment_packets
WHEN NEW.state IN('approved','processing','paid') AND EXISTS(SELECT 1 FROM refund_obligations original WHERE original.id=NEW.obligation_id AND original.source_kind='receipt_return' AND NEW.amount_paisa<>original.cash_paisa-COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied JOIN seller_recovery_receipt_reversal_reviews reviewed ON reviewed.id=satisfied.review_id WHERE satisfied.obligation_id=original.id AND reviewed.state='completed'),0))
BEGIN SELECT RAISE(ABORT,'receipt_return_remaining_cash_required'); END;

--> statement-breakpoint
DROP TRIGGER recovery_receipt_review_completion;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_review_completion BEFORE UPDATE ON seller_recovery_receipt_reversal_reviews
WHEN OLD.state<>'planned' OR NEW.state<>'completed' OR NEW.completed_at IS NULL OR NEW.id<>OLD.id OR NEW.reversal_id<>OLD.reversal_id OR NEW.receipt_id<>OLD.receipt_id OR NEW.receipt_revision<>OLD.receipt_revision OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.unallocated_paisa<>OLD.unallocated_paisa OR NEW.source_json<>OLD.source_json OR NEW.plan_json<>OLD.plan_json OR NEW.actor_id<>OLD.actor_id OR NEW.request_id<>OLD.request_id OR NEW.created_at<>OLD.created_at OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.reason<>OLD.reason OR NEW.public_message<>OLD.public_message
 OR NOT EXISTS(SELECT 1 FROM company_receipt_controls control JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE control.receipt_id=NEW.receipt_id AND control.revision=NEW.receipt_revision+1 AND actor.status='active')
 OR NEW.amount_paisa<>NEW.unallocated_paisa+COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied WHERE satisfied.review_id=NEW.id),0)+COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss WHERE loss.review_id=NEW.id),0)+COALESCE((SELECT SUM(part.amount_paisa) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id),0)
 OR (SELECT COUNT(*) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id)<>json_array_length(NEW.plan_json,'$.parts')
 OR EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id AND part.company_loss_paisa<>COALESCE((SELECT SUM(reclass.amount_paisa) FROM seller_recovery_restoration_reclassifications reclass WHERE reclass.part_id=part.id),0))
 OR (SELECT COUNT(*) FROM receipt_return_bank_losses loss WHERE loss.review_id=NEW.id)<>COALESCE(json_array_length(NEW.plan_json,'$.returnLosses'),0)
 OR (SELECT COUNT(*) FROM receipt_return_bank_satisfactions satisfied WHERE satisfied.review_id=NEW.id)<>COALESCE(json_array_length(NEW.plan_json,'$.returnSatisfactions'),0)
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_complete_projection_required'); END;
