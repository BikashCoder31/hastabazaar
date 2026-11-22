import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {readBoundedForm,BodyTooLargeError} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {ManagedLiveError} from '@/lib/managed-commerce/live-activation-support';
import {uploadManagedClearanceEvidence,recoverManagedClearanceEvidence,readManagedClearanceEvidence} from '@/lib/managed-commerce/live-clearance-evidence';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
const bindings=()=>env as unknown as {DB?:D1Database;MEDIA?:R2Bucket};
function failure(error:unknown){if(error instanceof StaffAuthorizationError||error instanceof ManagedLiveError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:'Use one private evidence file of 5 MB or less.'},413);return reply({error:'The private upload could not be confirmed. Check its original outcome before retrying.'},503);}
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context){if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);try{
 const actor=await requireStaffApi('seller.application.review'),{id}=await context.params,form=await readBoundedForm(request,6*1024*1024),allowed=['materialScopeDigest','requestId','file'],requestId=form.get('requestId'),materialScopeDigest=form.get('materialScopeDigest');
 if([...form.keys()].some(key=>!allowed.includes(key)||form.getAll(key).length!==1)||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(requestId)||typeof materialScopeDigest!=='string'||!/^[a-f0-9]{64}$/.test(materialScopeDigest)||form.has('file')&&!(form.get('file') instanceof File))return reply({error:'Use one exact private file and its current material scope.'},400);
 const db=requireDatabase(bindings()),bucket=requireMediaBucket(bindings()),ctx={actorId:actor.id,requestId,expectedRevision:null,now:Date.now()},scope={sellerId:id,materialScopeDigest};
 return reply(form.has('file')?await uploadManagedClearanceEvidence(db,bucket,ctx,scope,form.get('file') as File):await recoverManagedClearanceEvidence(db,bucket,ctx,scope));
}catch(error){return failure(error);}}
export async function GET(request:Request,context:Context){try{
 const actor=await requireStaffApi('seller.application.review'),{id}=await context.params,query=new URL(request.url).searchParams,file=query.get('file'),db=requireDatabase(bindings());
 if(query.size!==1||query.getAll('file').length!==1||!file||file.length>191)return reply({error:'Use this seller’s retained private file reference.'},400);
 if(!await db.prepare('SELECT 1 FROM managed_clearance_evidence_intents WHERE id=? AND seller_id=?').bind(file,id).first())return reply({error:'The private file is unavailable.'},404);
 return await readManagedClearanceEvidence(db,requireMediaBucket(bindings()),actor.id,file);
}catch(error){return failure(error);}}
