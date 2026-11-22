import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readReviewContinuation} from '@/lib/admin/review-continuation';
import {resolveRuntimeEnvironment} from '@/lib/staging/environment';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 try{const actor=await requireStaffApi('account.self.manage');if(request.headers.has('X-Hastabazaar-Actor')&&request.headers.get('X-Hastabazaar-Actor')!==actor.id)return reply({error:'The signed-in staff account changed. Open the original task again.'},403);const bindings=env as unknown as Record<string,string|undefined>,environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});return reply(await readReviewContinuation(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,new URL(request.url).searchParams.get('returnTo'),{environment}));}
 catch(error){if(error instanceof StaffAuthorizationError)return reply({error:error.message},error.status);return reply({error:'The next task could not be checked. Return to results and refresh the current source.'},503);}
}
