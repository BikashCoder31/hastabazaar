import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {getManagedLiveActivationReview} from '@/lib/managed-commerce/live-activation';
import {ManagedLiveError} from '@/lib/managed-commerce/live-activation-support';
import {ManagedLiveFinancialError} from '@/lib/managed-commerce/live-billing';
import {runManagedLiveCommand,recoverManagedLiveCommand} from '@/lib/managed-commerce/live-commands';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
function failure(error:unknown){if(error instanceof StaffAuthorizationError||error instanceof ManagedLiveError||error instanceof ManagedLiveFinancialError)return reply({error:error.message},error.status);if(error instanceof Error&&error.message==='Request reference was already used for different command content.')return reply({error:'This request reference already belongs to different details. Check its saved outcome.'},409);if(error instanceof BodyTooLargeError)return reply({error:'Request too large.'},413);if(error instanceof SyntaxError)return reply({error:'Use the protected live-readiness form.'},400);return reply({error:'The action could not be confirmed. Check its saved outcome before retrying.'},503);}
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{
 const actor=await requireStaffApi('seller.application.review'),{id}=await context.params,query=new URL(request.url).searchParams,db=requireDatabase(env as unknown as {DB?:D1Database});
 if(!query.size)return reply({review:await getManagedLiveActivationReview(db,actor.id,id)});
 if(query.size!==1||query.getAll('attempt').length!==1)return reply({error:'Use the original saved action reference.'},400);
 return reply({outcome:await recoverManagedLiveCommand(db,actor.id,id,query.get('attempt')!)});
}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);try{
 const actor=await requireStaffApi('seller.application.review'),{id}=await context.params,body=await readBoundedJsonObject(request);
 return reply(await runManagedLiveCommand(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,id,body));
}catch(error){return failure(error);}}
