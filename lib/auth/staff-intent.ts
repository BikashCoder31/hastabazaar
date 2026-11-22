import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {ACTOR_INTENT_HEADER,hasActorIntentMismatch} from '../http/actor-intent';
import type {Permission} from '../marketplace/permissions';

/** Reject UI identity drift before invitation acceptance; intent never grants access. */
export async function requireStaffIntentApi(request:Request,permission:Permission,expectedActorId?:string){
 const intended=request.headers.get(ACTOR_INTENT_HEADER);
 if(expectedActorId!==undefined&&intended!==null&&intended!==expectedActorId)
  throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
 const selected=expectedActorId??intended;
 const actor=await requireStaffApi(permission,selected===null?undefined:{intendedActorId:selected});
 if(hasActorIntentMismatch(request,actor.id)||(expectedActorId!==undefined&&actor.id!==expectedActorId))
  throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
 return actor;
}

/** New outcome readers must not accept/provision even when no UI header exists. */
export async function requireExistingStaffIntentApi(request:Request,permission:Permission){
 const intended=request.headers.get(ACTOR_INTENT_HEADER);
 const actor=await requireStaffApi(permission,intended===null?{}:{intendedActorId:intended});
 if(hasActorIntentMismatch(request,actor.id))
  throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
 return actor;
}
