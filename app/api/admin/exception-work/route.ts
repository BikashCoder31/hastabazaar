import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {createExceptionWork,updateExceptionWork,ExceptionWorkConflictError} from '@/lib/operations/exception-work';
import {isValidatedFormVersionStale,validateSellerFormSubmission} from '@/lib/forms/submission';
import {FormRuntimeError} from '@/lib/forms/runtime';
import {FormValidationError} from '@/lib/forms/validation';
export async function POST(request:Request){
 let validatedVersionId:string|undefined;
 if(!isTrustedMutationRequest(request))return Response.json({error:'Request origin was not accepted.'},{status:403});
 try{const staff=await requireStaffApi('order.manage');const raw:unknown=await readBoundedJsonObject(request);
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return Response.json({error:'Invalid exception follow-up.'},{status:400});
 const data=raw as Record<string,unknown>;
 if(!data||typeof data!=='object'||(data.action!=='create'&&data.action!=='update')||typeof data.requestId!=='string'||typeof data.nextAction!=='string'||(data.ownerId!==null&&data.ownerId!==undefined&&typeof data.ownerId!=='string'))return Response.json({error:'Invalid exception follow-up.'},{status:400});
 const db=requireDatabase(env as unknown as {DB?:D1Database});
 const configured=await validateSellerFormSubmission(db,'staff.exception-work',data.formVersion,data.customAnswers,data.requestId);
 validatedVersionId=configured.versionId;
 const common={actorId:staff.id,requestId:data.requestId,nextAction:data.nextAction,ownerId:data.ownerId||null,now:Date.now(),form:{requestId:data.requestId,versionId:configured.versionId,answers:configured.answers}};
 if(data.action==='create'){
 if(typeof data.note!=='string'||typeof data.jobId!=='string'||typeof data.kind!=='string'||(data.cashRecordId!==undefined&&typeof data.cashRecordId!=='string'))return Response.json({error:'Choose a parcel and supported exception.'},{status:400});
 const id=await createExceptionWork(db,{...common,jobId:data.jobId,kind:data.kind,cashRecordId:data.cashRecordId,note:data.note});return Response.json({id});
 }
 if(typeof data.id!=='string'||(typeof data.version!=='number'||!Number.isSafeInteger(data.version))||typeof data.note!=='string'||(data.resolve!==undefined&&typeof data.resolve!=='boolean')||(data.evidence!==undefined&&typeof data.evidence!=='string'))return Response.json({error:'Invalid exception update.'},{status:400});
 const checks=data.checks&&typeof data.checks==='object'?data.checks as Record<string,unknown>:{};
 await updateExceptionWork(db,{...common,id:data.id,version:data.version,note:data.note,resolve:data.resolve,evidence:data.evidence,checks:{sourceReviewed:checks.sourceReviewed===true,obligationsReviewed:checks.obligationsReviewed===true,followupComplete:checks.followupComplete===true}});return Response.json({ok:true});
 }catch(e){
    if (e instanceof BodyTooLargeError) return Response.json({ error: e.message }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    if (e instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
 if(e instanceof FormRuntimeError)return Response.json({error:e.message,code:e.code},{status:e.code==='stale_version'?409:503});
 if(e instanceof FormValidationError)return Response.json({error:e.message,fieldId:e.fieldId},{status:400});
 if(validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as {DB?:D1Database}),
   'staff.exception-work',validatedVersionId))return Response.json({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},{status:409});
 return Response.json({error:e instanceof StaffAuthorizationError||e instanceof ExceptionWorkConflictError?e.message:'Exception follow-up could not be saved.'},{status:e instanceof StaffAuthorizationError?e.status:e instanceof ExceptionWorkConflictError?409:400});}
}
