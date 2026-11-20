import assert from 'node:assert/strict';
import test from 'node:test';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {getProductPublicationReview,reviewProductPublication} from '../lib/products/publication';
import {getProductAvailability,changeProductAvailability} from '../lib/products/availability';
import {getProductConcern,reportProductConcern,triageProductConcern} from '../lib/products/priority-concerns';
import {deliverBusinessEmails} from '../lib/operations/business-notifications';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';

void test('disposable native Product commands, final reads and queued delivery retain exact original/current party boundaries',{timeout:180000},async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|null=null;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));native=await nativeFinanceClone(f.sqlite);const db=native.db;
  const view=await getProductPublicationReview(db,'reviewer',f.sent.caseId),published=await reviewProductPublication(db,{actorId:'reviewer',requestId:'native-party-publish',expectedRevision:String(view.revision),now:f.now+20},{caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),action:'approve_and_publish',reason:'Review the exact original fictional product and its retained usable cover.',checks:{sameItem:true,accurateCover:true,eligibilityEvidence:[]}});
  const concern=await reportProductConcern(db,{actorId:'registered-owner',requestId:'native-party-report',expectedRevision:null,now:f.now+21},{productId:view.productId,publicVersionId:published.versionId,kind:'price_error',note:'Check this exact original offer without changing the selling price.'});
  const triage={caseId:concern.id,state:'open' as const,ownerId:'reviewer',backupId:null,backupUnavailableReason:'No second eligible fictional member is available.',coverageConfirmed:true,nextUpdateAt:f.now+3600000,note:'The independent reviewer will update this exact original case.'};
  await triageProductConcern(db,{actorId:'reviewer',requestId:'native-party-coverage',expectedRevision:'0',now:f.now+22},triage);
  await changeProductAvailability(db,{actorId:'registered-owner',requestId:'native-party-owner-pause',expectedRevision:null,now:f.now+23},{productId:view.productId,action:'owner_pause',reason:'Pause only new orders while the exact original offer is checked.'});
  const notices=(await db.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE recipient_user_id='reviewer' AND audience_role='staff' AND channel='email' AND template_key IN ('business.product.priority','business.product.availability')").all<{template:string;relatedId:string;relatedType:string;userId:string;audience:string;channel:string;requestId:string}>()).results;assert.ok(notices.length>=2);
  await db.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();
  for(const notice of notices)assert.equal(await isCurrentOperationalNotice(db,notice),false,notice.template);
  await db.prepare("UPDATE notification_messages SET status='cancelled' WHERE channel='email' AND template_key NOT IN ('business.product.priority','business.product.availability')").run();
  const sent:string[]=[];await deliverBusinessEmails(db,{transport:'capture',handoffAware:true,send:async(message,context)=>{await context?.beforeHandoff?.();sent.push(message.to);return{outcome:'captured',transport:'capture',receipt:'fictional-native-product-only'};}},'http://localhost:3018',{limit:30});
  const reviewer=await db.prepare("SELECT email FROM users WHERE id='reviewer'").first<{email:string}>();assert.ok(reviewer);assert.equal(sent.includes(reviewer.email),false);
  await db.prepare("UPDATE seller_profiles SET user_id='registered-owner' WHERE id='registered'").run();
  const state=await getProductAvailability(db,'reviewer',view.productId,Date.now());let raced=false;const racing={prepare:db.prepare.bind(db),async batch(statements:D1PreparedStatement[]){if(!raced){raced=true;await db.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();}return db.batch(statements);}}as D1Database;
  await assert.rejects(changeProductAvailability(racing,{actorId:'reviewer',requestId:'native-party-at-commit',expectedRevision:String(state.state.revision),now:f.now+24},{productId:view.productId,action:'staff_withdraw',reason:'A party change at the actual native commit must roll this independent action back.'}),/changed|authority|compare/i);assert.equal(raced,true);
  assert.equal((await db.prepare('SELECT revision FROM product_availability_states WHERE product_id=?').bind(view.productId).first<{revision:number}>())?.revision,state.state.revision);
  assert.equal((await db.prepare("SELECT COUNT(*)n FROM audit_logs WHERE action='product.availability.staff_withdraw'").first<{n:number}>())?.n,0);
  await db.prepare("UPDATE seller_profiles SET user_id='delegate' WHERE id='registered'").run();await db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',?)").bind(f.now+25).run();
  const denied=(error:unknown)=>error instanceof Error&&'status'in error&&error.status===403;
  await assert.rejects(getProductAvailability(db,'registered-owner',view.productId,Date.now()),denied);await assert.rejects(getProductConcern(db,'registered-owner',concern.id),denied);
  await assert.rejects(triageProductConcern(db,{actorId:'registered-owner',requestId:'native-retained-party-triage',expectedRevision:'1',now:f.now+26},triage),denied);
  await triageProductConcern(db,{actorId:'reviewer',requestId:'native-independent-party-triage',expectedRevision:'1',now:f.now+27},triage);
  const copies=(await db.prepare('SELECT recipient_user_id actor,channel FROM notification_messages WHERE related_id=? AND created_at=?').bind(concern.id,f.now+27).all<{actor:string;channel:string}>()).results;
  assert.equal(copies.some(copy=>copy.actor==='registered-owner'),false);assert.deepEqual(copies.filter(copy=>copy.actor==='reviewer').map(copy=>copy.channel).sort(),['email','in_app']);
  const input={productId:view.productId,action:'staff_withdraw' as const,reason:'An independent authorized reviewer records the separate staff withdrawal.'},context={actorId:'reviewer',requestId:'native-independent-party-withdraw',expectedRevision:String(state.state.revision),now:f.now+28};
  const withdrawn=await changeProductAvailability(db,context,input);assert.deepEqual(await changeProductAvailability(db,context,input),withdrawn);
  const final=await getProductAvailability(db,'reviewer',view.productId,Date.now());assert.equal(final.state.ownerPaused,true);assert.equal(final.state.staffWithdrawn,true);
  assert.equal((await db.prepare('SELECT owner_id ownerId FROM product_intake_drafts WHERE id=?').bind(f.attached.id).first<{ownerId:string}>())?.ownerId,'registered-owner');
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await native?.dispose();f.dispose();}
});

void test('disposable native intake notices recheck exact current parties at commit and at fake delivery',{timeout:180000},async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|null=null;try{
  native=await nativeFinanceClone(f.sqlite);const db=native.db,view=await getProductPublicationReview(db,'reviewer',f.sent.caseId),before=await db.prepare('SELECT first_requested_at firstRequestedAt FROM product_intake_cases WHERE id=?').bind(f.sent.caseId).first<{firstRequestedAt:number}>();let raced=false;
  const racing={prepare:db.prepare.bind(db),async batch(statements:D1PreparedStatement[]){if(!raced){raced=true;await db.prepare("UPDATE seller_profiles SET user_id='delegate' WHERE id='registered'").run();}return db.batch(statements);}}as D1Database;
  await reviewProductPublication(racing,{actorId:'reviewer',requestId:'native-intake-current-party',expectedRevision:String(view.revision),now:f.now+30},{caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),action:'request_changes',reason:'Correct this exact original product with actual seller feedback.',checks:null});assert.equal(raced,true);
  const rows=(await db.prepare("SELECT recipient_user_id actor,audience_role audience,channel FROM notification_messages WHERE template_key='business.product.intake' AND related_id=? AND created_at=?").bind(f.sent.caseId,f.now+30).all<{actor:string;audience:string;channel:string}>()).results;
  assert.equal(rows.some(row=>row.actor==='delegate'&&row.audience==='staff'),false);assert.deepEqual(rows.filter(row=>row.actor==='reviewer').map(row=>row.channel).sort(),['email','in_app']);
  const notice=await db.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE related_id=? AND template_key='business.product.intake' AND recipient_user_id='reviewer' AND channel='email' AND created_at=?").bind(f.sent.caseId,f.now+30).first<{template:string;relatedId:string;relatedType:string;userId:string;audience:string;channel:string;requestId:string}>();assert.ok(notice);assert.equal(await isCurrentOperationalNotice(db,notice),true);
  await db.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();assert.equal(await isCurrentOperationalNotice(db,notice),false);
  await db.prepare("UPDATE notification_messages SET status='cancelled' WHERE channel='email' AND template_key<>'business.product.intake'").run();const sent:string[]=[];
  await deliverBusinessEmails(db,{transport:'capture',handoffAware:true,send:async(message,context)=>{await context?.beforeHandoff?.();sent.push(message.to);return{outcome:'captured',transport:'capture',receipt:'fictional-native-intake-only'};}},'http://localhost:3018',{limit:30});
  const reviewer=await db.prepare("SELECT email FROM users WHERE id='reviewer'").first<{email:string}>();assert.ok(reviewer);assert.equal(sent.includes(reviewer.email),false);
  assert.deepEqual(await db.prepare('SELECT first_requested_at firstRequestedAt FROM product_intake_cases WHERE id=?').bind(f.sent.caseId).first(),before);assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await native?.dispose();f.dispose();}
});
