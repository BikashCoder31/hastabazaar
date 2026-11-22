import {intakeErrorReply} from '@/lib/products/intake-http';
import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {intakeFailure} from '@/lib/products/intake-http';
import {readProductConcernHttp,writeProductConcernHttp} from '@/lib/products/priority-http';
async function run(request:Request,write:boolean){try{const actor=await requireSellerCenterApi();return await(write?writeProductConcernHttp:readProductConcernHttp)(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,request,'seller');}catch(error){return error instanceof SellerCenterAuthorizationError?intakeErrorReply(error.message,error.status,write?'rejected_before_write':undefined):intakeFailure(error,write?'rejected_before_write':undefined);}}
export const GET=(request:Request)=>run(request,false);
export const POST=(request:Request)=>run(request,true);
