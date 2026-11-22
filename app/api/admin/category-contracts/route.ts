import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {CategoryContractError,getCategoryContractWorkspace,publishCategoryContract} from '@/lib/products/category-contracts';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){if(error instanceof CategoryContractError||error instanceof StaffAuthorizationError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:error.message},413);if(error instanceof SyntaxError)return reply({error:'Invalid category contract.'},400);return reply({error:'The category contract outcome is unavailable. Keep the same request for recovery.'},503);}
export async function GET(request:Request){try{await requireStaffApi('catalog.manage');const id=new URL(request.url).searchParams.get('categoryId');if(!id||id.length>160)return reply({error:'Choose the category to inspect.'},400);return reply(await getCategoryContractWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),id));}catch(error){return failure(error);}}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{const actor=await requireStaffApi('catalog.manage');if(actor.role!=='super_admin')return reply({error:'A current Super Admin must review category requirements.'},403);
  const body=await readBoundedJsonObject(request);if(Object.keys(body).some(key=>!['categoryId','contract','reason','requestId','expectedRevision'].includes(key))||typeof body.categoryId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(body.categoryId)||typeof body.reason!=='string'||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||!(body.expectedRevision===null||typeof body.expectedRevision==='string'&&/^\d+$/.test(body.expectedRevision)))return reply({error:'Choose the exact category and policy revision.'},400);
  return reply(await publishCategoryContract(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:actor.id,requestId:body.requestId,expectedRevision:body.expectedRevision,now:Date.now()},{categoryId:body.categoryId,contract:body.contract,reason:body.reason}));
 }catch(error){return failure(error);}
}
