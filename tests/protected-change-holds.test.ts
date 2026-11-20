import assert from 'node:assert/strict';
import test from 'node:test';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { requestDocumentChange, verifySellerDocument } from '../lib/sellers/document-review';
import { classifyIdentityEvidenceOnly, protectedCapabilityState } from '../lib/sellers/protected-change-policy';
import { operatePayout } from '../lib/db/repositories/payouts';
import {prepareFixedSupplierPayment,transitionFixedSupplierPayment} from '../lib/managed-commerce/fixed-supply';
import {resolveRuntimeEnvironment} from '../lib/staging/environment';

async function fixture() {
  const f=await completeVersionFixture();
  const doc=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
  await verifySellerDocument(f.db,{sellerId:'maker',documentId:doc.id,actorId:'reviewer',reason:'Actual fictional identity evidence inspected',now:f.now});
  return {...f,documentId:doc.id};
}
void test('submitted identity change creates scoped holds atomically and preserves payout destinations and reservations',async()=>{
  const f=await fixture();
  try{
    for(const status of ['approved','processing','failed','paid']){
      f.sqlite.prepare(`INSERT INTO payouts(id,seller_id,payout_number,status,amount_paisa,destination_reference,prepared_by,approved_by,scheduled_for,created_at,updated_at)
        VALUES(?,'maker',?,?,10000,'ORIGINAL-DESTINATION','reviewer','reviewer',1,1,1)`).run(status,`FIX-${status}`,status);
      f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES(?,'maker','sale',10000,1,'Fictional earning',1)").run(`earning-${status}`);
      f.sqlite.prepare('INSERT INTO payout_entries(payout_id,ledger_entry_id) VALUES(?,?)').run(status,`earning-${status}`);
    }
    const input={sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'Correct the protected identity evidence',commandId:'identity-hold-request',now:f.now+1};
    const id=await requestDocumentChange(f.db,input);
    assert.equal(Boolean(f.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='seller_capability_holds'").get()),true,'A complete protected request must create durable capability holds');
    const holds=f.sqlite.prepare('SELECT capability FROM seller_capability_holds WHERE case_id=? AND released_at IS NULL ORDER BY capability').all(id);
    assert.deepEqual(holds.map(row=>row.capability),['new_orders','payouts']);
    const blocks=f.sqlite.prepare('SELECT payout_id,disposition FROM seller_payout_review_blocks WHERE case_id=? ORDER BY payout_id').all(id);
    assert.deepEqual(blocks.map(row=>[row.payout_id,row.disposition]),[['approved','reprepare'],['failed','reconcile'],['processing','reconcile']]);
    assert.equal(await requestDocumentChange(f.db,input),id);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_capability_holds').get()!.n,2);
    assert.ok(f.sqlite.prepare('SELECT destination_reference FROM payouts').all().every(row=>row.destination_reference==='ORIGINAL-DESTINATION'));
    assert.equal(f.sqlite.prepare("SELECT status FROM payouts WHERE id='paid'").get()!.status,'paid');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM payout_entries WHERE released_at IS NULL').get()!.n,4);
  }finally{f.dispose();}
});

void test('evidence-only classification releases only its own holds and cannot reuse stale, expired or bank evidence',async()=>{
  const f=await fixture();
  try{
    const id=await requestDocumentChange(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'Replace this scan with a clearer copy',now:f.now+1});
    f.sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_by,reviewed_at)
      VALUES('bank-proof','maker','bank_verification','private/seller-documents/maker/bank-proof','bank.png','image/png',20,'verified',?,'reviewer',?)`).run(f.now,f.now);
    const bank=await requestDocumentChange(f.db,{sellerId:'maker',documentId:'bank-proof',actorId:'maker-user',reason:'Replace the current bank proof with a clearer file',now:f.now+2});
    const decision={caseId:id,actorId:'reviewer',expectedVersion:0,currentEvidenceValid:true,factsUnchanged:true,evidenceReference:'QA-INSPECTION-1',reason:'Same legal person and current valid evidence inspected',requestId:'classify-current-evidence',now:f.now+3};
    await assert.rejects(classifyIdentityEvidenceOnly(f.db,{...decision,caseId:bank}));
    await classifyIdentityEvidenceOnly(f.db,decision);
    await classifyIdentityEvidenceOnly(f.db,decision);
    const state=await protectedCapabilityState(f.db,'maker');
    assert.equal(state.newOrdersHeld,false);assert.equal(state.payoutsHeld,true);assert.ok(state.holds.every(row=>row.caseId===bank));
    await assert.rejects(classifyIdentityEvidenceOnly(f.db,{...decision,requestId:'stale-classification'}));
    assert.throws(()=>f.sqlite.prepare('DELETE FROM seller_capability_holds WHERE case_id=?').run(id),/retained/);
  }finally{f.dispose();}
  const incomplete=await fixture();try{
    incomplete.sqlite.prepare("UPDATE seller_profiles SET applicant_type='company' WHERE id='maker'").run();
    const id=await requestDocumentChange(incomplete.db,{sellerId:'maker',documentId:incomplete.documentId,actorId:'maker-user',reason:'Clearer copy of the still valid representative identity',now:incomplete.now});
    await assert.rejects(classifyIdentityEvidenceOnly(incomplete.db,{caseId:id,actorId:'reviewer',expectedVersion:0,currentEvidenceValid:true,factsUnchanged:true,evidenceReference:'QA-MISSING-COMPANY-PROOF',reason:'One valid document cannot establish the whole company identity',requestId:'classify-missing-required-proof',now:incomplete.now}));
    assert.equal((await protectedCapabilityState(incomplete.db,'maker')).newOrdersHeld,true);
  }finally{incomplete.dispose();}
  const expired=await fixture();try{
    expired.sqlite.prepare('UPDATE seller_documents SET valid_until=? WHERE id=?').run(expired.now-1,expired.documentId);
    const id=await requestDocumentChange(expired.db,{sellerId:'maker',documentId:expired.documentId,actorId:'maker-user',reason:'Renew the evidence which has expired',now:expired.now});
    await assert.rejects(classifyIdentityEvidenceOnly(expired.db,{caseId:id,actorId:'reviewer',expectedVersion:0,currentEvidenceValid:true,factsUnchanged:true,evidenceReference:'QA-EXPIRED',reason:'Attempt to reuse expired evidence',requestId:'classify-expired-evidence',now:expired.now}));
    assert.equal((await protectedCapabilityState(expired.db,'maker')).newOrdersHeld,true);
  }finally{expired.dispose();}
});

void test('a protected hold and retained destination cannot bypass the required payout execution packet with a typed reference',async()=>{
  const f=await fixture();try{
    f.sqlite.exec(`INSERT INTO payouts(id,seller_id,payout_number,status,amount_paisa,destination_reference,prepared_by,approved_by,scheduled_for,created_at,updated_at)
      VALUES('packet','maker','FIX-PACKET','approved',10000,'ORIGINAL-DESTINATION','reviewer','reviewer',1,1,1),
      ('sent','maker','FIX-SENT','processing',10000,'SENT-DESTINATION','reviewer','reviewer',1,1,1);
      INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('sent-earning','maker','sale',10000,1,'Fictional sent obligation',1);
      INSERT INTO payout_entries(payout_id,ledger_entry_id) VALUES('sent','sent-earning');`);
    const input={payoutId:'packet',actorId:'reviewer',actorRole:'super_admin' as const,action:'start_processing' as const,note:'Start fictional manual execution',requestId:'start-held-packet',now:f.now};
    await requestDocumentChange(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'Review a protected identity correction',now:f.now});
    await assert.rejects(operatePayout(f.db,input));
    assert.equal(f.sqlite.prepare("SELECT status FROM payouts WHERE id='packet'").get()!.status,'approved');
    await assert.rejects(operatePayout(f.db,{...input,payoutId:'sent',action:'mark_paid',providerReference:'FICTIONAL-CONFIRMED-BANK-OUTCOME',requestId:'record-existing-sent-outcome'}),/original verified payout execution packet/);
    assert.equal(f.sqlite.prepare("SELECT status FROM payouts WHERE id='sent'").get()!.status,'processing');
    assert.equal(f.sqlite.prepare("SELECT destination_reference FROM payouts WHERE id='sent'").get()!.destination_reference,'SENT-DESTINATION');
    assert.equal((await protectedCapabilityState(f.db,'maker')).payoutsHeld,true);
  }finally{f.dispose();}
});

void test('fixed supplier approvals are invalidated too, without changing the accepted debt or beneficiary snapshot',async()=>{
  const f=await fixture();const environment=resolveRuntimeEnvironment({runtimeEnvironment:'local_staging',appOrigin:'http://localhost:3018'});
  try{
    f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('fixed-cat','fixed-cat','Fictional',1,1,1,1);
      INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
      VALUES('fixed-product','maker','fixed-cat','fixed-product','FIXED-QA','Fictional product','Isolated fixture',10000,1,'Fictional','NP','Clay','draft',1,1);
      INSERT INTO managed_supply_records(id,seller_id,product_id,quantity_proposed,agreed_unit_paisa,status,possession_status,quality_status,ownership_record_status,risk_record_status,
        agreement_version,agreement_language,payout_beneficiary_reference,simulation_label,created_by,proposal_request_id,created_at)
      VALUES('fixed-debt','maker','fixed-product',1,10000,'proposed','not_received','not_inspected','not_recorded','not_recorded','FIX-TERMS','en','ORIGINAL-DESTINATION','FICTIONAL','maker-user','fixed-proposal',1);
      INSERT INTO managed_supplier_obligations(id,seller_id,original_amount_paisa,payout_beneficiary_reference,agreement_version,agreement_language,owed_at,eligible_at,created_at)
      VALUES('fixed-debt','maker',10000,'ORIGINAL-DESTINATION','FIX-TERMS','en',1,1,1);`);
    const packet=await prepareFixedSupplierPayment(f.db,{recordId:'fixed-debt',actorId:'reviewer',destinationReference:'ORIGINAL-DESTINATION',requestId:'fixed-prepare',now:f.now,environment});
    await requestDocumentChange(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'Inspect the current protected identity',commandId:'fixed-hold',now:f.now+1});
    await assert.rejects(transitionFixedSupplierPayment(f.db,{paymentId:packet,actorId:'reviewer',action:'mark_paid',requestId:'fixed-held-execution',now:f.now+2,environment}));
    const block=f.sqlite.prepare("SELECT disposition,original_destination FROM seller_payout_review_blocks WHERE payout_model='fixed' AND payout_id=?").get(packet);
    assert.equal(block?.disposition,'reprepare');assert.equal(block?.original_destination,'ORIGINAL-DESTINATION');
    assert.equal(f.sqlite.prepare('SELECT status FROM managed_supplier_payments WHERE id=?').get(packet)!.status,'approved');
    assert.equal(f.sqlite.prepare("SELECT original_amount_paisa FROM managed_supplier_obligations WHERE id='fixed-debt'").get()!.original_amount_paisa,10000);
  }finally{f.dispose();}
});
