import assert from 'node:assert/strict';
import test from 'node:test';
import {incentiveReportDatabase} from './helpers/incentive-report-database';
import {seedIncentiveCustomer} from './helpers/incentive-db';
import {publishForm,NOW} from './helpers/loyalty-fixture';
import {createBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {readCommercialOutcome} from '../lib/admin/commercial-outcome';

async function fixture(){
 const f=await incentiveReportDatabase();
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 try{
  await seedIncentiveCustomer(f.db,'super');
  f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('super','super_admin',1)");
  await publishForm(f.db,'staff.business-settings-manager');
  const form={formId:'staff.business-settings-manager',versionId:'staff.business-settings-manager-v1',answers:{formId:'staff.business-settings-manager',version:1,answers:[]}};
  const draft=await createBusinessSettingDraft(f.db,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:1000},actorId:'super',reason:'Fictional original private receipt.',requestId:'Original-Case',now:NOW,form});
  return {...f,draft,actor:{id:'super',authSubject:'super'}};
 }catch(error){f.dispose();throw error;}
}

void test('case-insensitive native lookup cannot relabel an original receipt as another opaque attempt',async()=>{
 const f=await fixture();try{
  // Deliberately reproduce a CI comparison in SQLite; this is not a claim of a native Maria run.
  const db=new Proxy(f.db,{get(target,key){
   if(key==='prepare')return(sql:string)=>target.prepare(sql.replaceAll('request_id=?','request_id=? COLLATE NOCASE'));
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  assert.equal((await readCommercialOutcome(db,f.actor,'business-setting','Original-Case'))?.sourceId,f.draft.id);
  assert.equal(await readCommercialOutcome(db,f.actor,'business-setting','original-case'),null,'A differently cased reference must not recover the original native action.');
 }finally{f.dispose();}
});

void test('an authenticated subject replaced after the final role read cannot receive its former receipt',async()=>{
 const f=await fixture();try{
  let authorityReads=0,changed=false;
  const db=new Proxy(f.db,{get(target,key){
   if(key==='prepare')return(sql:string)=>{
    const statement=target.prepare(sql);if(!sql.startsWith('SELECT u.id,r.role'))return statement;
    const proxy:D1PreparedStatement=new Proxy(statement,{get(source,property){
     if(property==='bind')return(...values:unknown[])=>{source.bind(...values);return proxy;};
     if(property==='first')return async()=>{const row=await source.first();if(++authorityReads===2){f.sqlite.prepare('UPDATE users SET auth_subject=? WHERE id=?').run('new-external-subject','super');changed=true;}return row;};
     const value=Reflect.get(source,property);return typeof value==='function'?value.bind(source):value;
    }});return proxy;
   };
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  await assert.rejects(()=>readCommercialOutcome(db,f.actor,'business-setting','Original-Case'));
  assert.equal(changed,true,'Exercise the real late subject replacement.');
 }finally{f.dispose();}
});
