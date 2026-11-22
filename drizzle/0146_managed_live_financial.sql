-- Source only. No canonical migration is authorized.
CREATE TABLE managed_live_financial_scopes (
 id TEXT PRIMARY KEY NOT NULL,company_entity_reference TEXT NOT NULL,company_scope_digest TEXT NOT NULL,
 issuer_model TEXT NOT NULL CHECK(issuer_model='company_commercial_invoice_v1'),issuer_scope_digest TEXT NOT NULL,
 issuer_snapshot_json TEXT NOT NULL CHECK(json_valid(issuer_snapshot_json)),series_prefix TEXT NOT NULL UNIQUE,
 series_version TEXT NOT NULL,opening_number INTEGER NOT NULL CHECK(opening_number>0),
 evidence_reference TEXT NOT NULL,reviewed_by TEXT NOT NULL REFERENCES users(id),reviewed_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,reason TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE managed_live_invoice_series (
 financial_scope_id TEXT PRIMARY KEY NOT NULL REFERENCES managed_live_financial_scopes(id),
 next_number INTEGER NOT NULL CHECK(next_number>0),revision INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE managed_live_invoice_numbers (
 id TEXT PRIMARY KEY NOT NULL,financial_scope_id TEXT NOT NULL REFERENCES managed_live_financial_scopes(id),
 invoice_group_id TEXT REFERENCES managed_invoice_groups(id),adjustment_id TEXT REFERENCES managed_invoice_adjustments(id),
 sequence INTEGER NOT NULL CHECK(sequence>0),invoice_number TEXT NOT NULL UNIQUE,
 request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,
 CHECK((invoice_group_id IS NULL)<>(adjustment_id IS NULL)),UNIQUE(financial_scope_id,sequence),UNIQUE(invoice_group_id),UNIQUE(adjustment_id)
);
--> statement-breakpoint
CREATE TABLE managed_live_invoice_adjustment_sources (
 adjustment_id TEXT PRIMARY KEY NOT NULL REFERENCES managed_invoice_adjustments(id),invoice_group_id TEXT NOT NULL REFERENCES managed_invoice_groups(id),
 source_kind TEXT NOT NULL CHECK(source_kind IN('refund','cancellation')),source_id TEXT NOT NULL,
 UNIQUE(invoice_group_id,source_kind,source_id)
);
--> statement-breakpoint
DROP TRIGGER managed_snapshot_no_update;
--> statement-breakpoint
ALTER TABLE managed_commercial_snapshots ADD COLUMN __retained_simulation_label TEXT;
--> statement-breakpoint
UPDATE managed_commercial_snapshots SET __retained_simulation_label=simulation_label;
--> statement-breakpoint
ALTER TABLE managed_commercial_snapshots DROP COLUMN simulation_label;
--> statement-breakpoint
ALTER TABLE managed_commercial_snapshots ADD COLUMN simulation_label TEXT CHECK(simulation_label IS NULL OR length(trim(simulation_label))>0);
--> statement-breakpoint
UPDATE managed_commercial_snapshots SET simulation_label=__retained_simulation_label;
--> statement-breakpoint
ALTER TABLE managed_commercial_snapshots DROP COLUMN __retained_simulation_label;
--> statement-breakpoint
ALTER TABLE managed_commercial_snapshots ADD COLUMN record_kind TEXT NOT NULL DEFAULT 'simulation' CHECK(record_kind IN('simulation','live'));
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_snapshot_no_update BEFORE UPDATE ON managed_commercial_snapshots BEGIN SELECT RAISE(ABORT,'managed_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_commercial_snapshots_kind_insert BEFORE INSERT ON managed_commercial_snapshots WHEN (NEW.record_kind='simulation' AND NEW.simulation_label IS NULL) OR (NEW.record_kind='live' AND NEW.simulation_label IS NOT NULL) BEGIN SELECT RAISE(ABORT,'managed_live_explicit_provenance_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_commercial_snapshots_kind_update BEFORE UPDATE ON managed_commercial_snapshots WHEN NEW.record_kind<>OLD.record_kind OR NEW.simulation_label IS NOT OLD.simulation_label BEGIN SELECT RAISE(ABORT,'managed_live_original_kind_immutable'); END;
--> statement-breakpoint
DROP TRIGGER managed_payout_preserve_identity;
--> statement-breakpoint
ALTER TABLE managed_payouts ADD COLUMN __retained_simulation_label TEXT;
--> statement-breakpoint
UPDATE managed_payouts SET __retained_simulation_label=simulation_label;
--> statement-breakpoint
ALTER TABLE managed_payouts DROP COLUMN simulation_label;
--> statement-breakpoint
ALTER TABLE managed_payouts ADD COLUMN simulation_label TEXT CHECK(simulation_label IS NULL OR length(trim(simulation_label))>0);
--> statement-breakpoint
UPDATE managed_payouts SET simulation_label=__retained_simulation_label;
--> statement-breakpoint
ALTER TABLE managed_payouts DROP COLUMN __retained_simulation_label;
--> statement-breakpoint
ALTER TABLE managed_payouts ADD COLUMN record_kind TEXT NOT NULL DEFAULT 'simulation' CHECK(record_kind IN('simulation','live'));
--> statement-breakpoint
CREATE TRIGGER managed_payout_preserve_identity BEFORE UPDATE ON managed_payouts
WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.amount_paisa IS NOT OLD.amount_paisa
  OR NEW.destination_reference IS NOT OLD.destination_reference OR NEW.request_id IS NOT OLD.request_id
  OR NEW.prepared_by IS NOT OLD.prepared_by OR NEW.created_at IS NOT OLD.created_at
  OR NEW.scheduled_for IS NOT OLD.scheduled_for OR NEW.payout_number IS NOT OLD.payout_number
  OR NEW.simulation_label IS NOT OLD.simulation_label
BEGIN SELECT RAISE(ABORT,'Managed payment identity and amount are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_payouts_kind_insert BEFORE INSERT ON managed_payouts WHEN (NEW.record_kind='simulation' AND NEW.simulation_label IS NULL) OR (NEW.record_kind='live' AND NEW.simulation_label IS NOT NULL) BEGIN SELECT RAISE(ABORT,'managed_live_explicit_provenance_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_payouts_kind_update BEFORE UPDATE ON managed_payouts WHEN NEW.record_kind<>OLD.record_kind OR NEW.simulation_label IS NOT OLD.simulation_label BEGIN SELECT RAISE(ABORT,'managed_live_original_kind_immutable'); END;
--> statement-breakpoint
ALTER TABLE managed_invoice_groups ADD COLUMN __retained_simulation_label TEXT;
--> statement-breakpoint
UPDATE managed_invoice_groups SET __retained_simulation_label=simulation_label;
--> statement-breakpoint
ALTER TABLE managed_invoice_groups DROP COLUMN simulation_label;
--> statement-breakpoint
ALTER TABLE managed_invoice_groups ADD COLUMN simulation_label TEXT CHECK(simulation_label IS NULL OR length(trim(simulation_label))>0);
--> statement-breakpoint
UPDATE managed_invoice_groups SET simulation_label=__retained_simulation_label;
--> statement-breakpoint
ALTER TABLE managed_invoice_groups DROP COLUMN __retained_simulation_label;
--> statement-breakpoint
ALTER TABLE managed_invoice_groups ADD COLUMN record_kind TEXT NOT NULL DEFAULT 'simulation' CHECK(record_kind IN('simulation','live'));
--> statement-breakpoint
CREATE TRIGGER managed_invoice_groups_kind_insert BEFORE INSERT ON managed_invoice_groups WHEN (NEW.record_kind='simulation' AND NEW.simulation_label IS NULL) OR (NEW.record_kind='live' AND NEW.simulation_label IS NOT NULL) BEGIN SELECT RAISE(ABORT,'managed_live_explicit_provenance_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_invoice_groups_kind_update BEFORE UPDATE ON managed_invoice_groups WHEN NEW.record_kind<>OLD.record_kind OR NEW.simulation_label IS NOT OLD.simulation_label BEGIN SELECT RAISE(ABORT,'managed_live_original_kind_immutable'); END;
--> statement-breakpoint
DROP TRIGGER managed_invoice_adjustment_no_update;
--> statement-breakpoint
ALTER TABLE managed_invoice_adjustments ADD COLUMN __retained_simulation_label TEXT;
--> statement-breakpoint
UPDATE managed_invoice_adjustments SET __retained_simulation_label=simulation_label;
--> statement-breakpoint
ALTER TABLE managed_invoice_adjustments DROP COLUMN simulation_label;
--> statement-breakpoint
ALTER TABLE managed_invoice_adjustments ADD COLUMN simulation_label TEXT CHECK(simulation_label IS NULL OR length(trim(simulation_label))>0);
--> statement-breakpoint
UPDATE managed_invoice_adjustments SET simulation_label=__retained_simulation_label;
--> statement-breakpoint
ALTER TABLE managed_invoice_adjustments DROP COLUMN __retained_simulation_label;
--> statement-breakpoint
ALTER TABLE managed_invoice_adjustments ADD COLUMN record_kind TEXT NOT NULL DEFAULT 'simulation' CHECK(record_kind IN('simulation','live'));
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_invoice_adjustment_no_update BEFORE UPDATE ON managed_invoice_adjustments BEGIN SELECT RAISE(ABORT,'managed_invoice_adjustment_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_invoice_adjustments_kind_insert BEFORE INSERT ON managed_invoice_adjustments WHEN (NEW.record_kind='simulation' AND NEW.simulation_label IS NULL) OR (NEW.record_kind='live' AND NEW.simulation_label IS NOT NULL) BEGIN SELECT RAISE(ABORT,'managed_live_explicit_provenance_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_invoice_adjustments_kind_update BEFORE UPDATE ON managed_invoice_adjustments WHEN NEW.record_kind<>OLD.record_kind OR NEW.simulation_label IS NOT OLD.simulation_label BEGIN SELECT RAISE(ABORT,'managed_live_original_kind_immutable'); END;
--> statement-breakpoint
ALTER TABLE managed_commercial_snapshots ADD COLUMN live_activation_decision_id TEXT REFERENCES managed_live_activation_decisions(id);
--> statement-breakpoint
ALTER TABLE managed_commercial_snapshots ADD COLUMN live_clearance_id TEXT REFERENCES managed_live_clearances(id);
--> statement-breakpoint
ALTER TABLE managed_commercial_snapshots ADD COLUMN live_financial_scope_id TEXT REFERENCES managed_live_financial_scopes(id);
--> statement-breakpoint
ALTER TABLE managed_commercial_snapshots ADD COLUMN live_customer_id TEXT REFERENCES users(id);
--> statement-breakpoint
CREATE TRIGGER managed_live_snapshot_proof BEFORE INSERT ON managed_commercial_snapshots WHEN NEW.record_kind='live' AND (NEW.commercial_model<>'managed_sale_linked_percentage_v1' OR NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions d JOIN managed_live_clearances c ON c.id=d.clearance_id JOIN managed_live_financial_scopes f ON f.id=d.financial_scope_id WHERE d.id=NEW.live_activation_decision_id AND d.seller_id=NEW.seller_id AND d.clearance_id=NEW.live_clearance_id AND d.financial_scope_id=NEW.live_financial_scope_id AND d.model='managed_sale_linked_percentage_v1' AND d.revision=(SELECT MAX(latest.revision) FROM managed_live_activation_decisions latest WHERE latest.seller_id=d.seller_id) AND c.state='active' AND c.effective_from<=NEW.created_at AND (c.valid_until IS NULL OR c.valid_until>NEW.created_at) AND f.company_entity_reference=NEW.legal_seller_reference AND NEW.invoice_issuer_reference=f.company_entity_reference AND f.company_scope_digest=d.company_scope_digest AND f.issuer_scope_digest=d.issuer_scope_digest AND f.issuer_model=d.issuer_model AND c.financial_scope_id=f.id AND c.issuer_scope_digest=f.issuer_scope_digest)) BEGIN SELECT RAISE(ABORT,'managed_live_original_proof_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_simulation_no_live_proof BEFORE INSERT ON managed_commercial_snapshots WHEN NEW.record_kind='simulation' AND (NEW.live_activation_decision_id IS NOT NULL OR NEW.live_clearance_id IS NOT NULL OR NEW.live_financial_scope_id IS NOT NULL OR NEW.live_customer_id IS NOT NULL) BEGIN SELECT RAISE(ABORT,'managed_simulation_cannot_claim_live_proof'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_original_customer BEFORE INSERT ON managed_commercial_snapshots WHEN NEW.record_kind='live' AND (NEW.live_customer_id IS NULL OR NOT EXISTS(SELECT 1 FROM order_items item JOIN orders original_order ON original_order.id=item.order_id WHERE item.id=NEW.order_item_id AND original_order.customer_id=NEW.live_customer_id)) BEGIN SELECT RAISE(ABORT,'managed_live_exact_original_customer_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_original_accepted_terms BEFORE INSERT ON managed_commercial_snapshots WHEN NEW.record_kind='live' AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details t JOIN seller_profiles owner ON owner.id=t.seller_id JOIN managed_live_financial_scopes financial ON financial.id=NEW.live_financial_scope_id WHERE t.id=NEW.accepted_managed_detail_id AND t.seller_id=NEW.seller_id AND t.agreement_accepted_by=owner.user_id AND t.agreement_accepted_at<=NEW.created_at AND t.agreement_version=NEW.agreement_version AND json_extract(t.agreement_snapshot_json,'$.version')=NEW.agreement_version AND (t.agreement_language=NEW.agreement_language OR t.agreement_language IS NULL AND t.agreement_version='managed-supplier-maker-2026-10-20-v2' AND NEW.agreement_language='en') AND json_extract(t.agreement_snapshot_json,'$.company.legalName')=NEW.company_legal_name_snapshot AND json_extract(financial.issuer_snapshot_json,'$.legalName')=NEW.company_legal_name_snapshot AND json_extract(financial.issuer_snapshot_json,'$.taxRegistrationNumber')=json_extract(t.agreement_snapshot_json,'$.company.pan') AND json_extract(financial.issuer_snapshot_json,'$.address')=json_extract(t.agreement_snapshot_json,'$.company.registeredOffice') AND json_extract(t.agreement_snapshot_json,'$.commercialModel')=NEW.commercial_model AND json_extract(t.agreement_snapshot_json,'$.platformRetentionBps')=NEW.platform_retention_bps AND json_extract(t.agreement_snapshot_json,'$.companyAccount.entityReference')=NEW.legal_seller_reference AND COALESCE(json_extract(t.agreement_snapshot_json,'$.settingVersionIds.retention'),'')=COALESCE(NEW.terms_setting_version_id,'') AND COALESCE((SELECT current_rate.id FROM business_setting_versions current_rate WHERE current_rate.setting_key='managed_sale_linked_platform_retention_bps' AND current_rate.status='published' AND current_rate.effective_from<=NEW.created_at AND (current_rate.effective_until IS NULL OR current_rate.effective_until>NEW.created_at) ORDER BY current_rate.effective_from DESC,current_rate.version DESC LIMIT 1),'')=COALESCE(NEW.terms_setting_version_id,'')) BEGIN SELECT RAISE(ABORT,'managed_live_exact_accepted_terms_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_allocation_same_original_kind BEFORE INSERT ON managed_payout_allocations WHEN NOT EXISTS(SELECT 1 FROM managed_payouts p JOIN managed_entitlements e ON e.id=NEW.entitlement_id JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE p.id=NEW.payout_id AND p.seller_id=e.seller_id AND p.record_kind=s.record_kind) BEGIN SELECT RAISE(ABORT,'managed_payout_cannot_mix_simulation_live'); END;
--> statement-breakpoint
CREATE TRIGGER managed_no_live_legacy_links BEFORE INSERT ON managed_payout_entries WHEN EXISTS(SELECT 1 FROM managed_payouts p WHERE p.id=NEW.payout_id AND p.record_kind='live') OR EXISTS(SELECT 1 FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE x.id=NEW.settlement_entry_id AND s.record_kind='live') BEGIN SELECT RAISE(ABORT,'managed_live_requires_exact_allocations'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_payout_source_cap BEFORE INSERT ON managed_payouts WHEN NEW.record_kind='live' AND (NEW.amount_paisa>(COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE e.seller_id=NEW.seller_id AND s.record_kind='live' AND s.live_activation_decision_id IS NOT NULL AND s.live_clearance_id IS NOT NULL AND s.live_financial_scope_id IS NOT NULL),0)-COALESCE((SELECT SUM(p.amount_paisa) FROM managed_payouts p WHERE p.seller_id=NEW.seller_id AND p.record_kind='live' AND p.status='paid'),0)) OR EXISTS(SELECT 1 FROM managed_payouts p WHERE p.seller_id=NEW.seller_id AND p.record_kind='live' AND p.status IN('prepared','approved','processing','failed'))) BEGIN SELECT RAISE(ABORT,'managed_live_original_balance_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_payout_independent_actor BEFORE INSERT ON managed_payouts WHEN NEW.record_kind='live' AND NOT EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=NEW.prepared_by JOIN user_roles r ON r.user_id=u.id WHERE s.id=NEW.seller_id AND s.user_id<>u.id AND u.status='active' AND r.role='super_admin' AND (NEW.approved_by IS NULL OR NEW.approved_by=u.id)) BEGIN SELECT RAISE(ABORT,'managed_live_payout_independent_actor_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_allocation_retained_interest BEFORE INSERT ON managed_payout_allocations WHEN EXISTS(SELECT 1 FROM managed_payouts p WHERE p.id=NEW.payout_id AND p.record_kind='live') AND NOT EXISTS(SELECT 1 FROM managed_payouts p JOIN managed_entitlements e ON e.id=NEW.entitlement_id JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id JOIN managed_live_activation_decisions d ON d.id=s.live_activation_decision_id WHERE p.id=NEW.payout_id AND NEW.actor_id=p.prepared_by AND d.owner_id<>p.prepared_by AND (p.approved_by IS NULL OR d.owner_id<>p.approved_by)) BEGIN SELECT RAISE(ABORT,'managed_live_original_interest_requires_independent_actor'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_allocation_original_parties BEFORE INSERT ON managed_payout_allocations WHEN EXISTS(SELECT 1 FROM managed_payouts p JOIN managed_entitlements e ON e.id=NEW.entitlement_id JOIN managed_commercial_snapshots allocation_party ON allocation_party.id=e.snapshot_id WHERE p.id=NEW.payout_id AND p.record_kind='live' AND (allocation_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=allocation_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=allocation_party.live_activation_decision_id WHERE party_owner.id=allocation_party.seller_id AND (party_owner.user_id=NEW.actor_id OR party_decision.owner_id=NEW.actor_id OR allocation_party.live_customer_id=NEW.actor_id OR party_order.customer_id=NEW.actor_id)))) BEGIN SELECT RAISE(ABORT,'managed_live_allocation_party_requires_independent_actor'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_packet_original_allocations BEFORE INSERT ON payout_transfer_packets WHEN NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NOT EXISTS(SELECT 1 FROM managed_payouts p WHERE p.id=NEW.managed_payout_id AND p.amount_paisa=NEW.amount_paisa AND (SELECT COALESCE(SUM(a.amount_paisa),0) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='reserved')=p.amount_paisa AND EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='reserved')) BEGIN SELECT RAISE(ABORT,'managed_live_packet_original_allocations_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_packet_prepare_parties BEFORE INSERT ON payout_transfer_packets WHEN NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.prepared_by OR party_decision.owner_id=NEW.prepared_by OR payout_party.live_customer_id=NEW.prepared_by OR party_order.customer_id=NEW.prepared_by)))) BEGIN SELECT RAISE(ABORT,'managed_live_packet_party_requires_independent_actor'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_packet_approved_parties BEFORE UPDATE ON payout_transfer_packets WHEN NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='approved' AND (NEW.state<>OLD.state OR NEW.approved_by IS NOT OLD.approved_by) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.approved_by OR party_decision.owner_id=NEW.approved_by OR payout_party.live_customer_id=NEW.approved_by OR party_order.customer_id=NEW.approved_by)))) BEGIN SELECT RAISE(ABORT,'managed_live_packet_party_requires_independent_actor'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_packet_processing_parties BEFORE UPDATE ON payout_transfer_packets WHEN NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='processing' AND (NEW.state<>OLD.state OR NEW.started_by IS NOT OLD.started_by) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.started_by OR party_decision.owner_id=NEW.started_by OR payout_party.live_customer_id=NEW.started_by OR party_order.customer_id=NEW.started_by)))) BEGIN SELECT RAISE(ABORT,'managed_live_packet_party_requires_independent_actor'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_packet_uncertain_parties BEFORE UPDATE ON payout_transfer_packets WHEN NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='uncertain' AND (NEW.state<>OLD.state OR NEW.recorded_by IS NOT OLD.recorded_by) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.recorded_by OR party_decision.owner_id=NEW.recorded_by OR payout_party.live_customer_id=NEW.recorded_by OR party_order.customer_id=NEW.recorded_by)))) BEGIN SELECT RAISE(ABORT,'managed_live_packet_party_requires_independent_actor'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_packet_paid_parties BEFORE UPDATE ON payout_transfer_packets WHEN NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='paid' AND (NEW.state<>OLD.state OR NEW.recorded_by IS NOT OLD.recorded_by) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.recorded_by OR party_decision.owner_id=NEW.recorded_by OR payout_party.live_customer_id=NEW.recorded_by OR party_order.customer_id=NEW.recorded_by)))) BEGIN SELECT RAISE(ABORT,'managed_live_packet_party_requires_independent_actor'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_packet_failed_parties BEFORE UPDATE ON payout_transfer_packets WHEN NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='failed' AND (NEW.state<>OLD.state OR NEW.recorded_by IS NOT OLD.recorded_by) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.recorded_by OR party_decision.owner_id=NEW.recorded_by OR payout_party.live_customer_id=NEW.recorded_by OR party_order.customer_id=NEW.recorded_by)))) BEGIN SELECT RAISE(ABORT,'managed_live_packet_party_requires_independent_actor'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_packet_void_parties BEFORE UPDATE ON payout_transfer_packets WHEN NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='void' AND (NEW.state<>OLD.state OR NEW.recorded_by IS NOT OLD.recorded_by) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.recorded_by OR party_decision.owner_id=NEW.recorded_by OR payout_party.live_customer_id=NEW.recorded_by OR party_order.customer_id=NEW.recorded_by)))) BEGIN SELECT RAISE(ABORT,'managed_live_packet_party_requires_independent_actor'); END;
--> statement-breakpoint
CREATE TRIGGER managed_actual_live_instruction_retained BEFORE UPDATE ON managed_payouts WHEN OLD.record_kind='live' AND NEW.status='rejected' AND OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM payout_transfer_packets p WHERE p.managed_payout_id=NEW.id AND p.state NOT IN('void','failed')) BEGIN SELECT RAISE(ABORT,'retire_or_reconcile_original_payout_instruction_first'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_invoice_original_source BEFORE INSERT ON managed_invoice_groups WHEN NEW.record_kind='live' AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id JOIN managed_live_financial_scopes f ON f.id=s.live_financial_scope_id WHERE i.order_id=NEW.order_id AND s.record_kind='live' AND s.invoice_issuer_reference=NEW.issuer_reference AND f.id=json_extract(NEW.snapshot_json,'$.financialScopeId') AND f.issuer_model=json_extract(NEW.snapshot_json,'$.issuerModel') AND f.issuer_scope_digest=json_extract(NEW.snapshot_json,'$.issuerScopeDigest')) BEGIN SELECT RAISE(ABORT,'managed_live_invoice_original_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_invoice_retained BEFORE UPDATE ON managed_invoice_groups WHEN OLD.record_kind='live' BEGIN SELECT RAISE(ABORT,'managed_live_invoice_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_invoice_no_delete BEFORE DELETE ON managed_invoice_groups WHEN OLD.record_kind='live' BEGIN SELECT RAISE(ABORT,'managed_live_invoice_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_adjustment_original BEFORE INSERT ON managed_invoice_adjustments WHEN NEW.record_kind='live' AND (NEW.kind<>'credit_note' OR NOT EXISTS(SELECT 1 FROM managed_invoice_groups g WHERE g.id=NEW.invoice_group_id AND g.record_kind='live' AND g.id=json_extract(NEW.snapshot_json,'$.originalInvoiceId') AND g.invoice_number=json_extract(NEW.snapshot_json,'$.originalInvoiceNumber'))) BEGIN SELECT RAISE(ABORT,'managed_live_adjustment_original_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_adjustment_same_kind BEFORE INSERT ON managed_invoice_adjustments WHEN NOT EXISTS(SELECT 1 FROM managed_invoice_groups g WHERE g.id=NEW.invoice_group_id AND g.record_kind=NEW.record_kind) BEGIN SELECT RAISE(ABORT,'managed_live_adjustment_cannot_mix_kinds'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_financial_scope_actor BEFORE INSERT ON managed_live_financial_scopes WHEN NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.status='active' AND r.role='super_admin') OR length(NEW.company_scope_digest)<>64 OR length(NEW.issuer_scope_digest)<>64 OR substr(NEW.series_prefix,1,3)='SIM' OR COALESCE(json_extract(NEW.issuer_snapshot_json,'$.taxMode'),'')<>'PAN' OR length(NEW.series_prefix)<3 OR length(NEW.series_prefix)>60 BEGIN SELECT RAISE(ABORT,'managed_live_financial_scope_review_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_series_opening BEFORE INSERT ON managed_live_invoice_series WHEN NOT EXISTS(SELECT 1 FROM managed_live_financial_scopes f WHERE f.id=NEW.financial_scope_id AND f.opening_number=NEW.next_number AND NEW.revision=0) BEGIN SELECT RAISE(ABORT,'managed_live_actual_opening_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_series_increment BEFORE UPDATE ON managed_live_invoice_series WHEN NEW.financial_scope_id<>OLD.financial_scope_id OR NEW.next_number<>OLD.next_number+1 OR NEW.revision<>OLD.revision+1 BEGIN SELECT RAISE(ABORT,'managed_live_actual_sequence_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_series_no_delete BEFORE DELETE ON managed_live_invoice_series BEGIN SELECT RAISE(ABORT,'managed_live_actual_sequence_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_number_original_artifact BEFORE INSERT ON managed_live_invoice_numbers WHEN NOT (EXISTS(SELECT 1 FROM managed_live_invoice_series n WHERE n.financial_scope_id=NEW.financial_scope_id AND n.next_number=NEW.sequence+1) AND (EXISTS(SELECT 1 FROM managed_invoice_groups g WHERE g.id=NEW.invoice_group_id AND g.record_kind='live' AND g.invoice_number=NEW.invoice_number AND json_extract(g.snapshot_json,'$.financialScopeId')=NEW.financial_scope_id) OR EXISTS(SELECT 1 FROM managed_invoice_adjustments a JOIN managed_invoice_groups g ON g.id=a.invoice_group_id WHERE a.id=NEW.adjustment_id AND a.record_kind='live' AND a.adjustment_number=NEW.invoice_number AND json_extract(g.snapshot_json,'$.financialScopeId')=NEW.financial_scope_id))) BEGIN SELECT RAISE(ABORT,'managed_live_number_original_artifact_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_credit_actual_source BEFORE INSERT ON managed_invoice_adjustments WHEN NEW.record_kind='live' AND NOT ((json_extract(NEW.snapshot_json,'$.sourceKind')='refund' AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests rr ON rr.id=r.return_request_id JOIN managed_commercial_snapshots s ON s.order_item_id=rr.order_item_id JOIN managed_invoice_groups g ON g.id=NEW.invoice_group_id WHERE r.id=json_extract(NEW.snapshot_json,'$.sourceId') AND r.order_id=g.order_id AND r.status='paid' AND r.amount_paisa=NEW.amount_paisa AND s.record_kind='live' AND s.live_financial_scope_id=json_extract(g.snapshot_json,'$.financialScopeId'))) OR (json_extract(NEW.snapshot_json,'$.sourceKind')='cancellation' AND EXISTS(SELECT 1 FROM orders o JOIN managed_invoice_groups g ON g.order_id=o.id WHERE g.id=NEW.invoice_group_id AND o.id=json_extract(NEW.snapshot_json,'$.sourceId') AND o.status='cancelled'))) BEGIN SELECT RAISE(ABORT,'managed_live_credit_actual_original_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_credit_original_cap BEFORE INSERT ON managed_invoice_adjustments WHEN NEW.record_kind='live' AND NOT EXISTS(SELECT 1 FROM managed_invoice_groups g WHERE g.id=NEW.invoice_group_id AND NEW.amount_paisa<=CAST(json_extract(g.snapshot_json,'$.commercialValuePaisa') AS INTEGER)-COALESCE((SELECT SUM(a.amount_paisa) FROM managed_invoice_adjustments a WHERE a.invoice_group_id=g.id AND a.record_kind='live' AND a.kind='credit_note'),0)) BEGIN SELECT RAISE(ABORT,'managed_live_credit_original_value_cap'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_credit_source_binding BEFORE INSERT ON managed_live_invoice_adjustment_sources WHEN NOT EXISTS(SELECT 1 FROM managed_invoice_adjustments a WHERE a.id=NEW.adjustment_id AND a.invoice_group_id=NEW.invoice_group_id AND a.record_kind='live' AND json_extract(a.snapshot_json,'$.sourceKind')=NEW.source_kind AND json_extract(a.snapshot_json,'$.sourceId')=NEW.source_id) BEGIN SELECT RAISE(ABORT,'managed_live_credit_source_binding_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_recovery_earnings_same_original_kind BEFORE INSERT ON seller_recovery_allocations WHEN NEW.method='earnings' AND EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed') AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_commercial_snapshots original ON original.order_item_id=json_extract(c.original_source_json,'$.orderItemId') AND original.seller_id=c.seller_id JOIN managed_settlement_entries credit ON credit.id=NEW.managed_credit_id JOIN managed_entitlements credit_earning ON credit_earning.id=credit.entitlement_id JOIN managed_commercial_snapshots credit_original ON credit_original.id=credit_earning.snapshot_id JOIN managed_settlement_entries debit ON debit.id=NEW.managed_debit_id JOIN managed_entitlements debit_earning ON debit_earning.id=debit.entitlement_id JOIN managed_commercial_snapshots debit_original ON debit_original.id=debit_earning.snapshot_id WHERE c.id=NEW.case_id AND credit_original.id=original.id AND debit_original.seller_id=c.seller_id AND debit_original.record_kind=original.record_kind AND credit_original.record_kind=original.record_kind AND (original.record_kind='simulation' OR original.live_activation_decision_id IS NOT NULL AND original.live_clearance_id IS NOT NULL AND original.live_financial_scope_id IS NOT NULL AND debit_original.live_activation_decision_id IS NOT NULL AND debit_original.live_clearance_id IS NOT NULL AND debit_original.live_financial_scope_id IS NOT NULL)) BEGIN SELECT RAISE(ABORT,'managed_recovery_cannot_mix_simulation_live'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_financial_scopes_update BEFORE UPDATE ON managed_live_financial_scopes BEGIN SELECT RAISE(ABORT,'managed_live_financial_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_financial_scopes_delete BEFORE DELETE ON managed_live_financial_scopes BEGIN SELECT RAISE(ABORT,'managed_live_financial_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_invoice_numbers_update BEFORE UPDATE ON managed_live_invoice_numbers BEGIN SELECT RAISE(ABORT,'managed_live_financial_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_invoice_numbers_delete BEFORE DELETE ON managed_live_invoice_numbers BEGIN SELECT RAISE(ABORT,'managed_live_financial_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_invoice_adjustment_sources_update BEFORE UPDATE ON managed_live_invoice_adjustment_sources BEGIN SELECT RAISE(ABORT,'managed_live_financial_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_invoice_adjustment_sources_delete BEFORE DELETE ON managed_live_invoice_adjustment_sources BEGIN SELECT RAISE(ABORT,'managed_live_financial_history_immutable'); END;
