-- Source only. Never apply to canonical data to pass startup.
CREATE TABLE receipt_return_bank_losses(
 id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES seller_recovery_receipt_reversal_reviews(id),reversal_id TEXT NOT NULL REFERENCES company_receipt_reversals(id),receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),receipt_use_id TEXT NOT NULL REFERENCES manual_receipt_uses(id),use_revision INTEGER NOT NULL,packet_id TEXT NOT NULL REFERENCES outgoing_payment_packets(id),obligation_id TEXT NOT NULL REFERENCES refund_obligations(id),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(review_id,receipt_use_id)
);
--> statement-breakpoint
CREATE TABLE receipt_return_bank_loss_pools(receipt_use_id TEXT PRIMARY KEY REFERENCES manual_receipt_uses(id),used_paisa INTEGER NOT NULL CHECK(used_paisa>0 AND used_paisa<=9007199254740991));
--> statement-breakpoint
CREATE VIEW manual_receipt_bank_backing AS SELECT used.id receipt_use_id,used.amount_minor-COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss JOIN seller_recovery_receipt_reversal_reviews review ON review.id=loss.review_id WHERE loss.receipt_use_id=used.id AND review.state='completed'),0) amount_paisa FROM manual_receipt_uses used;
--> statement-breakpoint
DROP TRIGGER manual_receipt_use_cap;
--> statement-breakpoint
DROP TRIGGER recovery_receipt_cap;
--> statement-breakpoint
DROP TRIGGER manual_receipt_recovery_cap;
--> statement-breakpoint
DROP TRIGGER recovery_receipt_review_completion;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_loss_source BEFORE INSERT ON receipt_return_bank_losses
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN company_receipt_reversals reversal ON reversal.id=review.reversal_id JOIN company_money_receipts receipt ON receipt.id=review.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id JOIN manual_receipt_uses used ON used.id=NEW.receipt_use_id JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN outgoing_payment_packets packet ON packet.id=NEW.packet_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE review.id=NEW.review_id AND review.state='planned' AND review.reversal_id=NEW.reversal_id AND reversal.receipt_id=NEW.receipt_id AND receipt.id=NEW.receipt_id AND review.actor_id=NEW.actor_id AND review.request_id=NEW.request_id AND control.revision=review.receipt_revision+1 AND actor.status='active' AND receipt.kind='bank_credit' AND receipt.currency='NPR' AND used.revision=NEW.use_revision AND json_extract(review.plan_json,'$.companyLossApproved')=1 AND EXISTS(SELECT 1 FROM json_each(review.plan_json,'$.returnLosses') planned WHERE json_extract(planned.value,'$.id')=NEW.id AND json_extract(planned.value,'$.receiptUseId')=NEW.receipt_use_id AND json_extract(planned.value,'$.useRevision')=NEW.use_revision AND json_extract(planned.value,'$.packetId')=NEW.packet_id AND json_extract(planned.value,'$.amountPaisa')=NEW.amount_paisa AND json_extract(planned.value,'$.obligationId')=NEW.obligation_id))
BEGIN SELECT RAISE(ABORT,'completed_original_payer_return_loss_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_loss_paid_proof BEFORE INSERT ON receipt_return_bank_losses
WHEN NOT EXISTS(SELECT 1 FROM manual_receipt_uses used JOIN company_money_receipts receipt ON receipt.id=used.receipt_id JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN outgoing_payment_packets packet ON packet.id=NEW.packet_id WHERE used.id=NEW.receipt_use_id AND receipt.id=NEW.receipt_id AND used.kind='return' AND used.state='returned' AND used.receipt_id=receipt.id AND original.id=used.target_id AND original.receipt_use_id=used.id AND original.source_kind='receipt_return' AND original.source_id=receipt.id AND original.receipt_id=receipt.id AND original.customer_id=receipt.payer_user_id AND original.currency='NPR' AND original.wallet_paisa=0 AND original.cash_paisa=used.amount_minor AND original.state='completed' AND packet.obligation_id=original.id AND packet.state='paid' AND packet.currency='NPR' AND packet.amount_paisa=COALESCE((SELECT backing.amount_paisa FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=used.id),0)+COALESCE((SELECT SUM(prior_loss.amount_paisa) FROM receipt_return_bank_losses prior_loss JOIN seller_recovery_receipt_reversal_reviews prior_review ON prior_review.id=prior_loss.review_id WHERE prior_loss.receipt_use_id=used.id AND prior_review.state='completed'),0) AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa AND bank.account_version_id=packet.account_version_id AND bank.identity_hash=packet.transaction_identity_hash AND bank.bank_at=packet.bank_at) AND EXISTS(SELECT 1 FROM refund_destination_versions destination WHERE destination.id=packet.destination_version_id AND destination.obligation_id=original.id AND destination.status='verified' AND destination.relationship IN('own_account','original_payer')))
BEGIN SELECT RAISE(ABORT,'completed_original_payer_return_loss_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_loss_interest BEFORE INSERT ON receipt_return_bank_losses
WHEN NOT EXISTS(SELECT 1 FROM company_money_receipts receipt JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN outgoing_payment_packets packet ON packet.id=NEW.packet_id WHERE receipt.id=NEW.receipt_id AND NEW.actor_id<>original.customer_id AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=NEW.actor_id) AND NOT EXISTS(SELECT 1 FROM company_payment_account_versions account WHERE account.id IN(receipt.account_version_id,packet.account_version_id) AND EXISTS(SELECT 1 FROM json_each(account.conflicts_json) response_scope WHERE response_scope.value=NEW.actor_id)) AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id WHERE (EXISTS(SELECT 1 FROM seller_recovery_allocations allocation WHERE allocation.receipt_id=receipt.id AND allocation.case_id=c.id) OR EXISTS(SELECT 1 FROM customer_refund_reversals returned JOIN refund_obligations paid ON paid.id=returned.obligation_id WHERE returned.receipt_id=receipt.id AND paid.source_kind='return_refund' AND paid.source_id=c.refund_id)) AND (seller.user_id=NEW.actor_id OR json_extract(c.original_source_json,'$.ownerId')=NEW.actor_id OR json_extract(c.original_source_json,'$.customerId')=NEW.actor_id OR EXISTS(SELECT 1 FROM refunds linked_refund JOIN orders linked_order ON linked_order.id=linked_refund.order_id WHERE linked_refund.id=c.refund_id AND linked_order.customer_id=NEW.actor_id))))
BEGIN SELECT RAISE(ABORT,'receipt_return_bank_loss_personal_interest'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_loss_backing BEFORE INSERT ON receipt_return_bank_losses
WHEN NOT EXISTS(SELECT 1 FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=NEW.receipt_use_id AND backing.amount_paisa>=NEW.amount_paisa)
BEGIN SELECT RAISE(ABORT,'receipt_return_actual_completed_loss_cap_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_loss_update BEFORE UPDATE ON receipt_return_bank_losses
WHEN 1
BEGIN SELECT RAISE(ABORT,'receipt_return_bank_loss_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_bank_loss_delete BEFORE DELETE ON receipt_return_bank_losses
WHEN 1
BEGIN SELECT RAISE(ABORT,'receipt_return_bank_loss_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_loss_pool_insert BEFORE INSERT ON receipt_return_bank_loss_pools
WHEN NOT EXISTS(SELECT 1 FROM receipt_return_bank_loss_pools existing WHERE existing.receipt_use_id=NEW.receipt_use_id) AND (NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.id=NEW.receipt_use_id AND used.kind='return' AND used.state='returned' AND EXISTS(SELECT 1 FROM outgoing_payment_packets paid WHERE paid.obligation_id=used.target_id AND paid.state='paid' AND NEW.used_paisa<=paid.amount_paisa)) OR NEW.used_paisa<>COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss WHERE loss.receipt_use_id=NEW.receipt_use_id),0))
BEGIN SELECT RAISE(ABORT,'receipt_return_actual_completed_loss_cap_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_loss_pool_update BEFORE UPDATE ON receipt_return_bank_loss_pools
WHEN NEW.receipt_use_id<>OLD.receipt_use_id OR (NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.id=NEW.receipt_use_id AND used.kind='return' AND used.state='returned' AND EXISTS(SELECT 1 FROM outgoing_payment_packets paid WHERE paid.obligation_id=used.target_id AND paid.state='paid' AND NEW.used_paisa<=paid.amount_paisa)) OR NEW.used_paisa<>COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss WHERE loss.receipt_use_id=NEW.receipt_use_id),0))
BEGIN SELECT RAISE(ABORT,'receipt_return_actual_completed_loss_cap_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_loss_pool_delete BEFORE DELETE ON receipt_return_bank_loss_pools
WHEN 1
BEGIN SELECT RAISE(ABORT,'receipt_return_loss_pool_retained'); END;
--> statement-breakpoint
CREATE TRIGGER manual_receipt_use_cap BEFORE INSERT ON manual_receipt_uses
WHEN NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id AND r.status='verified' AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved') AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)-COALESCE((SELECT SUM(COALESCE((SELECT backing.amount_paisa FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=u.id),0)) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0))
BEGIN SELECT RAISE(ABORT,'manual_receipt_balance_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_cap BEFORE INSERT ON seller_recovery_allocations
WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND r.status='verified' AND r.currency='NPR'
 AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved')
 AND NEW.amount_paisa<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(COALESCE((SELECT backing.amount_paisa FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=u.id),0)) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_balance_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER manual_receipt_recovery_cap BEFORE INSERT ON manual_receipt_uses
WHEN NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(COALESCE((SELECT backing.amount_paisa FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=u.id),0)) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))
BEGIN SELECT RAISE(ABORT,'manual_receipt_recovery_balance_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_review_completion BEFORE UPDATE ON seller_recovery_receipt_reversal_reviews
WHEN OLD.state<>'planned' OR NEW.state<>'completed' OR NEW.completed_at IS NULL OR NEW.id<>OLD.id OR NEW.reversal_id<>OLD.reversal_id OR NEW.receipt_id<>OLD.receipt_id OR NEW.receipt_revision<>OLD.receipt_revision OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.unallocated_paisa<>OLD.unallocated_paisa OR NEW.source_json<>OLD.source_json OR NEW.plan_json<>OLD.plan_json OR NEW.actor_id<>OLD.actor_id OR NEW.request_id<>OLD.request_id OR NEW.created_at<>OLD.created_at OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.reason<>OLD.reason OR NEW.public_message<>OLD.public_message
 OR NOT EXISTS(SELECT 1 FROM company_receipt_controls control JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE control.receipt_id=NEW.receipt_id AND control.revision=NEW.receipt_revision+1 AND actor.status='active')
 OR NEW.amount_paisa<>NEW.unallocated_paisa+COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss WHERE loss.review_id=NEW.id),0)+COALESCE((SELECT SUM(part.amount_paisa) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id),0)
 OR (SELECT COUNT(*) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id)<>json_array_length(NEW.plan_json,'$.parts')
 OR EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id AND part.company_loss_paisa<>COALESCE((SELECT SUM(reclass.amount_paisa) FROM seller_recovery_restoration_reclassifications reclass WHERE reclass.part_id=part.id),0))
 OR (SELECT COUNT(*) FROM receipt_return_bank_losses loss WHERE loss.review_id=NEW.id)<>COALESCE(json_array_length(NEW.plan_json,'$.returnLosses'),0)
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_complete_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER receipt_return_loss_pool_consume AFTER INSERT ON receipt_return_bank_losses BEGIN INSERT INTO receipt_return_bank_loss_pools(receipt_use_id,used_paisa) VALUES(NEW.receipt_use_id,NEW.amount_paisa) ON CONFLICT(receipt_use_id) DO UPDATE SET used_paisa=used_paisa+NEW.amount_paisa; END;
