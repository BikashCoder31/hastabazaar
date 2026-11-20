/** Source generation only. This script has no database connection or migration runner. */
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unpaidRecoverySourceSql} from '../lib/payments/recovery-unpaid-source';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
import {recoveryPayoutRetirementSql,recoveryPayoutModels} from '../lib/payments/recovery-payout-retirement';
const table=`CREATE TABLE seller_recovery_payout_retirements (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 payout_id TEXT NOT NULL,original_status TEXT NOT NULL,original_amount_paisa INTEGER NOT NULL CHECK(original_amount_paisa>0 AND original_amount_paisa<=9007199254740991),
 original_destination TEXT NOT NULL,original_updated_at INTEGER NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 UNIQUE(payout_model,payout_id)
);`;
const indexes=['CREATE INDEX recovery_retirement_case ON seller_recovery_payout_retirements(case_id);'];
const proof=(model:'registered'|'managed'|'fixed')=>`NEW.payout_model='${model}' AND EXISTS(SELECT 1 FROM (${recoveryPayoutRetirementSql(model,'NEW.case_id')}) original
 WHERE original.id=NEW.payout_id AND original.status=NEW.original_status AND original.amountPaisa=NEW.original_amount_paisa AND original.destination=NEW.original_destination AND original.updatedAt=NEW.original_updated_at)`;
const originalSource=await readFile(resolve(root,'drizzle/0127_recovery_unpaid_sources.sql'),'utf8');
const unpaidProof=originalSource.match(/CREATE TRIGGER recovery_unpaid_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources\nWHEN ([\s\S]+?)\nBEGIN SELECT RAISE/)?.[1];
if(!unpaidProof)throw new Error('Regenerate the retained 0127 source before extending its native proof.');
// Keep the common authority/source predicate and each commercial model in separate
// native triggers. Combining both nested proofs exceeds D1's expression depth 100.
const commonUnpaidProof=unpaidProof.slice(0,unpaidProof.indexOf(" AND (c.payout_model="))+" AND c.payout_model IN('registered','managed'))";
const unpaidModelProof=(model:'registered'|'managed')=>`EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='${model}')
 AND NOT EXISTS(SELECT 1 FROM (${unpaidRecoverySourceSql(model,'NEW.refund_id','NEW.seller_id',true)}) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa)`;
const triggers:[string,string,string,string|null,string][]=[
 ['recovery_retirement_original_proof','INSERT','seller_recovery_payout_retirements',`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.payout_model=NEW.payout_model AND actor.status='active' AND seller.user_id<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND (${proof('registered')} OR ${proof('managed')} OR ${proof('fixed')}))`,'recovery_retirement_original_unsent_proof_required'],
 ['recovery_retirement_immutable','UPDATE','seller_recovery_payout_retirements',null,'recovery_retirement_retained'],
 ['recovery_retirement_retained','DELETE','seller_recovery_payout_retirements',null,'recovery_retirement_retained'],
 ...(['registered','managed','fixed'] as const).map(model=>[`recovery_retired_${model}`,'UPDATE',recoveryPayoutModels[model].table,`NEW.status<>'${recoveryPayoutModels[model].terminal}' AND EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model='${model}' AND r.payout_id=NEW.id)`,'recovery_retired_payout_requires_fresh_source'] as [string,string,string,string|null,string]),
 ['recovery_retired_no_new_instruction','INSERT','payout_transfer_packets',`EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model=NEW.payout_model AND r.payout_id=COALESCE(NEW.registered_payout_id,NEW.managed_payout_id,NEW.supplier_payment_id))`,'recovery_retired_payout_requires_fresh_source'],
 ['recovery_unpaid_native_proof','INSERT','seller_recovery_unpaid_sources',commonUnpaidProof,'recovery_unpaid_original_proof_required'],
 ...(['registered','managed'] as const).map(model=>[`recovery_unpaid_${model}_native_proof`,'INSERT','seller_recovery_unpaid_sources',unpaidModelProof(model),'recovery_unpaid_original_proof_required'] as [string,string,string,string|null,string]),
];
const sqlite='-- Generated source only by scripts/generate-recovery-payout-retirement-source.ts. Never run against canonical data to pass startup.\n'+[table,...indexes,'DROP TRIGGER recovery_unpaid_native_proof;',...triggers.map(([name,action,on,when,message])=>`CREATE TRIGGER ${name} BEFORE ${action} ON ${on}${when?'\nWHEN '+when:''}\nBEGIN SELECT RAISE(ABORT,'${message}'); END;`)].join('\n--> statement-breakpoint\n')+'\n';
const mariaTable=table.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(source_json|evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
const maria='-- Generated source parity for 0128. Canonical and live execution remain held.\n'+[mariaTable,...indexes].join('\n\n')+'\n\nDELIMITER $$\n'+triggers.map(([name,action,on,when,message])=>`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${on} FOR EACH ROW BEGIN ${when?'IF ('+when+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${when?' END IF;':''} END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0128_recovery_payout_retirements.sql'),sqlite,'utf8');
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-payout-retirements.sql'),maria,'utf8');
