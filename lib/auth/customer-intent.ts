import * as customerAuth from '@/lib/auth/customer';
import {ACTOR_INTENT_HEADER,hasActorIntentMismatch} from '@/lib/http/actor-intent';
import type {CustomerUser} from '@/lib/auth/customer';

export function assertCustomerIntent(request:Request,actorId:string):void {
  if(hasActorIntentMismatch(request,actorId))throw new customerAuth.CustomerAuthorizationError('Your signed-in account changed. Refresh this page before continuing.',403);
}

export function requireCustomerIntentApi(request:Request):Promise<CustomerUser>;
export function requireCustomerIntentApi(request:Request,legacyResolver:()=>Promise<CustomerUser|null>):Promise<CustomerUser|null>;
/** An expected account is reject-only intent. Resolve it without provisioning any user or role. */
export async function requireCustomerIntentApi(request:Request,legacyResolver:()=>Promise<CustomerUser|null>=customerAuth.requireCustomerApi):Promise<CustomerUser|null> {
  const customer=request.headers.has(ACTOR_INTENT_HEADER)
    ? await customerAuth.requireExistingCustomerApi()
    : await legacyResolver();
  if(customer)assertCustomerIntent(request,customer.userId);
  return customer;
}
