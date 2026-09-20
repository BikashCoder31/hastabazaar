import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedBody} from '@/lib/http/bounded-body';
import {saveDeliveryRates,DeliveryRateConflictError} from '@/lib/db/repositories/delivery-rates';
export async function PUT(request:Request){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);
 try{
 const staff=await requireStaffApi('admin.invite');if(staff.role!=='super_admin')return reply({error:'Only the Super Admin can change delivery rates.'},403);
 let body:Record<string,unknown>;try{body=JSON.parse(new TextDecoder().decode(await readBoundedBody(request,16384))) as Record<string,unknown>;if(!body||Array.isArray(body))throw new Error();}catch{return reply({error:'Invalid or oversized request.'},400);}
 await saveDeliveryRates(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:staff.id,expectedVersion:typeof body.expectedVersion==='string'?body.expectedVersion:'',rates:body.rates,reason:typeof body.reason==='string'?body.reason:'',now:Date.now()});return reply({saved:true});
 }catch(error){return reply({error:error instanceof StaffAuthorizationError||error instanceof DeliveryRateConflictError?error.message:'Check delivery rates and try again.'},error instanceof StaffAuthorizationError?error.status:error instanceof DeliveryRateConflictError?409:400);}
}
