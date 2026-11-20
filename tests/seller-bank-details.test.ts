import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { sellerBankState, submitSellerBankDetails, reviewSellerBankDetails } from '../lib/sellers/bank-details';
import { prepareSellerPayout } from '../lib/db/repositories/payouts';
import { verifySellerDocument } from '../lib/sellers/document-review';
import {requestProtectedChange,reviewProtectedChangePermission,protectedBankFields} from '../lib/sellers/protected-change-requests';

void test('bank details stay pending until independently reviewed and stale/foreign writes fail', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const seller = f.sqlite.prepare("SELECT user_id AS userId FROM seller_profiles WHERE id='maker'").get() as { userId: string };
    const identity=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    await verifySellerDocument(f.db,{sellerId:'maker',documentId:identity.id,actorId:'reviewer',reason:'Fictional current identity evidence inspected',now:f.now});
    f.sqlite.exec("UPDATE seller_profiles SET payout_account_reference=NULL WHERE id='maker'");
    const initial = await sellerBankState(f.db, 'maker');
    assert.equal(initial.status, 'missing');
    f.sqlite.exec("UPDATE seller_profiles SET status='approved' WHERE id='maker'");
    const payout = { sellerId:'maker', actorId:'reviewer', actorRole:'super_admin' as const, note:'Fictional payout gate test',requestId:'no-bank-payout',now:f.now };
    await assert.rejects(prepareSellerPayout(f.db, payout), /verified payout destination/);
    const input = { sellerId: 'maker', actorId: seller.userId, revision: initial.revision, now: f.now,
      details: { payoutBeneficiary: 'Fictional Maker', bankName: 'Fictional Bank', bankBranch: 'Test branch', bankAccountNumber: '123456789' },
      document: { id: 'new-bank-doc', kind: 'bank_verification' as const, objectKey: 'private/seller-documents/maker/new-bank-doc', originalName: 'proof.png', mimeType: 'image/png', sizeBytes: 20 } };
    await assert.rejects(submitSellerBankDetails(f.db, { ...input, actorId: 'another-user' }));
    await submitSellerBankDetails(f.db, input);
    const pending = await sellerBankState(f.db, 'maker'); assert.equal(pending.status, 'pending');
    await assert.rejects(prepareSellerPayout(f.db, payout), /verified payout destination/);
    await assert.rejects(submitSellerBankDetails(f.db, input), /changed/);
    await assert.rejects(reviewSellerBankDetails(f.db, { sellerId: 'maker', actorId: seller.userId, revision: pending.revision, reference: 'REVIEW-1', reason: 'Independently checked fictional evidence', now: f.now }));
    await reviewSellerBankDetails(f.db, { sellerId: 'maker', actorId: 'reviewer', revision: pending.revision, reference: 'REVIEW-1', reason: 'Independently checked fictional evidence',
      ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,now: f.now });
    assert.equal((await sellerBankState(f.db, 'maker')).status, 'verified');
    const audit = f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE action LIKE 'seller.bank_details.%'").all();
    assert.doesNotMatch(JSON.stringify(audit), /123456789|Fictional Bank/);
  } finally { f.sqlite.close(); }
});

void test('bank verification binds actual identity evidence, excludes the personal beneficiary and retains a private beneficiary version',async()=>{
  const f=await companyStoreMakerFixture();try{
    const identity=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    await verifySellerDocument(f.db,{sellerId:'maker',documentId:identity.id,actorId:'reviewer',reason:'Fictional identity evidence actually inspected',now:f.now});
    f.sqlite.exec("UPDATE seller_profiles SET payout_account_reference=NULL WHERE id='maker'");
    const initial=await sellerBankState(f.db,'maker');
    await submitSellerBankDetails(f.db,{sellerId:'maker',actorId:'maker-user',revision:initial.revision,now:f.now+1,
      details:{payoutBeneficiary:'Fictional Maker',bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'987654321'},
      document:{id:'bank-version-file',kind:'bank_verification',objectKey:'private/seller-documents/maker/bank-version-file',originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
    const pending=await sellerBankState(f.db,'maker');
    f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('maker-user','super_admin',1)");
    const decision={sellerId:'maker',actorId:'reviewer',revision:pending.revision,reference:'QA-BENEFICIARY-OWNERSHIP',reason:'Identity and actual bank ownership independently inspected',
      ownershipBasis:'same_person' as const,identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'verify-beneficiary-version',now:f.now+2};
    await assert.rejects(reviewSellerBankDetails(f.db,{...decision,actorId:'maker-user'}));
    await assert.rejects(reviewSellerBankDetails(f.db,{...decision,identityEvidenceConfirmed:false}));
    await reviewSellerBankDetails(f.db,decision);await reviewSellerBankDetails(f.db,decision);
    const version=f.sqlite.prepare("SELECT details_json,identity_revision,verified_by FROM seller_beneficiary_versions WHERE seller_id='maker'").get()!;
    assert.equal(JSON.parse(String(version.details_json)).bankAccountNumber,'987654321');assert.equal(version.verified_by,'reviewer');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_beneficiary_versions WHERE seller_id='maker'").get()!.n,1);
    assert.throws(()=>f.sqlite.exec("UPDATE seller_beneficiary_versions SET details_json='{}'"),/immutable/);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_capability_holds WHERE seller_id='maker' AND released_at IS NULL").get()!.n,0);
  }finally{f.dispose();}
});

void test('verified bank replacement requires exact current permission and preserves the old effective account until ownership review',async()=>{
  const f=await companyStoreMakerFixture();try{
    const identity=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    await verifySellerDocument(f.db,{sellerId:'maker',documentId:identity.id,actorId:'reviewer',reason:'Current fictional identity independently inspected',now:f.now});
    f.sqlite.exec("UPDATE seller_profiles SET payout_account_reference='OLD-RECEIVING-REFERENCE' WHERE id='maker'");
    f.sqlite.exec("UPDATE seller_participation_profiles SET payout_beneficiary_reference='OLD-RECEIVING-REFERENCE' WHERE seller_id='maker'");
    const current=await sellerBankState(f.db,'maker');
    const request={sellerId:'maker',actorId:'maker-user',kind:'bank' as const,fields:[...protectedBankFields],reason:'Replace the receiving account with my new account',
      expectedIdentityRevision:current.identityRevision,expectedBankRevision:current.bankRevision,requestId:'request-bank-change',now:f.now+1};
    const caseId=await requestProtectedChange(f.db,request);assert.equal(await requestProtectedChange(f.db,request),caseId);
    const decision={caseId,actorId:'reviewer',expectedVersion:0,expectedIdentityRevision:current.identityRevision,expectedBankRevision:current.bankRevision,decision:'permit' as const,
      reason:'The exact bank scope may be replaced for ownership review',requestId:'permit-bank-change',now:f.now+2};
    await assert.rejects(reviewProtectedChangePermission(f.db,{...decision,actorId:'maker-user'}));
    const permissionId=await reviewProtectedChangePermission(f.db,decision);assert.ok(permissionId);
    assert.equal(await reviewProtectedChangePermission(f.db,decision),permissionId);
    const upload={sellerId:'maker',actorId:'maker-user',revision:(await sellerBankState(f.db,'maker')).revision,changeRequestId:caseId,permissionId,commandId:'bank-replacement-upload',now:f.now+3,
      details:{payoutBeneficiary:'Fictional Maker',bankName:'New Fictional Bank',bankBranch:'New branch',bankAccountNumber:'123456780'},
      document:{id:'changed-bank-file',kind:'bank_verification' as const,objectKey:'private/seller-documents/maker/changed-bank-file',originalName:'new-bank.png',mimeType:'image/png',sizeBytes:20}};
    await submitSellerBankDetails(f.db,upload);await submitSellerBankDetails(f.db,upload);
    assert.equal((await sellerBankState(f.db,'maker')).reference,'OLD-RECEIVING-REFERENCE');
    assert.equal(f.sqlite.prepare('SELECT used_document_id FROM seller_protected_change_permissions WHERE id=?').get(permissionId)!.used_document_id,'changed-bank-file');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_capability_holds WHERE case_id=? AND capability='new_orders' AND released_at IS NULL").get(caseId)!.n,0);
    const pending=await sellerBankState(f.db,'maker');
    await reviewSellerBankDetails(f.db,{sellerId:'maker',actorId:'reviewer',revision:pending.revision,reference:'NEW-OWNERSHIP-REVIEW',reason:'New bank evidence and actual legal owner inspected',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'verify-bank-change',now:f.now+4});
    assert.match((await sellerBankState(f.db,'maker')).reference!,/^BENEFICIARY:/);
    assert.equal(f.sqlite.prepare("SELECT payout_beneficiary_reference AS reference FROM seller_participation_profiles WHERE seller_id='maker'").get()!.reference,
      (await sellerBankState(f.db,'maker')).reference,'Future managed preparation must use the reviewed current beneficiary, while existing packets keep their snapshots');
    assert.equal(f.sqlite.prepare('SELECT original_bank_reference FROM seller_protected_change_cases WHERE id=?').get(caseId)!.original_bank_reference,'OLD-RECEIVING-REFERENCE');
  }finally{f.dispose();}
});
