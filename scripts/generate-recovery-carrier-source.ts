/** Source generation only. No database is opened. */
import {readFile,writeFile} from 'node:fs/promises';
import {mariaRetainedTrigger} from './mariadb-retained-trigger';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {carrierDispositionPendingSql} from '../lib/payments/recovery-carrier';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const reviews=`CREATE TABLE seller_recovery_carrier_reviews (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),receipt_revision INTEGER NOT NULL,allocation_id TEXT NOT NULL UNIQUE,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),restored_paisa INTEGER NOT NULL CHECK(restored_paisa>=0 AND restored_paisa<=amount_paisa),
 resolved_disputed_paisa INTEGER NOT NULL CHECK(resolved_disputed_paisa>=0 AND resolved_disputed_paisa<=amount_paisa),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
);`;
const restorations=`CREATE TABLE seller_recovery_carrier_restorations (
 id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES seller_recovery_carrier_reviews(id),case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),
 allocation_id TEXT REFERENCES seller_recovery_allocations(id),method TEXT NOT NULL CHECK(method IN('cash','earnings','returned_payout')),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991)
);`;
const view=`CREATE VIEW seller_recovery_all_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id FROM seller_recovery_carrier_restorations;`;
const indexes=['CREATE INDEX recovery_carrier_case ON seller_recovery_carrier_reviews(case_id);','CREATE INDEX recovery_carrier_restored_allocation ON seller_recovery_carrier_restorations(allocation_id);','CREATE UNIQUE INDEX recovery_carrier_historical_once ON seller_recovery_carrier_restorations(review_id) WHERE allocation_id IS NULL;'];
const current=`c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa`;
const source=await readFile(resolve(root,'drizzle/0123_recovery_liability_corrections.sql'),'utf8');
function previous(name:string){const sql=source.match(new RegExp('CREATE TRIGGER '+name+' BEFORE ([\\s\\S]+?)\\nBEGIN SELECT RAISE\\(ABORT,\'([^\']+)\'\\); END;'));if(!sql)throw new Error('Review the retained correction trigger: '+name);return {body:sql[1],message:sql[2]};}
const originalRestoration=previous('recovery_restoration_source'),projection=previous('recovery_correction_projection');
const triggers:[string,string,string,string|null,string][]=[
 ['recovery_carrier_current_source','INSERT','seller_recovery_carrier_reviews',`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa>0 AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND receipt.payer_user_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0)
 AND NEW.restored_paisa=MAX(0,${current}+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(${current}+NEW.amount_paisa-NEW.restored_paisa))`,'recovery_carrier_current_source_required'],
 ['recovery_carrier_restoration_source','INSERT','seller_recovery_carrier_restorations',`NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE review.id=NEW.review_id AND c.id=NEW.case_id AND c.revision=review.case_revision
 AND NEW.amount_paisa<=review.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0))))`,'recovery_carrier_original_collection_required'],
 ['recovery_carrier_complete_projection','UPDATE','seller_recovery_cases',`NEW.revision>OLD.revision AND ${carrierDispositionPendingSql('NEW.id')}`,'recovery_carrier_complete_projection_required'],
 ['recovery_correction_carrier_boundary','INSERT','seller_recovery_liability_corrections',`NEW.new_confirmed_paisa-NEW.new_absorbed_paisa<COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=NEW.case_id AND a.method='carrier'),0)`,'recovery_carrier_excess_needs_own_disposition'],
 ['recovery_carrier_no_seller_gift','INSERT','seller_recovery_restorations',`EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.method='carrier')`,'recovery_carrier_excess_needs_own_disposition'],
 ...(['seller_recovery_carrier_reviews','seller_recovery_carrier_restorations'] as const).flatMap(table=>['UPDATE','DELETE'].map(action=>[table+'_'+action.toLowerCase(),action,table,null,'recovery_carrier_history_retained'] as [string,string,string,string|null,string])),
];
const cap=`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL AND (
 NEW.method<>'carrier' AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))`;
triggers.push(['recovery_allocation_cap','INSERT','seller_recovery_allocations',cap,'recovery_remaining_cap_exceeded']);
const changedProjection=projection.body.replace('OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)','OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)');
if(changedProjection===projection.body)throw new Error('Review the original restoration projection before extending it.');
const retainedTriggers=[`CREATE TRIGGER recovery_restoration_source BEFORE ${originalRestoration.body.replaceAll('FROM seller_recovery_restorations','FROM seller_recovery_all_restorations')}\nBEGIN SELECT RAISE(ABORT,'${originalRestoration.message}'); END;`,`CREATE TRIGGER recovery_correction_projection BEFORE ${changedProjection}\nBEGIN SELECT RAISE(ABORT,'${projection.message}'); END;`];
const drops=['recovery_restoration_source','recovery_correction_projection','recovery_allocation_cap'].map(name=>'DROP TRIGGER '+name+';');
const sqlite='-- Generated source only. Canonical and live execution remain held.\n'+[reviews,restorations,view,...indexes,...drops,...retainedTriggers,...triggers.map(([name,action,table,when,message])=>`CREATE TRIGGER ${name} BEFORE ${action} ON ${table}${when?'\nWHEN '+when:''}\nBEGIN SELECT RAISE(ABORT,'${message}'); END;`)].join('\n--> statement-breakpoint\n')+'\n';
const mariaTable=(sql:string)=>sql.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(source_json|evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
const mariaRetained=retainedTriggers.map(mariaRetainedTrigger);
const maria='-- Generated source parity for 0130. Execution remains held.\n'+[mariaTable(reviews),mariaTable(restorations).replace(' ) ENGINE',", historical_review_id VARCHAR(191) AS (CASE WHEN allocation_id IS NULL THEN review_id ELSE NULL END) PERSISTENT UNIQUE\n ) ENGINE"),view,...indexes.filter(sql=>!sql.includes(' WHERE '))].join('\n\n')+'\nDELIMITER $$\n'+[...mariaRetained,...triggers.map(([name,action,table,when,message])=>`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${table} FOR EACH ROW BEGIN ${when?'IF ('+when+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${when?' END IF;':''} END$$`)].join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0130_recovery_carrier_reimbursements.sql'),sqlite,'utf8');
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-carrier-reimbursements.sql'),maria.replace(/MAX\(0,/g,'GREATEST(0,'),'utf8');
