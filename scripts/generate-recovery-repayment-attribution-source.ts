/** Source parity only: never connects to a database or runs migrations. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=await readFile(resolve(root,'drizzle/0141_recovery_repayment_attributions.sql'),'utf8');
const statements=source.split('--> statement-breakpoint').map(s=>s.replace(/^--.*$/gm,'').trim()).filter(Boolean);
const ordinary:string[]=[],triggers:string[]=[];
for(const statement of statements){
 if(statement.startsWith('DROP TRIGGER '))continue;
 const match=/^CREATE TRIGGER (\w+) BEFORE (INSERT|UPDATE|DELETE) ON (\w+)(?:\s+WHEN ([\s\S]+?))?\s+BEGIN SELECT RAISE\(ABORT,'([^']+)'\); END;$/.exec(statement);
 if(match){const [,name,action,table,condition,message]=match;triggers.push(`CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${table} FOR EACH ROW BEGIN ${condition?'IF ('+condition+') THEN ':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';${condition?' END IF;':''} END$$`);continue;}
 if(!statement.startsWith('CREATE TABLE '))throw new Error('Unsupported attribution source: '+statement.slice(0,70));
 ordinary.push(statement.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bTEXT\b/g,'VARCHAR(191)').replace(/(evidence_reference|reason|public_message) VARCHAR\(191\)/g,'$1 TEXT').replace(/\);$/,' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'));
}
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-repayment-attributions.sql'),'-- Source parity for 0141. Canonical/live execution remains held.\n'+ordinary.join('\n')+'\nDELIMITER $$\n'+triggers.join('\n')+'\nDELIMITER ;\n');
