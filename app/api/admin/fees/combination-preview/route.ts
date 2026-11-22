import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {CommercialPreviewError,readCommercialCombinationPreview,readCommercialPreviewChoices} from '@/lib/incentives/commercial-combination-preview';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function context(request:Request){const actor=await requireStaffApi('commercial_policy.manage');if(actor.role!=='super_admin'||hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('Current commercial access or signed-in account changed. Reopen Fees, programs & promotions.',403);return{actor:{id:actor.id,authSubject:actor.authSubject},db:requireDatabase(env as unknown as{DB?:D1Database})};}
function failed(error:unknown){if(error instanceof StaffAuthorizationError||error instanceof CommercialPreviewError)return json({error:error.message},error.status);if(error instanceof BodyTooLargeError)return json({error:'The sample is too large.'},413);if(error instanceof SyntaxError)return json({error:'Use a valid native sample cart.'},400);return json({error:'A current native preview source is unavailable. No price, balance or eligibility is assumed.'},503);}
export async function GET(request:Request){try{const{actor,db}=await context(request),query=new URL(request.url).searchParams;if([...query.keys()].some(key=>key!=='after')||query.getAll('after').length>1)return json({error:'Use the actual product continuation reference.'},400);return json(await readCommercialPreviewChoices(db,actor,query.get('after')??undefined));}catch(error){return failed(error);}}
export async function POST(request:Request){if(!isTrustedMutationRequest(request))return json({error:'Cross-site preview requests are not allowed.'},403);try{const{actor,db}=await context(request),body=await readBoundedJsonObject(request);return json(await readCommercialCombinationPreview(db,actor,body));}catch(error){return failed(error);}}
