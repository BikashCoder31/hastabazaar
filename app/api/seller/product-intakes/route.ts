import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {CategoryContractError,getCategoryDetailGroups,getProductIntakeDraft,saveProductIntakeDraft} from '@/lib/products/category-contracts';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){if(error instanceof CategoryContractError||error instanceof SellerCenterAuthorizationError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:error.message},413);if(error instanceof SyntaxError)return reply({error:'Invalid product draft.'},400);return reply({error:'The saved draft outcome is unavailable. Preserve and retry the same request.'},503);}
export async function GET(request:Request){try{const owner=await requireSellerCenterApi(),query=new URL(request.url).searchParams,db=requireDatabase(env as unknown as {DB?:D1Database}),id=query.get('draftId');if(id&&id.length>160)return reply({error:'Invalid draft reference.'},400);return reply(id?await getProductIntakeDraft(db,owner.userId,id):await getCategoryDetailGroups(db,query.get('categoryId')));}catch(error){return failure(error);}}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{const owner=await requireSellerCenterApi();if(!owner.sellerId)return reply({error:'Send the information you have in your registration first so this draft can retain its seller reference.'},409);
  const body=await readBoundedJsonObject(request);if(Object.keys(body).some(key=>!['draftId','categoryId','answers','requestId','expectedRevision'].includes(key))||!(body.draftId===null||typeof body.draftId==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(body.draftId))||!(body.categoryId===null||typeof body.categoryId==='string'&&body.categoryId.length<=160)||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||!(body.expectedRevision===null||typeof body.expectedRevision==='string'&&/^\d+$/.test(body.expectedRevision)))return reply({error:'Invalid product draft reference or revision.'},400);
  return reply(await saveProductIntakeDraft(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:owner.userId,requestId:body.requestId,expectedRevision:body.expectedRevision,now:Date.now()},{draftId:body.draftId,sellerId:owner.sellerId,categoryId:body.categoryId,answers:body.answers}));
 }catch(error){return failure(error);}
}
