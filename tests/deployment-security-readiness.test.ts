import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../deployment/babal/release-manifest.json';
import {inspectDeploymentReadiness} from '../lib/operations/deployment-readiness';
import {inspectReadiness} from '../lib/operations/readiness';
import nativeFeeMetadata from './helpers/mariadb-fee-readiness-metadata.json';

const db={dialect:'mariadb',prepare(sql:string){return {async all(){
 if(sql.includes('information_schema.COLUMNS'))return {results:Object.entries(manifest.requiredTables).flatMap(([tableName,names])=>names.map(columnName=>({tableName,columnName,generationExpression:"case when binary disposition='reserved' then entitlement_id else null end",collation:manifest.requiredColumnCollations[`${tableName}.${columnName}` as keyof typeof manifest.requiredColumnCollations]??'utf8mb4_unicode_ci'})))};
 if(sql.includes('information_schema.STATISTICS'))return {results:Object.entries(manifest.requiredUniqueIndexes).flatMap(([key,columns])=>columns.map((columnName,i)=>({tableName:key.split('.')[0],name:key.split('.')[1],columnName,position:i+1,nonUnique:0,prefixLength:null})))};
 if(sql.includes('information_schema.TRIGGERS'))return {results:Object.entries(manifest.requiredTriggers).map(([name,parts])=>({name,definition:nativeFeeMetadata.triggers.find(row=>row.name===name)?.definition??(parts.join(' ')||'BEGIN SIGNAL END'),tableName:manifest.requiredTriggerShapes[name as keyof typeof manifest.requiredTriggerShapes]?.table,event:manifest.requiredTriggerShapes[name as keyof typeof manifest.requiredTriggerShapes]?.event,timing:'BEFORE'}))};
 if(sql.includes('information_schema.CHECK_CONSTRAINTS'))return {results:Object.entries(manifest.requiredChecks).map(([key,parts])=>nativeFeeMetadata.checks.find(row=>row.tableName+'.'+row.name===key)??({tableName:key.split('.')[0],name:key.split('.')[1],definition:parts.join(' ')}))};
 if(sql.includes('information_schema.KEY_COLUMN_USAGE'))return {results:Object.entries(manifest.requiredForeignKeys).flatMap(([key,fk])=>fk.columns.map((columnName,i)=>({tableName:key.split('.')[0],name:key.split('.')[1],columnName,position:i+1,referencedTable:fk.referencedTable,referencedColumn:fk.referencedColumns[i],referencedSchema:'fixture',databaseName:'fixture',deleteRule:'RESTRICT',updateRule:'RESTRICT'})))};
 if(sql.includes('FROM marketplace_fee_waiver_control'))return {results:[{id:'default',revision:0}]};
 return {results:[]};
}};}} as unknown as D1Database;
void test('a complete native schema cannot pass deployment readiness without initialized staff security',async()=>{
 assert.deepEqual(await inspectReadiness(db),{ready:true,missing:[]});
 let checked=0;
 const failed=await inspectDeploymentReadiness(db,{},async()=>{checked++;return {ready:false,reasonCodes:['SECURITY_SETUP_PENDING']};});
 assert.equal(checked,1);assert.equal(failed.ready,false);assert.deepEqual(failed.missing,['security:SECURITY_SETUP_PENDING']);
 const passed=await inspectDeploymentReadiness(db,{},async()=>({ready:true,reasonCodes:[]}));assert.equal(passed.ready,true);
 const unavailable=await inspectDeploymentReadiness(db,{},async()=>{throw Error('private diagnostic');});assert.deepEqual(unavailable,{ready:false,missing:['security:SECURITY_STATE_UNAVAILABLE']});
});
