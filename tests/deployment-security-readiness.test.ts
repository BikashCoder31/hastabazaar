import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../deployment/babal/release-manifest.json';
import {inspectDeploymentReadiness} from '../lib/operations/deployment-readiness';

const db={dialect:'mariadb',prepare(sql:string){return {async all(){
 if(sql.includes('information_schema.COLUMNS'))return {results:Object.entries(manifest.requiredTables).flatMap(([tableName,names])=>names.map(columnName=>({tableName,columnName,generationExpression:"case when binary disposition='reserved' then entitlement_id else null end",collation:'utf8mb4_unicode_ci'})))};
 if(sql.includes('information_schema.STATISTICS'))return {results:[{tableName:'managed_payout_allocations',name:'managed_allocation_one_reservation',nonUnique:0,position:1,columnName:'reserved_entitlement_key',prefixLength:null}]};
 if(sql.includes('information_schema.TRIGGERS'))return {results:Object.entries(manifest.requiredTriggers).map(([name,parts])=>({name,definition:parts.join(' ')||'BEGIN SIGNAL END'}))};
 if(sql.includes('information_schema.CHECK_CONSTRAINTS'))return {results:Object.entries(manifest.requiredChecks).map(([key,parts])=>({tableName:key.split('.')[0],name:key.split('.')[1],definition:parts.join(' ')}))};
 return {results:[]};
}};}} as unknown as D1Database;
void test('a complete native schema cannot pass deployment readiness without initialized staff security',async()=>{
 let checked=0;
 const failed=await inspectDeploymentReadiness(db,{},async()=>{checked++;return {ready:false,reasonCodes:['SECURITY_SETUP_PENDING']};});
 assert.equal(checked,1);assert.equal(failed.ready,false);assert.deepEqual(failed.missing,['security:SECURITY_SETUP_PENDING']);
 const passed=await inspectDeploymentReadiness(db,{},async()=>({ready:true,reasonCodes:[]}));assert.equal(passed.ready,true);
 const unavailable=await inspectDeploymentReadiness(db,{},async()=>{throw Error('private diagnostic');});assert.deepEqual(unavailable,{ready:false,missing:['security:SECURITY_STATE_UNAVAILABLE']});
});
