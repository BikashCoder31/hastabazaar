import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {HomepageVisibilityConflictError,setHomepageProductVisibility} from '@/lib/db/repositories/products';
import {assertHomepageVisibilityActor,HomepageOutcomeError,readHomepageVisibilityOutcome} from '@/lib/admin/homepage-visibility-outcomes';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {isValidatedFormVersionStale,validateSellerFormSubmission} from '@/lib/forms/submission';
import {FormRuntimeError} from '@/lib/forms/runtime';
import {FormValidationError} from '@/lib/forms/validation';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const database=()=>requireDatabase(env as unknown as{DB?:D1Database});
async function actor(request:Request){const staff=await requireStaffApi('admin.invite');if(staff.role!=='super_admin'||hasActorIntentMismatch(request,staff.id))throw new StaffAuthorizationError('Current signed-in Super Admin homepage access is required.',403);return{id:staff.id,authSubject:staff.authSubject};}
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{const current=await actor(request),{id}=await context.params,query=new URL(request.url).searchParams;if([...query.keys()].some(key=>key!=='attempt')||query.getAll('attempt').length!==1)return json({error:'Use the original homepage product request reference.'},400);return json(await readHomepageVisibilityOutcome(database(),current,id,query.get('attempt')??''));}catch(error){if(error instanceof StaffAuthorizationError||error instanceof HomepageOutcomeError)return json({error:error.message},error.status);return json({error:'The original homepage decision is unavailable. Keep its original reference; no result is assumed.'},503);}}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 let invoked=false,validatedVersionId:string|undefined,current:Awaited<ReturnType<typeof actor>>|undefined;
 const failed=(body:Record<string,unknown>,status:number)=>json({...body,phase:invoked?'outcome_unconfirmed':'rejected_before_write',...(!invoked&&[401,403].includes(status)?{code:'access_denied_before_write'}:{})},status);
 if(!isTrustedMutationRequest(request))return failed({error:'Cross-site requests are not allowed.'},403);
 try{
  current=await actor(request);const{id}=await context.params,body=await readBoundedJsonObject(request);
  if(typeof body.hidden!=='boolean')return failed({error:'Select whether the product is hidden.'},400);
  if(!Number.isInteger(body.expectedVersion)||Number(body.expectedVersion)<0)return failed({error:'Refresh the product and try again.'},400);
  const reason=typeof body.reason==='string'?body.reason.trim():'',requestId=typeof body.requestId==='string'?body.requestId.trim():'';
  if(reason.length<8||reason.length>500)return failed({error:'Add a clear reason from 8 through 500 characters.'},400);
  if(!/^[a-zA-Z0-9:_-]{8,191}$/.test(requestId))return failed({error:'The homepage-control request identifier is invalid.'},400);
  const db=database(),form=await validateSellerFormSubmission(db,'staff.homepage-visibility',body.formVersion,body.customAnswers,requestId);validatedVersionId=form.versionId;
  const source=await db.prepare("SELECT COALESCE(control.version,0) version,COALESCE(control.is_hidden,0) hidden,control.last_request_id requestId FROM products p LEFT JOIN homepage_product_controls control ON control.product_id=p.id WHERE p.id=? AND HEX(p.id)=HEX(?) AND p.status='published' AND NOT EXISTS(SELECT 1 FROM product_deletions deletion WHERE deletion.product_id=p.id)").bind(id,id).first<{version:number;hidden:number;requestId:string|null}>();
  if(!source)return failed({error:'Product not found.'},409);
  if(source.requestId!==requestId&&source.version!==Number(body.expectedVersion))return failed({error:'Homepage visibility changed. Refresh and review the current product before another decision.'},409);
  if(source.requestId!==requestId&&Boolean(source.hidden)===body.hidden)return failed({error:'Homepage visibility is already set. Review its current state.'},409);
  invoked=true;const result=await setHomepageProductVisibility(db,{productId:id,actorId:current.id,hidden:body.hidden,expectedVersion:Number(body.expectedVersion),reason,requestId,now:Date.now(),form:{versionId:form.versionId,answers:form.answers}});await assertHomepageVisibilityActor(db,current);return json({...result,message:'Homepage visibility updated.'});
 }catch(error){
  if(invoked&&current){try{await assertHomepageVisibilityActor(database(),current);}catch(authority){if(authority instanceof HomepageOutcomeError&&authority.status===403)return failed({error:authority.message},403);}}
  if(error instanceof StaffAuthorizationError)return failed({error:error.message},error.status);
  if(error instanceof BodyTooLargeError)return failed({error:error.message},413);
  if(error instanceof SyntaxError)return failed({error:'Invalid JSON request.'},400);
  if(error instanceof FormRuntimeError)return failed({error:error.message,code:error.code},error.code==='stale_version'?409:503);
  if(error instanceof FormValidationError)return failed({error:error.message,fieldId:error.fieldId},400);
  if(validatedVersionId&&await isValidatedFormVersionStale(database(),'staff.homepage-visibility',validatedVersionId))return failed({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},409);
  if(error instanceof HomepageVisibilityConflictError)return failed({error:error.message},409);
  return failed({error:'The homepage decision could not be confirmed. Keep its original reference.'},503);
 }
}
