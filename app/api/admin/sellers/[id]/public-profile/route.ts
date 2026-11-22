import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {staffPublicProfileCommand} from '@/lib/sellers/public-profile-commands';
import {PublicProfileError} from '@/lib/sellers/public-profile-types';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{
  const staff=await requireStaffApi('seller.application.review');
  if(hasActorIntentMismatch(request,staff.id))throw new StaffAuthorizationError('The signed-in staff account changed. Reopen this review for your current account.',403);
  if(staff.role!=='super_admin')return reply({error:'An eligible Super Admin must make the final profile decision.'},403);
  const body=await readBoundedJsonObject(request),db=requireDatabase(env as unknown as {DB?:D1Database});
  const result=await staffPublicProfileCommand(db,(await context.params).id,staff.id,body,Date.now());
  return reply({ok:true,result:result??null});
 }catch(error){
  if(error instanceof StaffAuthorizationError||error instanceof PublicProfileError)return reply({error:error.message},error.status);
  if(error instanceof SyntaxError)return reply({error:'Invalid profile command.'},400);
  if(error instanceof BodyTooLargeError)return reply({error:error.message},413);
  return reply({error:'The profile decision could not be confirmed. Keep your comparison and retry the same request.'},503);
 }
}
