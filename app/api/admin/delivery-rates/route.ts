import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedBody,BodyTooLargeError} from '@/lib/http/bounded-body';
import {saveDeliveryRates,DeliveryRateConflictError} from '@/lib/db/repositories/delivery-rates';
import {isValidatedFormVersionStale,validateSellerFormSubmission} from '@/lib/forms/submission';
import {FormRuntimeError} from '@/lib/forms/runtime';
import {FormValidationError} from '@/lib/forms/validation';
export async function PUT(request:Request){
 let validatedVersionId:string|undefined;
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);
 try{
 const staff=await requireStaffApi('admin.invite');if(staff.role!=='super_admin')return reply({error:'Only the Super Admin can change delivery rates.'},403);
 let body:Record<string,unknown>;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedBody(request,256*1024))) as Record<string,unknown>;if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}catch(error){return reply({error:error instanceof BodyTooLargeError?error.message:'Invalid request.'},error instanceof BodyTooLargeError?413:400);}
 if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId))return reply({error:'A rate-change request reference is required.'},400);
 const db=requireDatabase(env as unknown as {DB?:D1Database});
 const configured=await validateSellerFormSubmission(db,'staff.delivery-rate',body.formVersion,body.customAnswers,body.requestId);
 validatedVersionId=configured.versionId;
 await saveDeliveryRates(db,{actorId:staff.id,expectedVersion:typeof body.expectedVersion==='string'?body.expectedVersion:'',rates:body.rates,reason:typeof body.reason==='string'?body.reason:'',now:Date.now(),requestId:body.requestId,
 form:{requestId:body.requestId,versionId:configured.versionId,answers:configured.answers}});return reply({saved:true});
 }catch(error){if(validatedVersionId&&await isValidatedFormVersionStale(requireDatabase(env as unknown as {DB?:D1Database}),'staff.delivery-rate',validatedVersionId))return reply({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},409);
 if(error instanceof FormRuntimeError)return reply({error:error.message,code:error.code},error.code==='stale_version'?409:503);
 if(error instanceof FormValidationError)return reply({error:error.message,fieldId:error.fieldId},400);
 return reply({error:error instanceof StaffAuthorizationError||error instanceof DeliveryRateConflictError?error.message:'Check delivery rates and try again.'},error instanceof StaffAuthorizationError?error.status:error instanceof DeliveryRateConflictError?409:400);}
}
