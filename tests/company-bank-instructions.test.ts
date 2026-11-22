import { fakeProviderMail } from './helpers/fake-provider-mail';
import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {companyDetails} from '../lib/content/company-details';
import {listReviewTasks,assignReviewTask} from '../lib/workflows/review-tasks';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';
import {deliverBusinessEmails as actualDeliverBusinessEmails} from '../lib/operations/business-notifications';
const details={holder:companyDetails.legalName,bank:'Fictional Test Bank',branch:'Fictional Branch',accountNumber:'TEST-RECEIVE-0001',currency:'NPR' as const,purpose:'both' as const};
async function api(){const path='../lib/payments/company-accounts';const loadedFixtureModule=await import(path).catch(()=>null);assert.equal(typeof loadedFixtureModule?.publishCompanyReceivingAccount,'function','A versioned, guarded company receiving-account workflow is required');return loadedFixtureModule!;}
const command=(actorId:string,requestId:string,expectedRevision:string|null,now:number)=>({actorId,requestId,expectedRevision,now});
function bankOrder(f:Awaited<ReturnType<typeof completeVersionFixture>>,id:string){
 f.sqlite.prepare("INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at) VALUES(?,?,'customer','customer@local.hastabazaar.test','9800000000','placed','en-NP','fictional-terms','{}',12000,500,12500,'prepaid','unpaid',?,?)").run(id,'FIX-'+id,f.now,f.now);
}
async function verified(m:Awaited<ReturnType<typeof api>>,f:Awaited<ReturnType<typeof completeVersionFixture>>,key:string,accountNumber=details.accountNumber){
 const saved=await m.saveCompanyAccountDraft(f.db,command('reviewer',key+'-draft',null,f.now),{accountId:null,basedOnVersionId:null,details:{...details,accountNumber},evidenceReference:'FICTIONAL-PRIVATE-OWNERSHIP-'+key,conflictUserIds:[],reason:'Record a fictional company-owned receiving account'});
 await m.submitCompanyAccountForReview(f.db,command('reviewer',key+'-submit','0',f.now+1),{versionId:saved.versionId,reason:'Submit the exact fictional ownership evidence for review'});
 await m.verifyCompanyAccount(f.db,command('reviewer',key+'-verify','1',f.now+2),{versionId:saved.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-VERIFIED-'+key,reason:'Verify fictional company ownership and NPR receiving currency'});
 return saved;
}
void test('one eligible Super Admin verifies and separately enables account versions; issued instructions remain immutable after replacement and retirement',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  bankOrder(f,'bank-one');bankOrder(f,'bank-two');bankOrder(f,'bank-three');const sellerBefore=JSON.stringify(f.sqlite.prepare('SELECT * FROM seller_profiles').all());
  const saved=await verified(m,f,'first');
  await assert.rejects(m.issueCompanyPaymentInstructions(f.db,command('customer','instructions-before-enable',String(f.now),f.now+3),{orderId:'bank-one'}));
  await m.publishCompanyReceivingAccount(f.db,command('reviewer','publish-first','2',f.now+4),{versionId:saved.versionId,expectedReceivingRevision:0,reason:'Enable this verified fictional account for new instructions'});
  const context=command('customer','instructions-first',String(f.now),f.now+5),issued=await m.issueCompanyPaymentInstructions(f.db,context,{orderId:'bank-one'});
  assert.equal(issued.amountPaisa,12500);assert.equal(issued.account.accountNumber,details.accountNumber);assert.equal(issued.deadlineAt,f.now+5+86400000);assert.doesNotMatch(JSON.stringify(issued),/FICTIONAL-PRIVATE-OWNERSHIP|FICTIONAL-VERIFIED/);
  const workspace=await m.getCompanyAccountWorkspace(f.db,'reviewer',f.now+6),account=workspace.accounts.find((row:{id:string})=>row.id===saved.accountId)!;
  const replacement=await m.saveCompanyAccountDraft(f.db,command('reviewer','replace',String(account.revision),f.now+7),{accountId:saved.accountId,basedOnVersionId:saved.versionId,details:{...details,accountNumber:'TEST-RECEIVE-0002'},evidenceReference:'FICTIONAL-PRIVATE-REPLACEMENT',conflictUserIds:[],reason:'Replace the fictional account with new evidence requiring review'});
  await assert.rejects(m.issueCompanyPaymentInstructions(f.db,command('customer','instructions-paused',String(f.now),f.now+8),{orderId:'bank-two'}));
  assert.deepEqual(await m.issueCompanyPaymentInstructions(f.db,context,{orderId:'bank-one'}),issued);
  const retained=await m.getCompanyPaymentInstruction(f.db,'bank-one','customer');assert.equal(retained.account.accountNumber,details.accountNumber);assert.equal(retained.requiresAccountReview,true);
  await m.submitCompanyAccountForReview(f.db,command('reviewer','replace-submit','0',f.now+8),{versionId:replacement.versionId,reason:'Submit the exact replacement for ownership review'});
  await m.verifyCompanyAccount(f.db,command('reviewer','replace-verify','1',f.now+9),{versionId:replacement.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-REPLACEMENT-VERIFIED',reason:'Confirm the new fictional company account ownership and currency'});
  const current=await m.getCompanyAccountWorkspace(f.db,'reviewer',f.now+10);
  await m.publishCompanyReceivingAccount(f.db,command('reviewer','replace-publish','2',f.now+11),{versionId:replacement.versionId,expectedReceivingRevision:current.receiving.revision,reason:'Enable the reviewed replacement for new instructions only'});
  const second=await m.issueCompanyPaymentInstructions(f.db,command('customer','instructions-second',String(f.now),f.now+12),{orderId:'bank-two'});assert.equal(second.account.accountNumber,'TEST-RECEIVE-0002');
  await m.retireCompanyAccount(f.db,command('reviewer','retire','3',f.now+13),{versionId:replacement.versionId,reason:'Retire the fictional receiving account while keeping all history'});
  await assert.rejects(m.issueCompanyPaymentInstructions(f.db,command('customer','instructions-retired',String(f.now),f.now+14),{orderId:'bank-three'}));
  assert.equal((await m.getCompanyPaymentInstruction(f.db,'bank-two','customer')).account.accountNumber,'TEST-RECEIVE-0002');
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM seller_profiles').all()),sellerBefore);
  assert.equal(f.sqlite.prepare("SELECT payment_status FROM orders WHERE id='bank-one'").get()?.payment_status,'unpaid');
  assert.doesNotMatch(JSON.stringify(f.sqlite.prepare('SELECT * FROM audit_logs').all()),/TEST-RECEIVE-0001|FICTIONAL-PRIVATE-OWNERSHIP/);
  assert.throws(()=>f.sqlite.exec("UPDATE company_payment_instructions SET snapshot_json='{}'"),/immutable/);
 }finally{f.dispose();}
});
void test('wrong-role access, recorded personal conflict, stale versions and role revocation cannot verify or publish banking evidence',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  await assert.rejects(m.getCompanyAccountWorkspace(f.db,'delegate',f.now));
  const saved=await m.saveCompanyAccountDraft(f.db,command('reviewer','conflicted-draft',null,f.now),{accountId:null,basedOnVersionId:null,details,evidenceReference:'FICTIONAL-PRIVATE-CONFLICT',conflictUserIds:['reviewer'],reason:'Record the declared fictional personal conflict for review'});
  await m.submitCompanyAccountForReview(f.db,command('reviewer','conflicted-submit','0',f.now+1),{versionId:saved.versionId,reason:'Refer this account to an eligible nonconflicted reviewer'});
  await assert.rejects(m.verifyCompanyAccount(f.db,command('reviewer','conflicted-review','1',f.now+2),{versionId:saved.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-CHECK',reason:'Attempt a decision on a recorded personal conflict'}));
  const clean=await verified(m,f,'clean','TEST-RECEIVE-0009');
  await assert.rejects(m.publishCompanyReceivingAccount(f.db,command('reviewer','stale','0',f.now+3),{versionId:clean.versionId,expectedReceivingRevision:0,reason:'Stale account review must not enable receiving instructions'}));
  f.setBeforeBatch(()=>{f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();});
  await assert.rejects(m.publishCompanyReceivingAccount(f.db,command('reviewer','revoked','2',f.now+4),{versionId:clean.versionId,expectedReceivingRevision:0,reason:'Revocation at commit must prevent this account publication'}));
  assert.equal(f.sqlite.prepare("SELECT version_id FROM company_payment_account_current WHERE currency='NPR'").get()?.version_id,null);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='revoked'").get()?.n,0);
 }finally{f.dispose();}
});
void test('concurrent account publication has one winner; instruction access is bound to the current order owner',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  bankOrder(f,'bank-owned');const a=await verified(m,f,'race-a'),b=await verified(m,f,'race-b','TEST-RECEIVE-0002');
  const outcomes=await Promise.allSettled([a,b].map((saved,index)=>m.publishCompanyReceivingAccount(f.db,command('reviewer','race-'+index,'2',f.now+3),{versionId:saved.versionId,expectedReceivingRevision:0,reason:'Choose one reviewed account for the next receiving instruction'})));
  assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);
  await assert.rejects(m.issueCompanyPaymentInstructions(f.db,command('foreign','foreign-instructions',String(f.now),f.now+4),{orderId:'bank-owned'}));
  await m.issueCompanyPaymentInstructions(f.db,command('customer','owned-instructions',String(f.now),f.now+4),{orderId:'bank-owned'});
  await assert.rejects(m.getCompanyPaymentInstruction(f.db,'bank-owned','foreign'));
  await assert.rejects(m.issueCompanyPaymentInstructions(f.db,command('customer','cod-instructions','1',f.now+4),{orderId:'legacy-order'}));
 }finally{f.dispose();}
});

void test('company ownership review and safe notices share current source identity without hiding personal conflicts or duplicating retries',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  const saved=await m.saveCompanyAccountDraft(f.db,command('reviewer','queue-draft',null,f.now),{accountId:null,basedOnVersionId:null,details,evidenceReference:'FICTIONAL-PRIVATE-QUEUE-PROOF',conflictUserIds:[],reason:'Prepare the fictional company receiving account for review'});
  assert.equal((await listReviewTasks(f.db,'reviewer')).filter(row=>row.sourceType==='company_account').length,0);
  const context=command('reviewer','queue-submit','0',f.now+1),input={versionId:saved.versionId,reason:'Submit fictional company ownership to the shared review queue'};
  await m.submitCompanyAccountForReview(f.db,context,input);await m.submitCompanyAccountForReview(f.db,context,input);
  const task=(await listReviewTasks(f.db,'reviewer')).find(row=>row.sourceId===saved.versionId)!;
  assert.equal(task.status,'awaiting_review');assert.equal(task.startedAt,f.now+1);assert.equal(task.dueAt,null);
  await assignReviewTask(f.db,command('reviewer','company-review-assignment','0',f.now+2),{taskId:task.id,ownerId:'reviewer',reason:'Own the company review as the eligible preparing Super Admin'});
  assert.equal((await listReviewTasks(f.db,'delegate')).filter(row=>row.sourceType==='company_account').length,0);
  const notices=f.sqlite.prepare("SELECT template_key AS template,related_id AS relatedId,related_type AS relatedType,recipient_user_id AS userId,audience_role AS audience,channel,request_id AS requestId FROM notification_messages WHERE template_key='business.company.account'").all() as unknown as Parameters<typeof isCurrentOperationalNotice>[1][];
  assert.equal(notices.length,4);assert.equal(notices.filter(row=>row.userId!=='reviewer').length,0);
  assert.equal((await Promise.all(notices.map(row=>isCurrentOperationalNotice(f.db,row)))).filter(Boolean).length,2);
  assert.doesNotMatch(JSON.stringify(f.sqlite.prepare("SELECT * FROM notification_messages WHERE template_key='business.company.account'").all()),/TEST-RECEIVE|PRIVATE-QUEUE-PROOF/);
  await m.verifyCompanyAccount(f.db,command('reviewer','queue-verify','1',f.now+3),{versionId:saved.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-QUEUE-VERIFY',reason:'Verify company ownership independently of receiving enablement'});
  assert.equal((await listReviewTasks(f.db,'reviewer')).find(row=>row.id===task.id)?.status,'completed');
  assert.equal((await Promise.all(notices.map(row=>isCurrentOperationalNotice(f.db,row)))).some(Boolean),false);
  assert.equal(f.sqlite.prepare('SELECT version_id FROM company_payment_account_current').get()?.version_id,null);
  const captured:{to:string;text:string;subject:string}[]=[];
  const delivered=await deliverBusinessEmails(f.db,{send:async message=>{captured.push(message);}},'https://company-fixture.test',{now:f.now+4,limit:20});
  const companyMail=captured.filter(message=>message.subject.includes('Company receiving account'));
  assert.equal(delivered.accepted,captured.length);assert.equal(companyMail.length,1);assert.match(companyMail[0].text,/company-account-/);assert.doesNotMatch(companyMail[0].text,/TEST-RECEIVE|PRIVATE-QUEUE-PROOF/);
  assert.equal((await deliverBusinessEmails(f.db,{send:async()=>{throw new Error('Duplicate delivery attempted');}},'https://company-fixture.test',{now:f.now+5,limit:20})).accepted,0);
 }finally{f.dispose();}
});

void test('a duplicate company bank identity cannot bypass retained conflicts and an outgoing-only account cannot receive customer instructions',async()=>{
 const m=await api(),f=await completeVersionFixture();try{
  const saved=await m.saveCompanyAccountDraft(f.db,command('reviewer','identity-draft',null,f.now),{accountId:null,basedOnVersionId:null,details,evidenceReference:'FICTIONAL-CONFLICT-EVIDENCE',conflictUserIds:['reviewer'],reason:'Record a fictional personal interest against this bank identity'});
  await assert.rejects(m.saveCompanyAccountDraft(f.db,command('reviewer','identity-bypass',null,f.now+1),{accountId:null,basedOnVersionId:null,details:{...details,bank:details.bank.toUpperCase()},evidenceReference:'FICTIONAL-CLEAN-EVIDENCE',conflictUserIds:[],reason:'A new family must not erase an existing identity conflict'}));
  await assert.rejects(m.saveCompanyAccountDraft(f.db,command('reviewer','conflict-drop','1',f.now+2),{accountId:saved.accountId,basedOnVersionId:saved.versionId,details,evidenceReference:'FICTIONAL-CLEAN-REPLACEMENT',conflictUserIds:[],reason:'Replacing details cannot silently discard recorded conflicts'}));
  const outgoing=await m.saveCompanyAccountDraft(f.db,command('reviewer','outgoing-draft',null,f.now),{accountId:null,basedOnVersionId:null,details:{...details,accountNumber:'TEST-OUTGOING-0001',purpose:'payment_source'},evidenceReference:'FICTIONAL-OUTGOING-EVIDENCE',conflictUserIds:[],reason:'Prepare a fictional company account for outgoing payments only'});
  await m.submitCompanyAccountForReview(f.db,command('reviewer','outgoing-submit','0',f.now+1),{versionId:outgoing.versionId,reason:'Submit the outgoing source for company ownership review'});
  await m.verifyCompanyAccount(f.db,command('reviewer','outgoing-verify','1',f.now+2),{versionId:outgoing.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-OUTGOING-VERIFY',reason:'Confirm this outgoing source belongs to the company in NPR'});
  await assert.rejects(m.publishCompanyReceivingAccount(f.db,command('reviewer','outgoing-publish','2',f.now+3),{versionId:outgoing.versionId,expectedReceivingRevision:0,reason:'An outgoing-only source cannot be used for customer receipts'}));
 }finally{f.dispose();}
});

// This test suite models an explicitly accepting fake provider.
const deliverBusinessEmails: typeof actualDeliverBusinessEmails = (db,mail,origin,options) => actualDeliverBusinessEmails(db,fakeProviderMail(mail),origin,options);
