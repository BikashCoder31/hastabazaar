import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {verifySellerDocument,requestDocumentChange,reviewDocumentChange} from '../lib/sellers/document-review';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../lib/sellers/bank-details';
import {requestProtectedChange,protectedBankFields,reviewProtectedChangePermission} from '../lib/sellers/protected-change-requests';
import {submitProtectedIdentityChange,verifyProtectedIdentityChange} from '../lib/sellers/protected-identity-change';
import {earnedMaker} from './helpers/company-store-financial-fixture';
import {addCartItem} from '../lib/db/repositories/cart';
import {withdrawProtectedChange,disposeProtectedHolds,revalidateCurrentBankAfterIdentity} from '../lib/sellers/protected-change-disposition';
import {protectedCapabilityState} from '../lib/sellers/protected-change-policy';
import {listSellerReviewTasks} from '../lib/workflows/review-tasks';

async function fixture(base?:Awaited<ReturnType<typeof earnedMaker>>){const f=base??await completeVersionFixture();try{
  const documentId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id);
  if(base){
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(documentId)!.status,'verified');
    const bank=await sellerBankState(f.db,'maker');assert.equal(bank.status,'verified');assert.equal(bank.reference,base.payoutSources.beneficiaryReference,'retain the actual original verified destination');
    return{...f,documentId};
  }
  await verifySellerDocument(f.db,{sellerId:'maker',documentId,actorId:'reviewer',reason:'Fictional identity proof independently inspected',now:f.now});
  const original=await sellerBankState(f.db,'maker');
  await submitSellerBankDetails(f.db,{sellerId:'maker',actorId:'maker-user',revision:original.revision,commandId:'fixture-bank-submit',now:f.now+1,
    details:{payoutBeneficiary:'Fictional Maker',bankName:'Fictional Bank',bankBranch:'Fictional Branch',bankAccountNumber:'987654321'},
    document:{id:'disposition-bank',kind:'bank_verification',objectKey:'private/seller-documents/maker/disposition-bank',originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
  const pending=await sellerBankState(f.db,'maker');await reviewSellerBankDetails(f.db,{sellerId:'maker',actorId:'reviewer',revision:pending.revision,reference:'FIX-BANK-REVIEW',reason:'Actual fictional ownership evidence inspected',
    ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'fixture-bank-verify',now:f.now+2});
  return{...f,documentId};
}catch(error){f.dispose();throw error;}}

void test('withdrawal retains holds; explicit current-evidence disposition releases only the resolved scope and replays once',async()=>{
  const f=await fixture();try{
    const bank=await sellerBankState(f.db,'maker');
    const caseId=await requestProtectedChange(f.db,{sellerId:'maker',actorId:'maker-user',kind:'bank',fields:protectedBankFields,reason:'Consider a replacement account for this business',
      expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,requestId:'bank-request',now:f.now+3});
    const identityId=await requestDocumentChange(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'Review an independent protected identity correction',commandId:'separate-identity',now:f.now+4});
    const withdrawal={caseId,actorId:'maker-user',expectedVersion:0,reason:'Withdraw this change while the original account remains valid',requestId:'bank-withdrawal',now:f.now+5};
    await withdrawProtectedChange(f.db,withdrawal);await withdrawProtectedChange(f.db,withdrawal);
    assert.equal((await protectedCapabilityState(f.db,'maker')).holds.some(hold=>hold.caseId===caseId),true);
    assert.equal((await listSellerReviewTasks(f.db,'maker-user')).find(task=>task.sourceId===caseId)?.status,'awaiting_review','A withdrawn request with unresolved holds must stay actionable');
    const input={caseId,actorId:'reviewer',expectedVersion:1,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,release:true,capabilities:['payouts'] as const,
      currentEvidenceValidConfirmed:true,bankOwnershipConfirmed:true,evidenceReference:'FIX-OLD-ACCOUNT-VALID',reason:'Current original account and actual ownership remain valid',requestId:'bank-disposition',now:f.now+6};
    f.setBeforeBatch(()=>{f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='reviewer'");});await assert.rejects(disposeProtectedHolds(f.db,input));
    assert.equal((await protectedCapabilityState(f.db,'maker')).holds.some(hold=>hold.caseId===caseId),true);
    f.sqlite.exec("UPDATE users SET status='active' WHERE id='reviewer'");await disposeProtectedHolds(f.db,input);await disposeProtectedHolds(f.db,input);
    const state=await protectedCapabilityState(f.db,'maker');assert.equal(state.payoutsHeld,true);assert.equal(state.newOrdersHeld,true);assert.ok(state.holds.every(hold=>hold.caseId===identityId));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_protected_change_events WHERE case_id=? AND action='holds_released'").get(caseId)!.n,1);
    assert.equal((await sellerBankState(f.db,'maker')).reference,bank.reference);
  }finally{f.dispose();}
});

void test('a closed account report cannot be undone by withdrawal or a validity checkbox',async()=>{
  const f=await fixture();try{const bank=await sellerBankState(f.db,'maker');
    const caseId=await requestProtectedChange(f.db,{sellerId:'maker',actorId:'maker-user',kind:'bank',fields:protectedBankFields,currentUnusable:true,reason:'The receiving account is confirmed closed',expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,requestId:'closed-bank',now:f.now+3});
    await withdrawProtectedChange(f.db,{caseId,actorId:'maker-user',expectedVersion:0,reason:'Withdraw my proposed replacement without changing the old record',requestId:'withdraw-closed-bank',now:f.now+4});
    await assert.rejects(disposeProtectedHolds(f.db,{caseId,actorId:'reviewer',expectedVersion:1,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,release:true,capabilities:['payouts'],
      currentEvidenceValidConfirmed:true,bankOwnershipConfirmed:true,evidenceReference:'INSUFFICIENT-CHECKBOX',reason:'Try to reuse the known closed account without replacement',requestId:'unsafe-release',now:f.now+5}));
    const state=await protectedCapabilityState(f.db,'maker');assert.equal(state.payoutsHeld,true);assert.equal(state.newOrdersHeld,true);
  }finally{f.dispose();}
});

void test('identity disposition revalidates the recorded beneficiary without rewriting old versions or automatically releasing holds',async()=>{
  const f=await fixture();try{const bank=await sellerBankState(f.db,'maker');
    const caseId=await requestDocumentChange(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'Review a potential identity record correction',commandId:'identity-disposition-request',now:f.now+3});
    await withdrawProtectedChange(f.db,{caseId,actorId:'maker-user',expectedVersion:0,reason:'Original identity remains correct; withdraw the proposed change',requestId:'identity-withdraw',now:f.now+4});
    const input={caseId,actorId:'reviewer',expectedVersion:1,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,ownershipConfirmed:true,ownershipBasis:'same_person' as const,
      evidenceReference:'FIX-REVALIDATE-OWNER',reason:'Current identity and original bank ownership independently rechecked',requestId:'bank-revalidation',now:f.now+5};
    await revalidateCurrentBankAfterIdentity(f.db,input);await revalidateCurrentBankAfterIdentity(f.db,input);
    const refreshed=await sellerBankState(f.db,'maker');assert.notEqual(refreshed.reference,bank.reference);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_beneficiary_versions').get()!.n,2);
    assert.equal((await protectedCapabilityState(f.db,'maker')).payoutsHeld,true);
    await disposeProtectedHolds(f.db,{caseId,actorId:'reviewer',expectedVersion:2,expectedIdentityRevision:refreshed.identityRevision,expectedBankRevision:refreshed.bankRevision,release:true,capabilities:['payouts'],currentEvidenceValidConfirmed:true,bankOwnershipConfirmed:true,
      evidenceReference:'FIX-RELEASE-IDENTITY-PAYOUT',reason:'Identity and beneficiary evidence resolved; keep new-order readiness separate',requestId:'release-identity-payout',now:f.now+6});
    assert.equal((await protectedCapabilityState(f.db,'maker')).payoutsHeld,false);assert.equal((await protectedCapabilityState(f.db,'maker')).newOrdersHeld,true);
    assert.equal(f.sqlite.prepare("SELECT shipping_address_json FROM orders WHERE id='legacy-order'").get()!.shipping_address_json,'{"locality":"Original address"}');
  }finally{f.dispose();}
});

void test('material identity restoration rechecks product readiness at commit and releases only new orders',async()=>{
  const base=await earnedMaker(),f=await fixture(base),now=Math.max(base.financialNow,Date.now());try{
    const historical=f.sqlite.prepare('SELECT shipping_address_json,grand_total_paisa,payment_status FROM orders').get();
    const bank=await sellerBankState(f.db,'maker');
    const caseId=await requestProtectedChange(f.db,{sellerId:'maker',actorId:'maker-user',kind:'identity',fields:['legalName','representative_identity'],reason:'Correct the spelling of the same legal person',expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,requestId:'restoration-request',now});
    await assert.rejects(addCartItem(f.db,'restoration-cart','cup',1,now+1));
    const permissionId=await reviewProtectedChangePermission(f.db,{caseId,actorId:'reviewer',expectedVersion:0,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,decision:'permit',reason:'Permit only this exact identity correction and evidence',requestId:'restoration-permission',now:now+1});
    await submitProtectedIdentityChange(f.db,{sellerId:'maker',caseId,actorId:'maker-user',permissionId:permissionId!,values:{legalName:'Fictional Corrected Maker'},documents:[{id:'restoration-id',kind:'representative_identity',objectKey:'private/seller-documents/maker/restoration-id',originalName:'identity.png',mimeType:'image/png',sizeBytes:20}],requestId:'restoration-upload',now:now+2});
    await verifyProtectedIdentityChange(f.db,{caseId,actorId:'reviewer',expectedVersion:2,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,sameLegalPersonConfirmed:true,evidenceReference:'FIX-RESTORED-IDENTITY',reason:'Actual fictional documents confirm the same legal person',requestId:'restoration-verification',now:now+3});
    const changed=await sellerBankState(f.db,'maker');
    await revalidateCurrentBankAfterIdentity(f.db,{caseId,actorId:'reviewer',expectedVersion:3,expectedIdentityRevision:changed.identityRevision,expectedBankRevision:changed.bankRevision,ownershipConfirmed:true,ownershipBasis:'same_person',evidenceReference:'FIX-RESTORED-BANK',reason:'The actual bank evidence belongs to this corrected identity',requestId:'restoration-bank',now:now+4});
    const current=await sellerBankState(f.db,'maker');
    const release={caseId,actorId:'reviewer',expectedVersion:4,expectedIdentityRevision:current.identityRevision,expectedBankRevision:current.bankRevision,release:true,capabilities:['new_orders'] as Array<'new_orders'>,currentEvidenceValidConfirmed:true,bankOwnershipConfirmed:true,evidenceReference:'FIX-READY-ORDERS',reason:'Review current identity, terms, program and approved product readiness',requestId:'restoration-orders',now:now+5};
    f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE products SET status='draft' WHERE id='cup'").run();});
    await assert.rejects(disposeProtectedHolds(f.db,release));
    assert.equal((await protectedCapabilityState(f.db,'maker')).newOrdersHeld,true);
    f.sqlite.prepare("UPDATE products SET status='published' WHERE id='cup'").run();
    await disposeProtectedHolds(f.db,release);
    const state=await protectedCapabilityState(f.db,'maker');assert.equal(state.newOrdersHeld,false);assert.equal(state.payoutsHeld,true);
    assert.deepEqual(f.sqlite.prepare('SELECT shipping_address_json,grand_total_paisa,payment_status FROM orders').get(),historical);
    const {getSellerReadiness}=await import('../lib/sellers/readiness');const readiness=await getSellerReadiness(f.db,'maker',now+6);assert.equal(readiness.simulationRecorded,true);assert.equal(readiness.newOrders,false,'clearing one hold does not manufacture a live activation');
    // A scoped hold release preserves the recorded simulation; it cannot activate public ordering.
    await assert.rejects(addCartItem(f.db,'restoration-cart','cup',1,now+6),/not currently accepting orders/);
  }finally{f.dispose();}
});

void test('a bank proof change uses the scoped bank permission and complete beneficiary review',async()=>{
  const f=await fixture();try{
    const caseId=await requestDocumentChange(f.db,{sellerId:'maker',documentId:'disposition-bank',actorId:'maker-user',reason:'Replace only this bank proof with a clearer unchanged copy',now:f.now+3});
    await assert.rejects(reviewDocumentChange(f.db,{requestId:caseId,actorId:'reviewer',decision:'approve',reason:'A generic file grant must not bypass the complete bank case',now:f.now+4}),/bank case/i);
    const bank=await sellerBankState(f.db,'maker');
    const permissionId=await reviewProtectedChangePermission(f.db,{caseId,actorId:'reviewer',expectedVersion:0,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,decision:'permit',reason:'Permit only the same bank details and this clearer private proof',requestId:'bank-proof-permission',now:f.now+4});
    const permitted=await sellerBankState(f.db,'maker');
    await submitSellerBankDetails(f.db,{sellerId:'maker',actorId:'maker-user',revision:permitted.revision,commandId:'bank-proof-refresh',changeRequestId:caseId,permissionId:permissionId!,now:f.now+5,
      details:{payoutBeneficiary:'Fictional Maker',bankName:'Fictional Bank',bankBranch:'Fictional Branch',bankAccountNumber:'987654321'},
      document:{id:'refreshed-bank-proof',kind:'bank_verification',objectKey:'private/seller-documents/maker/refreshed-bank-proof',originalName:'clearer.png',mimeType:'image/png',sizeBytes:20}});
    const pending=await sellerBankState(f.db,'maker');
    await reviewSellerBankDetails(f.db,{sellerId:'maker',actorId:'reviewer',revision:pending.revision,reference:'FIX-BANK-REFRESHED',reason:'The actual clearer proof confirms the unchanged account owner',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'bank-proof-review',now:f.now+6});
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_document_change_requests WHERE id=?').get(caseId)?.status,'completed');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_beneficiary_versions').get()?.n,2);
    assert.equal((await protectedCapabilityState(f.db,'maker')).payoutsHeld,false);
  }finally{f.dispose();}
});

void test('a genuinely public-ready registered seller resumes the exact approved variant after scoped identity hold disposition',async()=>{
  const {publishedOfferFixture}=await import('./helpers/public-offer-fixture');
  const {getPublicOfferSet}=await import('../lib/products/public-offers');
  const {addOfferCartLine}=await import('../lib/cart/offer-cart');
  const {getCart}=await import('../lib/db/repositories/cart');
  const {getSellerReadiness}=await import('../lib/sellers/readiness');
  const f=await publishedOfferFixture(),now=Date.now();try{
    assert.equal((await getSellerReadiness(f.db,'registered',now)).newOrders,true);
    const offers=await getPublicOfferSet(f.db,f.productId);assert.ok(offers);
    const choice={productId:f.productId,offerId:'medium',versionId:offers.versionId,publicVersionId:offers.publicVersionId,pricePaisa:80000,quantity:1};
    await addOfferCartLine(f.db,'registered-original-cart',{...choice,requestId:'before-identity-hold'},now);
    const originalCart=await getCart(f.db,'registered-original-cart'),bank=await sellerBankState(f.db,'registered');
    const caseId=await requestDocumentChange(f.db,{sellerId:'registered',documentId:'public-fixture-representative_identity',actorId:'registered-owner',reason:'Review an exact correction while retaining the original valid identity',commandId:'registered-identity-change',now:now+1});
    await assert.rejects(addOfferCartLine(f.db,'registered-blocked-cart',{...choice,requestId:'during-identity-hold'},now+2));
    await withdrawProtectedChange(f.db,{caseId,actorId:'registered-owner',expectedVersion:0,reason:'The existing original evidence remains correct; withdraw the proposed correction',requestId:'registered-withdraw',now:now+3});
    const release={caseId,actorId:'reviewer',expectedVersion:1,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,release:true,capabilities:['new_orders'] as const,currentEvidenceValidConfirmed:true,bankOwnershipConfirmed:false,evidenceReference:'FIX-REGISTERED-VALID-IDENTITY',reason:'Inspect the current verified identity, accepted terms and actually approved offer before restoring orders',requestId:'registered-orders-release',now:now+4};
    f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE products SET status='draft' WHERE id=?").run(f.productId);});
    await assert.rejects(disposeProtectedHolds(f.db,release));
    assert.equal((await protectedCapabilityState(f.db,'registered')).newOrdersHeld,true);
    f.sqlite.prepare("UPDATE products SET status='published' WHERE id=?").run(f.productId);
    await disposeProtectedHolds(f.db,release);await disposeProtectedHolds(f.db,release);
    const state=await protectedCapabilityState(f.db,'registered');assert.equal(state.newOrdersHeld,false);assert.equal(state.payoutsHeld,true);
    await addOfferCartLine(f.db,'registered-restored-cart',{...choice,requestId:'after-identity-disposition'},now+5);
    const restored=await getCart(f.db,'registered-restored-cart');assert.equal(restored.itemCount,1);assert.equal(restored.itemSubtotalPaisa,80000);
    assert.equal((await getCart(f.db,'registered-original-cart')).itemCount,originalCart.itemCount);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_protected_change_events WHERE case_id=? AND action='holds_released'").get(caseId)!.n,1);
  }finally{f.dispose();}
});
