import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {registrationEvidenceKinds} from './document-policy';
import { env } from 'cloudflare:workers';
import { requireSellerCenterApi, SellerCenterAuthorizationError } from '@/lib/auth/seller-center';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { validateSellerDocument, type SellerApplicationDocument } from '@/lib/sellers/application';
import { validateSellerDocumentContent } from '@/lib/documents/document-content';
import { usableReplacementPermissions } from '@/lib/sellers/document-workspace';
import { submitDocumentReplacement, submitUnverifiedDocumentCorrection, SellerDocumentReviewError } from '@/lib/sellers/document-review';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function handleDocumentUpload(request:Request,context:{params:Promise<{id:string}>},mode:'reviewed'|'unverified') {
  if(!isTrustedMutationRequest(request)) return reply({error:'Cross-site requests are not allowed.'},403);
  try {
    const viewer=await requireSellerCenterApi();
    if(hasActorIntentMismatch(request,viewer.userId))throw new SellerCenterAuthorizationError('The signed-in account changed. Reopen this document for your current account.',403);
    if(!viewer.sellerId) return reply({error:'Registration not found.'},404);
    const bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket},db=requireDatabase(bindings);
    const requestId=(await context.params).id,form=await readBoundedForm(request,6*1024*1024);
    const file=form.get('document'),commandId=form.get('commandId'),permissionId=form.get('permissionId');
    if([...form.keys()].some(key=>!(mode==='reviewed'?['document','commandId','permissionId']:['document','commandId']).includes(key)) || !(file instanceof File) || typeof commandId!=='string'
      || !/^[a-zA-Z0-9_-]{1,160}$/.test(commandId) || mode==='reviewed'&&typeof permissionId!=='string') return reply({error:'Choose a document and a current correction or replacement scope.'},400);
    const invalid=validateSellerDocument(file)??await validateSellerDocumentContent(file);
    if(invalid) return reply({error:invalid},400);
    const source=await db.prepare(mode==='reviewed'?`SELECT d.kind FROM seller_document_change_requests r JOIN seller_documents d ON d.id=r.document_id
      WHERE r.id=? AND r.seller_id=?`:'SELECT kind FROM seller_documents WHERE id=? AND seller_id=?').bind(requestId,viewer.sellerId).first<{kind:SellerApplicationDocument['kind']}>();
    if(!source || !(registrationEvidenceKinds as readonly string[]).includes(source.kind)) return reply({error:'This registration evidence replacement request is unavailable.'},404);
    const bytes=await file.arrayBuffer();
    const contentHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
    const identityHash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([viewer.userId,requestId,permissionId,commandId,file.name,file.type,contentHash])));
    const id='replacement-'+Array.from(new Uint8Array(identityHash),byte=>byte.toString(16).padStart(2,'0')).join('');
    const document={id,kind:source.kind,objectKey:`private/seller-documents/${viewer.sellerId}/${id}`,originalName:file.name.slice(0,180),mimeType:file.type,sizeBytes:file.size};
    if(!await db.prepare('SELECT 1 FROM seller_documents WHERE id=? AND seller_id=?').bind(id,viewer.sellerId).first()) {
      if(mode==='reviewed'&&!(await usableReplacementPermissions(db,viewer.sellerId,viewer.userId)).some(permission=>permission.id===permissionId&&permission.requestId===requestId))
        return reply({error:'The replacement permission changed. Review the current request; your file remains selected.'},409);
      if(mode==='unverified'&&!await db.prepare(`SELECT 1 FROM seller_documents d WHERE d.id=? AND d.seller_id=? AND d.status IN ('pending','rejected')
        AND NOT EXISTS(SELECT 1 FROM seller_documents verified WHERE verified.seller_id=d.seller_id AND verified.kind=d.kind AND verified.status='verified')
        AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind AND (newer.uploaded_at>d.uploaded_at OR newer.uploaded_at=d.uploaded_at AND newer.id>d.id))`)
        .bind(requestId,viewer.sellerId).first())return reply({error:'The evidence changed or was verified. Review its current status before supplying a correction.'},409);
      // Retain an upload-attempt inventory for later orphan reconciliation. Never delete bytes after an uncertain commit.
      await db.prepare(`INSERT OR IGNORE INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at)
        VALUES(?,?,'seller.document.upload_started','seller_document',?,?,?)`).bind(`upload-${id}`,viewer.userId,id,JSON.stringify({sellerId:viewer.sellerId,sourceId:requestId,mode,objectKey:document.objectKey}),Date.now()).run();
      await requireMediaBucket(bindings).put(document.objectKey,bytes,{httpMetadata:{contentType:file.type},customMetadata:{sellerId:viewer.sellerId,documentKind:source.kind}});
    }
    const documentId=mode==='reviewed'?await submitDocumentReplacement(db,{sellerId:viewer.sellerId,actorId:viewer.userId,requestId,permissionId:permissionId as string,commandId,document,now:Date.now()})
      :await submitUnverifiedDocumentCorrection(db,{sellerId:viewer.sellerId,actorId:viewer.userId,documentId:requestId,commandId,document,now:Date.now()});
    return reply({ok:true,documentId,requestId});
  } catch(error) {
    if(error instanceof SellerCenterAuthorizationError || error instanceof SellerDocumentReviewError) return reply({error:error.message},error.status);
    if(error instanceof BodyTooLargeError) return reply({error:'Choose a PDF, JPG or PNG no larger than 5 MB.'},413);
    return reply({error:'The replacement could not be confirmed. Keep the file selected and retry the same submission.'},503);
  }
}
