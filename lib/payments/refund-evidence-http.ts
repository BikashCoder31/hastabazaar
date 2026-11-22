import {env} from 'cloudflare:workers';
import {requireExistingCustomerApi,CustomerAuthorizationError} from '../auth/customer';
import {requireStaffApi,StaffAuthorizationError} from '../auth/staff';
import {requireDatabase,requireMediaBucket} from '../db/d1';
import {readBoundedForm,BodyTooLargeError} from '../http/bounded-body';
import {isTrustedMutationRequest} from '../http/request-security';
import {hasActorIntentMismatch} from '../http/actor-intent';
import {RefundObligationError} from './refund-obligations';
import {FinanceEvidenceAccessError,uploadFinanceEvidence,recoverFinanceEvidence,readFinanceEvidence,type FinanceEvidenceMode,type FinanceEvidenceScope} from './refund-evidence';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie'}});
const bindings=()=>env as unknown as {DB?:D1Database;MEDIA?:R2Bucket};
async function actor(mode:FinanceEvidenceMode){return mode==='customer'?(await requireExistingCustomerApi()).userId:(await requireStaffApi('refund.approve.standard')).id;}
function actorIntent(request:Request,actorId:string,mode:FinanceEvidenceMode){if(hasActorIntentMismatch(request,actorId))throw mode==='staff'?new StaffAuthorizationError('The signed-in account changed. Refresh this Finance view before using its retained fields.',403):new CustomerAuthorizationError('The signed-in account changed. Refresh this refund view before using its retained fields.',403);}
function failure(error:unknown){if(error instanceof FinanceEvidenceAccessError||error instanceof RefundObligationError||error instanceof CustomerAuthorizationError||error instanceof StaffAuthorizationError)return json({error:error.message},error.status);if(error instanceof BodyTooLargeError)return json({error:'Use a file of 5 MB or less.'},413);return json({error:'The private upload could not be confirmed. Check the original saved upload before retrying.'},503);}
export async function financeEvidenceUpload(request:Request,mode:FinanceEvidenceMode){
 if(!isTrustedMutationRequest(request))return json({error:'Cross-site request rejected.'},403);
 try{
  const actorId=await actor(mode);actorIntent(request,actorId,mode);const form=await readBoundedForm(request,6*1024*1024),allowed=['scopeKind','scopeId','requestId','file'];
  const scopeId=form.get('scopeId'),requestId=form.get('requestId'),scopeKind=form.get('scopeKind'),file=form.get('file');
  if([...form.keys()].some(key=>!allowed.includes(key)||form.getAll(key).length!==1)||typeof scopeId!=='string'||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(requestId)||typeof scopeKind!=='string'||!['obligation','company_account','order'].includes(scopeKind)||form.has('file')&&!(file instanceof File))return json({error:'Use one private evidence file and the original financial source.'},400);
  const ctx={actorId,requestId,expectedRevision:null,now:Date.now()},scope={kind:scopeKind as FinanceEvidenceScope['kind'],id:scopeId},db=requireDatabase(bindings()),bucket=requireMediaBucket(bindings());
  return json(file instanceof File?await uploadFinanceEvidence(db,bucket,ctx,scope,file,mode):await recoverFinanceEvidence(db,bucket,ctx,scope,mode));
 }catch(error){return failure(error);}
}
export async function financeEvidenceRead(request:Request,mode:FinanceEvidenceMode){try{const actorId=await actor(mode);actorIntent(request,actorId,mode);const id=new URL(request.url).searchParams.get('file');if(!id||id.length>191)return json({error:'Use the original private evidence link.'},400);return await readFinanceEvidence(requireDatabase(bindings()),requireMediaBucket(bindings()),actorId,id,mode);}catch(error){return failure(error);}}
