import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {coreFormContract} from '../lib/forms/core-contracts';
import {validateFormDraft} from '../lib/forms/validation';
import {FIXED_PREVIEW_FORM_IDS} from '../lib/forms/preview-contracts';
import {inspectFormPreviewReadiness,REQUIRED_PREVIEW_FORM_IDS} from '../scripts/staging/form-preview-readiness.mjs';

void test('read-only preview recognizes valid native core contracts while retaining independent storage and sign-in stops',async t=>{
 const f=await completeVersionFixture();
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions').get()!.n,0);
  for(const formId of REQUIRED_PREVIEW_FORM_IDS){
   if(coreFormContract(formId)||FIXED_PREVIEW_FORM_IDS.has(formId))continue;
   const config=validateFormDraft(formId,{formId,fields:[]});
   f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES(?,?,1,'published',?,'Isolated retained required publication','reviewer',1,'reviewer',1,'reviewer',1,?)`).run('fixture:'+formId,formId,JSON.stringify(config),'fixture:'+formId);
  }
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const result=inspectFormPreviewReadiness(f.sqlite);
  assert.deepEqual(result.invalidForms,[]);
  assert.deepEqual(result.missingForms,[],'An optional publication must not replace a valid native core contract.');
  assert.deepEqual(result.blockedFixedForms,[]);
  assert.equal(result.fixedForms.length,16);
  assert.equal(REQUIRED_PREVIEW_FORM_IDS.length,107,'Catalogue placement must not silently remove the approved runtime inventory.');
  assert.deepEqual(result.errors,['Missing sign-in table: user_credentials','Missing sign-in table: user_sessions','Missing sign-in table: email_login_challenges']);
  assert.equal(result.readyForms,REQUIRED_PREVIEW_FORM_IDS.length);
  assert.equal(result.ready,false,'Missing sign-in storage remains a stop even with valid core forms.');
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before,'Readiness must not repair, initialize or write any fixture data.');
  async function altered(name:string,mutate:()=>void,check:(result:ReturnType<typeof inspectFormPreviewReadiness>)=>void){
   await t.test(name,()=>{
    f.sqlite.exec('SAVEPOINT readiness_negative');
    try{
     mutate();
     const schema=f.sqlite.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();
     const changes=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
     const stopped=inspectFormPreviewReadiness(f.sqlite);check(stopped);assert.equal(stopped.ready,false);
     assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,changes);
     assert.deepEqual(f.sqlite.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all(),schema);
    }finally{f.sqlite.exec('ROLLBACK TO readiness_negative; RELEASE readiness_negative');}
   });
  }
  for(const guard of ['core_form_receipt_no_update','core_form_receipt_no_delete','audit_command_key_unique'])await altered('missing '+guard+' blocks core use without repair',()=>f.sqlite.exec((guard.endsWith('_unique')?'DROP INDEX ':'DROP TRIGGER ')+guard),stopped=>{
   assert.ok(stopped.blockedCoreForms.includes('seller.application'));assert.ok(stopped.errors.some((error:string)=>error.includes(guard)));
  });
  await altered('same-name weakened transaction CHECK is rejected',()=>f.sqlite.exec('DROP TABLE operation_transaction_guards; CREATE TABLE operation_transaction_guards(id VARCHAR(191) PRIMARY KEY,valid BIGINT NOT NULL CHECK(valid IN(0,1)))'),stopped=>{
   assert.ok(stopped.blockedCoreForms.includes('seller.application'));assert.ok(stopped.errors.some((error:string)=>error.includes('unrecognized operation_transaction_guards')));
  });
  await altered('same-name disabled core retention trigger is rejected',()=>f.sqlite.exec("DROP TRIGGER core_form_receipt_no_delete; CREATE TRIGGER core_form_receipt_no_delete BEFORE DELETE ON audit_logs WHEN 0 BEGIN SELECT RAISE(ABORT,'core_form_receipt_retained'); END"),stopped=>{
   assert.ok(stopped.errors.some((error:string)=>error.includes('unrecognized core_form_receipt_no_delete')));
  });
  await altered('published receipts require the real health columns used by their writer',()=>f.sqlite.exec('ALTER TABLE form_answer_sets DROP COLUMN health_environment'),stopped=>{
   assert.ok(stopped.errors.some((error:string)=>error.includes('missing form_answer_sets.health_environment')));
  });
  for(const guard of ['feedback_native_origin_insert','feedback_native_origin_update','feedback_native_facts_immutable','feedback_native_proof_immutable','feedback_native_proof_retained'])await altered('missing '+guard+' blocks the three public native forms',()=>f.sqlite.exec('DROP TRIGGER '+guard),stopped=>{
   assert.deepEqual(stopped.blockedCoreForms,['public.contact','public.feedback','public.footer-feedback']);assert.ok(stopped.errors.some((error:string)=>error.includes(guard)));
  });
  await altered('published malformed native metadata cannot fall back to an empty core',()=>{
   f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES('malformed-native','seller.application',1,'published',?,'Fictional malformed legacy metadata','reviewer',1,'reviewer',1,'reviewer',1,'malformed-native')`).run(JSON.stringify({formId:'wrong-form',fields:[]}));
  },stopped=>{assert.deepEqual(stopped.invalidForms,['seller.application']);assert.equal(stopped.coreForms.includes('seller.application'),false);});
  await altered('a required non-core invitation publication cannot be replaced by a native fallback',()=>{
   f.sqlite.exec('DROP TRIGGER trg_form_config_versions_published_delete');
   f.sqlite.prepare('DELETE FROM form_config_versions WHERE form_id=?').run('staff.staff-invitation');
  },stopped=>assert.ok(stopped.missingForms.includes('staff.staff-invitation')));
  await t.test('an unreadable publication query cannot be reclassified as absent optional metadata',()=>{
   const unavailable={prepare(sql:string){if(sql.startsWith('SELECT version, config_json, published_at'))throw Error('Fictional read failure');return f.sqlite.prepare(sql);}};
   const changes=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
   const stopped=inspectFormPreviewReadiness(unavailable);
   assert.equal(stopped.ready,false);assert.equal(stopped.invalidForms.length,REQUIRED_PREVIEW_FORM_IDS.length);assert.deepEqual(stopped.coreForms,[]);
   assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,changes);
  });
 }finally{f.dispose();}
});
