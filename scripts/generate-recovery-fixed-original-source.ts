/** Generate source parity only; no database or external service is opened. */
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixedOriginalUnpaidSql,fixedOriginalBalanceQuery} from '../lib/payments/recovery-fixed-original';
import {carrierUnpaidAvailableSql} from '../lib/payments/recovery-carrier-unpaid';
import {retiredRecoveryPayoutSql} from '../lib/payments/recovery-payout-retirement';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
type Trigger={name:string;action:string;table:string;when:string;message:string};
const prior=new Map<string,Trigger>();
for(const name of (await readdir(resolve(root,'drizzle'))).filter(n=>/^\d{4}_.*\.sql$/.test(n)&&n<'0137').sort()){
 const sql=await readFile(resolve(root,'drizzle',name),'utf8');
 for(const m of sql.matchAll(/CREATE TRIGGER (\w+) BEFORE (INSERT|UPDATE|DELETE) ON (\w+)\r?\nWHEN ([\s\S]+?)\r?\nBEGIN SELECT RAISE\(ABORT,'([^']+)'\); END;/g))prior.set(m[1],{name:m[1],action:m[2],table:m[3],when:m[4],message:m[5]});
}
function copy(name:string){const t=prior.get(name);if(!t)throw new Error('Review retained trigger '+name);return {...t};}
function triggers(dialect:'sqlite'|'mariadb'){
 const common=copy('recovery_unpaid_correction_source');
 const original=`EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))`;
 if(common.when.split(original).length!==4)throw new Error('Review all three original combined-disposition boundaries.');
 const mixed=`(c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))`;
 common.when=common.when.replaceAll(original,`(${original} OR ${mixed})`);
 const fixed=copy('recovery_unpaid_correction_fixed');
 fixed.when=`EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed') AND NOT EXISTS(
 SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments adjustment ON adjustment.id=c.supplier_adjustment_id JOIN managed_supplier_obligations o ON o.id=adjustment.obligation_id
 WHERE c.id=NEW.case_id AND o.seller_id=c.seller_id AND NEW.fixed_obligation_id=o.id AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL
 AND c.liability_reduced_paisa=adjustment.amount_paisa-NEW.original_charge_paisa
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status<>'paid' AND NOT ${retiredRecoveryPayoutSql('fixed','p.id','o.seller_id')})
 AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN managed_supplier_payments p ON p.id=packet.supplier_payment_id WHERE p.obligation_id=o.id AND packet.state IN('processing','uncertain')))`;
 const carrier=copy('recovery_carrier_unpaid_source'),marker="AND NEW.amount_paisa<=";
 const index=carrier.when.lastIndexOf(marker);if(index<0)throw new Error('Review the retained carrier unpaid cap.');
 carrier.when=carrier.when.slice(0,index)+')';
 const cap:Trigger={name:'recovery_carrier_unpaid_original_cap',action:'INSERT',table:'seller_recovery_carrier_unpaid_reviews',when:`NEW.amount_paisa>COALESCE((SELECT ${carrierUnpaidAvailableSql('c',dialect)} FROM seller_recovery_cases c WHERE c.id=NEW.case_id),-1)`,message:'recovery_carrier_unpaid_original_cap_exceeded'};
 const fixedCap:Trigger={name:'recovery_unpaid_fixed_original_cap',action:'INSERT',table:'seller_recovery_unpaid_corrections',when:`EXISTS(SELECT 1 FROM seller_recovery_cases WHERE id=NEW.case_id AND payout_model='fixed') AND NEW.original_charge_paisa<>${fixedOriginalUnpaidSql('NEW.case_id',dialect)}`,message:'recovery_unpaid_fixed_original_cap_required'};
 return [common,fixed,carrier,cap,fixedCap];
}
const sqlite='-- Source only; canonical and live execution remain held.\n'+'CREATE VIEW seller_recovery_fixed_original_balances AS '+fixedOriginalBalanceQuery('sqlite')+';\n--> statement-breakpoint\n'+triggers('sqlite').flatMap(t=>[...(prior.has(t.name)?['DROP TRIGGER '+t.name+';']:[]),`CREATE TRIGGER ${t.name} BEFORE ${t.action} ON ${t.table}\nWHEN ${t.when}\nBEGIN SELECT RAISE(ABORT,'${t.message}'); END;`]).join('\n--> statement-breakpoint\n')+'\n';
const maria='-- Source parity for 0137; execution remains held.\nCREATE VIEW seller_recovery_fixed_original_balances AS '+fixedOriginalBalanceQuery('mariadb')+';\nDELIMITER $$\n'+triggers('mariadb').map(t=>`CREATE OR REPLACE TRIGGER ${t.name} BEFORE ${t.action} ON ${t.table} FOR EACH ROW BEGIN IF (${t.when}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${t.message}'; END IF; END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0137_recovery_fixed_original.sql'),sqlite);
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-fixed-original.sql'),maria);
