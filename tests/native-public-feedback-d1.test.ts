import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {createIncentiveDb} from './helpers/incentive-db';
import {listFormAnswersForSubject} from '../lib/db/repositories/form-answers';
import {authorizeFormAnswerRead} from '../lib/forms/access';

const state={db:null as D1Database|null,sends:0};
(globalThis as typeof globalThis&{public154D1:typeof state}).public154D1=state;
const installApiBindings=()=>registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.public154D1.db},EMAIL_DELIVERY_CONFIGURED:"false",EMAIL:{configured:false,async send(){globalThis.public154D1.sends++;throw Error("Unexpected transport")}}};',
 '@/app/auth':'export async function getAuthenticatedUser(){return null};export const requireAuthenticatedUser=getAuthenticatedUser;',
 'next/navigation':'export function redirect(url){throw Error(url)};',
};return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('nonpersistent native D1 applies154 with all five original jobs/receipts and FK enforcement unchanged',{timeout:180000},async()=>{
 let original='';let seeded=false;
 const snapshot=async(db:D1Database)=>JSON.stringify({jobs:(await db.prepare('SELECT * FROM feedback_delivery_jobs ORDER BY id').all()).results,answers:(await db.prepare('SELECT * FROM form_answer_sets ORDER BY id').all()).results,versions:(await db.prepare('SELECT * FROM form_config_versions ORDER BY id').all()).results});
 const f=await createIncentiveDb({beforePublicFeedbackDefaults:async db=>{
  assert.equal((await db.prepare('PRAGMA foreign_keys').first<{foreign_keys:number}>())?.foreign_keys,1);
  const tables=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all<{name:string;sql:string}>()).results;
  const incoming:string[]=[];
  for(const table of tables){
   if(table.name==='_cf_METADATA'){
    // D1 protects PRAGMA access to its own table. Inspect its actual DDL instead;
    // no other table is skipped or accepted on an authorization failure.
    assert.equal(typeof table.sql,'string');assert.ok(table.sql.length>0);assert.doesNotMatch(table.sql,/\bREFERENCES\b/i);continue;
   }
   let keys:D1Result<{table:string}>;
   try{keys=await db.prepare(`PRAGMA foreign_key_list("${table.name.replaceAll('"','""')}")`).all<{table:string}>();}
   catch(error){throw new Error(`Native D1 incoming-FK inventory denied table ${table.name}`,{cause:error});}
   if(keys.results.some(key=>key.table==='feedback_delivery_jobs'))incoming.push(table.name);
  }
  assert.deepEqual(incoming,[],'Every actual application-table FK is inspected before replacement.');
  const statements=[db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('public-d1-old-owner','old@local.hastabazaar.test','Fictional old owner','active',1,1)"),db.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
   VALUES('public-d1-old-version','public.footer-feedback',1,1,'published',?,'Original historical fixture','public-d1-old-owner',1,'public-d1-old-owner',1,'public-d1-old-owner',1,'public-d1-old-version')`).bind(JSON.stringify({formId:'public.footer-feedback',fields:[]}))];
  for(const[index,status]of ['pending','leased','sending','failed','sent'].entries()){
   const leased=status==='leased'||status==='sending',id=`public-d1-old-${status}`,requestId=`public-d1-original-request-${status}`;
   const legacy={name:'Fictional original visitor',email:'old@local.hastabazaar.test',phone:'',topic:'General question',subject:'',rating:null,orderReference:'00012',message:'Original private question नेपाल with unchanged whitespace.',pagePath:'/products/original'};
   const wire={kind:'footer',pagePath:legacy.pagePath,name:legacy.name,email:legacy.email,topic:legacy.topic,message:legacy.message,orderReference:legacy.orderReference,privacyAcknowledgement:'accepted',requestId,formVersion:'1'};
   const hash=createHash('sha256').update(JSON.stringify(Object.entries(wire).toSorted(([ak,av],[bk,bv])=>ak.localeCompare(bk)||av.localeCompare(bv)))).digest('hex');
   statements.push(db.prepare(`INSERT INTO feedback_delivery_jobs(id,request_id,form_id,config_version_id,payload_hash,feedback_json,status,lease_token,lease_expires_at,attempt_count,created_at,updated_at,sent_at)
    VALUES(?,?,'public.footer-feedback','public-d1-old-version',?,?,?,?,?,?,1,2,?)`).bind(id,requestId,hash,JSON.stringify(legacy,null,1),status,leased?`original-token-${status}`:null,leased?9999999999999:null,index,status==='sent'?2:null),db.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at)
    VALUES(?,'public.footer-feedback',?,'public-d1-old-version','feedback_submission',?,NULL,?,1)`).bind(`public-d1-old-answer-${status}`,requestId,id,JSON.stringify({formId:'public.footer-feedback',version:1,answers:[]})));
  }
  await db.batch(statements);original=await snapshot(db);seeded=true;
 }});
 try{
  assert.equal(seeded,true);assert.equal(await snapshot(f.db),original);assert.equal((await f.db.prepare('PRAGMA foreign_keys').first<{foreign_keys:number}>())?.foreign_keys,1);
  assert.equal((await f.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  assert.equal((await f.db.prepare('PRAGMA table_info(feedback_delivery_jobs)').all<{name:string;notnull:number}>()).results.find(row=>row.name==='config_version_id')?.notnull,0);
  await assert.rejects(f.db.prepare("UPDATE feedback_delivery_jobs SET config_version_id=NULL WHERE id='public-d1-old-pending'").run());
  await assert.rejects(f.db.prepare("UPDATE feedback_delivery_jobs SET feedback_json='[]' WHERE id='public-d1-old-pending'").run());assert.equal(await snapshot(f.db),original);
 }finally{await f.dispose();}
});

void test('fresh separate native D1 public3 intake/replay/consent/current private readers use actual native proofs',{timeout:180000},async()=>{
 const f=await createIncentiveDb();state.db=f.db;state.sends=0;
 const hooks=installApiBindings();
 try{
  await f.db.batch([f.db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('public-d1-reviewer','public-d1-reviewer','reviewer@local.hastabazaar.test','Fictional reviewer','active',1,1),('public-d1-other','public-d1-other','other@local.hastabazaar.test','Fictional other','active',1,1)"),f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('public-d1-reviewer','super_admin',1),('public-d1-other','admin',1)"),f.db.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('public-d1-other','[\"product.review\"]',1,'public-d1-reviewer',1)")]);
  const forms=await import('../app/api/forms/[formId]/route'),feedback=await import('../app/api/feedback/route');
  const post=(body:FormData)=>feedback.POST(new Request('https://native-public.test/api/feedback',{method:'POST',headers:{origin:'https://native-public.test'},body}));
  for(const[kind,formId,pagePath]of [['contact','public.contact','/contact-us'],['feedback','public.feedback','/feedback'],['footer','public.footer-feedback','/products/original']] as const){
   assert.equal((await forms.GET(new Request(`https://native-public.test/api/forms/${formId}`),{params:Promise.resolve({formId})})).status,200);
   const body=new FormData();for(const[key,value]of Object.entries({kind,pagePath,name:'Fictional native visitor',email:`${kind}@local.hastabazaar.test`,topic:'General question',message:'Please help me with this original handmade item.',privacyAcknowledgement:'accepted',requestId:`public-d1-native-${kind}`,formVersion:'1'}))body.set(key,value);
   body.delete('privacyAcknowledgement');assert.equal((await post(body)).status,400);body.set('privacyAcknowledgement','accepted');
   assert.equal((await(await post(body)).json() as {registered?:boolean}).registered,true);assert.equal((await(await post(body)).json() as {registered?:boolean}).registered,true);
   const jobs=(await f.db.prepare('SELECT id,config_version_id FROM feedback_delivery_jobs WHERE form_id=?').bind(formId).all<{id:string;config_version_id:string|null}>()).results;assert.equal(jobs.length,1);assert.equal(jobs[0].config_version_id,null);
   const answers=await listFormAnswersForSubject(f.db,'feedback_submission',jobs[0].id);assert.equal(answers.length,1);assert.equal(await authorizeFormAnswerRead(f.db,{id:'public-d1-reviewer',role:'super_admin'},answers[0]),true);assert.equal(await authorizeFormAnswerRead(f.db,{id:'public-d1-other',role:'admin'},answers[0]),false);
   body.set('message','Changed content cannot reuse the original immutable request.');assert.equal((await post(body)).status,409);
   await assert.rejects(f.db.prepare("UPDATE feedback_delivery_jobs SET feedback_json='{}' WHERE id=?").bind(jobs[0].id).run());
   await assert.rejects(f.db.prepare("UPDATE audit_logs SET next_json='{}' WHERE id=?").bind(`feedback:${jobs[0].id}:submitted`).run());
   await assert.rejects(f.db.prepare('DELETE FROM audit_logs WHERE id=?').bind(`feedback:${jobs[0].id}:submitted`).run());
  }
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM form_config_versions').first<{n:number}>())?.n,0);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM form_answer_sets').first<{n:number}>())?.n,0);
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='feedback.submitted'").first<{n:number}>())?.n,3);
  assert.equal((await f.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);assert.equal(state.sends,0);
 }finally{hooks.deregister();state.db=null;await f.dispose();}
});
