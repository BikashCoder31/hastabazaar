/** Source parity generation only. Reads SQL and writes one deployment source; opens no database. */
import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile('drizzle/0143_receipt_return_bank_satisfactions.sql','utf8');
const chunks=source.split('--> statement-breakpoint').map(part=>part.trim()).filter(Boolean);
const ordinary:string[]=[],triggers:string[]=[];
function maria(predicate:string){
 let result=predicate.replace(/EXISTS\(SELECT 1 FROM json_each\(account\.conflicts_json\) response_scope WHERE response_scope\.value=actor\.id\)/g,"JSON_CONTAINS(account.conflicts_json,JSON_QUOTE(actor.id))=1");
 const planned=/EXISTS\(SELECT 1 FROM json_each\(review\.plan_json,'\$\.returnSatisfactions'\) planned WHERE[\s\S]+?json_extract\(planned\.value,'\$\.originalPayerReturnedConfirmed'\)=1\)/g;
 result=result.replace(planned,`JSON_CONTAINS(review.plan_json,JSON_MERGE_PATCH(JSON_OBJECT('id',NEW.id,'receiptUseId',NEW.receipt_use_id,'useRevision',NEW.use_revision,'obligationId',NEW.obligation_id,'obligationRevision',NEW.obligation_revision,'customerId',NEW.customer_id,'amountPaisa',NEW.amount_paisa),'{"originalPayerReturnedConfirmed":true}'),'$.returnSatisfactions')=1`);
 result=result.replace(/json_extract\((c\.original_source_json|outcome\.private_details_json),'([^']+)'\)/g,"JSON_UNQUOTE(JSON_EXTRACT($1,'$2'))").replaceAll('json_array_length(','JSON_LENGTH(');
 if(result.includes('json_each('))throw new Error('Review untranslated SQLite JSON table access in bank-satisfaction source.');
 return result;
}
for(const chunk of chunks){
 const sql=chunk.replace(/^--[^\n]*(?:\n|$)/gm,'').trim();
 if(!sql||sql.startsWith('DROP TRIGGER'))continue;
 if(sql.startsWith('CREATE TABLE')){ordinary.push(sql.replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/\bINTEGER\b/g,'BIGINT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'));continue;}
 if(sql.startsWith('DROP VIEW')||sql.startsWith('CREATE VIEW')){ordinary.push(sql);continue;}
 const guarded=/^CREATE TRIGGER (\w+) BEFORE (INSERT|UPDATE|DELETE) ON (\w+)\s+WHEN ([\s\S]+?)\s+BEGIN SELECT RAISE\(ABORT,'([^']+)'\); END;$/.exec(sql);
 if(guarded){triggers.push(`CREATE OR REPLACE TRIGGER ${guarded[1]} BEFORE ${guarded[2]} ON ${guarded[3]} FOR EACH ROW BEGIN IF (${maria(guarded[4])}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${guarded[5]}'; END IF; END$$`);continue;}
 const retained=/^CREATE TRIGGER (\w+) BEFORE (UPDATE|DELETE) ON (\w+) BEGIN SELECT RAISE\(ABORT,'([^']+)'\); END;$/.exec(sql);
 if(retained){triggers.push(`CREATE OR REPLACE TRIGGER ${retained[1]} BEFORE ${retained[2]} ON ${retained[3]} FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${retained[4]}'; END$$`);continue;}
 const pool=/^CREATE TRIGGER (\w+) AFTER INSERT ON (\w+) BEGIN ([\s\S]+) END;$/.exec(sql);
 if(pool){triggers.push(`CREATE OR REPLACE TRIGGER ${pool[1]} AFTER INSERT ON ${pool[2]} FOR EACH ROW BEGIN ${pool[3].replace('ON CONFLICT(receipt_use_id) DO UPDATE SET','ON DUPLICATE KEY UPDATE')} END$$`);continue;}
 throw new Error('Review unsupported native bank-satisfaction source statement: '+sql.slice(0,90));
}
await writeFile('deployment/babal/mariadb-receipt-return-bank-satisfactions.sql','-- Source parity0143; native MariaDB verification remains required.\n'+ordinary.join('\n')+'\nDELIMITER $$\n'+triggers.join('\n')+'\nDELIMITER ;\n');
