/** Source generation only; no database connection or migration runner. */
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const tables=[`CREATE TABLE seller_recovery_calculation_reviews(
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 submitted_by TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,evidence_reference TEXT,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,due_at INTEGER NOT NULL CHECK(due_at>created_at)
);`,`CREATE TABLE seller_recovery_calculation_answers(
 id TEXT PRIMARY KEY,review_id TEXT NOT NULL UNIQUE REFERENCES seller_recovery_calculation_reviews(id),case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,public_message TEXT NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL
);`];
type Trigger=[string,string,string,string|null,string];
const triggers:Trigger[]=[
 ['recovery_calculation_current_owner','INSERT','seller_recovery_calculation_reviews',`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users owner ON owner.id=seller.user_id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND owner.id=NEW.submitted_by AND owner.status='active' AND (CASE WHEN c.exposure_paisa>c.confirmed_paisa THEN c.exposure_paisa ELSE c.confirmed_paisa END)-c.absorbed_paisa-c.disputed_paisa<=0)
 OR EXISTS(SELECT 1 FROM seller_recovery_calculation_reviews prior WHERE prior.case_id=NEW.case_id AND NOT EXISTS(SELECT 1 FROM seller_recovery_calculation_answers answered WHERE answered.review_id=prior.id))`,'recovery_calculation_current_owner_or_pending_review_required'],
 ['recovery_calculation_current_reviewer','INSERT','seller_recovery_calculation_answers',`NOT EXISTS(SELECT 1 FROM seller_recovery_calculation_reviews request JOIN seller_recovery_cases c ON c.id=request.case_id
 JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE request.id=NEW.review_id AND request.case_id=NEW.case_id AND c.revision=NEW.case_revision AND actor.status='active' AND actor.id<>seller.user_id
 AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id))`,'recovery_calculation_current_independent_reviewer_required'],
 ...['reviews','answers'].flatMap(kind=>[['recovery_calculation_'+kind+'_immutable','UPDATE','seller_recovery_calculation_'+kind,null,'recovery_calculation_history_retained'],['recovery_calculation_'+kind+'_retained','DELETE','seller_recovery_calculation_'+kind,null,'recovery_calculation_history_retained']] as Trigger[]),
];
const index='CREATE INDEX recovery_calculation_case ON seller_recovery_calculation_reviews(case_id,created_at);';
const sqlite='-- Generated source only; canonical and live execution remain held.\n'+[...tables,index,...triggers.map(([name,action,on,when,message])=>`CREATE TRIGGER ${name} BEFORE ${action} ON ${on}${when?'\nWHEN '+when:''}\nBEGIN SELECT RAISE(ABORT,'${message}'); END;`)].join('\n--> statement-breakpoint\n')+'\n';
const mariaTables=tables.map(table=>table.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(source_json|evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'));
const maria='-- Generated source parity for 0132; execution remains held.\n'+[...mariaTables,index].join('\n\n')+'\n\nDELIMITER $$\n'+triggers.map(([name,action,on,when,message])=>`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${on} FOR EACH ROW BEGIN ${when?'IF ('+when+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${when?' END IF;':''} END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0132_recovery_calculation_reviews.sql'),sqlite,'utf8');
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-calculation-reviews.sql'),maria,'utf8');
