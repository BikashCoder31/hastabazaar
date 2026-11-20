import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {verifySellerDocument} from '../lib/sellers/document-review';
import {requestProtectedChange,reviewProtectedChangePermission} from '../lib/sellers/protected-change-requests';
import {submitProtectedIdentityChange,verifyProtectedIdentityChange} from '../lib/sellers/protected-identity-change';
import {protectedCapabilityState} from '../lib/sellers/protected-change-policy';

void test('material identity remains proposed until exact nonconflicted verification and retains accepted terms and independent holds',async()=>{
  const f=await completeVersionFixture();try{
    const original=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id as string;
    await verifySellerDocument(f.db,{sellerId:'maker',documentId:original,actorId:'reviewer',reason:'Inspect actual fictional identity proof',now:f.now});
    const terms=f.sqlite.prepare("SELECT agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,agreement_language,agreement_form_version_id FROM managed_maker_application_details WHERE seller_id='maker'").get()!;
    f.sqlite.prepare(`INSERT INTO seller_registration_intakes(seller_id,user_id,version,answers_json,documents_json,review_ready,updated_at) VALUES('maker','maker-user',0,?,?,1,?)`)
      .run(JSON.stringify({legalName:['Fictional Maker'],phone:['9800000000']}),JSON.stringify({representativeIdentity:{id:original,kind:'representative_identity'}}),f.now);
    const revision=f.sqlite.prepare("SELECT identity_revision,bank_revision FROM seller_protected_revisions WHERE seller_id='maker'").get()!;
    const id=await requestProtectedChange(f.db,{sellerId:'maker',actorId:'maker-user',kind:'identity',fields:['legalName','representative_identity'],reason:'Correct the legal spelling for the same person',expectedIdentityRevision:Number(revision.identity_revision),expectedBankRevision:Number(revision.bank_revision),requestId:'material-request',now:f.now+1});
    const permission=await reviewProtectedChangePermission(f.db,{caseId:id,actorId:'reviewer',expectedVersion:0,expectedIdentityRevision:Number(revision.identity_revision),expectedBankRevision:Number(revision.bank_revision),decision:'permit',reason:'Permit only this person name and supporting identity proof',requestId:'material-permission',now:f.now+2});
    const document={id:'material-identity-proof',kind:'representative_identity' as const,objectKey:'private/seller-documents/maker/material-identity-proof',originalName:'fictional-proof.png',mimeType:'image/png',sizeBytes:20};
    const input={sellerId:'maker',caseId:id,permissionId:permission!,actorId:'maker-user',values:{legalName:'Fictional Maker Corrected'},documents:[document],requestId:'material-submission',now:f.now+3};
    await assert.rejects(submitProtectedIdentityChange(f.db,{...input,values:{...input.values,userId:'foreign'}}));
    await submitProtectedIdentityChange(f.db,input);await submitProtectedIdentityChange(f.db,input);
    assert.equal(f.sqlite.prepare("SELECT legal_name FROM seller_profiles WHERE id='maker'").get()!.legal_name,'Fictional Maker');
    await assert.rejects(verifySellerDocument(f.db,{sellerId:'maker',documentId:document.id,actorId:'reviewer',reason:'Cannot bypass the complete identity and facts review',now:f.now+4}));
    const review={caseId:id,actorId:'reviewer',expectedVersion:2,expectedIdentityRevision:Number(revision.identity_revision),expectedBankRevision:Number(revision.bank_revision),sameLegalPersonConfirmed:true,evidenceReference:'QA-IDENTITY-INSPECTED',reason:'Actual evidence establishes the same person and corrected spelling',requestId:'material-verification',now:f.now+5};
    await assert.rejects(verifyProtectedIdentityChange(f.db,{...review,sameLegalPersonConfirmed:false}));
    await verifyProtectedIdentityChange(f.db,review);await verifyProtectedIdentityChange(f.db,review);
    assert.equal(f.sqlite.prepare("SELECT legal_name FROM seller_profiles WHERE id='maker'").get()!.legal_name,'Fictional Maker Corrected');
    const intake=f.sqlite.prepare("SELECT answers_json,documents_json FROM seller_registration_intakes WHERE seller_id='maker'").get()!;
    assert.deepEqual(JSON.parse(String(intake.answers_json)),{legalName:['Fictional Maker Corrected'],phone:['9800000000']});
    assert.equal(JSON.parse(String(intake.documents_json)).representativeIdentity.id,document.id);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(document.id)!.status,'verified');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_identity_fact_versions").get()!.n,1);
    const latest=f.sqlite.prepare("SELECT agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,agreement_language,agreement_form_version_id FROM managed_maker_application_details WHERE seller_id='maker' ORDER BY created_at DESC,id DESC LIMIT 1").get()!;
    assert.deepEqual({...latest},{...terms});
    assert.equal((await protectedCapabilityState(f.db,'maker')).newOrdersHeld,true,'Verification alone must not restore order readiness');
    assert.equal((await protectedCapabilityState(f.db,'maker')).payoutsHeld,true,'Current bank ownership must be revalidated after identity changes');
    assert.throws(()=>f.sqlite.prepare('DELETE FROM seller_identity_fact_versions').run(),/retained|immutable/i);
  }finally{f.dispose();}
});
