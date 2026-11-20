/** Source generation only. No database is opened. */
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {carrierUnpaidAvailableSql,carrierUnpaidDispositionPendingSql} from '../lib/payments/recovery-carrier-unpaid';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
type Trigger={name:string;action:string;table:string;when:string|null;message:string};
const prior=new Map<string,Trigger>();
for(const name of (await readdir(resolve(root,'drizzle'))).filter(n=>/^\d{4}_.*\.sql$/.test(n)&&n<'0134').sort()){
 const sql=await readFile(resolve(root,'drizzle',name),'utf8');
 for(const match of sql.matchAll(/CREATE TRIGGER (\w+) BEFORE (INSERT|UPDATE|DELETE) ON (\w+)\r?\nWHEN ([\s\S]+?)\r?\nBEGIN SELECT RAISE\(ABORT,'([^']+)'\); END;/g))prior.set(match[1],{name:match[1],action:match[2],table:match[3],when:match[4],message:match[5]});
}
function copy(name:string){const t=prior.get(name);if(!t)throw new Error('Review retained trigger '+name);return {...t};}
const table=`CREATE TABLE seller_recovery_carrier_unpaid_reviews (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),receipt_revision INTEGER NOT NULL,allocation_id TEXT NOT NULL UNIQUE,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
);`;
const source133=await readFile(resolve(root,'drizzle/0133_recovery_payout_returns.sql'),'utf8');
const oldView=source133.match(/CREATE VIEW seller_recovery_all_restorations AS[\s\S]+?;/)![0];
const view=oldView.slice(0,-1)+`\n UNION ALL SELECT id,case_id,allocation_id,'carrier' AS method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_unpaid_reviews;`;
const current=copy('recovery_carrier_current_source');
const unpaidCurrent={...current,name:'recovery_carrier_unpaid_source',table:'seller_recovery_carrier_unpaid_reviews',when:current.when!
 .replace('AND c.confirmed_paisa>0','')
 .replace(/AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-[\s\S]+$/,`AND NEW.amount_paisa<=${carrierUnpaidAvailableSql('c')})`),message:'recovery_carrier_unpaid_current_source_required'};
if(unpaidCurrent.when.includes('NEW.restored_paisa')||!unpaidCurrent.when.includes('seller_recovery_original_unpaid_reviews'))throw new Error('Review original carrier source boundary.');
const changed:Trigger[]=[];
for(const name of ['recovery_carrier_current_source','recovery_correction_carrier_boundary','recovery_payout_return_current']){
 const t=copy(name),old=t.when!;
 t.when=old.replaceAll('SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE', 'SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE');
 // Replace only sums restricted to carrier money. The returned review also has
 // a gross all-method current-position sum, which must keep its original form.
 t.when=t.when.replaceAll('SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)', 'SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)');
 if(t.when===old)throw new Error('Review retained carrier ownership cap '+name);changed.push(t);
}
const allocation=copy('recovery_allocation_cap'),needle=" OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews";
if(!allocation.when!.includes(needle))throw new Error('Review shared allocation cap');
allocation.when=allocation.when!.replace(needle,` OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id)\n${needle}`);
changed.push(allocation);
const projection=copy('recovery_correction_projection'),sum='COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_payout_return_reviews x WHERE x.case_id=NEW.id),0)';
if(!projection.when!.includes(sum))throw new Error('Review restoration projection');projection.when=projection.when!.replace(sum,sum+'+COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=NEW.id),0)');changed.push(projection);
const unpaidCorrection=copy('recovery_unpaid_correction_source');
const covered=`COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0)`;
const oldUnpaid=unpaidCorrection.when!;
unpaidCorrection.when=oldUnpaid.replace('c.restored_paisa=0 AND c.liability_reduced_paisa=0',`c.restored_paisa=${covered} AND c.liability_reduced_paisa=0`)
 .replace('NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)',`NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.allocation_id=a.id AND review.case_id=a.case_id AND review.amount_paisa=a.amount_paisa AND a.method='carrier'))`);
if(unpaidCorrection.when===oldUnpaid)throw new Error('Review current unpaid correction boundaries');changed.push(unpaidCorrection);
const fixedCorrection=copy('recovery_unpaid_correction_fixed'),fixedBound='<=o.original_amount_paisa+NEW.previous_restored_paisa';
if(!fixedCorrection.when!.includes(fixedBound))throw new Error('Review original fixed unpaid capacity');fixedCorrection.when=fixedCorrection.when!.replace(fixedBound,fixedBound+'+'+covered);changed.push(fixedCorrection);
const fresh:Trigger[]=[unpaidCurrent,
 {name:'recovery_carrier_unpaid_complete',action:'UPDATE',table:'seller_recovery_cases',when:`NEW.revision<>OLD.revision AND ${carrierUnpaidDispositionPendingSql('OLD.id')}`,message:'recovery_carrier_unpaid_disposition_incomplete'},
 {name:'recovery_unpaid_carrier_boundary',action:'INSERT',table:'seller_recovery_unpaid_corrections',when:`NEW.original_charge_paisa-NEW.previous_restored_paisa-NEW.amount_paisa<COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=NEW.case_id),0)`,message:'recovery_unpaid_carrier_excess_requires_disposition'},
 ...(['UPDATE','DELETE'] as const).map(action=>({name:'recovery_carrier_unpaid_'+action.toLowerCase(),action,table:'seller_recovery_carrier_unpaid_reviews',when:null,message:'recovery_carrier_unpaid_history_retained'}))];
const sqliteTrigger=(t:Trigger)=>`CREATE TRIGGER ${t.name} BEFORE ${t.action} ON ${t.table}${t.when?'\nWHEN '+t.when:''}\nBEGIN SELECT RAISE(ABORT,'${t.message}'); END;`;
const index='CREATE INDEX recovery_carrier_unpaid_case ON seller_recovery_carrier_unpaid_reviews(case_id);';
const sqlite='-- Generated source only; canonical and live execution remain held.\n'+[table,index,'DROP VIEW seller_recovery_all_restorations;',view,...changed.flatMap(t=>['DROP TRIGGER '+t.name+';',sqliteTrigger(t)]),...fresh.map(sqliteTrigger)].join('\n--> statement-breakpoint\n')+'\n';
const mariaTable=table.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(source_json|evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
const mariaTrigger=(t:Trigger)=>`CREATE OR REPLACE TRIGGER ${t.name} BEFORE ${t.action} ON ${t.table} FOR EACH ROW BEGIN ${t.when?'IF ('+t.when.replace(/\bMAX\(/g,'GREATEST(').replace(/\bMIN\(/g,'LEAST(')+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${t.message}';${t.when?' END IF;':''} END$$`;
const maria='-- Generated source parity for 0134; execution remains held.\n'+mariaTable+'\n'+index+'\n'+view.replace('CREATE VIEW','CREATE OR REPLACE VIEW')+'\nDELIMITER $$\n'+[...changed,...fresh].map(mariaTrigger).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0134_recovery_carrier_unpaid.sql'),sqlite);
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-carrier-unpaid.sql'),maria);
