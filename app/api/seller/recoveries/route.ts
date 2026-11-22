import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {SellerRecoveryError} from '@/lib/payments/seller-recovery';
import {runRecoveryCommand,recoverRecoveryCommand} from '@/lib/payments/recovery-commands';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
function actorIntent(request:Request,actorId:string){if(hasActorIntentMismatch(request,actorId))throw new SellerCenterAuthorizationError('The signed-in account changed. Refresh this recovery view before using its retained fields.',403);}
function failure(error:unknown){if(error instanceof SellerRecoveryError||error instanceof SellerCenterAuthorizationError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:'Request too large.'},413);if(error instanceof SyntaxError)return reply({error:'Use your original recovery statement.'},400);return reply({error:'Your saved response could not be confirmed. Check its original outcome before retrying.'},503);}
export async function GET(request:Request){try{const actor=await requireSellerCenterApi(),query=(actorIntent(request,actor.userId),new URL(request.url).searchParams);if([...query.keys()].some(key=>key!=='attempt')||query.getAll('attempt').length!==1)return reply({error:'Use your original saved action reference.'},400);return reply({outcome:await recoverRecoveryCommand(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,query.get('attempt')!,'seller')});}catch(error){return failure(error);}}
export async function POST(request:Request){if(!isTrustedMutationRequest(request))return reply({error:'Cross-site request rejected.'},403);try{const actor=await requireSellerCenterApi(),body=(actorIntent(request,actor.userId),await readBoundedJsonObject(request));return reply(await runRecoveryCommand(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,body,'seller'));}catch(error){return failure(error);}}
