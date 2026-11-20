import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {readProductCommandOutcome} from '@/lib/products/command-outcomes';
import {productOutcomeKinds,type ProductOutcomeKind} from '@/lib/products/command-outcome-contract';
import {intakeQuery,intakeReply,intakeFailure,intakeActor} from '@/lib/products/intake-http';
import {OfferError} from '@/lib/products/offer-contracts';
export async function GET(request:Request){try{const actor=await requireSellerCenterApi();intakeActor(request,actor.userId);const query=intakeQuery(request,['kind','sourceId','requestId','action','relatedId']),kind=query.get('kind');if(!productOutcomeKinds.includes(kind as ProductOutcomeKind))throw new OfferError('Choose an original Product action source.',400);return intakeReply(await readProductCommandOutcome(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,'seller',{kind:kind as ProductOutcomeKind,sourceId:query.get('sourceId')??'',requestId:query.get('requestId')??'',action:query.get('action')??'',...(query.has('relatedId')?{relatedId:query.get('relatedId')??''}:{})}));}catch(error){return error instanceof SellerCenterAuthorizationError?intakeReply({error:error.message},error.status):intakeFailure(error);}}
