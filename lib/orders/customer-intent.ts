import {CustomerAuthorizationError,getCustomerUser,type CustomerUser} from '@/lib/auth/customer';
import {requireCustomerIntentApi} from '@/lib/auth/customer-intent';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';

type OrderCustomerIntent={ok:true;customer:CustomerUser|null}|{ok:false;error:string;status:401|403};
/** Preserve genuine anonymous receipt access; an authenticated principal without an account is not that guest. */
export async function readOrderCustomerIntent(request:Request):Promise<OrderCustomerIntent>{
 try{return{ok:true,customer:await requireCustomerIntentApi(request,getCustomerUser)};}
 catch(error){
  if(!(error instanceof CustomerAuthorizationError))throw error;
  // The read-only resolver uses401 only for absent authentication; missing/inactive accounts use403.
  if(error.status===401&&request.headers.get(ACTOR_INTENT_HEADER)==='')return{ok:true,customer:null};
  return{ok:false,error:error.message,status:error.status};
 }
}
