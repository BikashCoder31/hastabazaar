 'use client';
import {ProtectedReviewForm} from './protected-review-form';
export function ProtectedIdentityReview({actorId,caseId,version,identityRevision,bankRevision,canDecide=true}:{actorId:string;caseId:string;version:number;identityRevision:number;bankRevision:number;canDecide?:boolean}){
 return <ProtectedReviewForm actorId={actorId} action="verify-identity" sourceId={caseId} revision={JSON.stringify([version,identityRevision,bankRevision])} canDecide={canDecide} title="Review proposed protected identity" submitLabel="Verify proposed identity" makePayload={form=>({version,identityRevision,bankRevision,sameLegalPersonConfirmed:form.get('confirmed')==='yes',evidenceReference:form.get('reference'),reason:form.get('reason')})} description={<p className="text-sm">This decision applies the verified facts and retains original agreements. It does not release holds, approve a new seller or execute payments.</p>}>
<label className="flex gap-2 text-sm"><input type="checkbox" name="confirmed" value="yes" required/>I inspected the actual current documents, confirmed their validity and verified that the proposed facts identify the same legal person or entity.</label>
    <label className="block text-sm">Verification reference<input name="reference" minLength={4} maxLength={191} required className="mt-1 block w-full rounded border bg-background p-2"/></label>
    <label className="block text-sm">Review reason<textarea name="reason" minLength={10} maxLength={1000} required className="mt-1 block min-h-24 w-full rounded border bg-background p-2"/></label>
 </ProtectedReviewForm>;
}
