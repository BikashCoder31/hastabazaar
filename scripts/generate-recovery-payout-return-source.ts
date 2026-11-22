/** Source generation only. No database connection or migration execution. */
import {readFile,writeFile} from 'node:fs/promises';
import {mariaRetainedTrigger} from './mariadb-retained-trigger';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {originalRecoveryPayoutProofSql} from '../lib/payments/recovery-original-payouts';
import {returnedPayoutDispositionPendingSql} from '../lib/payments/recovery-returned-payout';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const reviews=`CREATE TABLE seller_recovery_payout_return_reviews (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed','fixed')),payout_id TEXT NOT NULL,scope_id TEXT NOT NULL,
 original_payout_paisa INTEGER NOT NULL CHECK(original_payout_paisa>0 AND original_payout_paisa<=9007199254740991),
 scope_paisa INTEGER NOT NULL CHECK(scope_paisa>0 AND scope_paisa<=9007199254740991),
 receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),receipt_revision INTEGER NOT NULL,allocation_id TEXT NOT NULL UNIQUE,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=original_payout_paisa AND amount_paisa<=scope_paisa),
 restored_paisa INTEGER NOT NULL CHECK(restored_paisa>=0 AND restored_paisa<=amount_paisa),
 principal_excess_paisa INTEGER NOT NULL CHECK(principal_excess_paisa>=0 AND principal_excess_paisa<=restored_paisa),
 resolved_disputed_paisa INTEGER NOT NULL CHECK(resolved_disputed_paisa>=0 AND resolved_disputed_paisa<=amount_paisa),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
);`;
const pools=`CREATE TABLE seller_recovery_payout_return_pools (
 payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed','fixed')),payout_id TEXT NOT NULL,
 scope_id TEXT NOT NULL,principal_paisa INTEGER NOT NULL CHECK(principal_paisa>0 AND principal_paisa<=9007199254740991),
 used_paisa INTEGER NOT NULL CHECK(used_paisa>=0 AND used_paisa<=principal_paisa),
 PRIMARY KEY(payout_model,payout_id,scope_id)
);`;
const restorations=`CREATE TABLE seller_recovery_payout_return_restorations (
 id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES seller_recovery_payout_return_reviews(id),case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),
 allocation_id TEXT REFERENCES seller_recovery_allocations(id),method TEXT NOT NULL CHECK(method IN('cash','earnings','returned_payout')),
 kind TEXT NOT NULL CHECK(kind IN('seller_collection','returned_principal')),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991)
);`;
const view=`CREATE VIEW seller_recovery_all_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,review_id AS payout_return_review_id FROM seller_recovery_payout_return_restorations;`;
const indexes=['CREATE INDEX recovery_payout_return_case ON seller_recovery_payout_return_reviews(case_id);','CREATE INDEX recovery_payout_return_original ON seller_recovery_payout_return_reviews(payout_model,payout_id,scope_id);','CREATE INDEX recovery_payout_return_restored ON seller_recovery_payout_return_restorations(allocation_id);','CREATE INDEX recovery_payout_return_review ON seller_recovery_payout_return_restorations(review_id);'];
const source=await readFile(resolve(root,'drizzle/0130_recovery_carrier_reimbursements.sql'),'utf8');
function previous(name:string){const sql=source.match(new RegExp('CREATE TRIGGER '+name+' BEFORE ([\\s\\S]+?)\\nBEGIN SELECT RAISE\\(ABORT,\'([^\']+)\'\\); END;'));if(!sql)throw new Error('Review retained trigger '+name);return {body:sql[1],message:sql[2]};}
const current=`c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa`;
const carrier=`COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0)`;
type Trigger=[string,'INSERT'|'UPDATE'|'DELETE',string,string|null,string];
const originalCurrent=previous('recovery_carrier_current_source').body.split('\nWHEN ')[1];
const currentSource=originalCurrent
 .replace('c.confirmed_paisa>0','c.confirmed_paisa>=0 AND c.payout_model=NEW.payout_model')
 .replace('AND receipt.payer_user_id IS NULL','AND (receipt.payer_user_id IS NULL OR receipt.payer_user_id=seller.user_id)')
 .replace(`AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-${carrier}`,`AND ${current}>=${carrier} AND ${current}<=c.confirmed_paisa-c.absorbed_paisa
 AND NEW.principal_excess_paisa=MAX(0,NEW.restored_paisa-(${current})+${carrier})`);
if(currentSource===originalCurrent||currentSource.includes('AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-'))throw new Error('Review original carrier cap before deriving returned-principal proof.');
const poolSum=(alias:string)=>`COALESCE((SELECT SUM(review.amount_paisa) FROM seller_recovery_payout_return_reviews review WHERE review.payout_model=${alias}.payout_model AND review.payout_id=${alias}.payout_id AND (${alias}.scope_id='' OR review.scope_id=${alias}.scope_id)),0)`;
const poolProof=`EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.payout_model=NEW.payout_model AND review.payout_id=NEW.payout_id AND (NEW.scope_id='' AND NEW.principal_paisa=review.original_payout_paisa OR NEW.scope_id=review.scope_id AND NEW.principal_paisa=review.scope_paisa))`;
function triggers(dialect:'sqlite'|'mariadb'):Trigger[]{return [
 ['recovery_payout_return_current','INSERT','seller_recovery_payout_return_reviews',currentSource,'recovery_payout_return_current_source_required'],
 ...(['registered','managed','fixed'] as const).map(model=>[`recovery_payout_return_${model}`,'INSERT','seller_recovery_payout_return_reviews',`NEW.payout_model='${model}' AND NOT EXISTS(SELECT 1 FROM (${originalRecoveryPayoutProofSql(model,'NEW.case_id',dialect)}) original
 WHERE original.payoutId=NEW.payout_id AND original.scopeId=NEW.scope_id AND original.originalPayoutPaisa=NEW.original_payout_paisa AND original.scopePaisa=NEW.scope_paisa
 AND original.bankAt<=(SELECT bank_at FROM company_money_receipts WHERE id=NEW.receipt_id))`,'recovery_payout_return_original_paid_proof_required'] as Trigger),
 ['recovery_payout_return_pool_insert','INSERT','seller_recovery_payout_return_pools',`NOT ${poolProof} OR NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_pools existing WHERE existing.payout_model=NEW.payout_model AND existing.payout_id=NEW.payout_id AND existing.scope_id=NEW.scope_id) AND NEW.used_paisa<>${poolSum('NEW')}`,'recovery_payout_return_pool_source_required'],
 ['recovery_payout_return_pool_update','UPDATE','seller_recovery_payout_return_pools',`NEW.payout_model<>OLD.payout_model OR NEW.payout_id<>OLD.payout_id OR NEW.scope_id<>OLD.scope_id OR NEW.principal_paisa<>OLD.principal_paisa OR NEW.used_paisa<OLD.used_paisa OR NEW.used_paisa<>${poolSum('NEW')}`,'recovery_payout_return_pool_projection_required'],
 ['recovery_payout_return_pool_retained','DELETE','seller_recovery_payout_return_pools',null,'recovery_payout_return_pool_retained'],
 ['recovery_payout_return_restoration','INSERT','seller_recovery_payout_return_restorations',`NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE review.id=NEW.review_id AND c.id=NEW.case_id AND c.revision=review.case_revision
 AND NEW.amount_paisa<=review.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id),0)
 AND (NEW.kind='returned_principal' AND NEW.method='returned_payout' AND NEW.allocation_id=review.allocation_id AND NEW.amount_paisa=review.principal_excess_paisa
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='returned_principal')
  AND EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method='returned_payout' AND a.receipt_id=review.receipt_id AND a.amount_paisa=review.amount_paisa)
 OR NEW.kind='seller_collection'
  AND NEW.amount_paisa<=review.restored_paisa-review.principal_excess_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
  AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
   OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.id<>review.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0)))))`,'recovery_payout_return_original_collection_required'],
 ['recovery_payout_return_complete','UPDATE','seller_recovery_cases',`NEW.revision>OLD.revision AND ${returnedPayoutDispositionPendingSql('NEW.id')}`,'recovery_payout_return_complete_projection_required'],
 ...(['seller_recovery_payout_return_reviews','seller_recovery_payout_return_restorations'] as const).flatMap(table=>(['UPDATE','DELETE'] as const).map(action=>[table+'_'+action.toLowerCase(),action,table,null,'recovery_payout_return_history_retained'] as Trigger)),
 ];}
const allocation=previous('recovery_allocation_cap');
const oldCap=allocation.body.split('\nWHEN ')[1];
const returnedCap=`OR NEW.method='returned_payout' AND EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa-review.principal_excess_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))`;
const cap=oldCap.replace("NEW.method<>'carrier'","NEW.method IN('cash','earnings')").replace(" OR NEW.method='carrier'",` ${returnedCap}\n OR NEW.method='carrier'`);
if(cap===oldCap||!cap.includes(returnedCap))throw new Error('Review the original shared allocation cap.');
const projection=previous('recovery_correction_projection');
const oldProjection='COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)';
const changedProjection=projection.body.replace(oldProjection,oldProjection+'+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_payout_return_reviews x WHERE x.case_id=NEW.id),0)');
if(changedProjection===projection.body)throw new Error('Review the retained restoration projection.');
function counter(dialect:'sqlite'|'mariadb'){
 const row=(scope:string,principal:string)=>`INSERT INTO seller_recovery_payout_return_pools(payout_model,payout_id,scope_id,principal_paisa,used_paisa) VALUES(NEW.payout_model,NEW.payout_id,${scope},${principal},NEW.amount_paisa)
 ${dialect==='sqlite'?'ON CONFLICT(payout_model,payout_id,scope_id) DO UPDATE SET used_paisa=used_paisa+excluded.used_paisa':'ON DUPLICATE KEY UPDATE used_paisa=used_paisa+VALUES(used_paisa)'};`;
 return row("''",'NEW.original_payout_paisa')+'\n'+row('NEW.scope_id','NEW.scope_paisa');
}
const retained=`CREATE TRIGGER recovery_correction_projection BEFORE ${changedProjection}\nBEGIN SELECT RAISE(ABORT,'${projection.message}'); END;`;
const sqliteTriggers=triggers('sqlite');sqliteTriggers.push(['recovery_allocation_cap','INSERT','seller_recovery_allocations',cap,allocation.message]);
const sqlite='-- Generated source only; canonical and live execution remain held.\n'+[reviews,pools,restorations,...indexes,'DROP VIEW seller_recovery_all_restorations;',view,'DROP TRIGGER recovery_correction_projection;','DROP TRIGGER recovery_allocation_cap;',retained,...sqliteTriggers.map(([name,action,table,when,message])=>`CREATE TRIGGER ${name} BEFORE ${action} ON ${table}${when?'\nWHEN '+when:''}\nBEGIN SELECT RAISE(ABORT,'${message}'); END;`),`CREATE TRIGGER recovery_payout_return_consume AFTER INSERT ON seller_recovery_payout_return_reviews BEGIN\n${counter('sqlite')}\nEND;`].join('\n--> statement-breakpoint\n')+'\n';
const mariaTable=(sql:string)=>sql.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(source_json|evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
const mariaTriggers=triggers('mariadb');mariaTriggers.push(['recovery_allocation_cap','INSERT','seller_recovery_allocations',cap,allocation.message]);
const mariaProjection=mariaRetainedTrigger(retained);
const maria='-- Generated source parity for 0133; execution remains held.\n'+[mariaTable(reviews),mariaTable(pools),mariaTable(restorations),...indexes,view.replace('CREATE VIEW','CREATE OR REPLACE VIEW')].join('\n\n')+'\nDELIMITER $$\n'+[mariaProjection,...mariaTriggers.map(([name,action,table,when,message])=>`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${table} FOR EACH ROW BEGIN ${when?'IF ('+when+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${when?' END IF;':''} END$$`),`CREATE OR REPLACE TRIGGER recovery_payout_return_consume AFTER INSERT ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN\n${counter('mariadb')}\nEND$$`].join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0133_recovery_payout_returns.sql'),sqlite,'utf8');
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-payout-returns.sql'),maria.replace(/MAX\(0,/g,'GREATEST(0,'),'utf8');
