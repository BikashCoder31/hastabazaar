import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {getRefundFinanceWorkspace} from '../lib/payments/refund-workspace';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {saveCompanyAccountDraft} from '../lib/payments/company-accounts';
declare global{var customerReversalDb:D1Database;var customerReversalActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.customerReversalDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{status=403};export async function requireStaffApi(){const id=globalThis.customerReversalActor;const row=await globalThis.customerReversalDb.prepare("SELECT 1 FROM users u JOIN user_roles role ON role.user_id=u.id WHERE u.id=? AND u.status=\'active\' AND role.role=\'super_admin\'").bind(id).first();if(!row)throw new StaffAuthorizationError("Staff access denied");return {id}}',shortCircuit:true};
 return next(specifier,context);
}});
void test('protected refund route records and recovers actual customer reversal and retain outcomes with current authority',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 globalThis.customerReversalDb=f.db;globalThis.customerReversalActor='reviewer';
 const api=await import('../app/api/admin/refunds/route');
 const packet=f.sqlite.prepare("SELECT id,revision FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
 const receipt=await recordBankReceipt(f.db,f.ctx('api-return-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-PROTECTED-CUSTOMER-RETURN',bankAt:Date.now()-1,amountMinor:f.cashPaisa,currency:'NPR',payerReference:'Original customer refund returned',payerUserId:'customer',evidenceReference:'FICTIONAL-PROTECTED-CUSTOMER-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify the actual returned original customer refund before protected route recording.'});
 const workspace=await getRefundFinanceWorkspace(f.db,'reviewer');
 assert.ok(workspace.obligations.some(row=>row.id===f.obligationId));assert.ok(workspace.returnedCredits.some(row=>row.id===receipt.id&&row.packetId===packet.id));
 const body={sourceFormId:'system.refund-finance',action:'customer_reversal',requestId:'protected-customer-reversal',expectedRevision:String(packet.revision),input:{packetId:packet.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-PROTECTED-CUSTOMER-RETURN',reason:'Record the actual returned credit against the original paid customer refund once.'}};
 const send=(payload:unknown,origin='https://refund-reversal.test')=>api.POST(new Request('https://refund-reversal.test/api/admin/refunds',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload)}));
 assert.equal((await send(body,'https://foreign.test')).status,403);
 assert.equal((await send({...body,sourceFormId:'system.recovery-finance'})).status,400);
 assert.equal((await send({...body,input:{...body.input,caseId:f.recoveryId}})).status,400);
 const saved=await send(body);assert.equal(saved.status,200);const outcome=await saved.json() as {id:string};
 assert.deepEqual(await (await send(body)).json(),outcome);
 assert.deepEqual(await (await api.GET(new Request('https://refund-reversal.test/api/admin/refunds?attempt='+body.requestId))).json(),{outcome});
 assert.notEqual((await send({...body,input:{...body.input,amountPaisa:f.cashPaisa-1}})).status,200);
 const retry=await f.m.openRefundObligation(f.db,f.ctx('api-retry-obligation'),{kind:'receipt_return',sourceId:receipt.id,reason:'Reserve only the original customer returned credit for its separately verified reissue.'});
 const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 const retain={sourceFormId:'system.refund-finance',action:'customer_reversal_retain',requestId:'protected-customer-retain',expectedRevision:String(review.case.revision),input:{caseId:f.recoveryId,reversalId:outcome.id,retryObligationId:retry.id,reviewDigest:review.reviewDigest,stillValidObligationConfirmed:true,evidenceReference:'FICTIONAL-PROTECTED-STILL-VALID-OBLIGATION',reason:'The reviewed original refund and seller responsibility remain valid under the original evidence.',publicMessage:'Your original responsibility remains valid while the original customer refund is reissued.'}};
 const retained=await send(retain);assert.equal(retained.status,200);const retainedOutcome=await retained.json() as {id:string};assert.deepEqual(await(await send(retain)).json(),retainedOutcome);
 assert.deepEqual(await(await api.GET(new Request('https://refund-reversal.test/api/admin/refunds?attempt='+retain.requestId))).json(),{outcome:retainedOutcome});
 // A current personal seller interest must also block returning an earlier retain outcome.
 f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();
 assert.notEqual((await send(retain)).status,200);
 const denied=await api.GET(new Request('https://refund-reversal.test/api/admin/refunds?attempt='+retain.requestId));assert.notEqual(denied.status,200);assert.equal('outcome' in (await denied.json() as Record<string,unknown>),false);
 f.sqlite.prepare("UPDATE seller_profiles SET user_id='registered-owner' WHERE id='registered'").run();assert.deepEqual(await(await send(retain)).json(),retainedOutcome);
 // The supported version replacement adds the conflict while immutable retained evidence stays intact.
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const account=f.sqlite.prepare('SELECT v.account_id accountId,v.details_json details,a.revision FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id WHERE v.id=?').get(f.accountVersionId)!;
 await saveCompanyAccountDraft(f.db,f.ctx('api-later-account-conflict',String(account.revision)),{accountId:String(account.accountId),basedOnVersionId:f.accountVersionId,details:JSON.parse(String(account.details)),evidenceReference:'FICTIONAL-API-LATER-ACCOUNT-INTEREST',conflictUserIds:['reviewer'],reason:'Record a newly declared operator personal interest in a supported replacement of the same company account.'});
 assert.deepEqual(JSON.parse(String(f.sqlite.prepare('SELECT conflicts_json FROM company_payment_account_versions WHERE id=?').get(f.accountVersionId)!.conflicts_json)),[]);
 assert.equal((await send(retain)).status,403);
 const accountDenied=await api.GET(new Request('https://refund-reversal.test/api/admin/refunds?attempt='+retain.requestId));assert.equal(accountDenied.status,403);assert.equal('outcome' in (await accountDenied.json() as Record<string,unknown>),false);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_refund_reversals').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_refund_reversal_dispositions').get()!.n,1);
 globalThis.customerReversalActor='customer';assert.equal((await send({...body,requestId:'customer-denied'})).status,403);
 }finally{f.dispose();}
});

