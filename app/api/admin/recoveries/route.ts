import {getRecoveryReceiptReversalReview} from '@/lib/payments/recovery-receipt-disposition';
import {ManualPaymentError} from '@/lib/payments/manual-receipts';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {resolveRuntimeEnvironment} from '@/lib/staging/environment';
import {SellerRecoveryError} from '@/lib/payments/seller-recovery';
import {FinanceEvidenceAccessError} from '@/lib/payments/refund-evidence';
import {RefundObligationError} from '@/lib/payments/refund-obligations';
import {runRecoveryCommand,recoverRecoveryCommand} from '@/lib/payments/recovery-commands';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
function actorIntent(request:Request,actorId:string){if(hasActorIntentMismatch(request,actorId))throw new StaffAuthorizationError('The signed-in account changed. Refresh this Finance view before using its retained fields.',403);}
function failure(error:unknown){if(error instanceof ManualPaymentError||error instanceof SellerRecoveryError||error instanceof StaffAuthorizationError||error instanceof FinanceEvidenceAccessError||error instanceof RefundObligationError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:'Request too large.'},413);if(error instanceof SyntaxError)return reply({error:'Use the protected recovery form.'},400);return reply({error:'The recovery outcome could not be confirmed. Check the saved action before retrying.'},503);}
export async function GET(request:Request){try{
 const actor=await requireStaffApi('payout.prepare'),query=(actorIntent(request,actor.id),new URL(request.url).searchParams);
 if(query.size===1&&query.has('reversalId'))return reply({review:await getRecoveryReceiptReversalReview(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,query.get('reversalId')!)});
 if([...query.keys()].some(key=>key!=='attempt')||query.getAll('attempt').length!==1)return reply({error:'Use the original saved action reference.'},400);
 return reply({outcome:await recoverRecoveryCommand(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,query.get('attempt')!,'staff')});
}catch(error){return failure(error);}}
export async function POST(request:Request){if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);try{
 const actor=await requireStaffApi('payout.prepare'),body=(actorIntent(request,actor.id),await readBoundedJsonObject(request)),bindings=env as unknown as {DB?:D1Database;HASTABAZAAR_RUNTIME_ENV?:string;APP_ORIGIN?:string};
 const environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
 return reply(await runRecoveryCommand(requireDatabase(bindings),actor.id,body,'staff',environment));
}catch(error){return failure(error);}}
