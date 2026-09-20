import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {createExceptionWork,updateExceptionWork,ExceptionWorkConflictError} from '@/lib/operations/exception-work';
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return Response.json({error:'Request origin was not accepted.'},{status:403});
 try{const staff=await requireStaffApi('order.manage');const raw:unknown=await request.json();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return Response.json({error:'Invalid exception follow-up.'},{status:400});
 const data=raw as Record<string,unknown>;
 if(!data||typeof data!=='object'||(data.action!=='create'&&data.action!=='update')||typeof data.requestId!=='string'||typeof data.nextAction!=='string'||(data.ownerId!==null&&data.ownerId!==undefined&&typeof data.ownerId!=='string'))return Response.json({error:'Invalid exception follow-up.'},{status:400});
 const db=requireDatabase(env as unknown as {DB?:D1Database});const common={actorId:staff.id,requestId:data.requestId,nextAction:data.nextAction,ownerId:data.ownerId||null,now:Date.now()};
 if(data.action==='create'){
 if(typeof data.note!=='string'||typeof data.jobId!=='string'||typeof data.kind!=='string'||(data.cashRecordId!==undefined&&typeof data.cashRecordId!=='string'))return Response.json({error:'Choose a parcel and supported exception.'},{status:400});
 const id=await createExceptionWork(db,{...common,jobId:data.jobId,kind:data.kind,cashRecordId:data.cashRecordId,note:data.note});return Response.json({id});
 }
 if(typeof data.id!=='string'||(typeof data.version!=='number'||!Number.isSafeInteger(data.version))||typeof data.note!=='string'||(data.resolve!==undefined&&typeof data.resolve!=='boolean')||(data.evidence!==undefined&&typeof data.evidence!=='string'))return Response.json({error:'Invalid exception update.'},{status:400});
 const checks=data.checks&&typeof data.checks==='object'?data.checks as Record<string,unknown>:{};
 await updateExceptionWork(db,{...common,id:data.id,version:data.version,note:data.note,resolve:data.resolve,evidence:data.evidence,checks:{sourceReviewed:checks.sourceReviewed===true,obligationsReviewed:checks.obligationsReviewed===true,followupComplete:checks.followupComplete===true}});return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof StaffAuthorizationError||e instanceof ExceptionWorkConflictError?e.message:'Exception follow-up could not be saved.'},{status:e instanceof StaffAuthorizationError?e.status:e instanceof ExceptionWorkConflictError?409:400});}
}
