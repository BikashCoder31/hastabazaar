import {env} from 'cloudflare:workers';
import {requireExistingCustomerApi,CustomerAuthorizationError} from '@/lib/auth/customer';
import {hostedSessionHash} from '@/lib/auth/hosted-session';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {submitRefundDestination,RefundObligationError} from '@/lib/payments/refund-obligations';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function GET(request:Request){try{const actor=await requireExistingCustomerApi(),query=new URL(request.url).searchParams,attempt=query.get('attempt'),id=query.get('obligation');if(!attempt||!id||attempt.length>191)return json({error:'Use your original saved refund reference.'},400);const row=await requireDatabase(env as unknown as {DB?:D1Database}).prepare("SELECT a.command_result_json AS result FROM audit_logs a JOIN refund_obligations r ON r.id=a.subject_id AND r.customer_id=? WHERE a.actor_id=? AND a.subject_id=? AND a.request_id=? AND a.action='refund.destination.submitted' AND a.command_key IS NOT NULL").bind(actor.userId,actor.userId,id,attempt).first<{result:string}>();return json({outcome:row?JSON.parse(row.result):null});}catch(error){return json({error:error instanceof CustomerAuthorizationError?error.message:'Your saved refund instructions could not be checked.'},error instanceof CustomerAuthorizationError?error.status:503);}}
export async function POST(request:Request){if(!isTrustedMutationRequest(request))return json({error:'Cross-site request rejected.'},403);try{
 const actor=await requireExistingCustomerApi(),body=await readBoundedJsonObject(request),sessionHash=hostedSessionHash(request.headers);
 if(!sessionHash||body.sourceFormId!=='system.refund-destination'||typeof body.requestId!=='string'||body.expectedRevision!==null&&typeof body.expectedRevision!=='string'||Object.keys(body).some(key=>!['sourceFormId','requestId','expectedRevision','obligationId','details','relationship','authorization','evidenceReference','reason'].includes(key)))return json({error:'Use the private authenticated refund instructions form.'},400);
 const {sourceFormId,requestId,expectedRevision,...input}=body;void sourceFormId;
 return json(await submitRefundDestination(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:actor.userId,requestId,expectedRevision:expectedRevision as string|null,sessionHash,now:Date.now()},input as unknown as Parameters<typeof submitRefundDestination>[2]));
 }catch(error){return json({error:error instanceof RefundObligationError||error instanceof CustomerAuthorizationError?error.message:error instanceof BodyTooLargeError?'Request too large.':'The instructions could not be confirmed. Check the original saved outcome.'},error instanceof RefundObligationError||error instanceof CustomerAuthorizationError?error.status:error instanceof BodyTooLargeError?413:503);}}
