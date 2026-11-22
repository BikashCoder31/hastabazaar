/** Source generation only; no database connection or migration runner. */
import {retiredRecoveryPayoutSql} from '../lib/payments/recovery-payout-retirement';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const table=`CREATE TABLE seller_recovery_unpaid_corrections (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 original_charge_paisa INTEGER NOT NULL CHECK(original_charge_paisa>0 AND original_charge_paisa<=9007199254740991),
 previous_restored_paisa INTEGER NOT NULL CHECK(previous_restored_paisa>=0),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
 registered_credit_id TEXT UNIQUE REFERENCES seller_ledger_entries(id),managed_credit_id TEXT UNIQUE REFERENCES managed_settlement_entries(id),
 fixed_obligation_id TEXT REFERENCES managed_supplier_obligations(id),source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 CHECK(amount_paisa<=original_charge_paisa-previous_restored_paisa),
 CHECK((registered_credit_id IS NOT NULL)+(managed_credit_id IS NOT NULL)+(fixed_obligation_id IS NOT NULL)=1)
);`;
const common=`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.restored_paisa=0 AND c.liability_reduced_paisa=0
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))`;
const refund=(model:'registered'|'managed')=>`EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='${model}')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_unpaid_sources unpaid ON unpaid.case_id=c.id
 JOIN refunds r ON r.id=c.refund_id WHERE c.id=NEW.case_id AND r.status='paid' AND unpaid.amount_paisa=NEW.original_charge_paisa
 AND EXISTS(SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE o.source_kind='return_refund' AND o.source_id=r.id AND o.state='completed' AND p.state='paid')
 AND ${model==='registered'?`NEW.managed_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM seller_ledger_entries credit WHERE credit.id=NEW.registered_credit_id AND credit.seller_id=c.seller_id AND credit.order_item_id=unpaid.order_item_id AND credit.type='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.description='Original recovery correction '||c.id)
 AND unpaid.amount_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=c.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)`:
 `NEW.registered_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM managed_settlement_entries credit JOIN managed_entitlements e ON e.id=credit.entitlement_id WHERE credit.id=NEW.managed_credit_id AND credit.entitlement_id=unpaid.scope_id AND e.seller_id=c.seller_id AND credit.refund_id=r.id AND credit.type='dispute_adjustment' AND credit.reason_code='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.created_by=NEW.actor_id AND json_extract(credit.metadata_json,'$.caseId')=c.id)
 AND unpaid.amount_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=unpaid.scope_id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)`})`;
const fixed=`EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed') AND NOT EXISTS(
 SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments adjustment ON adjustment.id=c.supplier_adjustment_id
 JOIN managed_supplier_obligations o ON o.id=adjustment.obligation_id WHERE c.id=NEW.case_id AND o.seller_id=c.seller_id
 AND NEW.fixed_obligation_id=o.id AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.original_charge_paisa=adjustment.amount_paisa
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status<>'paid' AND NOT ${retiredRecoveryPayoutSql('fixed','p.id','o.seller_id')})
 AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN managed_supplier_payments p ON p.id=packet.supplier_payment_id WHERE p.obligation_id=o.id AND packet.state IN('processing','uncertain'))
 AND COALESCE((SELECT SUM(p.amount_paisa) FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status='paid'),0)
  +COALESCE((SELECT SUM(prior.amount_paisa) FROM managed_supplier_adjustments prior WHERE prior.obligation_id=o.id AND (prior.created_at<adjustment.created_at OR prior.created_at=adjustment.created_at AND prior.id<=adjustment.id)),0)
  <=o.original_amount_paisa+NEW.previous_restored_paisa)`;
const triggers:[string,string,string|null,string][]=[
 ['recovery_unpaid_correction_source','INSERT',common,'recovery_unpaid_correction_current_source_required'],
 ['recovery_unpaid_correction_registered','INSERT',refund('registered'),'recovery_unpaid_correction_native_credit_required'],
 ['recovery_unpaid_correction_managed','INSERT',refund('managed'),'recovery_unpaid_correction_native_credit_required'],
 ['recovery_unpaid_correction_fixed','INSERT',fixed,'recovery_unpaid_correction_native_credit_required'],
 ['recovery_unpaid_correction_immutable','UPDATE',null,'recovery_unpaid_correction_retained'],
 ['recovery_unpaid_correction_retained','DELETE',null,'recovery_unpaid_correction_retained'],
];
const index='CREATE INDEX recovery_unpaid_correction_case ON seller_recovery_unpaid_corrections(case_id);';
const sqlite='-- Generated source only. Never apply to canonical data to pass startup.\n'+[table,index,...triggers.map(([name,action,when,message])=>`CREATE TRIGGER ${name} BEFORE ${action} ON seller_recovery_unpaid_corrections${when?'\nWHEN '+when:''}\nBEGIN SELECT RAISE(ABORT,'${message}'); END;`)].join('\n--> statement-breakpoint\n')+'\n';
const mariaTable=table.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(source_json|evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
const maria='-- Generated source parity for 0129. Execution remains held.\n'+[mariaTable,index].join('\n\n')+'\nDELIMITER $$\n'+triggers.map(([name,action,when,message])=>`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN ${when?'IF ('+when.replace("'Original recovery correction '||c.id","CONCAT('Original recovery correction ',c.id)")+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${when?' END IF;':''} END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0129_recovery_unpaid_corrections.sql'),sqlite,'utf8');
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-unpaid-corrections.sql'),maria,'utf8');
