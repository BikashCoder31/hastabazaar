import {observedFileBucket} from '../operations/file-access-health';
import {validateSellerDocument} from '../sellers/application';
import {validateSellerDocumentContent} from '../documents/document-content';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt} from '../workflows/contracts';
import {ManualPaymentError,ManualPaymentNotAppliedError} from './manual-receipts';
import {claimReleaseAuthority,claimReleaseProofStatement,requireClaimReleaseProof,withClaimReleaseAuthority,ClaimReleaseProofError,type ClaimReleaseContext} from './claim-release-authority';
import {evidenceFileDisposition} from '../http/content-disposition';

class FileAccessError extends ManualPaymentError{constructor(message:string){super(message,403);}}
async function owned(db:D1Database,actorId:string,orderId:string){if(!await db.prepare("SELECT 1 FROM manual_payment_windows w JOIN orders o ON o.id=w.order_id JOIN users u ON u.id=o.customer_id WHERE w.order_id=? AND u.id=? AND u.status='active'").bind(orderId,actorId).first())throw new FileAccessError('Only the signed-in order owner may upload payment evidence.');}
async function digest(bytes:BufferSource){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function recoverPaymentClaimFile(db:D1Database,bucket:R2Bucket,context:ClaimReleaseContext,orderId:string){return withClaimReleaseAuthority(db,context,orderId,'upload',()=>recoverPaymentClaimFileNative(db,bucket,context,orderId));}
async function recoverPaymentClaimFileNative(db:D1Database,bucket:R2Bucket,context:ClaimReleaseContext,orderId:string){
 await owned(db,context.actorId,orderId);const attempt=await digest(new TextEncoder().encode(JSON.stringify([context.actorId,orderId,context.requestId]))),saved=await db.prepare("SELECT next_json AS value FROM audit_logs WHERE id=? AND actor_id=? AND subject_id=? AND action='manual.payment.file.started'").bind('payment-upload:'+attempt,context.actorId,orderId).first<{value:string}>();
 if(!saved)throw new ManualPaymentError('No saved upload attempt was found. Reselect the original optional file.');
 const record=JSON.parse(saved.value) as {payload:string;objectKey:string;authSubject?:string},payload=JSON.parse(record.payload) as {orderId:string;hash:string;name:string;type:string;size:number},expectedKey=`private/payment-claims/${orderId}/payment-file-${attempt}`;
 if(context.authSubject!==undefined&&record.authSubject!==context.authSubject)throw new ClaimReleaseProofError();
 if(record.objectKey!==expectedKey||payload.orderId!==orderId)throw new ManualPaymentError('The retained upload needs review.');
 const object=await bucket.get(expectedKey);if(!object)throw new ManualPaymentError('The optional file was not saved. Reselect it and retry this upload request.');const bytes=await object.arrayBuffer();if(await digest(bytes)!==payload.hash||bytes.byteLength!==payload.size)throw new ManualPaymentError('The retained bytes do not match this upload attempt.');
 return uploadPaymentClaimFile(db,bucket,context,orderId,new File([bytes],payload.name,{type:payload.type}));
}
export async function uploadPaymentClaimFile(db:D1Database,bucket:R2Bucket,context:ClaimReleaseContext,orderId:string,file:File){return withClaimReleaseAuthority(db,context,orderId,'upload',()=>uploadPaymentClaimFileNative(db,bucket,context,orderId,file));}
async function uploadPaymentClaimFileNative(db:D1Database,bucket:R2Bucket,context:ClaimReleaseContext,orderId:string,file:File){
 await owned(db,context.actorId,orderId);const invalid=validateSellerDocument(file)??await validateSellerDocumentContent(file);if(invalid)throw new ManualPaymentNotAppliedError(invalid,400);
 if(context.expectedRevision!==null)throw new ManualPaymentNotAppliedError('Use the original upload request identity.',400);
 const bytes=await file.arrayBuffer(),hash=await digest(bytes),attempt=await digest(new TextEncoder().encode(JSON.stringify([context.actorId,orderId,context.requestId]))),fileId='payment-file-'+attempt,objectKey=`private/payment-claims/${orderId}/${fileId}`;
 const payload={orderId,hash,name:file.name,type:file.type,size:file.size},encoded=JSON.stringify(payload),source={action:'manual.payment.file.saved',subjectType:'order',subjectId:orderId},receipt=await commandReceipt(db,context,source,payload);
 if(receipt.replayed){if(context.authSubject!==undefined)await requireClaimReleaseProof(db,context,orderId,'upload');return receipt.result as {id:string;name:string};}
 await db.batch([...await claimReleaseAuthority(db,context,orderId,'upload'),db.prepare("INSERT OR IGNORE INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at) VALUES(?,?,'manual.payment.file.started','order',?,?,?)").bind('payment-upload:'+attempt,context.actorId,orderId,JSON.stringify({payload:encoded,objectKey,...context.authSubject===undefined?{}:{authSubject:context.authSubject}}),context.now)]);
 const prior=await db.prepare('SELECT next_json AS value FROM audit_logs WHERE id=? AND actor_id=?').bind('payment-upload:'+attempt,context.actorId).first<{value:string}>();if(!prior||JSON.parse(prior.value).payload!==encoded)throw new ManualPaymentError('This upload request already identifies another file. Recover that outcome before starting a new upload.');
 if(context.authSubject!==undefined&&JSON.parse(prior.value).authSubject!==context.authSubject)throw new ClaimReleaseProofError();
 await claimReleaseAuthority(db,context,orderId,'upload');const existing=await bucket.get(objectKey);if(existing){if(await digest(await existing.arrayBuffer())!==hash)throw new ManualPaymentError('The retained upload needs storage review. It will not be overwritten.');}else {await claimReleaseAuthority(db,context,orderId,'upload');await bucket.put(objectKey,bytes,{httpMetadata:{contentType:file.type},customMetadata:{orderId,ownerId:context.actorId,contentHash:hash}});}
 const result={id:fileId,name:file.name};
 try{await db.batch([...await claimReleaseAuthority(db,context,orderId,'upload'),db.prepare('INSERT INTO manual_payment_claim_files(id,order_id,uploaded_by,object_key,original_name,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(fileId,orderId,context.actorId,objectKey,file.name.slice(0,180),file.type,file.size,context.now),receipt.insert(result),...await claimReleaseProofStatement(db,context,orderId,'upload')]);return result;}catch(error){const replay=await commandReceipt(db,context,source,payload);if(replay.replayed){if(context.authSubject!==undefined)await requireClaimReleaseProof(db,context,orderId,'upload');return replay.result as typeof result;}throw error;}
}
export async function readPaymentClaimFile(db:D1Database,bucket:R2Bucket,actorId:string,fileId:string,mode:'customer'|'finance'){
 if(mode==='finance')await staffMutationGuard(db,actorId,'payment.receipt.verify',FileAccessError);
 const file=await db.prepare(`SELECT f.order_id AS orderId,f.object_key AS objectKey,f.original_name AS name,f.mime_type AS type FROM manual_payment_claim_files f JOIN orders o ON o.id=f.order_id JOIN users u ON u.id=o.customer_id WHERE f.id=? ${mode==='customer'?"AND o.customer_id=? AND u.status='active'":''}`).bind(fileId,...mode==='customer'?[actorId]:[]).first<{orderId:string;objectKey:string;name:string;type:string}>();if(!file)throw new ManualPaymentError('Payment evidence was not found.',404);
 const object=await observedFileBucket(db,bucket,'private').get(file.objectKey);if(!object)throw new ManualPaymentError('The retained evidence file is unavailable. Its claim remains recorded.',404);
 if(mode==='finance'){await staffMutationGuard(db,actorId,'payment.receipt.verify',FileAccessError);await db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,created_at) VALUES(?,?,'manual.payment.file.read','payment_claim_file',?,?)").bind(crypto.randomUUID(),actorId,fileId,Date.now()).run();}else await owned(db,actorId,file.orderId);
 const mime=['application/pdf','image/png','image/jpeg'].includes(file.type)?file.type:'application/octet-stream';return new Response(object.body,{headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie','Content-Type':mime,'Content-Disposition':evidenceFileDisposition(file.name,mime),'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"}});
}
