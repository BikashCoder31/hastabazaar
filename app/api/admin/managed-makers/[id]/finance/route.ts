import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {readLiveManagedFinance,runLiveManagedFinanceAction,recoverLiveManagedFinanceAction,LiveFinanceError,ManagedLiveFinancialError} from '@/lib/managed-commerce/live-finance-api';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
function failure(error:unknown){
 if(error instanceof StaffAuthorizationError||error instanceof LiveFinanceError||error instanceof ManagedLiveFinancialError)return reply({error:error.message},error.status);
 if(error instanceof BodyTooLargeError)return reply({error:'Request too large.'},413);
 if(error instanceof SyntaxError)return reply({error:'Use the protected actual payment form.'},400);
 return reply({error:'The actual payment action could not be confirmed. Check its saved outcome before retrying.'},503);
}
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{
 const actor=await requireStaffApi('payout.prepare'),{id}=await context.params,db=requireDatabase(env as unknown as {DB?:D1Database}),query=new URL(request.url).searchParams;
 if(!query.size)return reply({finance:await readLiveManagedFinance(db,actor.id,id,Date.now())});
 if(query.size!==1||query.getAll('attempt').length!==1)return reply({error:'Use the original action reference.'},400);
 return reply({outcome:await recoverLiveManagedFinanceAction(db,actor.id,id,query.get('attempt')!)});
}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);
 try{const actor=await requireStaffApi('payout.prepare'),{id}=await context.params,body=await readBoundedJsonObject(request);return reply(await runLiveManagedFinanceAction(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,id,body));}
 catch(error){return failure(error);}
}
