import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import { env } from 'cloudflare:workers';
import { requireSellerCenterApi, SellerCenterAuthorizationError } from '@/lib/auth/seller-center';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { validateSellerDocument } from '@/lib/sellers/application';
import { validateSellerDocumentContent } from '@/lib/documents/document-content';
import { parseBankDetails, sellerBankState, submitSellerBankDetails, SellerBankError } from '@/lib/sellers/bank-details';
import { digestFormRequest } from '@/lib/forms/submission';
import {currentProtectedPermission} from '@/lib/sellers/protected-change-requests';
import {ProtectedChangeError,protectedCapabilityState} from '@/lib/sellers/protected-change-policy';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';

export const dynamic = 'force-dynamic';
const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function owner(request?:Request) {
  const actor = await requireSellerCenterApi();
  if(request && hasActorIntentMismatch(request,actor.userId)) throw new SellerBankError('The signed-in account changed. Reopen bank details for this account.',403);
  const db = requireDatabase(bindings);
  if (!actor.sellerId) throw new SellerBankError('Submit your seller application before adding bank details.', 404);
  return { actor, db, profile:{sellerId:actor.sellerId} };
}
function failure(error: unknown) {
  if (error instanceof SellerBankError || error instanceof SellerCenterAuthorizationError || error instanceof ProtectedChangeError) return reply({ error: error.message }, error.status);
  if (error instanceof BodyTooLargeError) return reply({ error: 'Bank evidence must be no larger than 5 MB.' }, 413);
  return reply({ error: 'Bank details could not be confirmed saved. Reload to check their status before retrying.' }, 503);
}
export async function GET(request?:Request) {
  try { const { actor,db, profile } = await owner(request); const caseId=request?new URL(request.url).searchParams.get('caseId')??undefined:undefined;
    const { status, revision,change,identityRevision,bankRevision } = await sellerBankState(db, profile.sellerId,caseId);
    let permissionId:string|null=null;if(change?.permissionId)try{permissionId=(await currentProtectedPermission(db,profile.sellerId,change.id,change.permissionId,actor.userId)).id;}catch(error){if(!(error instanceof ProtectedChangeError))throw error;}
    const capability=await protectedCapabilityState(db,profile.sellerId);
    const current=await owner(request);
    if(current.actor.userId!==actor.userId || current.profile.sellerId!==profile.sellerId) throw new SellerBankError('The signed-in account changed. Reopen bank details for this account.',403);
    return reply({ status, revision,userId:actor.userId,caseId:change?.id??null,permissionId,identityRevision,bankRevision,
      activeCase:change?.status==='open'||capability.holds.some(hold=>hold.caseId===change?.id) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const { actor, db, profile } = await owner(request);
    const rate = await consumePublicRequestRateLimit(db, request, { scope: `seller-bank:${actor.userId}`, limit: 10, windowMs: 60 * 60_000 });
    if (!rate.allowed) return rateLimitJson(rate);
    const data = await readBoundedForm(request, 6 * 1024 * 1024);
    const allowed = new Set(['revision', 'payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber', 'bankVerification','commandId','accountId','changeRequestId','permissionId']);
    if ([...data.keys()].some(key => !allowed.has(key) || data.getAll(key).length !== 1)) throw new SellerBankError('Invalid bank details form.', 400);
    const revision = data.get('revision');
    if(data.get('accountId')!==actor.userId)throw new SellerBankError('The signed-in account changed. Reopen bank details for this account.',409);
    const commandId=data.get('commandId');if(typeof commandId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(commandId))throw new SellerBankError('A stable bank submission reference is required.',400);
    const changeRequestId=data.get('changeRequestId'),permissionId=data.get('permissionId');
    if((changeRequestId!==null||permissionId!==null)&&(typeof changeRequestId!=='string'||typeof permissionId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(changeRequestId)||!/^[A-Za-z0-9_-]{1,160}$/.test(permissionId)))throw new SellerBankError('A current exact bank replacement permission is required.',400);
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) throw new SellerBankError('Reload the bank details form.', 400);
    const details = parseBankDetails(Object.fromEntries(data));
    const file = data.get('bankVerification');
    if (!(file instanceof File) || !file.size) throw new SellerBankError('Attach bank evidence showing the beneficiary and account.', 400);
    const error = validateSellerDocument(file) ?? await validateSellerDocumentContent(file);
    if (error) throw new SellerBankError(error, 400);
    const bytes=await file.arrayBuffer(),contentHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
    const id='bank-'+await digestFormRequest({actorId:actor.userId,commandId,revision,details,name:file.name,type:file.type,contentHash,changeRequestId,permissionId});
    const objectKey = `private/seller-documents/${profile.sellerId}/${id}`;
    if(!await db.prepare('SELECT 1 FROM seller_documents WHERE id=? AND seller_id=?').bind(id,profile.sellerId).first()){
      const current = await sellerBankState(db, profile.sellerId,typeof changeRequestId==='string'?changeRequestId:undefined);
      if (current.revision !== revision) throw new SellerBankError('Bank details changed. Review the current bank record before submitting.');
      if(current.status==='verified'||changeRequestId){if(typeof changeRequestId!=='string'||typeof permissionId!=='string')throw new SellerBankError('Request scoped permission before replacing reviewed bank details.');
        await currentProtectedPermission(db,profile.sellerId,changeRequestId,permissionId,actor.userId);}
      await db.prepare(`INSERT OR IGNORE INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at)
        VALUES(?,?,'seller.document.upload_started','seller_document',?,?,?)`).bind(`upload-${id}`,actor.userId,id,JSON.stringify({sellerId:profile.sellerId,objectKey}),Date.now()).run();
      await requireMediaBucket(bindings).put(objectKey,bytes,{httpMetadata:{contentType:file.type},customMetadata:{sellerId:profile.sellerId,documentKind:'bank_verification'}});
    }
    await submitSellerBankDetails(db, { sellerId: profile.sellerId, actorId: actor.userId, revision, details,commandId, now: Date.now(),
      ...(typeof changeRequestId==='string'&&typeof permissionId==='string'?{changeRequestId,permissionId}:{}),
      document: { id, objectKey, kind: 'bank_verification', originalName: file.name.slice(0, 180), mimeType: file.type, sizeBytes: file.size } });
    return reply({ ok: true });
  } catch (error) { return failure(error); }
}
