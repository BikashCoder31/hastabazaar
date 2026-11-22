import {validateSellerDocument} from '../sellers/application';
import {validateSellerDocumentContent} from '../documents/document-content';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {evidenceFileDisposition} from '../http/content-disposition';
import {responseScopeContains} from '../orders/response-sql';
import {paymentGuard} from './manual-receipts';
import {getRefundObligation,refundIndependence,RefundObligationError} from './refund-obligations';

export interface FinanceEvidenceScope{kind:'obligation'|'company_account'|'order';id:string;}
export type FinanceEvidenceMode='customer'|'staff';
export class FinanceEvidenceAccessError extends Error{readonly status=403;}
const AccessError=FinanceEvidenceAccessError;
async function scopeAuthority(db:D1Database,actorId:string,scope:FinanceEvidenceScope,mode:FinanceEvidenceMode){
 if(!scope||!['obligation','company_account','order'].includes(scope.kind)||typeof scope.id!=='string'||scope.id.length>191)throw new AccessError('Use an existing private financial source.');
 const statements:D1PreparedStatement[]=[];
 if(mode==='staff')statements.push(...(await staffMutationGuard(db,actorId,'refund.approve.standard',AccessError,'super_admin')).statements);
 else if(mode!=='customer'||scope.kind!=='obligation')throw new AccessError('Use your own original refund for private customer evidence.');
 if(scope.kind==='obligation'){
  const row=await getRefundObligation(db,scope.id);if(!row)throw new AccessError('The original refund is unavailable.');
  if(mode==='customer'){
   const predicate="EXISTS(SELECT 1 FROM refund_obligations r JOIN users u ON u.id=r.customer_id WHERE r.id=? AND u.id=? AND u.status='active')";
   if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(scope.id,actorId).first())throw new AccessError('Only the authenticated refund owner may access this customer evidence.');
   statements.push(...paymentGuard(db,predicate,[scope.id,actorId]));
  }else statements.push(...await refundIndependence(db,actorId,row.customerId,row.orderId,row.receiptId));
 }else if(scope.kind==='order'){
  const order=await db.prepare('SELECT customer_id AS customerId FROM orders WHERE id=?').bind(scope.id).first<{customerId:string|null}>();
  if(!order?.customerId)throw new AccessError('An original identified customer order is required.');
  statements.push(...await refundIndependence(db,actorId,order.customerId,scope.id,null));
 }else{
  const predicate=`EXISTS(SELECT 1 FROM company_payment_account_versions v WHERE v.id=? AND NOT ${responseScopeContains(db,'v.conflicts_json','?')})`;
  if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(scope.id,actorId).first())throw new AccessError('The retained company account is unavailable or personally conflicted.');
  statements.push(...paymentGuard(db,predicate,[scope.id,actorId]));
 }
 return statements;
}
const digest=async(bytes:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function evidenceIdentity(ctx:CommandContext,scope:FinanceEvidenceScope){return 'fin-file-'+await digest(new TextEncoder().encode(JSON.stringify([ctx.actorId,scope.kind,scope.id,ctx.requestId])));}
interface Intent{id:string;kind:FinanceEvidenceScope['kind'];scopeId:string;uploadedBy:string;objectKey:string;name:string;type:string;size:number;hash:string;}
const intentColumns='i.id,i.scope_kind AS kind,i.scope_id AS scopeId,i.uploaded_by AS uploadedBy,i.object_key AS objectKey,i.original_name AS name,i.mime_type AS type,i.size_bytes AS size,i.content_hash AS hash';

export async function uploadFinanceEvidence(db:D1Database,bucket:R2Bucket,ctx:CommandContext,scope:FinanceEvidenceScope,file:File,mode:FinanceEvidenceMode){
 let guards=await scopeAuthority(db,ctx.actorId,scope,mode);if(ctx.expectedRevision!==null)throw new RefundObligationError('Keep the original upload request reference.');
 const invalid=validateSellerDocument(file)??await validateSellerDocumentContent(file);if(invalid)throw new RefundObligationError(invalid,400);
 const bytes=await file.arrayBuffer(),hash=await digest(bytes),id=await evidenceIdentity(ctx,scope),objectKey='private/finance-evidence/'+id;
 const payload={scope,hash,name:file.name,type:file.type,size:file.size},source={action:'finance.evidence.saved',subjectType:'finance_evidence',subjectId:scope.kind+':'+scope.id},receipt=await commandReceipt(db,ctx,source,payload);
 if(receipt.replayed)return receipt.result as {id:string};
 await db.batch([...guards,db.prepare(`INSERT OR IGNORE INTO finance_evidence_intents(id,scope_kind,scope_id,uploaded_by,object_key,original_name,mime_type,size_bytes,content_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,${checkoutCommitClock(db)})`).bind(id,scope.kind,scope.id,ctx.actorId,objectKey,file.name,file.type,file.size,hash)]);
 const prior=await db.prepare('SELECT '+intentColumns+' FROM finance_evidence_intents i WHERE i.id=?').bind(id).first<Intent>();
 if(!prior||prior.hash!==hash||prior.name!==file.name||prior.type!==file.type||prior.size!==file.size||prior.objectKey!==objectKey)throw new RefundObligationError('This request identifies another original file. Recover it before choosing a new upload.');
 guards=await scopeAuthority(db,ctx.actorId,scope,mode);const existing=await bucket.get(objectKey);
 if(existing){if(await digest(await existing.arrayBuffer())!==hash)throw new RefundObligationError('Retained evidence bytes need storage review and will not be overwritten.');}
 else await bucket.put(objectKey,bytes,{httpMetadata:{contentType:file.type},customMetadata:{ownerId:ctx.actorId,contentHash:hash}});
 const result={id};
 try{await db.batch([...guards,db.prepare(`INSERT INTO finance_evidence_files(id,retained_at) VALUES(?,${checkoutCommitClock(db)})`).bind(id),receipt.insert(result)]);return result;}
 catch(error){await scopeAuthority(db,ctx.actorId,scope,mode);const replay=await commandReceipt(db,ctx,source,payload);if(replay.replayed)return replay.result as typeof result;throw error;}
}

export async function recoverFinanceEvidence(db:D1Database,bucket:R2Bucket,ctx:CommandContext,scope:FinanceEvidenceScope,mode:FinanceEvidenceMode){
 await scopeAuthority(db,ctx.actorId,scope,mode);const id=await evidenceIdentity(ctx,scope),prior=await db.prepare('SELECT '+intentColumns+' FROM finance_evidence_intents i WHERE i.id=? AND i.uploaded_by=?').bind(id,ctx.actorId).first<Intent>();
 if(!prior||prior.scopeId!==scope.id||prior.kind!==scope.kind||prior.objectKey!=='private/finance-evidence/'+id)throw new RefundObligationError('No retained upload was found. Reselect the original file for this attempt.');
 const object=await bucket.get(prior.objectKey);if(!object)throw new RefundObligationError('The original file has not reached storage. Reselect it and retry the unchanged upload.');
 const bytes=await object.arrayBuffer();if(bytes.byteLength!==prior.size||await digest(bytes)!==prior.hash)throw new RefundObligationError('The retained original evidence needs storage reconciliation.');
 return uploadFinanceEvidence(db,bucket,ctx,scope,new File([bytes],prior.name,{type:prior.type}),mode);
}

export async function readFinanceEvidence(db:D1Database,bucket:R2Bucket,actorId:string,fileId:string,mode:FinanceEvidenceMode){
 const file=await db.prepare('SELECT '+intentColumns+' FROM finance_evidence_intents i JOIN finance_evidence_files f ON f.id=i.id WHERE i.id=?').bind(fileId).first<Intent>();
 if(!file||mode==='customer'&&file.uploadedBy!==actorId)throw new AccessError('This private evidence file is unavailable.');
 const scope={kind:file.kind,id:file.scopeId};await scopeAuthority(db,actorId,scope,mode);
 const object=await bucket.get(file.objectKey);if(!object)throw new RefundObligationError('The retained evidence is unavailable; its original record is preserved.',404);
 const guards=await scopeAuthority(db,actorId,scope,mode);
 await db.batch([...guards,db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,created_at) VALUES(?,?,'finance.evidence.read','finance_evidence',?,${checkoutCommitClock(db)})`).bind(crypto.randomUUID(),actorId,fileId)]);
 const mime=['image/jpeg','image/png','application/pdf'].includes(file.type)?file.type:'application/octet-stream';
 return new Response(object.body,{headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie','Content-Type':mime,'Content-Disposition':evidenceFileDisposition(file.name,mime),'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"}});
}

/** External retained case references are allowed; internal files must belong to this exact source. */
export async function financeEvidenceReferenceGuards(db:D1Database,reference:string,scope:FinanceEvidenceScope,uploadedBy?:string){
 if(!reference.startsWith('fin-file-'))return [];
 const predicate=`EXISTS(SELECT 1 FROM finance_evidence_intents i JOIN finance_evidence_files f ON f.id=i.id WHERE i.id=? AND i.scope_kind=? AND i.scope_id=? ${uploadedBy?'AND i.uploaded_by=?':''})`,values=[reference,scope.kind,scope.id,...uploadedBy?[uploadedBy]:[]];
 if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new RefundObligationError('Use retained private evidence belonging to this exact original financial source.');
 return paymentGuard(db,predicate,values);
}
