import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {companyDetails} from '../lib/content/company-details';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount,publishCompanyReceivingAccount,getCompanyAccountWorkspace} from '../lib/payments/company-accounts';
import {listReviewTasks} from '../lib/workflows/review-tasks';

void test('company account queue keeps superseded native history readable and fences the actual latest version at projection time',async()=>{
 const f=await completeVersionFixture();try{
  const command=(key:string,revision:string|null,offset:number)=>({actorId:'reviewer',requestId:key,expectedRevision:revision,now:f.now+offset});
  const details={holder:companyDetails.legalName,bank:'Fictional Queue Bank',branch:'Fictional Branch',accountNumber:'QUEUE-FICTIONAL-001',currency:'NPR' as const,purpose:'both' as const};
  const saved=await saveCompanyAccountDraft(f.db,command('queue-bank-draft',null,1),{accountId:null,basedOnVersionId:null,details,evidenceReference:'PRIVATE-FICTIONAL-QUEUE-EVIDENCE',conflictUserIds:[],reason:'Retain actual fictional ownership evidence for this account version.'});
  await submitCompanyAccountForReview(f.db,command('queue-bank-submit','0',2),{versionId:saved.versionId,reason:'Submit this exact fictional account version for verification.'});
  const original=(await listReviewTasks(f.db,'reviewer')).find(row=>row.sourceId===saved.versionId)!;assert.ok(original);
  await verifyCompanyAccount(f.db,command('queue-bank-verify','1',3),{versionId:saved.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-QUEUE-VERIFIED',reason:'Verify this fictional company account and its receiving currency.'});
  await publishCompanyReceivingAccount(f.db,command('queue-bank-enable','2',4),{versionId:saved.versionId,expectedReceivingRevision:0,reason:'Enable the verified version for new fictional payment instructions.'});
  const current=await getCompanyAccountWorkspace(f.db,'reviewer',f.now+5),account=current.accounts.find(row=>row.id===saved.accountId)!;
  await saveCompanyAccountDraft(f.db,command('queue-bank-replacement',String(account.revision),6),{accountId:saved.accountId,basedOnVersionId:saved.versionId,details:{...details,accountNumber:'QUEUE-FICTIONAL-002'},evidenceReference:'PRIVATE-FICTIONAL-REPLACEMENT',conflictUserIds:[],reason:'Keep the original version while reviewing its fictional replacement.'});
  const rows=await listReviewTasks(f.db,'reviewer'),historical=rows.find(row=>row.id===original.id)!;
  assert.ok(historical);assert.equal(historical.status,'no_longer_needed');assert.equal(historical.sourceStatus,'superseded');assert.equal(historical.startedAt,original.startedAt);
  assert.doesNotMatch(JSON.stringify(rows),/QUEUE-FICTIONAL-00|PRIVATE-FICTIONAL/);
  const batch=f.db.batch.bind(f.db);let changed=false;
  f.db.batch=async statements=>{
   if(!changed){changed=true;f.sqlite.prepare('UPDATE company_payment_accounts SET latest_version_id=? WHERE id=?').run(saved.versionId,saved.accountId);}
   return batch(statements);
  };
  await assert.rejects(()=>listReviewTasks(f.db,'reviewer'));assert.equal(changed,true);
 }finally{f.dispose();}
});
