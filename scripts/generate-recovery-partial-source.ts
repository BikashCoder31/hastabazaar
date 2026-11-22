/** Source generation only; no database connection or migration runner. */
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {partialUnpaidSourceSql} from '../lib/payments/recovery-partial-source';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const table=`CREATE TABLE seller_recovery_partial_sources(
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL UNIQUE REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),refund_id TEXT NOT NULL UNIQUE REFERENCES refunds(id),
 order_item_id TEXT NOT NULL REFERENCES order_items(id),scope_id TEXT NOT NULL,
 basis_paisa INTEGER NOT NULL CHECK(basis_paisa>0 AND basis_paisa<=9007199254740991),
 native_charge_paisa INTEGER NOT NULL CHECK(native_charge_paisa>0 AND native_charge_paisa<=9007199254740991),
 capacity_paisa INTEGER NOT NULL CHECK(capacity_paisa>=0 AND capacity_paisa<=basis_paisa),
 used_paisa INTEGER NOT NULL CHECK(used_paisa>=0 AND used_paisa<=capacity_paisa),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>=0 AND amount_paisa<native_charge_paisa AND amount_paisa<=capacity_paisa-used_paisa),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
);`;
type Trigger=[string,string,string,string|null,string];
const proof=(model:'registered'|'managed')=>`EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='${model}')
 AND NOT EXISTS(SELECT 1 FROM (${partialUnpaidSourceSql(model,'NEW.refund_id','NEW.seller_id')}) original
 WHERE original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa
 AND original.nativeDebitPaisa=NEW.native_charge_paisa AND original.capacityPaisa=NEW.capacity_paisa
 AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)`;
const triggers:Trigger[]=[
 ['recovery_partial_current','INSERT','seller_recovery_partial_sources',`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id AND c.payout_model IN('registered','managed')
 AND actor.status='active' AND seller.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_unpaid_sources x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews x WHERE x.case_id=c.id))`,'recovery_partial_current_source_required'],
 ...(['registered','managed'] as const).map(model=>[`recovery_partial_${model}`,'INSERT','seller_recovery_partial_sources',proof(model),'recovery_partial_shared_original_capacity_required'] as Trigger),
 ['recovery_partial_no_duplicate_unpaid','INSERT','seller_recovery_unpaid_sources','EXISTS(SELECT 1 FROM seller_recovery_partial_sources x WHERE x.case_id=NEW.case_id)','recovery_partial_original_already_recognized'],
 ['recovery_partial_projection','UPDATE','seller_recovery_cases',`NEW.revision<>OLD.revision AND EXISTS(SELECT 1 FROM seller_recovery_partial_sources x WHERE x.case_id=NEW.id
 AND (NEW.confirmed_paisa<>x.native_charge_paisa-x.amount_paisa-COALESCE((SELECT SUM(c.old_confirmed_paisa-c.new_confirmed_paisa) FROM seller_recovery_liability_corrections c WHERE c.case_id=NEW.id),0)
 OR NEW.exposure_paisa<>NEW.confirmed_paisa))`,'recovery_partial_original_projection_required'],
 ['recovery_partial_immutable','UPDATE','seller_recovery_partial_sources',null,'recovery_partial_original_retained'],
 ['recovery_partial_retained','DELETE','seller_recovery_partial_sources',null,'recovery_partial_original_retained'],
];
const originalUnpaidView=`CREATE VIEW seller_recovery_original_unpaid_reviews AS
 SELECT id,case_id,seller_id,refund_id,order_item_id,scope_id,amount_paisa,amount_paisa AS native_charge_paisa FROM seller_recovery_unpaid_sources
 UNION ALL SELECT id,case_id,seller_id,refund_id,order_item_id,scope_id,amount_paisa,native_charge_paisa FROM seller_recovery_partial_sources`;
const prior=await readFile(resolve(root,'drizzle/0129_recovery_unpaid_corrections.sql'),'utf8');
const replacements:Trigger[]=[];
for(const name of ['recovery_unpaid_correction_source','recovery_unpaid_correction_registered','recovery_unpaid_correction_managed']){
 const start=prior.indexOf('CREATE TRIGGER '+name+' '),end=prior.indexOf('\nBEGIN SELECT RAISE',start),chunk=prior.slice(start,end);
 let when=chunk.slice(chunk.indexOf('\nWHEN ')+6);
 if(name==='recovery_unpaid_correction_source'){
  const partial=`EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))`;
  when=when.replace('AND c.restored_paisa=0 AND c.liability_reduced_paisa=0',`AND c.disputed_paisa=0 AND (c.restored_paisa=0 AND c.liability_reduced_paisa=0 OR ${partial})`)
   .replace('AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)',`AND (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id) OR ${partial})`)
   .replace('AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)',`AND (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id) OR ${partial})`)
   .replace('AND NEW.previous_restored_paisa=',`AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts receipt ON receipt.id=a.receipt_id WHERE a.case_id=c.id
    AND (receipt.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id))) AND NEW.previous_restored_paisa=`);
 }else when=when.replace('JOIN seller_recovery_unpaid_sources unpaid','JOIN seller_recovery_original_unpaid_reviews unpaid').replace('unpaid.amount_paisa=COALESCE((SELECT -SUM','unpaid.native_charge_paisa=COALESCE((SELECT -SUM');
 replacements.push([name,'INSERT','seller_recovery_unpaid_corrections',when,name.endsWith('_source')?'recovery_unpaid_correction_current_source_required':'recovery_unpaid_correction_native_credit_required']);
}
triggers.push(...replacements);
const index='CREATE INDEX recovery_partial_original_scope ON seller_recovery_partial_sources(seller_id,scope_id);';
const sqlite='-- Generated source only; canonical and live execution remain held.\n'+[table,index,originalUnpaidView+';',...replacements.map(([name])=>'DROP TRIGGER '+name+';'),...triggers.map(([name,action,on,when,message])=>`CREATE TRIGGER ${name} BEFORE ${action} ON ${on}${when?'\nWHEN '+when:''}\nBEGIN SELECT RAISE(ABORT,'${message}'); END;`)].join('\n--> statement-breakpoint\n')+'\n';
const mariaTable=table.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(source_json|evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
const maria='-- Generated source parity for 0131; execution remains held.\n'+[mariaTable,index,originalUnpaidView+';'].join('\n\n')+'\n\nDELIMITER $$\n'+triggers.map(([name,action,on,when,message])=>`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${on} FOR EACH ROW BEGIN ${when?'IF ('+when.replace("'Original recovery correction '||c.id","CONCAT('Original recovery correction ',c.id)")+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${when?' END IF;':''} END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0131_recovery_partial_sources.sql'),sqlite,'utf8');
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-partial-sources.sql'),maria,'utf8');
