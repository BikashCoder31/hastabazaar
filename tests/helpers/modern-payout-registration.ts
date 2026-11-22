import type {DatabaseSync} from 'node:sqlite';

export function addModernPayoutRegistration(sqlite:DatabaseSync,sellerId:string,model:'registered'|'managed'|'fixed',ready=0){
 sqlite.prepare(`INSERT INTO seller_registration_intakes(seller_id,user_id,version,answers_json,documents_json,review_ready,updated_at)
  SELECT id,user_id,1,'{}','{}',?,1 FROM seller_profiles WHERE id=?`).run(ready,sellerId);
 const addEvidence=sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_by,reviewed_at)
  VALUES (?,?,?,?,'fixture-proof.png','image/png',20,'verified',0,'reviewer',1)`);
 for(const kind of model==='registered'?['pan_certificate','business_registration']:['pan_certificate']){
  const id='modern-payout-proof-'+kind;
  addEvidence.run(id,sellerId,kind,`private/seller-documents/${sellerId}/${id}`);
 }
}
