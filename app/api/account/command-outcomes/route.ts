import {env} from 'cloudflare:workers';
import {requireExistingCustomerApi,CustomerAuthorizationError} from '@/lib/auth/customer';
import {assertCustomerIntent} from '@/lib/auth/customer-intent';
import {requireDatabase} from '@/lib/db/d1';
import {readAccountCommandOutcome,AccountCommandOutcomeError} from '@/lib/account/command-outcomes';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const customer=await requireExistingCustomerApi();assertCustomerIntent(request,customer.userId);const query=new URL(request.url).searchParams;
 if([...query.keys()].some(key=>!['action','sourceId','requestId','relatedId'].includes(key)||query.getAll(key).length!==1))throw new AccountCommandOutcomeError('Identify one exact original account action.');
 const result=await readAccountCommandOutcome(requireDatabase(env as unknown as{DB?:D1Database}),customer.userId,{action:query.get('action'),sourceId:query.get('sourceId'),requestId:query.get('requestId'),...(query.has('relatedId')?{relatedId:query.get('relatedId')}:{})});
 return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){if(error instanceof CustomerAuthorizationError||error instanceof AccountCommandOutcomeError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'private, no-store'}});return Response.json({error:'The original account result could not be checked. Keep its reference and retry.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}}
