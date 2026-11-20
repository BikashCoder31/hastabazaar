 'use client';
import {Input} from '@/components/ui/input';
import {ProtectedReviewForm} from './protected-review-form';
export function SellerBankReview({actorId,sellerId,revision,changeRequestId,canDecide=true}:{actorId:string;sellerId:string;revision:string;changeRequestId?:string;canDecide?:boolean}){
 return <ProtectedReviewForm actorId={actorId} action="bank-details" sourceId={sellerId} revision={revision} canDecide={canDecide} title="Review submitted bank details" submitLabel="Confirm bank verification" makePayload={data=>({revision,reference:data.get('reference'),reason:data.get('reason'),ownershipBasis:data.get('ownershipBasis'),identityEvidenceConfirmed:data.get('identityEvidenceConfirmed')==='yes',releaseBankHold:data.get('holdDisposition')==='release',...(changeRequestId?{changeRequestId}:{})})} description={<p className="text-sm">Inspect private bank and identity evidence independently. Only this bank case&apos;s recorded hold disposition changes; other holds and payout checks still apply.</p>}>
<label className="block text-sm">Verified legal account owner<select name="ownershipBasis" className="mt-1 block w-full rounded border bg-background p-2" required defaultValue=""><option value="" disabled>Select the evidenced relationship</option><option value="same_person">The individual seller</option><option value="same_legal_entity">The registered legal entity</option></select></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="identityEvidenceConfirmed" value="yes" required/>I inspected current identity and actual account ownership evidence. Matching names alone are insufficient; this is not an unrelated third-party account.</label>
    <label htmlFor="bank-review-reference" className="block text-sm">Internal verification reference<Input id="bank-review-reference" name="reference" required minLength={4} maxLength={200} /></label>
    <label htmlFor="bank-review-reason" className="block text-sm">Review reason<Input id="bank-review-reason" name="reason" required minLength={8} maxLength={1000} /></label>
    <label className="block text-sm">This bank case&apos;s payout hold<select name="holdDisposition" className="mt-1 block w-full rounded border bg-background p-2" required defaultValue=""><option value="" disabled>Record an explicit disposition</option><option value="release">Release this bank case&apos;s payout hold</option><option value="keep">Keep the hold for further review</option></select></label>
    
 </ProtectedReviewForm>;
}
