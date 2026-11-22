import assert from 'node:assert/strict';
import test from 'node:test';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {getProductIntakeReview} from '../lib/products/intake-assistance';
import {getProductPublicationReview,reviewProductPublication} from '../lib/products/publication';
import {getProductAvailability,changeProductAvailability} from '../lib/products/availability';
import {getProductConcern,listProductConcerns,reportProductConcern,triageProductConcern} from '../lib/products/priority-concerns';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';
import {deliverBusinessEmails} from '../lib/operations/business-notifications';

void test('a current-owner change during assistance proposal reads cannot return the newly personal private case',async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);try{let raced=false;const db=Object.create(f.db)as D1Database;
  db.prepare=(sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('FROM product_intake_proposals WHERE case_id=')){const all=statement.all.bind(statement);statement.all=(async()=>{const result=await all();if(!raced){raced=true;f.sqlite.prepare("UPDATE seller_profiles SET user_id='delegate' WHERE id='registered'").run();}return result;})as D1PreparedStatement['all'];}return statement;};
  await assert.rejects(getProductIntakeReview(db,'delegate',f.sent.caseId),/source|case|access|independent|changed|permission/i);assert.equal(raced,true);
 }finally{f.dispose();}
});

void test('a current-owner change after publication permission checks cannot return retained private evidence',async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);try{let raced=false;const db=Object.create(f.db)as D1Database;
  db.prepare=(sql:string)=>{if(!raced&&sql.includes('FROM product_availability_states WHERE product_id=')){raced=true;f.sqlite.prepare("UPDATE seller_profiles SET user_id='delegate' WHERE id='registered'").run();}return f.db.prepare(sql);};
  await assert.rejects(getProductPublicationReview(db,'delegate',f.sent.caseId),/source|case|access|independent|changed|permission/i);assert.equal(raced,true);
 }finally{f.dispose();}
});

void test('losing private product-review access during assistance reads is a denial even when support access remains',async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);try{let raced=false;const db=Object.create(f.db)as D1Database;
  db.prepare=(sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('FROM product_intake_proposals WHERE case_id=')){const all=statement.all.bind(statement);statement.all=(async()=>{const result=await all();if(!raced){raced=true;f.sqlite.prepare('UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?').run('["support.manage"]','delegate');}return result;})as D1PreparedStatement['all'];}return statement;};
  await assert.rejects(getProductIntakeReview(db,'delegate',f.sent.caseId),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===403);assert.equal(raced,true);
 }finally{f.dispose();}
});

async function actualConcern(){const f=await productPublicationFixture('',Date.now()-1000);try{const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId),published=await reviewProductPublication(f.db,{actorId:'reviewer',requestId:'read-boundary-publication',expectedRevision:String(view.revision),now:f.now+20},{caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),action:'approve_and_publish',reason:'Reviewed this actual fictional complete product and its usable cover.',checks:{sameItem:true,accurateCover:true,eligibilityEvidence:[]}}),reported=await reportProductConcern(f.db,{actorId:'registered-owner',requestId:'read-boundary-report',expectedRevision:null,now:f.now+21},{productId:view.productId,publicVersionId:published.versionId,kind:'price_error',note:'Review this actual original price concern without changing any selling price.'});await triageProductConcern(f.db,{actorId:'reviewer',requestId:'read-boundary-coverage',expectedRevision:String(reported.revision),now:f.now+22},{caseId:reported.id,state:'open',ownerId:'reviewer',backupId:null,backupUnavailableReason:'PRIVATE-STAFF-COVERAGE original evidence for this fictional absence.',coverageConfirmed:true,nextUpdateAt:f.now+3600000,note:'The reviewer will compare the exact original offer and update the owner.'});return{...f,productId:view.productId,caseId:reported.id};}catch(error){f.dispose();throw error;}}

for(const family of ['case','list']as const)void test('late staff revocation cannot return Product concern '+family+' private context',async()=>{
 const f=await actualConcern();try{let raced=false;const db=Object.create(f.db)as D1Database;
  db.prepare=(sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes("AND r.role='super_admin'")){const first=statement.first.bind(statement);statement.first=(async()=>{const result=await first();if(!raced){raced=true;f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='reviewer'").run();}return result;})as D1PreparedStatement['first'];}return statement;};
  await assert.rejects(family==='case'?getProductConcern(db,'reviewer',f.caseId):listProductConcerns(db,'reviewer',f.productId),/source|current|permission|access/i);assert.equal(raced,true);
 }finally{f.dispose();}
});

void test('availability history cannot return independent staff controls after its actor becomes the current owner',async()=>{
 const f=await actualConcern();try{let raced=false;const db=Object.create(f.db)as D1Database;
  db.prepare=(sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('FROM product_availability_events WHERE product_id=')){const all=statement.all.bind(statement);statement.all=(async()=>{const result=await all();if(!raced){raced=true;f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();}return result;})as D1PreparedStatement['all'];}return statement;};
  await assert.rejects(getProductAvailability(db,'reviewer',f.productId,Date.now()),/independent|current|permission|access/i);assert.equal(raced,true);
 }finally{f.dispose();}
});

for(const family of ['availability','concern','triage']as const)void test('the exact retained Product owner cannot become independent '+family+' staff after current-owner metadata changes',async()=>{
 const f=await actualConcern();try{
  f.sqlite.prepare("UPDATE seller_profiles SET user_id='delegate' WHERE id='registered'").run();
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',?)").run(f.now+25);
  const denied=(error:unknown)=>error instanceof Error&&'status'in error&&error.status===403;
  const operation=family==='availability'?getProductAvailability(f.db,'registered-owner',f.productId,Date.now()):family==='concern'?getProductConcern(f.db,'registered-owner',f.caseId):triageProductConcern(f.db,{actorId:'registered-owner',requestId:'retained-owner-triage',expectedRevision:'1',now:f.now+30},{caseId:f.caseId,state:'open',ownerId:'reviewer',backupId:null,backupUnavailableReason:'No second eligible fictional person is currently available.',coverageConfirmed:true,nextUpdateAt:f.now+3600000,note:'This must not let the retained original owner independently review its own product.'});
  await assert.rejects(operation,denied);
  assert.equal(f.sqlite.prepare('SELECT revision FROM product_priority_cases WHERE id=?').get(f.caseId)?.revision,1);
 }finally{f.dispose();}
});

void test('a current-party change at the actual availability commit rolls back the decision and receipt',async()=>{
 const f=await actualConcern();try{const original=await getProductAvailability(f.db,'reviewer',f.productId,Date.now());let raced=false;const db=Object.create(f.db)as D1Database;
  db.batch=(async(statements:D1PreparedStatement[])=>{if(!raced){raced=true;f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();}return f.db.batch(statements);})as D1Database['batch'];
  await assert.rejects(changeProductAvailability(db,{actorId:'reviewer',requestId:'availability-party-at-commit',expectedRevision:original.state.revision===null?null:String(original.state.revision),now:f.now+30},{productId:f.productId,action:'staff_withdraw',reason:'An actual current-party change must not commit an independent staff withdrawal.'}),/changed|authority|compare/i);
  assert.equal(raced,true);assert.equal(f.sqlite.prepare('SELECT revision FROM product_availability_states WHERE product_id=?').get(f.productId)?.revision??null,original.state.revision);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*)AS n FROM audit_logs WHERE action='product.availability.staff_withdraw'").get()?.n,0);
 }finally{f.dispose();}
});

void test('native Product concern generation excludes its retained original owner from new eligible-staff copies',async()=>{
 const f=await actualConcern();try{
  f.sqlite.prepare("UPDATE seller_profiles SET user_id='delegate' WHERE id='registered'").run();f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',?)").run(f.now+25);
  await triageProductConcern(f.db,{actorId:'reviewer',requestId:'independent-retained-party-notice',expectedRevision:'1',now:f.now+30},{caseId:f.caseId,state:'open',ownerId:'reviewer',backupId:null,backupUnavailableReason:'No other eligible fictional staff member is available.',coverageConfirmed:true,nextUpdateAt:f.now+3600000,note:'The independent reviewer keeps this exact original case and its next update.'});
  const rows=f.sqlite.prepare("SELECT recipient_user_id actor,audience_role audience,channel FROM notification_messages WHERE related_id=? AND created_at=?").all(f.caseId,f.now+30);
  assert.equal(rows.some(row=>row.actor==='registered-owner'),false,JSON.stringify(rows));
  assert.deepEqual(rows.filter(row=>row.actor==='reviewer').map(row=>row.channel).sort((a,b)=>String(a)<String(b)?-1:String(a)>String(b)?1:0),['email','in_app']);
 }finally{f.dispose();}
});

void test('queued Product staff copies become stale when their recipient becomes personal, and fake delivery never hands them off',async()=>{
 const f=await actualConcern();try{
  await changeProductAvailability(f.db,{actorId:'registered-owner',requestId:'party-notice-owner-pause',expectedRevision:null,now:f.now+30},{productId:f.productId,action:'owner_pause',reason:'Pause only new orders while the exact original fictional product is checked.'});
  const notices=f.sqlite.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE recipient_user_id='reviewer' AND audience_role='staff' AND channel='email' AND template_key IN ('business.product.priority','business.product.availability')").all();
  assert.ok(notices.length>=2);
  f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();
  for(const row of notices){const notice={template:String(row.template),relatedId:String(row.relatedId),relatedType:String(row.relatedType),userId:String(row.userId),audience:String(row.audience),channel:String(row.channel),requestId:String(row.requestId)};assert.equal(await isCurrentOperationalNotice(f.db,notice),false,notice.template);}
  f.sqlite.prepare("UPDATE users SET auth_subject='fictional-product-reviewer-subject' WHERE id='reviewer'").run();
  f.sqlite.exec("UPDATE notification_messages SET status='cancelled' WHERE channel='email' AND template_key NOT IN ('business.product.priority','business.product.availability')");
  const sent:string[]=[];await deliverBusinessEmails(f.db,{transport:'capture',handoffAware:true,send:async(message,context)=>{await context?.beforeHandoff?.();sent.push(message.to);return{outcome:'captured',transport:'capture',receipt:'fictional-product-only'};}},'http://localhost:3018',{limit:30});
  const email=String(f.sqlite.prepare("SELECT email FROM users WHERE id='reviewer'").get()?.email);assert.equal(sent.includes(email),false);
 }finally{f.dispose();}
});

void test('Product intake notices exclude the exact current profile party at the native decision commit',async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);try{const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId);let raced=false;const db={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){if(!raced){raced=true;f.sqlite.prepare("UPDATE seller_profiles SET user_id='delegate' WHERE id='registered'").run();}return f.db.batch(statements);}}as D1Database;
  await reviewProductPublication(db,{actorId:'reviewer',requestId:'intake-current-party-notice',expectedRevision:String(view.revision),now:f.now+30},{caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),action:'request_changes',reason:'Correct this exact original product with actual seller feedback.',checks:null});assert.equal(raced,true);
  const rows=f.sqlite.prepare("SELECT recipient_user_id actor,audience_role audience,channel FROM notification_messages WHERE template_key='business.product.intake' AND related_id=? AND created_at=?").all(f.sent.caseId,f.now+30);
  assert.equal(rows.some(row=>row.actor==='delegate'&&row.audience==='staff'),false,JSON.stringify(rows));assert.deepEqual(rows.filter(row=>row.actor==='reviewer').map(row=>row.channel).sort((a,b)=>String(a)<String(b)?-1:String(a)>String(b)?1:0),['email','in_app']);
 }finally{f.dispose();}
});

void test('an issued Product intake staff copy is stale at exact current-party change and fake sender never hands it off',async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);try{const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId);await reviewProductPublication(f.db,{actorId:'reviewer',requestId:'intake-issued-party-notice',expectedRevision:String(view.revision),now:f.now+30},{caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),action:'request_changes',reason:'Correct this exact original product with actual seller feedback.',checks:null});
  const row=f.sqlite.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE template_key='business.product.intake' AND related_id=? AND recipient_user_id='reviewer' AND channel='email' AND created_at=?").get(f.sent.caseId,f.now+30);assert.ok(row);const notice={template:String(row.template),relatedId:String(row.relatedId),relatedType:String(row.relatedType),userId:String(row.userId),audience:String(row.audience),channel:String(row.channel),requestId:String(row.requestId)};assert.equal(await isCurrentOperationalNotice(f.db,notice),true);
  f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();assert.equal(await isCurrentOperationalNotice(f.db,notice),false);
  f.sqlite.exec("UPDATE notification_messages SET status='cancelled' WHERE channel='email' AND template_key<>'business.product.intake'");const sent:string[]=[];await deliverBusinessEmails(f.db,{transport:'capture',handoffAware:true,send:async(message,context)=>{await context?.beforeHandoff?.();sent.push(message.to);return{outcome:'captured',transport:'capture',receipt:'fictional-intake-only'};}},'http://localhost:3018',{limit:30});
  assert.equal(sent.includes(String(f.sqlite.prepare("SELECT email FROM users WHERE id='reviewer'").get()?.email)),false);
 }finally{f.dispose();}
});
