import {intakeErrorReply} from '@/lib/products/intake-http';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {intakeFailure} from '@/lib/products/intake-http';
import {readProductConcernHttp,writeProductConcernHttp} from '@/lib/products/priority-http';
async function run(request:Request,write:boolean){try{const actor=await requireStaffApi('product.review');return await(write?writeProductConcernHttp:readProductConcernHttp)(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,request,'admin');}catch(error){return error instanceof StaffAuthorizationError?intakeErrorReply(error.message,error.status,write?'rejected_before_write':undefined):intakeFailure(error,write?'rejected_before_write':undefined);}}
export const GET=(request:Request)=>run(request,false);
export const POST=(request:Request)=>run(request,true);
