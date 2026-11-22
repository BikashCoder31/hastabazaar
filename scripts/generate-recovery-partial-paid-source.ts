/** Source generation only. No database or external service is opened. */
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mariaOriginalSourcePoolView,patchMariaOriginalSourcePoolView,retained0138OriginalSourcePoolView} from './mariadb-original-source-pool-view';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const retainedSqlite=await readFile(resolve(root,'drizzle/0138_recovery_partial_paid.sql'),'utf8');
const historicalView=retained0138OriginalSourcePoolView(retainedSqlite);
if(process.argv.includes('--mariadb-view-only')){const path=resolve(root,'deployment/babal/mariadb-recovery-partial-paid.sql');await writeFile(path,patchMariaOriginalSourcePoolView(historicalView,await readFile(path,'utf8')));process.exit(0);}

type Trigger={name:string;action:string;table:string;when:string;message:string};
const prior=new Map<string,Trigger>();
for(const name of (await readdir(resolve(root,'drizzle'))).filter(n=>/^\d{4}_.*\.sql$/.test(n)&&n<'0138').sort()){
 const sql=await readFile(resolve(root,'drizzle',name),'utf8');
 for(const m of sql.matchAll(/CREATE TRIGGER (\w+) BEFORE (INSERT|UPDATE|DELETE) ON (\w+)\r?\nWHEN ([\s\S]+?)\r?\nBEGIN SELECT RAISE\(ABORT,'([^']+)'\); END;/g))prior.set(m[1],{name:m[1],action:m[2],table:m[3],when:m[4],message:m[5]});
}
function copy(name:string){const t=prior.get(name);if(!t)throw new Error('Review retained trigger '+name);return {...t};}
const view=historicalView;
const triggers:Trigger[]=(['registered','managed'] as const).map(model=>({...copy('recovery_partial_'+model),when:`EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='${model}')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='${model}' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.native_charge_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.partialUnpaidSource.nativeRemainingPaisa') AND original.capacityPaisa=NEW.capacity_paisa AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)`}));
for(const model of ['registered','managed'] as const){
 const unpaid=copy(`recovery_unpaid_${model}_native_proof`);
 unpaid.when=`EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='${model}') AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='${model}' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.amount_paisa AND original.offsetPaisa=NEW.amount_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.unpaidSource.nativeRemainingPaisa') AND original.capacityPaisa-original.usedPaisa-original.offsetPaisa=NEW.remaining_paisa)`;
 triggers.push(unpaid);
}
const poolTable=`CREATE TABLE seller_recovery_original_unpaid_pools(payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed')),seller_id TEXT NOT NULL REFERENCES seller_profiles(id),scope_id TEXT NOT NULL,used_paisa INTEGER NOT NULL CHECK(used_paisa>=0 AND used_paisa<=9007199254740991),PRIMARY KEY(payout_model,seller_id,scope_id));`;
const uses=`SELECT c.payout_model,u.seller_id,u.scope_id,u.amount_paisa FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id`;
const backfill=`INSERT INTO seller_recovery_original_unpaid_pools(payout_model,seller_id,scope_id,used_paisa) SELECT payout_model,seller_id,scope_id,SUM(amount_paisa) FROM (${uses}) u GROUP BY payout_model,seller_id,scope_id;`;
const total=`COALESCE((SELECT SUM(u.amount_paisa) FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id WHERE c.payout_model=NEW.payout_model AND u.seller_id=NEW.seller_id AND u.scope_id=NEW.scope_id),0)`;
triggers.push({name:'recovery_original_pool_insert',action:'INSERT',table:'seller_recovery_original_unpaid_pools',when:`NOT EXISTS(SELECT 1 FROM seller_recovery_original_unpaid_pools p WHERE p.payout_model=NEW.payout_model AND p.seller_id=NEW.seller_id AND p.scope_id=NEW.scope_id) AND NEW.used_paisa<>${total}`,message:'recovery_original_pool_projection_required'},
 {name:'recovery_original_pool_update',action:'UPDATE',table:'seller_recovery_original_unpaid_pools',when:`NEW.payout_model<>OLD.payout_model OR NEW.seller_id<>OLD.seller_id OR NEW.scope_id<>OLD.scope_id OR NEW.used_paisa<>${total}`,message:'recovery_original_pool_projection_required'},
 {name:'recovery_original_pool_delete',action:'DELETE',table:'seller_recovery_original_unpaid_pools',when:'1',message:'recovery_original_pool_retained'});
const targets=['seller_recovery_unpaid_sources','seller_recovery_partial_sources'];
const counter=(dialect:'sqlite'|'mariadb')=>`INSERT INTO seller_recovery_original_unpaid_pools(payout_model,seller_id,scope_id,used_paisa) VALUES((SELECT payout_model FROM seller_recovery_cases WHERE id=NEW.case_id),NEW.seller_id,NEW.scope_id,NEW.amount_paisa) ${dialect==='sqlite'?'ON CONFLICT(payout_model,seller_id,scope_id) DO UPDATE SET':'ON DUPLICATE KEY UPDATE'} used_paisa=CASE WHEN used_paisa=COALESCE(json_extract(NEW.source_json,'$.partialUnpaidSource.usedPaisa'),json_extract(NEW.source_json,'$.unpaidSource.usedPaisa'),-1) THEN used_paisa+NEW.amount_paisa ELSE -1 END;`;
const sqlite='-- Source only; canonical and live execution remain held.\n'+[view,poolTable,backfill,...triggers.flatMap(t=>[...(prior.has(t.name)?['DROP TRIGGER '+t.name+';']:[]),`CREATE TRIGGER ${t.name} BEFORE ${t.action} ON ${t.table}\nWHEN ${t.when}\nBEGIN SELECT RAISE(ABORT,'${t.message}'); END;`]),...targets.map((table,i)=>`CREATE TRIGGER recovery_original_pool_consume_${i} AFTER INSERT ON ${table} BEGIN\n${counter('sqlite')}\nEND;`)].join('\n--> statement-breakpoint\n')+'\n';
const maria='-- Source parity for 0138; native validation and execution remain held.\n'+[mariaOriginalSourcePoolView(view),poolTable.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'),backfill].join('\n')+'\nDELIMITER $$\n'+triggers.map(t=>`CREATE OR REPLACE TRIGGER ${t.name} BEFORE ${t.action} ON ${t.table} FOR EACH ROW BEGIN IF (${t.when}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${t.message}'; END IF; END$$`).join('\n')+'\n'+targets.map((table,i)=>`CREATE OR REPLACE TRIGGER recovery_original_pool_consume_${i} AFTER INSERT ON ${table} FOR EACH ROW BEGIN ${counter('mariadb')} END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0138_recovery_partial_paid.sql'),sqlite);
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-partial-paid.sql'),maria);
