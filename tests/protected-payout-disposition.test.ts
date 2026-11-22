import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import { requestDocumentChange } from '../lib/sellers/document-review';
import {classifyIdentityEvidenceOnly} from '../lib/sellers/protected-change-policy';
import {retireProtectedPayout} from '../lib/sellers/protected-payout-disposition';
import { prepareSellerPayout } from '../lib/db/repositories/payouts';
import {earnedMaker} from './helpers/company-store-financial-fixture';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import {cancelManagedPayout} from '../lib/managed-commerce/payout-operations';

void test('an invalidated unsent packet retires once and links fresh preparation without freeing an uncertain transfer',async()=>{
  const f=await completeVersionFixture();try{
    f.sqlite.exec(`UPDATE seller_profiles SET applicant_type='individual' WHERE id='registered';
      INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_by,reviewed_at)
      VALUES('registered-id','registered','representative_identity','private/seller-documents/registered/registered-id','id.png','image/png',20,'verified',1,'reviewer',1),
      ('registered-pan','registered','pan_certificate','private/seller-documents/registered/registered-pan','pan.png','image/png',20,'verified',1,'reviewer',1);
      INSERT INTO payouts(id,seller_id,payout_number,status,amount_paisa,destination_reference,prepared_by,approved_by,scheduled_for,created_at,updated_at)
      VALUES('unsent','registered','FIX-UNSENT','approved',10000,'ORIGINAL-DESTINATION','reviewer','reviewer',1,1,1),
      ('uncertain','registered','FIX-UNCERTAIN','failed',5000,'UNCERTAIN-DESTINATION','reviewer','reviewer',1,1,1);
      INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES
      ('unsent-earning','registered','sale',10000,1,'Fictional unsent earning',1),('uncertain-earning','registered','sale',5000,1,'Fictional uncertain earning',1);
      INSERT INTO payout_entries(payout_id,ledger_entry_id) VALUES('unsent','unsent-earning'),('uncertain','uncertain-earning');`);
    const caseId=await requestDocumentChange(f.db,{sellerId:'registered',documentId:'registered-id',actorId:'registered-owner',reason:'Provide a clearer scan of the same valid identity',commandId:'retirement-case',now:f.now});
    const input={caseId,payoutId:'unsent',model:'registered' as const,actorId:'reviewer',expectedVersion:0,notExecutedConfirmed:true,evidenceReference:'NO-BANK-INSTRUCTION-CONFIRMED',reason:'Inspected the fictional bank instruction history; no instruction was initiated',requestId:'retire-unsent',now:f.now+1};
    await assert.rejects(retireProtectedPayout(f.db,{...input,notExecutedConfirmed:false}));
    await assert.rejects(retireProtectedPayout(f.db,{...input,payoutId:'uncertain',requestId:'cannot-retire-uncertain'}));
    await retireProtectedPayout(f.db,input);await retireProtectedPayout(f.db,input);
    assert.equal(f.sqlite.prepare("SELECT status FROM payouts WHERE id='unsent'").get()!.status,'rejected');
    assert.equal(f.sqlite.prepare("SELECT destination_reference FROM payouts WHERE id='unsent'").get()!.destination_reference,'ORIGINAL-DESTINATION');
    assert.equal(f.sqlite.prepare("SELECT released_at FROM payout_entries WHERE payout_id='uncertain'").get()!.released_at,null);
    await classifyIdentityEvidenceOnly(f.db,{caseId,actorId:'reviewer',expectedVersion:1,currentEvidenceValid:true,factsUnchanged:true,evidenceReference:'SAME-CURRENT-VALID-IDENTITY',reason:'Only a scan refresh; actual current identity remains valid',requestId:'resume-after-classification',now:f.now+2});
    const fresh=await prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',note:'Prepare all currently eligible resolved earnings with fresh approval',requestId:'fresh-after-retirement',now:f.now+3});
    assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(fresh.id)!.amount_paisa,10000);
    assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(fresh.id)!.status,'approved');
    const link=f.sqlite.prepare('SELECT old.old_payout_id,replacement.new_payout_id FROM seller_payout_packet_replacements replacement JOIN seller_payout_packet_dispositions old ON old.id=replacement.disposition_id').get()!;
    assert.equal(link.old_payout_id,'unsent');assert.equal(link.new_payout_id,fresh.id);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM payout_entries WHERE ledger_entry_id='unsent-earning' AND released_at IS NULL").get()!.n,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_payout_packet_dispositions").get()!.n,1);
  }finally{f.dispose();}
});

void test('legacy managed reservations require protected retirement and retain their link to fresh preparation',async()=>{
  const f=await earnedMaker();try{
    f.sqlite.prepare(`INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,simulation_label,prepared_by,scheduled_for,request_id,created_at,updated_at)
      SELECT 'legacy-managed',?,'FIX-LEGACY-MANAGED',SUM(x.amount_paisa),'prepared',?,'SIMULATED','reviewer',?,'legacy-managed',?,?
      FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE e.seller_id=?`)
      .run(f.sellerId,f.context.destinationReference,f.financialNow,f.financialNow,f.financialNow,f.sellerId);
    f.sqlite.prepare("INSERT INTO managed_payout_entries(payout_id,settlement_entry_id) SELECT 'legacy-managed',x.id FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE e.seller_id=?").run(f.sellerId);
    const documentId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id=? AND kind='representative_identity'").get(f.sellerId)?.id);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(documentId)!.status,'verified');
    const caseId=await requestDocumentChange(f.db,{sellerId:f.sellerId,documentId,actorId:'maker-user',reason:'Clearer evidence for this same valid person',now:f.financialNow});
    await assert.rejects(cancelManagedPayout(f.db,{...f.context,payoutId:'legacy-managed',requestId:'unsafe-cancel',reason:'Cannot bypass the protected packet disposition'}));
    await retireProtectedPayout(f.db,{caseId,payoutId:'legacy-managed',model:'managed',actorId:'reviewer',expectedVersion:0,notExecutedConfirmed:true,evidenceReference:'FIX-LEGACY-NOT-SENT',reason:'Fictional outgoing instructions inspected; no transfer was initiated',requestId:'retire-legacy-managed',now:f.financialNow+1,environment:f.context.environment});
    await classifyIdentityEvidenceOnly(f.db,{caseId,actorId:'reviewer',expectedVersion:1,currentEvidenceValid:true,factsUnchanged:true,evidenceReference:'FIX-SAME-VALID-PERSON',reason:'Current actual fictional proof and unchanged identity inspected',requestId:'classify-legacy-managed',now:f.financialNow+2});
    const replacement=await prepareManagedPayout(f.db,{...f.context,requestId:'replace-legacy-managed',now:f.financialNow+3});
    assert.equal(f.sqlite.prepare('SELECT new_payout_id FROM seller_payout_packet_replacements').get()?.new_payout_id,replacement);
    assert.equal(f.sqlite.prepare("SELECT status FROM managed_payouts WHERE id='legacy-managed'").get()?.status,'rejected');
  }finally{f.dispose();}
});
