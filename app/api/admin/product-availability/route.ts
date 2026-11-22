import {intakeErrorReply,type ProductMutationPhase} from '@/lib/products/intake-http';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {intakeFailure} from '@/lib/products/intake-http';
import {readAvailabilityHttp,mutateAvailabilityHttp} from '@/lib/products/availability-http';
const failure=(error:unknown,phase?:ProductMutationPhase)=>error instanceof StaffAuthorizationError?intakeErrorReply(error.message,error.status,phase):intakeFailure(error,phase);
export async function GET(request:Request){try{const actor=await requireStaffApi('product.review');return await readAvailabilityHttp(request,requireDatabase(env as unknown as {DB?:D1Database}),actor.id,'staff');}catch(error){return failure(error);}}
export async function POST(request:Request){try{const actor=await requireStaffApi('product.review');return await mutateAvailabilityHttp(request,requireDatabase(env as unknown as {DB?:D1Database}),actor.id,'staff');}catch(error){return failure(error,'rejected_before_write');}}
