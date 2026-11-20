import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb} from './helpers/incentive-db';
import {companyDetails} from '../lib/content/company-details';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount,publishCompanyReceivingAccount,issueCompanyPaymentInstructions} from '../lib/payments/company-accounts';
import {listReviewTasks} from '../lib/workflows/review-tasks';
void test('disposable native D1 serializes receiving publication and retains exact company instruction and review history',async()=>{
 const f=await createIncentiveDb();try{
  await f.db.batch([f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('reviewer','reviewer@local.hastabazaar.test','Fictional Reviewer','active',1,1),('customer','customer@local.hastabazaar.test','Fictional Customer','active',1,1)"),f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1),('customer','customer',1)"),f.db.prepare("INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at) VALUES('bank-native','FICTIONAL-NATIVE','customer','customer@local.hastabazaar.test','9800000000','placed','en-NP','fictional-terms','{}',12000,500,12500,'prepaid','unpaid',1,1)")]);
  const c=(requestId:string,expectedRevision:string|null,now=2)=>({requestId,expectedRevision,now,actorId:'reviewer'}),versions=[];
  for(const suffix of ['A','B']){
   const saved=await saveCompanyAccountDraft(f.db,c('native-draft-'+suffix,null),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional Native Bank',branch:'Fictional Branch',accountNumber:'TEST-NATIVE-'+suffix,currency:'NPR',purpose:'receiving'},evidenceReference:'FICTIONAL-NATIVE-EVIDENCE-'+suffix,conflictUserIds:[],reason:'Prepare this isolated fictional company receiving account'});
   await submitCompanyAccountForReview(f.db,c('native-submit-'+suffix,'0',3),{versionId:saved.versionId,reason:'Submit the exact fictional native account for ownership review'});
   assert.equal((await listReviewTasks(f.db,'reviewer')).find(task=>task.sourceId===saved.versionId)?.dueAt,null);
   await verifyCompanyAccount(f.db,c('native-verify-'+suffix,'1',4),{versionId:saved.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-NATIVE-VERIFY-'+suffix,reason:'Verify exact fictional company ownership and NPR currency'});versions.push(saved);
  }
  const results=await Promise.allSettled(versions.map((saved,index)=>publishCompanyReceivingAccount(f.db,c('native-publish-'+index,'2',5),{versionId:saved.versionId,expectedReceivingRevision:0,reason:'Select the current verified account for future customer instructions'})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const command={actorId:'customer',requestId:'native-instruction',expectedRevision:'1',now:6};
  const issued=await issueCompanyPaymentInstructions(f.db,command,{orderId:'bank-native'});assert.equal(issued.amountPaisa,12500);assert.equal(issued.deadlineAt,86400006);
  assert.deepEqual(await issueCompanyPaymentInstructions(f.db,command,{orderId:'bank-native'}),issued);
  await assert.rejects(f.db.prepare('UPDATE company_payment_instructions SET amount_paisa=1').run(),/immutable/);
  await assert.rejects(f.db.prepare('DELETE FROM company_payment_account_current').run(),/immutable/);
  await assert.rejects(f.db.prepare("UPDATE company_payment_account_versions SET details_json='{}',revision=revision+1 WHERE id=?").bind(issued.accountVersionId).run(),/immutable/);
  assert.equal((await f.db.prepare("SELECT payment_status FROM orders WHERE id='bank-native'").first<{payment_status:string}>())?.payment_status,'unpaid');
 }finally{await f.dispose();}
});
