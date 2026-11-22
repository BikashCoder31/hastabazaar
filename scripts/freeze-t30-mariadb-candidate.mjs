import assert from 'node:assert/strict';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
assert.equal((await realpath(process.cwd())).toLowerCase(),(await realpath('C:/Users/abinash/Desktop/HastaBazaar')).toLowerCase());
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),directory='.test-artifacts/t30/maria-candidate',sources={},tables=[],expectedForeignKeys=[];
for(const name of ['drizzle/0149_team_governance.sql','drizzle/0150_incident_governance.sql','drizzle/0151_form_health_records.sql','deployment/babal/mariadb-team-governance.sql','deployment/babal/mariadb-incident-governance.sql','deployment/babal/mariadb-form-health-records.sql','lib/operations/governance-schema.mjs']){
 const bytes=await readFile(name);sources[name]=hash(bytes);if(!name.startsWith('drizzle/'))continue;
 const text=bytes.toString();for(const table of text.matchAll(/CREATE TABLE (\w+)\s*\(([\s\S]*?)\);/g)){
  tables.push(table[1]);for(const reference of table[2].matchAll(/(?:^|,)\s*(\w+)\s+TEXT\b[^,\n]*?\bREFERENCES\s+(\w+)\((\w+)\)/g))expectedForeignKeys.push({tableName:table[1],columnName:reference[1],parentTable:reference[2],parentColumn:reference[3]});
 }
}
const count=Object.keys(sources).filter(name=>name.startsWith('drizzle/')).map(async name=>(String(await readFile(name)).match(/REFERENCES /g)||[]).length);assert.equal((await Promise.all(count)).reduce((a,b)=>a+b,0),expectedForeignKeys.length,'Parse every native source FK exactly.');
const freeze={schemaSha256:hash(await readFile(directory+'/mariadb-schema.sql')),resetSha256:hash(await readFile(directory+'/mariadb-reset-empty-import.sql')),sources,tables,expectedForeignKeyCount:expectedForeignKeys.length,expectedForeignKeys};await writeFile(directory+'/freeze.json',JSON.stringify(freeze,null,2));console.log(JSON.stringify({schemaSha256:freeze.schemaSha256,resetSha256:freeze.resetSha256,newTables:tables.length,newForeignKeys:expectedForeignKeys.length}));
