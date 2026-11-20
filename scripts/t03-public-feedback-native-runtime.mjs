import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import mysql from 'mysql2/promise';
import {coreFormReceiptId} from '../lib/forms/core-receipts.ts';
import {listFormAnswersForSubject} from '../lib/db/repositories/form-answers.ts';
import {authorizeFormAnswerRead} from '../lib/forms/access.ts';
import {validateCustomerFeedback} from '../lib/feedback/customer-feedback.ts';
import {saveFormDraft,publishFormDraft} from '../lib/db/repositories/form-catalog.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const forms=[['contact','public.contact','/contact-us'],['feedback','public.feedback','/feedback'],['footer','public.footer-feedback','/products/original']];
function form(kind,requestId){
 const source=forms.find(value=>value[0]===kind);assert.ok(source);
 const data=new FormData();for(const[key,value]of Object.entries({kind,pagePath:source[2],name:'Fictional native visitor',email:`${kind}@local.hastabazaar.test`,topic:'General question',message:'Original private handmade-item question नेपाल 00012.',privacyAcknowledgement:'accepted',requestId,formVersion:'1'}))data.set(key,value);return data;
}
function payloadHash(data){return sha(JSON.stringify([...data.entries()].toSorted(([ak,av],[bk,bv])=>ak.localeCompare(bk)||av.localeCompare(bv))));}
async function owned(fixture,phase){
 const database=fixture.database;assert.match(database,new RegExp('^fixture_'+fixture.id.split('-').at(-1)+'_public154'+phase+'_[a-z0-9_]+$'));
 assert.equal((await fixture.connection.query('SELECT DATABASE() name'))[0][0].name,database);
 assert.equal(Number((await fixture.connection.query('SELECT @@foreign_key_checks enabled'))[0][0].enabled),1);
 return database;
}
async function rejected(connection,operation){
 await connection.beginTransaction();let reached=false,denied=false;
 try{await operation(()=>{reached=true;});}catch(error){if(!reached)throw error;denied=true;}finally{await connection.rollback();}
 assert.equal(reached,true,'The negative must reach its intended native write.');return denied;
}

/** Phase A uses only the authenticated owned control connection, before env.DB exists. */
export async function verifyT03PublicFeedbackTransition(fixture,{apply154}){
 const database=await owned(fixture,'a'),connection=fixture.connection;
 const columnMetadata=async()=>(await connection.execute('SELECT COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,COLUMN_DEFAULT,EXTRA,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[database,'feedback_delivery_jobs','config_version_id']))[0][0];
 const beforeColumn=await columnMetadata();
 const[incoming]=await connection.execute('SELECT TABLE_NAME name FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME=?',[database,'feedback_delivery_jobs']);assert.equal(incoming.length,0);
 assert.equal((await connection.execute('SELECT IS_NULLABLE value FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[database,'feedback_delivery_jobs','config_version_id']))[0][0].value,'NO');
 await connection.execute("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('public154-old-owner','public154-old-owner','old-owner@local.hastabazaar.test','Fictional old owner','active',1,1)");
 await connection.execute(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
 VALUES('public154-old-version','public.footer-feedback',1,1,'published',?,'Original historical public wording','public154-old-owner',1,'public154-old-owner',1,'public154-old-owner',1,'public154-old-version')`,[JSON.stringify({formId:'public.footer-feedback',fields:[]})]);
 for(const[index,status]of ['pending','leased','sending','failed','sent'].entries()){
  const requestId=`public154-original-${status}`,data=form('footer',requestId),validation=validateCustomerFeedback(data);assert.equal(validation.ok,true);
  const id=`public154-old-job-${status}`,leased=status==='leased'||status==='sending';
  await connection.execute(`INSERT INTO feedback_delivery_jobs(id,request_id,form_id,config_version_id,payload_hash,feedback_json,status,lease_token,lease_expires_at,attempt_count,created_at,updated_at,sent_at)
   VALUES(?,?,'public.footer-feedback','public154-old-version',?,?,?,?,?,?,1,2,?)`,[id,requestId,payloadHash(data),JSON.stringify(validation.feedback,null,1),status,leased?`original-token-${status}`:null,leased?9999999999999:null,index,status==='sent'?2:null]);
  await connection.execute(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at)
   VALUES(?,'public.footer-feedback',?,'public154-old-version','feedback_submission',?,NULL,?,1)`,[`public154-old-answer-${status}`,requestId,id,JSON.stringify({formId:'public.footer-feedback',version:1,answers:[]})]);
 }
 const snapshot=async()=>JSON.stringify({jobs:(await connection.query('SELECT * FROM feedback_delivery_jobs ORDER BY id'))[0],answers:(await connection.query('SELECT * FROM form_answer_sets ORDER BY id'))[0],versions:(await connection.query('SELECT * FROM form_config_versions ORDER BY id'))[0]});
 const original=await snapshot();
 const requireValidLegacyShapes=async()=>{
  const invalid=Number((await connection.query("SELECT COUNT(*) n FROM feedback_delivery_jobs WHERE NOT JSON_VALID(feedback_json) OR JSON_TYPE(feedback_json)<>'OBJECT' OR OCTET_LENGTH(feedback_json)>8192"))[0][0].n);
  if(invalid)throw Error('Native public feedback cutover stopped: invalid legacy feedback shape requires explicit review; no data was normalized.');
 };
 await requireValidLegacyShapes();
 let invalidLegacyStopProof=false;
 await connection.beginTransaction();
 try{
  await connection.execute("UPDATE feedback_delivery_jobs SET feedback_json='[]' WHERE id='public154-old-job-pending'");
  await assert.rejects(requireValidLegacyShapes(),/cutover stopped/);invalidLegacyStopProof=true;
 }finally{await connection.rollback();}
 assert.equal(await snapshot(),original);
 const legacyObjectRejected=await rejected(connection,async reached=>{reached();await connection.execute("UPDATE feedback_delivery_jobs SET feedback_json='[]' WHERE id='public154-old-job-pending'");});
 const legacyScalarRejected=await rejected(connection,async reached=>{reached();await connection.execute("UPDATE feedback_delivery_jobs SET feedback_json='\"scalar\"' WHERE id='public154-old-job-pending'");});
 await requireValidLegacyShapes();await apply154();assert.equal(await owned(fixture,'a'),database);assert.equal(await snapshot(),original,'Actual153→154 preserves every old row, JSON byte, lease, original receipt and publication.');
 const afterColumn=await columnMetadata();
 for(const key of ['COLUMN_TYPE','CHARACTER_SET_NAME','COLLATION_NAME','EXTRA'])assert.equal(afterColumn[key],beforeColumn[key],`Native nullable transition must preserve ${key}.`);
 assert.equal(beforeColumn.IS_NULLABLE,'NO');assert.equal(afterColumn.IS_NULLABLE,'YES');
 const columnDefaultChanged=afterColumn.COLUMN_DEFAULT!==beforeColumn.COLUMN_DEFAULT;
 // Root reviewed the retained first run's exact Maria 10.11.19 representation.
 // Accept only that observed nullable default transition, never arbitrary drift.
 assert.equal(beforeColumn.COLUMN_DEFAULT,null);assert.equal(afterColumn.COLUMN_DEFAULT,'NULL');
 assert.equal((await connection.execute('SELECT IS_NULLABLE value FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[database,'feedback_delivery_jobs','config_version_id']))[0][0].value,'YES');
 const objectRejected=await rejected(connection,async reached=>{reached();await connection.execute("UPDATE feedback_delivery_jobs SET feedback_json='[]' WHERE id='public154-old-job-pending'");});
 const scalarRejected=await rejected(connection,async reached=>{reached();await connection.execute("UPDATE feedback_delivery_jobs SET feedback_json='\"scalar\"' WHERE id='public154-old-job-pending'");});
 const forgedNullRejected=await rejected(connection,async reached=>{reached();await connection.execute("UPDATE feedback_delivery_jobs SET config_version_id=NULL WHERE id='public154-old-job-pending'");});
 const retainedFkRejected=await rejected(connection,async reached=>{reached();await connection.execute("UPDATE feedback_delivery_jobs SET config_version_id='missing-published-version' WHERE id='public154-old-job-pending'");});
 assert.equal(objectRejected,true);assert.equal(scalarRejected,true);assert.equal(forgedNullRejected,true);assert.equal(retainedFkRejected,true);assert.equal(await snapshot(),original);
 return{actualIncremental153To154:true,foreignKeysKeptEnabled:true,incomingForeignKeys:incoming.length,preservedStatuses:5,originalRowsSha256:sha(original),beforeColumn:{...beforeColumn},afterColumn:{...afterColumn},columnDefaultChanged,reviewedExactNullableDefault:true,invalidLegacyStopProof,legacyObjectRejected,legacyScalarRejected,objectRejected,scalarRejected,forgedNullRejected,retainedFkRejected};
}

/** Phase B is a different fresh owned namespace; one real Node pool, no real mail. */
export async function verifyT03PublicFeedbackRuntime(fixture){
 const database=await owned(fixture,'b'),connection=fixture.connection;
 assert.equal(Number((await connection.query('SELECT COUNT(*) n FROM form_config_versions'))[0][0].n),0);
 for(const[id,role]of [['public154-reviewer','super_admin'],['public154-support','admin'],['public154-other','admin']]){
  await connection.execute("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'Fictional native reviewer','active',1,1)",[id,id,`${id}@local.hastabazaar.test`]);
  await connection.execute('INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,1)',[id,role]);
 }
 for(const[id,permission]of [['public154-support','support.manage'],['public154-other','product.review']])await connection.execute("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,?,1,'public154-reviewer',1)",[id,JSON.stringify([permission])]);
 const originalFactory=mysql.createPool,keys=['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'],prior=keys.map(key=>process.env[key]);
 /** @type {import('mysql2/promise').Pool | undefined} */
 let pool;
 let hooks;
 const holder={db:null,sendAttempts:0};globalThis.public154NativeBindings=holder;
 try{
  mysql.createPool=configuration=>{
   assert.equal(configuration.host,'127.0.0.1');assert.equal(configuration.port,fixture.port);assert.equal(configuration.database,database);assert.equal(configuration.password,'owned-public154-transport');assert.equal(pool,undefined);
   const authenticated=connection.connection.config;pool=originalFactory({...configuration,user:authenticated.user,password:authenticated.password,connectionLimit:2});return pool;
  };
  for(const[key,value]of Object.entries({DB_HOST:'127.0.0.1',DB_PORT:String(fixture.port),DB_NAME:database,DB_USER:'owned-public154-transport',DB_PASSWORD:'owned-public154-transport'}))process.env[key]=value;
  const{env}=await import('../lib/runtime/node-bindings.ts');const db=env.DB;holder.db=db;assert.equal(db.dialect,'mariadb');
  hooks=registerHooks({resolve(specifier,context,next){const modules={
   'cloudflare:workers':'export const env={get DB(){return globalThis.public154NativeBindings.db},EMAIL_DELIVERY_CONFIGURED:"false",EMAIL:{configured:false,async send(){globalThis.public154NativeBindings.sendAttempts++;throw Error("Unexpected transport")}}};',
   '@/app/auth':'export async function getAuthenticatedUser(){return null};export const requireAuthenticatedUser=getAuthenticatedUser;',
   'next/navigation':'export function redirect(url){throw Error(url)};',
  };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
  const feedback=await import('../app/api/feedback/route.ts'),config=await import('../app/api/forms/[formId]/route.ts');
  const post=data=>feedback.POST(new Request('https://native-public.test/api/feedback',{method:'POST',headers:{origin:'https://native-public.test'},body:data}));
  const nativeJobs=[];
  for(const[kind,formId]of forms){
   assert.equal((await config.GET(new Request(`https://native-public.test/api/forms/${formId}`),{params:Promise.resolve({formId})})).status,200);
   const data=form(kind,`public154-native-${kind}`);assert.equal((await(await post(data)).json()).registered,true);
   assert.equal((await(await post(data)).json()).registered,true);
   const[rows]=await connection.execute('SELECT * FROM feedback_delivery_jobs WHERE form_id=?',[formId]);assert.equal(rows.length,1);assert.equal(rows[0].config_version_id,null);nativeJobs.push(rows[0]);
   const answers=await listFormAnswersForSubject(db,'feedback_submission',rows[0].id);assert.equal(answers.length,1);
   assert.equal(await authorizeFormAnswerRead(db,{id:'public154-reviewer',role:'super_admin'},answers[0]),true);
   assert.equal(await authorizeFormAnswerRead(db,{id:'public154-support',role:'admin'},answers[0]),true);
   assert.equal(await authorizeFormAnswerRead(db,{id:'public154-other',role:'admin'},answers[0]),false);
   data.set('message','Changed private content cannot replace the original registered request.');assert.equal((await post(data)).status,409);
  }
  const nativeFactMutationRejected=await rejected(connection,async reached=>{reached();await connection.execute("UPDATE feedback_delivery_jobs SET feedback_json='{}' WHERE id=?",[nativeJobs[0].id]);});assert.equal(nativeFactMutationRejected,true);
  const parentProofUpdateRejected=await rejected(connection,async reached=>{reached();await connection.execute("UPDATE audit_logs SET next_json='{}' WHERE id=?",[`feedback:${nativeJobs[0].id}:submitted`]);});assert.equal(parentProofUpdateRejected,true);
  const parentProofDeleteRejected=await rejected(connection,async reached=>{reached();await connection.execute('DELETE FROM audit_logs WHERE id=?',[`feedback:${nativeJobs[0].id}:submitted`]);});assert.equal(parentProofDeleteRejected,true);
  await connection.beginTransaction();let historicalActorAnonymization=false;
  try{
   await connection.execute("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at) SELECT 'public154-legacy-actor-proof','public154-reviewer',action,subject_type,subject_id,next_json,created_at FROM audit_logs WHERE id=?",[`feedback:${nativeJobs[0].id}:submitted`]);
   await connection.execute("UPDATE audit_logs SET actor_id=NULL WHERE id='public154-legacy-actor-proof'");
   assert.equal((await connection.query("SELECT actor_id FROM audit_logs WHERE id='public154-legacy-actor-proof'"))[0][0].actor_id,null);historicalActorAnonymization=true;
  }finally{await connection.rollback();}
  let serial=0;
  async function originCase({json='{}',mutation=null,missing=false}={}){
   const id=`public154-negative-${++serial}`,requestId=`public154-negative-request-${serial}`,formId='public.contact',now=Date.now(),receiptId=coreFormReceiptId(formId,requestId),hash='d'.repeat(64);
   const core={formId,version:1,answers:[],requestId,versionId:`core:${formId}:1`},fact={formId,requestId,versionId:core.versionId,payloadHash:hash,coreReceiptId:receiptId};mutation?.(core,fact);
   return rejected(connection,async reached=>{
    if(!missing){
     await connection.execute("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at) VALUES(?,NULL,'form.core_answers','feedback_submission',?,?,?)",[receiptId,id,JSON.stringify(core),now]);
     await connection.execute("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at) VALUES(?,NULL,'feedback.submitted','feedback_submission',?,?,?)",[`feedback:${id}:submitted`,id,JSON.stringify(fact),now]);
    }
    reached();await connection.execute("INSERT INTO feedback_delivery_jobs(id,request_id,form_id,config_version_id,payload_hash,feedback_json,status,lease_token,lease_expires_at,attempt_count,created_at,updated_at,sent_at) VALUES(?,?,?,NULL,?,?,'pending',NULL,NULL,0,?,?,NULL)",[id,requestId,formId,hash,json,now,now]);
   });
  }
  assert.equal(await originCase(),false,'A fully matching native proof must pass before negatives are counted.');
  const checks={missingProofRejected:await originCase({missing:true}),arrayRejected:await originCase({json:'[]'}),scalarRejected:await originCase({json:'"scalar"'}),caseVariantRejected:await originCase({mutation:(_core,fact)=>{fact.formId='PUBLIC.CONTACT';}}),wrongRequestRejected:await originCase({mutation:(_core,fact)=>{fact.requestId+='-different';}}),stringVersionRejected:await originCase({mutation:core=>{core.version='1';}})};
  if(Object.values(checks).some(value=>value!==true))throw Error('Native public proof checks failed: '+JSON.stringify(checks));
  const draft=await saveFormDraft(db,{formId:'public.contact',actorId:'public154-reviewer',actorRole:'super_admin',requestId:'public154-publish-save',expectedPublishedVersion:0,reason:'Document optional public questions while preserving original native intake.',config:{formId:'public.contact',fields:[]},now:Date.now()});
  const published=await publishFormDraft(db,{formId:'public.contact',actorId:'public154-reviewer',actorRole:'super_admin',requestId:'public154-publish-confirm',expectedPublishedVersion:0,draftId:draft.id,expectedDraftRevision:draft.revision,reason:'Native public intake and its immutable original receipts remain usable.',now:Date.now()});
  assert.equal((await(await post(form('contact','public154-native-contact'))).json()).registered,true,'Original native delivery remains valid after first publication.');
  assert.equal((await(await post(form('contact','public154-published-contact'))).json()).registered,true);
  assert.equal((await connection.execute('SELECT config_version_id value FROM feedback_delivery_jobs WHERE request_id=?',['public154-published-contact']))[0][0].value,published.id);
  const nativeOriginRewriteRejected=await rejected(connection,async reached=>{reached();await connection.execute('UPDATE feedback_delivery_jobs SET config_version_id=? WHERE id=?',[published.id,nativeJobs[0].id]);});assert.equal(nativeOriginRewriteRejected,true);
  const[facts]=await connection.query("SELECT next_json FROM audit_logs WHERE action='feedback.submitted'");assert.equal(facts.length,3);assert.ok(facts.every(row=>!row.next_json.includes('@local.hastabazaar.test')&&!row.next_json.includes('Original private')));
  assert.equal(Number((await connection.query('SELECT COUNT(*) n FROM users'))[0][0].n),3);assert.equal(holder.sendAttempts,0);
  return{actualNodeAdapter:true,publicVariants:3,nativeJobs:3,exactOriginalReplay:true,currentSupportRead:true,unauthorizedReadDenied:true,nativeFactMutationRejected,parentProofUpdateRejected,parentProofDeleteRejected,historicalActorAnonymization,...checks,nativeOriginRewriteRejected,originalNativeAfterPublication:true,newPublishedPath:true,noIdentityProvisioning:true,noPrivateBodyInNewAudit:true,externalMailAttempts:holder.sendAttempts};
 }finally{hooks?.deregister();holder.db=null;if(pool)await pool.end();mysql.createPool=originalFactory;keys.forEach((key,index)=>prior[index]===undefined?delete process.env[key]:process.env[key]=prior[index]);delete globalThis.public154NativeBindings;}
}
