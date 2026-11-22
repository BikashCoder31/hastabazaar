import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';

const state={db:null as D1Database|null,sendAttempts:0};
(globalThis as typeof globalThis&{nativePublicFeedbackCore:typeof state}).nativePublicFeedbackCore=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.nativePublicFeedbackCore.db},EMAIL_DELIVERY_CONFIGURED:"false",EMAIL:{configured:false,async send(){globalThis.nativePublicFeedbackCore.sendAttempts++;throw Error("Unexpected transport")}}};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){return null};export const requireAuthenticatedUser=getAuthenticatedUser;',
};return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('the three public variants retain native minimum intake without an extra-question publication',async()=>{
 const f=await completeVersionFixture();state.db=f.db;state.sendAttempts=0;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const forms=await import('../app/api/forms/[formId]/route');const feedback=await import('../app/api/feedback/route');
  const {listFormAnswersForSubject}=await import('../lib/db/repositories/form-answers');
  const {authorizeFormAnswerRead}=await import('../lib/forms/access');
  const failures:unknown[]=[];
  for(const [kind,formId,pagePath] of [['contact','public.contact','/contact-us'],['feedback','public.feedback','/feedback'],['footer','public.footer-feedback','/products/example']] as const){
   const config=await forms.GET(new Request(`https://native-public.test/api/forms/${formId}`),{params:Promise.resolve({formId})});
   const data=new FormData();
   for(const [key,value] of Object.entries({kind,pagePath,name:'Fictional public visitor',email:`${kind}@local.hastabazaar.test`,topic:'General question',message:'Please help me understand this handmade item.',privacyAcknowledgement:'accepted',requestId:`native-public-${kind}-request`,formVersion:'1'}))data.set(key,value);
   const result=await feedback.POST(new Request('https://native-public.test/api/feedback',{method:'POST',headers:{origin:'https://native-public.test'},body:data}));
   const body=await result.json() as {registered?:boolean};
   const count=f.sqlite.prepare('SELECT COUNT(*) n FROM feedback_delivery_jobs WHERE form_id=?').get(formId)?.n;
   console.log(JSON.stringify({kind,configStatus:config.status,status:result.status,registered:body.registered??false,nativeJobs:count}));
   try{
    assert.equal(config.status,200,`${kind}: absent extra questions must not block the native form`);assert.equal(body.registered,true,`${kind}: native intake must commit independently of unavailable email`);assert.equal(count,1);
    const job=f.sqlite.prepare('SELECT * FROM feedback_delivery_jobs WHERE form_id=?').get(formId)!;
    assert.equal(job.config_version_id,null);assert.equal(job.form_id,formId);assert.equal(JSON.parse(String(job.feedback_json)).pagePath,pagePath);
    const answers=await listFormAnswersForSubject(f.db,'feedback_submission',String(job.id));assert.equal(answers.length,1);
    assert.equal(await authorizeFormAnswerRead(f.db,{id:'reviewer',role:'super_admin'},answers[0]),true);
    assert.equal(await authorizeFormAnswerRead(f.db,{id:'delegate',role:'admin'},answers[0]),false,'Product-only delegated staff cannot read private public-intake history.');
    const replay=await feedback.POST(new Request('https://native-public.test/api/feedback',{method:'POST',headers:{origin:'https://native-public.test'},body:data}));
    assert.equal((await replay.json() as {registered?:boolean}).registered,true);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM feedback_delivery_jobs WHERE form_id=?').get(formId)?.n,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE subject_id=? AND action IN ('feedback.submitted','form.core_answers')").get(job.id)?.n,2);
    data.set('message','A different private request cannot reuse the original receipt.');
    const changed=await feedback.POST(new Request('https://native-public.test/api/feedback',{method:'POST',headers:{origin:'https://native-public.test'},body:data}));assert.equal(changed.status,409);
    assert.throws(()=>f.sqlite.prepare("UPDATE feedback_delivery_jobs SET feedback_json='{}' WHERE id=?").run(job.id),'Original native message facts remain immutable.');
   }catch(error){console.log(JSON.stringify({kind,failure:error instanceof Error?error.message:'Assertion failed'}));failures.push(error);}
  }
  assert.equal(state.sendAttempts,0,'No external mail transport may run in this fixture.');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id IN ('public.contact','public.feedback','public.footer-feedback')").get()?.n,0);
  assert.ok(f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE action='feedback.submitted'").all().every(row=>!String(row.next_json).includes('@local.hastabazaar.test')&&!String(row.next_json).includes('Fictional public visitor')));
  if(failures.length)throw new AggregateError(failures,'Public native defaults, replay or privacy contract failed.');
 }finally{state.db=null;f.dispose();}
});

void test('public native defaults never mask malformed existing publication or authoritative read failure',async()=>{
 const f=await completeVersionFixture();state.db=f.db;state.sendAttempts=0;
 try{
  const forms=await import('../app/api/forms/[formId]/route');const feedback=await import('../app/api/feedback/route');
  f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
   VALUES('public-invalid-history','public.contact',1,1,'published',?,'Invalid historical configuration fixture','reviewer',1,'reviewer',1,'reviewer',1,'public-invalid-history')`).run(JSON.stringify({formId:'public.contact',fields:[{id:'invalid'}]}));
  assert.equal((await forms.GET(new Request('https://native-public.test/api/forms/public.contact'),{params:Promise.resolve({formId:'public.contact'})})).status,503);
  const submit=()=>{const body=new FormData();for(const [key,value] of Object.entries({kind:'contact',pagePath:'/contact-us',name:'Fictional visitor',email:'invalid@local.hastabazaar.test',topic:'General question',message:'Please help with this item without hiding a configuration failure.',privacyAcknowledgement:'accepted',requestId:'public-invalid-config-request',formVersion:'1'}))body.set(key,value);return feedback.POST(new Request('https://native-public.test/api/feedback',{method:'POST',headers:{origin:'https://native-public.test'},body}));};
  assert.equal((await submit()).status,503);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM feedback_delivery_jobs').get()?.n,0);
  state.db={prepare(sql:string){if(sql.includes('SELECT version, config_json, published_at FROM form_config_versions'))throw Error('Isolated authoritative read failure');return f.db.prepare(sql);},batch:f.db.batch.bind(f.db)} as D1Database;
  assert.equal((await forms.GET(new Request('https://native-public.test/api/forms/public.feedback'),{params:Promise.resolve({formId:'public.feedback'})})).status,503);
  assert.equal(state.sendAttempts,0);
 }finally{state.db=null;f.dispose();}
});

void test('first public publication wins before the native batch and rolls back all losing intake receipts',async()=>{
 const f=await completeVersionFixture();state.sendAttempts=0;
 try{
  const {saveFormDraft,publishFormDraft}=await import('../lib/db/repositories/form-catalog');
  const sqls=new WeakMap<object,string>();let raced=false;
  state.db={prepare(sql:string){const statement=f.db.prepare(sql);sqls.set(statement,sql);return statement;},async batch(statements:D1PreparedStatement[]){
   if(!raced&&statements.some(statement=>sqls.get(statement)?.includes('/* core-form-answer-insert */'))){
    raced=true;const draft=await saveFormDraft(f.db,{formId:'public.contact',actorId:'reviewer',actorRole:'super_admin',requestId:'public-race-save-draft',expectedPublishedVersion:0,reason:'Publish the native public wording through the supported catalog command.',config:{formId:'public.contact',fields:[]},now:Date.now()});
    await publishFormDraft(f.db,{formId:'public.contact',actorId:'reviewer',actorRole:'super_admin',requestId:'public-race-publish-draft',expectedPublishedVersion:0,draftId:draft.id,expectedDraftRevision:draft.revision,reason:'First publication wins before the independent native intake batch.',now:Date.now()});
   }
   return f.db.batch(statements);
  }} as D1Database;
  const feedback=await import('../app/api/feedback/route');const body=new FormData();
  for(const [key,value] of Object.entries({kind:'contact',pagePath:'/contact-us',name:'Fictional race visitor',email:'race@local.hastabazaar.test',topic:'General question',message:'The original native intake must not adopt a coincident publication.',privacyAcknowledgement:'accepted',requestId:'public-first-publication-race',formVersion:'1'}))body.set(key,value);
  const result=await feedback.POST(new Request('https://native-public.test/api/feedback',{method:'POST',headers:{origin:'https://native-public.test'},body}));
  assert.equal(raced,true);assert.equal(result.status,503);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM feedback_delivery_jobs').get()?.n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('feedback.submitted','form.core_answers')").get()?.n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='public.contact' AND status='published' AND version=1").get()?.n,1);
  assert.equal(state.sendAttempts,0);
 }finally{state.db=null;f.dispose();}
});

void test('native public parent proof remains immutable and retained like its actual core receipt',async t=>{
 const f=await completeVersionFixture();state.db=f.db;state.sendAttempts=0;
 try{
  const feedback=await import('../app/api/feedback/route');const body=new FormData();
  for(const[key,value]of Object.entries({kind:'contact',pagePath:'/contact-us',name:'Fictional retention visitor',email:'retention@local.hastabazaar.test',topic:'General question',message:'The actual native parent proof must retain its original immutable references.',privacyAcknowledgement:'accepted',requestId:'public-native-parent-retention',formVersion:'1'}))body.set(key,value);
  const result=await feedback.POST(new Request('https://native-public.test/api/feedback',{method:'POST',headers:{origin:'https://native-public.test'},body}));assert.equal((await result.json() as {registered?:boolean}).registered,true);
  const fact=f.sqlite.prepare("SELECT id FROM audit_logs WHERE action='feedback.submitted'").get();assert.ok(fact);
  for(const action of ['update','delete'] as const)await t.test(action,()=>{
   f.sqlite.exec('BEGIN');try{assert.throws(()=>f.sqlite.prepare(action==='update'?"UPDATE audit_logs SET next_json='{}' WHERE id=?":'DELETE FROM audit_logs WHERE id=?').run(fact.id));}finally{f.sqlite.exec('ROLLBACK');}
  });
  await t.test('historical actor may be anonymized without rewriting proof',()=>{
   f.sqlite.exec('BEGIN');try{
    f.sqlite.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at) SELECT 'public-legacy-actor-proof','reviewer',action,subject_type,subject_id,next_json,created_at FROM audit_logs WHERE id=?").run(fact.id);
    f.sqlite.prepare("UPDATE audit_logs SET actor_id=NULL WHERE id='public-legacy-actor-proof'").run();
    assert.equal(f.sqlite.prepare("SELECT actor_id FROM audit_logs WHERE id='public-legacy-actor-proof'").get()?.actor_id,null);
    assert.throws(()=>f.sqlite.prepare("UPDATE audit_logs SET next_json='{}' WHERE id='public-legacy-actor-proof'").run());
   }finally{f.sqlite.exec('ROLLBACK');}
  });
 }finally{state.db=null;f.dispose();}
});
