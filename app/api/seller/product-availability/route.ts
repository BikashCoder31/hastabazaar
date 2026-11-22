import {intakeErrorReply,type ProductMutationPhase} from '@/lib/products/intake-http';
import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {intakeFailure} from '@/lib/products/intake-http';
import {readAvailabilityHttp,mutateAvailabilityHttp} from '@/lib/products/availability-http';
const failure=(error:unknown,phase?:ProductMutationPhase)=>error instanceof SellerCenterAuthorizationError?intakeErrorReply(error.message,error.status,phase):intakeFailure(error,phase);
export async function GET(request:Request){try{const actor=await requireSellerCenterApi();return await readAvailabilityHttp(request,requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,'owner');}catch(error){return failure(error);}}
export async function POST(request:Request){try{const actor=await requireSellerCenterApi();return await mutateAvailabilityHttp(request,requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,'owner');}catch(error){return failure(error,'rejected_before_write');}}
