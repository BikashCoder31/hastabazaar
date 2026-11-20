/** Source generation only. This script has no database connection or migration runner. */
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unpaidRecoverySourceSql} from '../lib/payments/recovery-unpaid-source';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const table=`CREATE TABLE seller_recovery_unpaid_sources (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL UNIQUE REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),refund_id TEXT NOT NULL UNIQUE REFERENCES refunds(id),
 order_item_id TEXT NOT NULL REFERENCES order_items(id),scope_id TEXT NOT NULL,
 basis_paisa INTEGER NOT NULL CHECK(basis_paisa>0 AND basis_paisa<=9007199254740991),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>=0 AND amount_paisa<=basis_paisa),
 remaining_paisa INTEGER NOT NULL CHECK(remaining_paisa>=0 AND remaining_paisa<=9007199254740991),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id TEXT NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
);`;
const indexes=['CREATE INDEX recovery_unpaid_original_scope ON seller_recovery_unpaid_sources(seller_id,order_item_id);'];
const proof=(model:'registered'|'managed')=>`EXISTS(SELECT 1 FROM (${unpaidRecoverySourceSql(model,'NEW.refund_id','NEW.seller_id')}) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa)`;
const triggers:[string,string,string,string|null,string][]=[
 ['recovery_unpaid_native_proof','INSERT','seller_recovery_unpaid_sources',`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id
 AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews x WHERE x.case_id=c.id)
 AND (c.payout_model='registered' AND ${proof('registered')} OR c.payout_model='managed' AND ${proof('managed')}))`,'recovery_unpaid_original_proof_required'],
 ['recovery_unpaid_not_recovery','INSERT','seller_recovery_historical_attributions','EXISTS(SELECT 1 FROM seller_recovery_unpaid_sources unpaid WHERE unpaid.case_id=NEW.case_id)','recovery_unpaid_is_not_historical_repayment'],
 ['recovery_unpaid_immutable','UPDATE','seller_recovery_unpaid_sources',null,'recovery_unpaid_original_retained'],
 ['recovery_unpaid_retained','DELETE','seller_recovery_unpaid_sources',null,'recovery_unpaid_original_retained'],
];
const sqlite='-- Generated source only by scripts/generate-recovery-unpaid-source.ts. Never run against canonical data to pass startup.\n'+[table,...indexes,...triggers.map(([name,action,on,when,message])=>`CREATE TRIGGER ${name} BEFORE ${action} ON ${on}${when?'\nWHEN '+when:''}\nBEGIN SELECT RAISE(ABORT,'${message}'); END;`)].join('\n--> statement-breakpoint\n')+'\n';
const mariaTable=table.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(source_json|evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
const maria='-- Generated source parity for 0127. Canonical and live execution remain held.\n'+[mariaTable,...indexes].join('\n\n')+'\n\nDELIMITER $$\n'+triggers.map(([name,action,on,when,message])=>`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${on} FOR EACH ROW BEGIN ${when?'IF ('+when+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${when?' END IF;':''} END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0127_recovery_unpaid_sources.sql'),sqlite,'utf8');
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-unpaid-sources.sql'),maria,'utf8');
