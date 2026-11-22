import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {saveFormDraft,publishFormDraft,restoreFormVersion} from '../lib/db/repositories/form-catalog';
import type {FormConfigDraft} from '../lib/forms/types';

for(const action of ['save','publish','restore'] as const)void test(`retired registration contact question cannot reactivate through ${action}`,async()=>{
 const f=await completeVersionFixture();
 try{
  const active:FormConfigDraft={formId:'seller.application',fields:[{id:'contact_time',key:'contact_time',label:'Best time to contact you',type:'short_text',required:false,status:'active',order:0}]};
  const archived:FormConfigDraft={...active,fields:active.fields.map(field=>({...field,status:'archived'}))};
  const insert=f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
   VALUES(?,'seller.application',?,1,?,?,'Historical original question','reviewer',1,'reviewer',1,?,?,?)`);
  insert.run('retired-history',1,'published',JSON.stringify(active),'reviewer',1,'retired-history-request');
  insert.run('retired-current',2,'published',JSON.stringify(archived),'reviewer',2,'retired-current-request');
  if(action==='publish')insert.run('retired-draft',3,'draft',JSON.stringify(active),null,null,'retired-draft-request');
  const before=f.sqlite.prepare("SELECT * FROM form_config_versions WHERE form_id='seller.application' ORDER BY version").all();
  const context={actorId:'reviewer',actorRole:'super_admin' as const,expectedPublishedVersion:2,reason:'Attempt to reactivate retired contact question',requestId:`retired-${action}-attempt`,now:100};
  await assert.rejects(action==='save'?saveFormDraft(f.db,{...context,formId:'seller.application',config:active}):action==='publish'?publishFormDraft(f.db,{...context,formId:'seller.application',draftId:'retired-draft',expectedDraftRevision:1}):restoreFormVersion(f.db,{...context,formId:'seller.application',sourceVersion:1}),/retired|keep.*archived/i);
  assert.deepEqual(f.sqlite.prepare("SELECT * FROM form_config_versions WHERE form_id='seller.application' ORDER BY version").all(),before,'Refusal preserves every historical configuration byte and original identity.');
  if(action==='publish'){
   f.sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at) VALUES('retired-original-publish','reviewer','form_catalog.published','form_config','seller.application','Historical original question','{}','{}','retired-history-request',1)`).run();
   const historical=await publishFormDraft(f.db,{...context,formId:'seller.application',draftId:'retired-history',expectedDraftRevision:1,expectedPublishedVersion:0,reason:'Historical original question',requestId:'retired-history-request'});
   assert.equal(historical.id,'retired-history');assert.equal(historical.config.fields[0].status,'active','An exact historical saved outcome remains readable; it does not republish the retired question.');
   assert.deepEqual(f.sqlite.prepare("SELECT * FROM form_config_versions WHERE form_id='seller.application' ORDER BY version").all(),before);
  }
 }finally{f.dispose();}
});
