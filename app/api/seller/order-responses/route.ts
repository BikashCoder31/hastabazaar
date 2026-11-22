import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {handlePreparationCommand} from '@/lib/orders/response-http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return POST(request);}
export async function POST(request:Request){
 let viewer:Awaited<ReturnType<typeof requireSellerCenterApi>>|undefined;
 const confirm=async()=>{if(!viewer)return;const current=await requireSellerCenterApi();if(current.userId!==viewer.userId||current.authSubject!==viewer.authSubject)throw new SellerCenterAuthorizationError('Current preparation identity changed.',403);};
 try{viewer=await requireSellerCenterApi();const response=await handlePreparationCommand(request,requireDatabase(env as unknown as {DB?:D1Database}),viewer.userId,'seller',{actorAuthSubject:viewer.authSubject});await confirm();return response;}
 catch(error){try{await confirm();}catch(current){if(current instanceof SellerCenterAuthorizationError)return Response.json({error:current.message},{status:current.status,headers:{'cache-control':'no-store'}});}
  if(error instanceof SellerCenterAuthorizationError)return Response.json({error:error.message},{status:error.status,headers:{'cache-control':'no-store'}});console.error('Preparation action failed',error);return Response.json({error:'The saved outcome could not be confirmed. Retry the same request.'},{status:500,headers:{'cache-control':'no-store'}});}
}
