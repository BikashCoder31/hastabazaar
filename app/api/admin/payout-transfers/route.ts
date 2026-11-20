import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {resolveRuntimeEnvironment} from '@/lib/staging/environment';
import {RefundObligationError} from '@/lib/payments/refund-obligations';
import {FinanceEvidenceAccessError} from '@/lib/payments/refund-evidence';
import * as payouts from '@/lib/payments/payout-transfers';
import type {CommandContext} from '@/lib/workflows/contracts';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
function financeActorIntent(request:Request,actorId:string){if(hasActorIntentMismatch(request,actorId))throw new StaffAuthorizationError('The signed-in account changed. Refresh this Finance view before using its retained fields.',403);}
const handlers={prepare:payouts.preparePayoutTransfer,approve:payouts.approvePayoutTransfer,start:payouts.startPayoutTransfer,outcome:payouts.recordPayoutTransferOutcome,void:payouts.voidUnsentPayoutTransfer};
const fields:Record<keyof typeof handlers,readonly string[]>={prepare:['model','payoutId','accountVersionId','reason'],approve:['packetId','reason'],start:['packetId','reason'],outcome:['packetId','outcome','reason','evidenceReference','amountPaisa','bankAt','transactionIdentity','completedTransferConfirmed','exactBeneficiaryConfirmed','failureBasis','noDebitConfirmed','returnedAmountPaisa','returnedDebitConfirmed'],void:['packetId','notSentConfirmed','reason','evidenceReference']};
const permission=(action:string)=>action==='prepare'||action==='prepared'?'payout.prepare':action==='approve'||action==='approved'?'payout.approve':'payout.mark_paid';
function failure(error:unknown){
 if(error instanceof payouts.PayoutTransferError||error instanceof RefundObligationError||error instanceof StaffAuthorizationError||error instanceof FinanceEvidenceAccessError)return reply({error:error.message},error.status);
 if(error instanceof BodyTooLargeError)return reply({error:'Request too large.'},413);
 if(error instanceof SyntaxError)return reply({error:'Use the current protected payout action.'},400);
 return reply({error:'The financial result could not be confirmed. Check the original saved outcome before retrying.'},503);
}
export async function GET(request:Request){try{
 const actor=await requireStaffApi('payout.prepare'),query=(financeActorIntent(request,actor.id),new URL(request.url).searchParams),attempt=query.get('attempt');
 if(!attempt||!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,190}$/.test(attempt)||[...query.keys()].some(key=>key!=='attempt')||query.getAll('attempt').length!==1)return reply({error:'Use the original saved request reference.'},400);
 const row=await requireDatabase(env as unknown as {DB?:D1Database}).prepare("SELECT command_result_json AS result,action FROM audit_logs WHERE actor_id=? AND request_id=? AND action LIKE 'payout.transfer.%' AND command_key IS NOT NULL").bind(actor.id,attempt).first<{result:string;action:string}>();
 if(row){const action=row.action.slice('payout.transfer.'.length),current=await requireStaffApi(permission(action));if(action!=='prepared'&&current.role!=='super_admin')return reply({error:'Current eligible Super Admin access is required for this decision outcome.'},403);}
 return reply({outcome:row?JSON.parse(row.result):null});
 }catch(error){return failure(error);}}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);
 try{
  const body=await readBoundedJsonObject(request),action=body.action as keyof typeof handlers;
  if(body.sourceFormId!=='system.payout-finance'||!Object.hasOwn(handlers,action)||typeof body.requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,190}$/.test(body.requestId)||Object.keys(body).some(key=>!['sourceFormId','action','requestId','expectedRevision','input'].includes(key))||!body.input||typeof body.input!=='object'||Array.isArray(body.input))return reply({error:'Use the current protected payout action.'},400);
  const input=body.input as Record<string,unknown>;
  if(Object.keys(input).some(key=>!fields[action].includes(key))||typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.length>1500||
   (action==='prepare'?body.expectedRevision!==null||!['registered','managed','fixed'].includes(String(input.model))||typeof input.payoutId!=='string'||typeof input.accountVersionId!=='string':typeof body.expectedRevision!=='string'||!/^(0|[1-9]\d{0,15})$/.test(body.expectedRevision)||typeof input.packetId!=='string'))return reply({error:'Review the original source, exact revision and required reason.'},400);
  const actor=await requireStaffApi(permission(action));financeActorIntent(request,actor.id);if(action!=='prepare'&&actor.role!=='super_admin')return reply({error:'An eligible Super Admin must make this financial decision.'},403);
  const bindings=env as unknown as Record<string,string>,environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
  const run=handlers[action] as (db:D1Database,ctx:CommandContext,input:never)=>Promise<unknown>;
  return reply(await run(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:actor.id,requestId:body.requestId,expectedRevision:body.expectedRevision as string|null,now:Date.now()},{...input,environment} as never));
 }catch(error){return failure(error);}
}
