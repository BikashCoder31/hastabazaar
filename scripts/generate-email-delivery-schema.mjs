import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function mariaEmailSchema(sql) {
 sql=sql.replace(/\r\n/g,'\n');
 sql=sql.replace(/^--> statement-breakpoint\r?$/gm,'');
 const triggers=[];
 let output=sql.replace(/CREATE TRIGGER (\w+) BEFORE (UPDATE|DELETE) ON (\w+)\s*(?:WHEN ([\s\S]*?)\n)?BEGIN SELECT RAISE\(ABORT,'([^']+)'\); END;/g,(_,name,event,table,condition,error)=>{
  const predicate=condition?.replace(/NEW\.(\w+) IS NOT OLD\.\1/g,(_,column)=>`NOT(NEW.${column}<=>OLD.${column})`);
  triggers.push(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW BEGIN\n${predicate?`IF ${predicate} THEN\n`:''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${error}';\n${predicate?'END IF;\n':''}END$$`);
  return '';
 });
 if(/CREATE\s+TRIGGER|RAISE\s*\(/i.test(output))throw new Error('Unconverted email schema trigger; preserve fail-closed parity.');
 output=output.replace(/\bINTEGER\b/g,'BIGINT').replace(/^(\s*)(\w+) TEXT/gm,(_,space,column)=>`${space}${column} ${column==='cursor'||column==='provider_receipt'?'TEXT':'VARCHAR(191)'}`);
 output=output.replace(/CREATE UNIQUE INDEX service_health_one_open[^;]+;/,`ALTER TABLE service_health_incidents ADD COLUMN open_key VARCHAR(383) GENERATED ALWAYS AS (CASE WHEN state<>'resolved' THEN CONCAT(environment,':',service_key) ELSE NULL END) STORED, ADD UNIQUE KEY service_health_one_open(open_key);`);
 output=output.replace(/^(\s*)cursor TEXT/gm,'$1`cursor` TEXT');
 return `${output.trim()}\n\nDELIMITER $$\n${triggers.join('\n')}\nDELIMITER ;\n`;
}
for(const [source,target] of [['0147_durable_email_delivery.sql','mariadb-durable-email-delivery.sql'],['0148_email_service_health.sql','mariadb-email-service-health.sql']]) {
 const sql=await readFile(resolve(root,'drizzle',source),'utf8');
 await writeFile(resolve(root,'deployment/babal',target),mariaEmailSchema(sql));
}
