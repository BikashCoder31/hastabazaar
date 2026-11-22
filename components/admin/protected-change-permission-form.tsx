 'use client';
import {ProtectedReviewForm} from './protected-review-form';
export function ProtectedChangePermissionForm({actorId,caseId,version,identityRevision,bankRevision,canDecide=true}:{actorId:string;caseId:string;version:number;identityRevision:number;bankRevision:number;canDecide?:boolean}){
 return <ProtectedReviewForm actorId={actorId} action="permission" sourceId={caseId} revision={JSON.stringify([version,identityRevision,bankRevision])} canDecide={canDecide} title="Review exact replacement scope" submitLabel="Record scope decision" makePayload={data=>({decision:data.get('decision'),reason:data.get('reason'),version,identityRevision,bankRevision})} description={<p className="text-sm">Permission does not verify replacement evidence, restore ordering or release an unrelated hold.</p>}>
<label className="block text-sm">Exact scope decision<select name="decision" className="mt-1 block w-full rounded border bg-background p-2" required defaultValue=""><option value="" disabled>Choose a decision</option><option value="permit">Permit this exact replacement scope</option><option value="clarify">Request clarification</option><option value="reject">Reject this requested scope</option></select></label>
    <label className="block text-sm">Seller-visible reason<textarea name="reason" required minLength={10} maxLength={1000} className="mt-1 block min-h-24 w-full rounded border bg-background p-2"/></label>
    
 </ProtectedReviewForm>;
}
