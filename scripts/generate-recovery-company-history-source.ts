/** Generate immutable historical company-cost disposition sources; never opens a database. */
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {historicalRecoveryCandidatesSql} from '../lib/payments/recovery-historical';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const deductions=`CREATE TABLE seller_recovery_company_deductions (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,seller_id TEXT NOT NULL REFERENCES seller_profiles(id),refund_id TEXT NOT NULL REFERENCES refunds(id),
 kind TEXT NOT NULL CHECK(kind IN('registered_refund_group','managed_allocation','managed_legacy_group')),payout_id TEXT NOT NULL,scope_id TEXT NOT NULL,
 native_deduction_paisa INTEGER NOT NULL CHECK(native_deduction_paisa>0 AND native_deduction_paisa<=9007199254740991),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=native_deduction_paisa),
 actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,UNIQUE(case_id,case_revision)
);`;
const pools=`CREATE TABLE seller_recovery_historical_pools (
 kind TEXT NOT NULL,payout_id TEXT NOT NULL,scope_id TEXT NOT NULL,principal_paisa INTEGER NOT NULL CHECK(principal_paisa>0 AND principal_paisa<=9007199254740991),used_paisa INTEGER NOT NULL CHECK(used_paisa>=0 AND used_paisa<=principal_paisa),PRIMARY KEY(kind,payout_id,scope_id)
);`;
const view=`CREATE VIEW seller_recovery_all_historical_uses AS
 SELECT id,case_id,kind,payout_id,scope_id,native_deduction_paisa,amount_paisa,'recovery' AS use_kind FROM seller_recovery_historical_attributions
 UNION ALL SELECT id,case_id,kind,payout_id,scope_id,native_deduction_paisa,amount_paisa,'company' AS use_kind FROM seller_recovery_company_deductions;`;
const audit="INSERT INTO operation_transaction_guards(id,valid) SELECT 'recovery-history-0136-capacity',CASE WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions GROUP BY kind,payout_id,scope_id HAVING MIN(native_deduction_paisa)<>MAX(native_deduction_paisa) OR SUM(amount_paisa)>MAX(native_deduction_paisa)) THEN 1 ELSE 0 END;";
const auditCleanup="DELETE FROM operation_transaction_guards WHERE id='recovery-history-0136-capacity';";
const backfill=`INSERT INTO seller_recovery_historical_pools(kind,payout_id,scope_id,principal_paisa,used_paisa) SELECT kind,payout_id,scope_id,MAX(native_deduction_paisa),SUM(amount_paisa) FROM seller_recovery_historical_attributions GROUP BY kind,payout_id,scope_id;`;
const proof=(model:'registered'|'managed')=>`EXISTS(SELECT 1 FROM (${historicalRecoveryCandidatesSql(model,'NEW.refund_id','NEW.seller_id')}) native_source WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1)`;
const usage=`COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_all_historical_uses h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0)`;
type Trigger=[string,string,string,string|null,string];
const triggers:Trigger[]=[
 ['recovery_company_deduction_source','INSERT','seller_recovery_company_deductions',`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN refunds r ON r.id=c.refund_id JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0 AND r.status='paid'
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=r.order_id AND o.customer_id=actor.id)
 AND EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id) AND NOT EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=c.seller_id AND cost.amount_paisa>0)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id) AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id) AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.case_id=c.id)
 AND (c.payout_model='registered' AND NEW.kind='registered_refund_group' AND ${proof('registered')} OR c.payout_model='managed' AND NEW.kind IN('managed_allocation','managed_legacy_group') AND ${proof('managed')})
 AND NEW.amount_paisa<=CASE WHEN c.payout_model='registered' THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='refund'),0) ELSE COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0) END-COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_company_deductions h WHERE h.case_id=c.id),0)
 AND NEW.amount_paisa<=COALESCE(json_extract(NEW.source_json,'$.historicalCandidatePaisa'),0)-COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_company_deductions h WHERE h.case_id=c.id),0))`,'recovery_company_original_deduction_required'],
 ['recovery_company_deduction_shared_cap','INSERT','seller_recovery_company_deductions',`NEW.amount_paisa>NEW.native_deduction_paisa-${usage}`,'recovery_historical_shared_capacity_exceeded'],
 ['recovery_historical_shared_cap','INSERT','seller_recovery_historical_attributions',`NEW.amount_paisa>NEW.native_deduction_paisa-${usage}`,'recovery_historical_shared_capacity_exceeded'],
 ['recovery_company_deduction_update','UPDATE','seller_recovery_company_deductions',null,'recovery_company_deduction_retained'],
 ['recovery_company_deduction_delete','DELETE','seller_recovery_company_deductions',null,'recovery_company_deduction_retained'],
 ['recovery_historical_pool_insert','INSERT','seller_recovery_historical_pools',`NOT EXISTS(SELECT 1 FROM seller_recovery_historical_pools p WHERE p.kind=NEW.kind AND p.payout_id=NEW.payout_id AND p.scope_id=NEW.scope_id) AND (NEW.used_paisa<=0 OR NEW.used_paisa<>${usage} OR NEW.principal_paisa<>COALESCE((SELECT MAX(h.native_deduction_paisa) FROM seller_recovery_all_historical_uses h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0))`,'recovery_historical_pool_projection_required'],
 ['recovery_historical_pool_update','UPDATE','seller_recovery_historical_pools',`NEW.kind<>OLD.kind OR NEW.payout_id<>OLD.payout_id OR NEW.scope_id<>OLD.scope_id OR NEW.principal_paisa<>OLD.principal_paisa OR NEW.used_paisa<>${usage}`,'recovery_historical_pool_projection_required'],
 ['recovery_historical_pool_delete','DELETE','seller_recovery_historical_pools',null,'recovery_historical_pool_retained'],
];
const counter=(dialect:'sqlite'|'mariadb')=>`INSERT INTO seller_recovery_historical_pools(kind,payout_id,scope_id,principal_paisa,used_paisa) VALUES(NEW.kind,NEW.payout_id,NEW.scope_id,NEW.native_deduction_paisa,NEW.amount_paisa) ${dialect==='sqlite'?'ON CONFLICT(kind,payout_id,scope_id) DO UPDATE SET used_paisa=used_paisa+excluded.used_paisa':'ON DUPLICATE KEY UPDATE used_paisa=used_paisa+VALUES(used_paisa)'};`;
const targets=['seller_recovery_company_deductions','seller_recovery_historical_attributions'];
const indexes=['CREATE INDEX recovery_company_deduction_case ON seller_recovery_company_deductions(case_id);','CREATE INDEX recovery_company_deduction_pool ON seller_recovery_company_deductions(kind,payout_id,scope_id);'];
const sqlite='-- Source only; execution against canonical or live data remains held.\n'+[deductions,pools,view,audit,auditCleanup,backfill,...indexes,'DROP TRIGGER recovery_historical_shared_cap;',...triggers.map(([name,action,table,when,message])=>`CREATE TRIGGER ${name} BEFORE ${action} ON ${table}${when?'\nWHEN '+when:''}\nBEGIN SELECT RAISE(ABORT,'${message}'); END;`),...targets.map((table,i)=>`CREATE TRIGGER recovery_historical_pool_consume_${i} AFTER INSERT ON ${table} BEGIN\n${counter('sqlite')}\nEND;`)].join('\n--> statement-breakpoint\n')+'\n';
const mariaTable=(sql:string)=>sql.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(source_json|evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
const maria='-- Source parity for 0136; native verification and execution remain held.\n'+[mariaTable(deductions),mariaTable(pools),view,audit,auditCleanup,backfill,...indexes].join('\n')+'\nDELIMITER $$\n'+triggers.map(([name,action,table,when,message])=>`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${table} FOR EACH ROW BEGIN ${when?'IF ('+when+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${when?' END IF;':''} END$$`).join('\n')+'\n'+targets.map((table,i)=>`CREATE OR REPLACE TRIGGER recovery_historical_pool_consume_${i} AFTER INSERT ON ${table} FOR EACH ROW BEGIN ${counter('mariadb')} END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0136_recovery_company_history.sql'),sqlite);
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-company-history.sql'),maria);
