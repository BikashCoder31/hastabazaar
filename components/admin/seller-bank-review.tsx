'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SellerBankReview({ sellerId, revision }: { sellerId: string; revision: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true);
    try {
      const response = await fetch(`/api/admin/seller-applications/${encodeURIComponent(sellerId)}/bank-details`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, reference: data.get('reference'), reason: data.get('reason') }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Review could not be saved.');
      setMessage('Receiving account verified. Other payout eligibility checks still apply.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Reload to check the review result.'); }
    finally { setBusy(false); }
  }
  return <form data-form-id="staff.seller-bank-review" onSubmit={submit} className="space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">Review submitted bank details</h3>
    <p className="text-sm">Inspect the private bank details and evidence above, independently verify the beneficiary and account, then record the verification reference.</p>
    <label htmlFor="bank-review-reference" className="block text-sm">Internal verification reference<Input id="bank-review-reference" name="reference" required minLength={4} maxLength={200} /></label>
    <label htmlFor="bank-review-reason" className="block text-sm">Review reason<Input id="bank-review-reason" name="reason" required minLength={8} maxLength={1000} /></label>
    <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Confirm bank verification'}</Button>
    <output className="block">{message}</output>
  </form>;
}
