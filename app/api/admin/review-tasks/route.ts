import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {assignReviewTask,ReviewTaskConflict} from '@/lib/workflows/review-tasks';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{
  const body=await readBoundedJsonObject(request);
  if(Object.keys(body).some(key=>!['taskId','ownerId','expectedRevision','requestId','reason'].includes(key))||typeof body.taskId!=='string'||body.taskId.length<1||body.taskId.length>191||!(body.ownerId===null||typeof body.ownerId==='string'&&body.ownerId.length>=1&&body.ownerId.length<=191)||typeof body.expectedRevision!=='string'||!/^\d+$/.test(body.expectedRevision)||typeof body.requestId!=='string'||body.requestId.length<8||body.requestId.length>100||typeof body.reason!=='string')return reply({error:'Invalid review assignment.'},400);
  const db=requireDatabase(env as unknown as {DB?:D1Database});
  // The native source command enforces its exact current permission, party scope and commit guards.
  const staff=await requireStaffApi('account.self.manage');
  if(request.headers.has('X-Hastabazaar-Actor')&&request.headers.get('X-Hastabazaar-Actor')!==staff.id)return reply({error:'The signed-in staff account changed. Open this original task again before assigning it.'},403);
  await assignReviewTask(db,{actorId:staff.id,requestId:body.requestId,expectedRevision:body.expectedRevision,now:Date.now()},{taskId:body.taskId,ownerId:body.ownerId,reason:body.reason});
  return reply({ok:true});
 }catch(error){
  if(error instanceof StaffAuthorizationError)return reply({error:error.message},error.status);
  if(error instanceof ReviewTaskConflict)return reply({error:error.message},409);
  if(error instanceof BodyTooLargeError)return reply({error:error.message},413);
  if(error instanceof SyntaxError)return reply({error:'Invalid assignment command.'},400);
  return reply({error:'Assignment could not be confirmed. Keep the same request and retry.'},503);
 }
}
