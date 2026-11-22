import type {CommandContext} from '../workflows/contracts';
import {commandReceipt} from '../workflows/contracts';
import {validateSellerDocument} from '../sellers/application';
import {validateSellerDocumentContent} from '../documents/document-content';
import {evidenceFileDisposition} from '../http/content-disposition';
import {paymentGuard} from '../payments/manual-receipts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {ManagedLiveError,managedLiveAuthority,liveDigest} from './live-activation-support';
import {getManagedClearanceScope,managedLiveScopeGuards} from './live-clearance';
export interface ManagedClearanceEvidenceScope{sellerId:string;materialScopeDigest:string;}
async function authority(db:D1Database,actorId:string,scope:ManagedClearanceEvidenceScope){
 const guards=await managedLiveAuthority(db,actorId,scope.sellerId),current=await getManagedClearanceScope(db,scope.sellerId,Date.now());
 if(current.materialScopeDigest!==scope.materialScopeDigest)throw new ManagedLiveError('The material legal, company or beneficiary scope changed; review the actual external source before uploading.');
 return [...guards,...managedLiveScopeGuards(db,current,Date.now(),{terms:false,orders:false})];
}
type Stored={id:string;sellerId:string;scopeDigest:string;uploadedBy:string;objectKey:string;name:string;type:string;size:number;hash:string;};
const columns='i.id,i.seller_id sellerId,i.material_scope_digest scopeDigest,i.uploaded_by uploadedBy,i.object_key objectKey,i.original_name name,i.mime_type type,i.size_bytes size,i.content_hash hash';
async function bytesDigest(value:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),byte=>byte.toString(16).padStart(2,'0')).join('');}
async function fileId(ctx:CommandContext,scope:ManagedClearanceEvidenceScope){return 'clearance-file-'+await liveDigest([ctx.actorId,scope,ctx.requestId]);}
export async function uploadManagedClearanceEvidence(db:D1Database,bucket:R2Bucket,ctx:CommandContext,scope:ManagedClearanceEvidenceScope,file:File){
 let guards=await authority(db,ctx.actorId,scope);if(ctx.expectedRevision!==null)throw new ManagedLiveError('Use the original upload attempt reference.',400);
 const invalid=validateSellerDocument(file)??await validateSellerDocumentContent(file);if(invalid)throw new ManagedLiveError(invalid,400);
 const bytes=await file.arrayBuffer(),hash=await bytesDigest(bytes),id=await fileId(ctx,scope),objectKey='private/managed-clearance-evidence/'+id;
 const payload={scope,hash,name:file.name,type:file.type,size:file.size},identity={action:'managed_maker.live.evidence_saved',subjectType:'seller',subjectId:scope.sellerId},receipt=await commandReceipt(db,ctx,identity,payload);
 if(receipt.replayed)return receipt.result as {id:string};
 const exactIntent=()=>paymentGuard(db,`EXISTS(SELECT 1 FROM managed_clearance_evidence_intents WHERE id=? AND seller_id=? AND material_scope_digest=? AND uploaded_by=? AND object_key=? AND original_name=? AND mime_type=? AND size_bytes=? AND content_hash=? AND request_id=?)`,[id,scope.sellerId,scope.materialScopeDigest,ctx.actorId,objectKey,file.name,file.type,file.size,hash,ctx.requestId]);
 const old=await db.prepare('SELECT '+columns+' FROM managed_clearance_evidence_intents i WHERE i.id=?').bind(id).first<Stored>();
 if(old&&(old.hash!==hash||old.name!==file.name||old.type!==file.type||old.size!==file.size||old.objectKey!==objectKey))throw new ManagedLiveError('This upload attempt belongs to different bytes or metadata. Recover the original file before changing it.');
 await db.batch([...guards,db.prepare(`INSERT OR IGNORE INTO managed_clearance_evidence_intents(id,seller_id,material_scope_digest,uploaded_by,object_key,original_name,mime_type,size_bytes,content_hash,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,${checkoutCommitClock(db)})`).bind(id,scope.sellerId,scope.materialScopeDigest,ctx.actorId,objectKey,file.name,file.type,file.size,hash,ctx.requestId),...exactIntent()]);
 guards=await authority(db,ctx.actorId,scope);const existing=await bucket.get(objectKey);
 if(existing){const retained=await existing.arrayBuffer();if(retained.byteLength!==bytes.byteLength||await bytesDigest(retained)!==hash)throw new ManagedLiveError('Retained external evidence bytes need storage review; they will not be overwritten.');}
 else await bucket.put(objectKey,bytes,{httpMetadata:{contentType:file.type},customMetadata:{sellerId:scope.sellerId,contentHash:hash,materialScopeDigest:scope.materialScopeDigest}});
 const result={id};try{await db.batch([...guards,...exactIntent(),db.prepare(`INSERT INTO managed_clearance_evidence_files(id,retained_at) VALUES(?,${checkoutCommitClock(db)})`).bind(id),receipt.insert(result)]);return result;}catch(error){await authority(db,ctx.actorId,scope);const saved=await commandReceipt(db,ctx,identity,payload);if(saved.replayed)return saved.result as typeof result;throw error;}
}
export async function recoverManagedClearanceEvidence(db:D1Database,bucket:R2Bucket,ctx:CommandContext,scope:ManagedClearanceEvidenceScope){
 await authority(db,ctx.actorId,scope);const id=await fileId(ctx,scope),stored=await db.prepare('SELECT '+columns+' FROM managed_clearance_evidence_intents i WHERE i.id=? AND i.uploaded_by=? AND i.seller_id=? AND i.material_scope_digest=?').bind(id,ctx.actorId,scope.sellerId,scope.materialScopeDigest).first<Stored>();
 if(!stored||stored.objectKey!=='private/managed-clearance-evidence/'+id)throw new ManagedLiveError('No original private upload was retained; reselect the original external document.');
 const object=await bucket.get(stored.objectKey);if(!object)throw new ManagedLiveError('The original external document has not reached storage; reselect it for the same attempt.');
 const bytes=await object.arrayBuffer();if(bytes.byteLength!==stored.size||await bytesDigest(bytes)!==stored.hash)throw new ManagedLiveError('The retained original bytes need storage reconciliation.');
 return uploadManagedClearanceEvidence(db,bucket,ctx,scope,new File([bytes],stored.name,{type:stored.type}));
}
export async function readManagedClearanceEvidence(db:D1Database,bucket:R2Bucket,actorId:string,id:string){
 const stored=await db.prepare('SELECT '+columns+' FROM managed_clearance_evidence_intents i JOIN managed_clearance_evidence_files f ON f.id=i.id WHERE i.id=?').bind(id).first<Stored>();
 if(!stored)throw new ManagedLiveError('The retained private clearance file is unavailable.',404);
 const guards=await managedLiveAuthority(db,actorId,stored.sellerId),object=await bucket.get(stored.objectKey);if(!object)throw new ManagedLiveError('The original external file is unavailable; its record is retained.',404);
 const bytes=await object.arrayBuffer();if(bytes.byteLength!==stored.size||await bytesDigest(bytes)!==stored.hash)throw new ManagedLiveError('Retained external evidence integrity needs storage review; the original record is preserved.');
 await db.batch([...guards,db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,created_at) VALUES(?,?,'managed_maker.live.evidence_read','managed_clearance_evidence',?,${checkoutCommitClock(db)})`).bind(crypto.randomUUID(),actorId,id)]);
 return new Response(bytes,{headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie','Content-Type':stored.type,'Content-Disposition':evidenceFileDisposition(stored.name,stored.type),'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"}});
}
export async function managedClearanceEvidenceGuards(db:D1Database,id:string,scope:ManagedClearanceEvidenceScope){
 const predicate=`EXISTS(SELECT 1 FROM managed_clearance_evidence_intents i JOIN managed_clearance_evidence_files f ON f.id=i.id WHERE i.id=? AND i.seller_id=? AND i.material_scope_digest=? AND i.object_key='private/managed-clearance-evidence/'||i.id)`;
 const values=[id,scope.sellerId,scope.materialScopeDigest];if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new ManagedLiveError('Use actual retained private external evidence for this exact seller and material scope.');
 return paymentGuard(db,predicate,values);
}
