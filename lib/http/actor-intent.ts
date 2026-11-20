/** Reject-only UI intent. Authentication, current permissions and native source guards remain authoritative. */
export const ACTOR_INTENT_HEADER='X-Hastabazaar-Actor';
export function hasActorIntentMismatch(request:Request,authenticatedActorId:string|null):boolean{
 const intended=request.headers.get(ACTOR_INTENT_HEADER);
 return intended!==null&&intended!==(authenticatedActorId??'');
}
