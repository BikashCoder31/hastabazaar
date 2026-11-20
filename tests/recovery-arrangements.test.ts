import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSellerRecoveryFixture,agreedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {recoveryReviewSource,ensureRecoveryReviewWork,readRecoveryFollowup} from '../lib/payments/recovery-followup';

async function propose(f:Awaited<ReturnType<typeof approvedSellerRecoveryFixture>>,revision:number,requestId:string,nettingAuthorized=true){
 const terms=await recovery.getSellerRecoveryPlanTerms(f.db,'registered-owner',f.recoveryId),now=Date.now();
 return runRecoveryCommand(f.db,'registered-owner',{sourceFormId:'system.recovery-seller',requestId,expectedRevision:String(revision),action:'propose',input:{caseId:f.recoveryId,termsDigest:terms.termsDigest,termsAccepted:true,nettingAuthorized,installments:[{amountPaisa:terms.terms.remainingPaisa,dueAt:now+7*86400000}],contactDetails:'Use my verified account contact for this fictional arrangement.',nextReviewAt:now+3*86400000}},'seller') as Promise<{id:string;caseId:string;revision:number}>;
}

void test('a pending seller arrangement has one owned first-review clock and preserves financial amounts',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const before=f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n;
 const proposal=await propose(f,1,'arrangement-first-proposal');
 const source=await recoveryReviewSource(f.db,f.recoveryId);
 assert.equal(source.needsAction,true);assert.equal(source.status,'proposal_review');assert.equal(source.initialReviewerId,'reviewer');
 const original=f.sqlite.prepare('SELECT accepted_at FROM seller_recovery_proposals WHERE id=?').get(proposal.id)!;
 assert.equal(source.startedAt,original.accepted_at);assert.equal(source.dueAt-source.startedAt,86400000);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='recovery_review' AND source_id=? AND source_revision=?").get(f.recoveryId,source.revision)!.n,1);
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n,before);
 }finally{f.dispose();}
});

void test('Finance can record a nonfinancial follow-up but cannot decide or recover a Super Admin proposal decision',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const proposal=await propose(f,1,'arrangement-role-proposal'),view=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 const input={caseId:f.recoveryId,proposalId:proposal.id,decision:'rejected' as const,reviewDigest:view.reviewDigest,nextReviewAt:Date.now()+86400000,reason:'Retain the independent fictional Super Admin decision and its reviewed next step.',publicMessage:'This proposed schedule is declined. Please discuss revised dates with Finance.'};
 await runRecoveryCommand(f.db,'reviewer',{sourceFormId:'system.recovery-finance',requestId:'arrangement-role-decision',expectedRevision:'2',action:'review_proposal',input},'staff');
 f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();
 f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
 await assert.rejects(recoverRecoveryCommand(f.db,'reviewer','arrangement-role-decision','staff'),/permission/i);
 await assert.rejects(recovery.reviewSellerRecoveryProposal(f.db,f.ctx('arrangement-role-reject-again','3'),input),/permission/i);
 const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),body={sourceFormId:'system.recovery-finance',requestId:'arrangement-role-followup',expectedRevision:'3',action:'review_arrangement',input:{caseId:f.recoveryId,proposalId:proposal.id,reviewDigest:current.reviewDigest,nextReviewAt:Date.now()+2*86400000,reason:'Finance records actual contact without amending financial responsibility or terms.',publicMessage:'Finance contacted you about revised dates and will review your response at the next update.'}};
 const result=await runRecoveryCommand(f.db,'reviewer',body,'staff');assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer','arrangement-role-followup','staff'),result);
 assert.equal((await recoveryReviewSource(f.db,f.recoveryId)).dueAt,body.input.nextReviewAt);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

void test('an actually reviewed missed installment retains its due date and follows one explicit next update; a later installment remains actionable',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const terms=await recovery.getSellerRecoveryPlanTerms(f.db,'registered-owner',f.recoveryId),now=Date.now(),day=86400000,half=Math.floor(terms.terms.remainingPaisa/2);
 const proposal=await recovery.proposeSellerRecoveryPlan(f.db,{...f.ctx('missed-installment-proposal','1'),actorId:'registered-owner'},{caseId:f.recoveryId,termsDigest:terms.termsDigest,termsAccepted:true,nettingAuthorized:false,installments:[{amountPaisa:half,dueAt:now+7*day},{amountPaisa:terms.terms.remainingPaisa-half,dueAt:now+14*day}],nextReviewAt:now+3*day,contactDetails:'Use the fictional verified account contact.'});
 const first=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await recovery.approveSellerRecoveryPlan(f.db,f.ctx('missed-installment-approve','2'),{caseId:f.recoveryId,proposalId:proposal.id,reviewDigest:first.reviewDigest,reason:'Approve the exact two installment dates accepted by the original seller.'});
 // Only this :memory: fixture receives an authoritative database clock; no immutable rows
 // or native constraints are changed to make the original installment appear overdue.
 let clock=now+8*day;
 f.sqlite.function('strftime',{varargs:true},(...args)=>{assert.equal(args[1],'now');if(args[0]==='%s')return String(Math.floor(clock/1000));if(args[0]==='%f')return new Date(clock).toISOString().slice(17,23);throw new Error('Unexpected fictional clock format.');});
 const before=await readRecoveryFollowup(f.db,f.recoveryId,clock);assert.equal(before.installments[0].overdue,true);assert.equal(before.installments[1].overdue,false);
 const view=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),input={caseId:f.recoveryId,proposalId:proposal.id,reviewDigest:view.reviewDigest,nextReviewAt:now+12*day,reason:'Record actual contact about the missed first installment and its next owned review.',publicMessage:'Finance reviewed the missed installment and will contact you again on the displayed review date.'};
 await recovery.recordSellerRecoveryArrangementReview(f.db,{...f.ctx('missed-first-followup','3'),now:clock},input);
 const current=await recoveryReviewSource(f.db,f.recoveryId);assert.equal(current.dueAt,now+12*day);assert.equal(current.status,'arrangement_review');
 assert.equal((await readRecoveryFollowup(f.db,f.recoveryId,clock)).installments[0].dueAt,now+7*day);
 clock=now+13*day;const updated=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await recovery.recordSellerRecoveryArrangementReview(f.db,{...f.ctx('missed-second-followup','4'),now:clock},{...input,reviewDigest:updated.reviewDigest,nextReviewAt:now+20*day});
 const second=await recoveryReviewSource(f.db,f.recoveryId);assert.equal(second.status,'installment_followup');assert.equal(second.dueAt,now+14*day);
 await ensureRecoveryReviewWork(f.db,f.recoveryId,clock);await ensureRecoveryReviewWork(f.db,f.recoveryId,clock+day);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='recovery_review' AND source_id=? AND source_revision=?").get(f.recoveryId,second.revision)!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

void test('an approved arrangement owns its next review and original installment deadline without daily duplicate tasks',async()=>{
 const f=await agreedSellerRecoveryFixture();try{
 const proposal=f.sqlite.prepare('SELECT id,next_review_at,installments_json FROM seller_recovery_proposals WHERE case_id=?').get(f.recoveryId)!,installments=JSON.parse(String(proposal.installments_json));
 const first=await recoveryReviewSource(f.db,f.recoveryId);assert.equal(first.needsAction,true);assert.equal(first.status,'arrangement_review');assert.equal(first.dueAt,proposal.next_review_at);
 const path='../lib/payments/seller-recovery',m=await import(path),view=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),nextReviewAt=installments[0].dueAt+86400000;
 const input={caseId:f.recoveryId,proposalId:String(proposal.id),reviewDigest:view.reviewDigest,nextReviewAt,reason:'Retain this fictional early review without changing seller-approved dates or earnings permission.',publicMessage:'Finance has reviewed your arrangement. The original installment remains due on its agreed date.'};
 const ctx=f.ctx('arrangement-periodic-review','3'),result=await m.recordSellerRecoveryArrangementReview(f.db,ctx,input);
 assert.deepEqual(await m.recordSellerRecoveryArrangementReview(f.db,ctx,input),result);
 const current=await recoveryReviewSource(f.db,f.recoveryId);assert.equal(current.dueAt,installments[0].dueAt);assert.equal(current.status,'installment_followup');
 assert.equal(f.sqlite.prepare('SELECT installments_json FROM seller_recovery_proposals WHERE id=?').get(proposal.id)!.installments_json,proposal.installments_json);
 assert.equal(JSON.parse(String(f.sqlite.prepare('SELECT plan_json FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.plan_json)).nettingAuthorized,true);
 await ensureRecoveryReviewWork(f.db,f.recoveryId);await ensureRecoveryReviewWork(f.db,f.recoveryId);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='recovery_review' AND source_id=? AND source_revision=?").get(f.recoveryId,current.revision)!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

void test('a replacement proposal pauses old earnings authority until a fresh decision',async()=>{
 const f=await agreedSellerRecoveryFixture();try{
 f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('arrangement-later-earnings','registered','sale',50000,1,'Fictional later eligible earnings',1)").run();
 await propose(f,3,'arrangement-replacement-proposal',false);
 await assert.rejects(recovery.applySellerRecoveryEarnings(f.db,f.ctx('cannot-use-superseded-authority','4'),{caseId:f.recoveryId}),/agreement|authority|plan/i);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal((await recoveryReviewSource(f.db,f.recoveryId)).status,'proposal_review');
 }finally{f.dispose();}
});

void test('one eligible Super Admin can request revised terms, retain the explanation, and approve a new exact proposal',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const proposal=await propose(f,1,'arrangement-needs-revision');
 const path='../lib/payments/seller-recovery',m=await import(path),view=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),nextReviewAt=Date.now()+2*86400000;
 const input={caseId:f.recoveryId,proposalId:proposal.id,decision:'changes_requested',reviewDigest:view.reviewDigest,nextReviewAt,reason:'FICTIONAL-PRIVATE-PLAN-REVIEW: revise the contact and schedule before approval.',publicMessage:'Please submit revised dates and contact details. Finance will review the updated arrangement.'};
 await assert.rejects(m.reviewSellerRecoveryProposal(f.db,{...f.ctx('owner-cannot-decide-plan','2'),actorId:'registered-owner'},input));
 const ctx=f.ctx('arrangement-reviewed','2'),saved=await m.reviewSellerRecoveryProposal(f.db,ctx,input);
 assert.deepEqual(await m.reviewSellerRecoveryProposal(f.db,ctx,input),saved);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 const source=await recoveryReviewSource(f.db,f.recoveryId);assert.equal(source.status,'arrangement_changes_requested');assert.equal(source.dueAt,nextReviewAt);
 const statement=await (await import('../lib/payments/recovery-workspace')).getSellerRecoveryStatement(f.db,'registered-owner',f.recoveryId);
 assert.ok(statement.events.some(e=>e.message===input.publicMessage));assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-PLAN-REVIEW'),false);
 const replacement=await propose(f,3,'arrangement-revised-by-owner',false),current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await assert.rejects(recovery.approveSellerRecoveryPlan(f.db,f.ctx('cannot-approve-old-plan','4'),{caseId:f.recoveryId,proposalId:proposal.id,reviewDigest:current.reviewDigest,reason:'An older superseded proposal must not become the new approved arrangement.'}));
 await recovery.approveSellerRecoveryPlan(f.db,f.ctx('approve-revised-arrangement','4'),{caseId:f.recoveryId,proposalId:replacement.id,reviewDigest:current.reviewDigest,reason:'One eligible Super Admin approves the exact revised terms explicitly accepted by the seller.'});
 const approved=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(JSON.parse(approved.case.planJson!).proposalId,replacement.id);assert.equal(JSON.parse(approved.case.planJson!).nettingAuthorized,false);
 await assert.rejects(m.reviewSellerRecoveryProposal(f.db,f.ctx('cannot-reject-approved-plan','5'),{...input,proposalId:replacement.id,reviewDigest:approved.reviewDigest}));
 }finally{f.dispose();}
});
