import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedForm,BodyTooLargeError} from '@/lib/http/bounded-body';
import {consumePublicRequestRateLimit,rateLimitJson} from '@/lib/http/rate-limit';
import {validateSellerDocument,type SellerApplicationDocument} from '@/lib/sellers/application';
import {validateSellerDocumentContent} from '@/lib/documents/document-content';
import {digestFormRequest} from '@/lib/forms/submission';
import {inspectProtectedIdentitySubmission,submitProtectedIdentityChange} from '@/lib/sellers/protected-identity-change';
import {ProtectedChangeError} from '@/lib/sellers/protected-change-policy';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
  try{
    const actor=await requireSellerCenterApi();
    if(hasActorIntentMismatch(request,actor.userId))throw new SellerCenterAuthorizationError('The signed-in account changed. Reopen this identity case for your current account.',403);
    const bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket},db=requireDatabase(bindings),{id}=await context.params;
    if(!actor.sellerId)throw new ProtectedChangeError('Submit a seller application first.',404);
    const rate=await consumePublicRequestRateLimit(db,request,{scope:`seller-identity:${actor.userId}`,limit:10,windowMs:60*60_000});if(!rate.allowed)return rateLimitJson(rate);
    const form=await readBoundedForm(request,16*1024*1024),kinds=['representative_identity','pan_certificate','business_registration'] as const;
    if([...form.keys()].some(key=>!['accountId','commandId','permissionId','values',...kinds].includes(key)||form.getAll(key).length!==1))throw new ProtectedChangeError('Invalid identity replacement form.',400);
    if(form.get('accountId')!==actor.userId)return reply({error:'The signed-in account changed. Reopen this case for the current account.',code:'account_changed'},409);
    const commandId=form.get('commandId'),permissionId=form.get('permissionId'),raw=form.get('values');
    if(typeof commandId!=='string'||typeof permissionId!=='string'||![commandId,permissionId].every(value=>/^[A-Za-z0-9_-]{1,160}$/.test(value))||typeof raw!=='string'||raw.length>8000)
      throw new ProtectedChangeError('A current permission and stable submission reference are required.',400);
    const values=JSON.parse(raw) as Record<string,string>,files:{document:SellerApplicationDocument;bytes:ArrayBuffer}[]=[];
    for(const kind of kinds){const file=form.get(kind);if(file===null||file instanceof File&&!file.size)continue;
      if(!(file instanceof File))throw new ProtectedChangeError('Attach private evidence files.',400);
      const invalid=validateSellerDocument(file)??await validateSellerDocumentContent(file);if(invalid)throw new ProtectedChangeError(invalid,400);
      const bytes=await file.arrayBuffer(),contentHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
      const documentId='identity-'+await digestFormRequest({actorId:actor.userId,caseId:id,commandId,permissionId,values,kind,name:file.name,type:file.type,contentHash});
      files.push({bytes,document:{id:documentId,kind,objectKey:`private/seller-documents/${actor.sellerId}/${documentId}`,originalName:file.name.slice(0,180),mimeType:file.type,sizeBytes:file.size}});
    }
    const input={sellerId:actor.sellerId,caseId:id,permissionId,actorId:actor.userId,values,documents:files.map(file=>file.document),requestId:commandId,now:Date.now()};
    const missing=[];for(const file of files)if(!await db.prepare('SELECT 1 FROM seller_documents WHERE id=? AND seller_id=?').bind(file.document.id,actor.sellerId).first())missing.push(file);
    if(missing.length){await inspectProtectedIdentitySubmission(db,input);
      for(const {document,bytes} of missing){
        await db.prepare(`INSERT OR IGNORE INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at) VALUES(?,?,'seller.document.upload_started','seller_document',?,?,?)`)
          .bind(`upload-${document.id}`,actor.userId,document.id,JSON.stringify({sellerId:actor.sellerId,objectKey:document.objectKey}),input.now).run();
        await requireMediaBucket(bindings).put(document.objectKey,bytes,{httpMetadata:{contentType:document.mimeType},customMetadata:{sellerId:actor.sellerId,documentKind:document.kind}});
      }
    }
    await submitProtectedIdentityChange(db,input);return reply({ok:true});
  }catch(error){if(error instanceof ProtectedChangeError||error instanceof SellerCenterAuthorizationError)return reply({error:error.message},error.status);
    if(error instanceof BodyTooLargeError)return reply({error:'Use at most three evidence files, each no larger than 5 MB.'},413);
    if(error instanceof SyntaxError||error instanceof TypeError)return reply({error:'Invalid identity replacement form.'},400);
    return reply({error:'The save could not be confirmed. Keep your entries and retry the same submission.'},503);}
}
