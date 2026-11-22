/** Source generation only. This script has no database connection or migration runner. */
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {historicalRecoveryCandidatesSql} from '../lib/payments/recovery-historical';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const table=`CREATE TABLE seller_recovery_historical_attributions (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),refund_id TEXT NOT NULL REFERENCES refunds(id),
 kind TEXT NOT NULL CHECK(kind IN('registered_refund_group','managed_allocation','managed_legacy_group')),
 payout_id TEXT NOT NULL,scope_id TEXT NOT NULL,
 native_deduction_paisa INTEGER NOT NULL CHECK(native_deduction_paisa>0 AND native_deduction_paisa<=9007199254740991),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=native_deduction_paisa),
 actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 UNIQUE(case_id,case_revision)
);`;
const indexes=[
 'CREATE INDEX recovery_historical_shared_pool ON seller_recovery_historical_attributions(kind,payout_id,scope_id);',
 'CREATE INDEX recovery_historical_case ON seller_recovery_historical_attributions(case_id);',
];
const proof=(model:'registered'|'managed')=>`EXISTS(SELECT 1 FROM (${historicalRecoveryCandidatesSql(model,'NEW.refund_id','NEW.seller_id')}) native_source
 WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id
 AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1)`;
const triggers:[string,string,string,string|null,string][]=[
 ['recovery_historical_native_source','INSERT','seller_recovery_historical_attributions',`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id
 AND (c.payout_model='registered' AND NEW.kind='registered_refund_group' AND ${proof('registered')}
 OR c.payout_model='managed' AND NEW.kind IN('managed_allocation','managed_legacy_group') AND ${proof('managed')}))`,'recovery_historical_actual_native_source_required'],
 ['recovery_historical_shared_cap','INSERT','seller_recovery_historical_attributions',`NEW.amount_paisa>NEW.native_deduction_paisa-COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_historical_attributions h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0)`,'recovery_historical_shared_capacity_exceeded'],
 ['recovery_historical_immutable','UPDATE','seller_recovery_historical_attributions',null,'recovery_historical_attribution_retained'],
 ['recovery_historical_retained','DELETE','seller_recovery_historical_attributions',null,'recovery_historical_attribution_retained'],
 ['recovery_historical_opening','INSERT','seller_recovery_cases','NEW.historical_recovered_paisa<>0','recovery_historical_explicit_attribution_required'],
 ['recovery_historical_projection','UPDATE','seller_recovery_cases',`NEW.historical_recovered_paisa<>COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_historical_attributions h WHERE h.case_id=NEW.id),0)`,'recovery_historical_exact_projection_required'],
];
const sqlite='-- Generated source only by scripts/generate-recovery-historical-source.ts. Never run against canonical data to pass startup.\n'+[table,...indexes,...triggers.map(([name,action,on,when,message])=>`CREATE TRIGGER ${name} BEFORE ${action} ON ${on}${when?'\nWHEN '+when:''}\nBEGIN SELECT RAISE(ABORT,'${message}'); END;`)].join('\n--> statement-breakpoint\n')+'\n';
const mariaTable=table.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
const maria='-- Generated source parity for 0125. Canonical and live execution remain held.\n'+[mariaTable,...indexes].join('\n\n')+'\n\nDELIMITER $$\n'+triggers.map(([name,action,on,when,message])=>`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${on} FOR EACH ROW BEGIN ${when?'IF ('+when+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${when?' END IF;':''} END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0125_recovery_historical_attributions.sql'),sqlite,'utf8');
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-historical-attributions.sql'),maria,'utf8');
