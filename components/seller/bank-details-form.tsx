'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SellerBankDetailsForm() {
  const [state, setState] = useState<{ status: string; revision: string } | null>(null);
  const [message, setMessage] = useState('Loading bank details status…');
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch('/api/seller/bank-details', { cache: 'no-store' });
    const body = await response.json() as { status: string; revision: string; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Bank details could not be loaded.');
    return body;
  }
  useEffect(() => { void load().then(body => { setState(body); setMessage(''); }).catch(error => setMessage(error.message)); }, []);
  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault(); if (!state || busy) return;
    const form = event.currentTarget;
    const data = new FormData(form); data.set('revision', state.revision);
    setBusy(true);
    try {
      const response = await fetch('/api/seller/bank-details', { method: 'POST', body: data });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Bank details could not be saved.');
      setState(await load()); form.reset(); setMessage('Bank details submitted for review. Payouts remain blocked until verification is complete.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save could not be confirmed. Reload to check before retrying.'); }
    finally { setBusy(false); }
  }
  return <section id="bank-details" className="space-y-4 rounded-2xl border bg-card p-6">
    <h2 className="font-heading text-2xl">Bank details for payouts</h2>
    <p className="text-sm text-muted-foreground">Add these details when you are ready. Staff must review the beneficiary and bank evidence before processing payouts. Never enter a banking password, PIN or OTP.</p>
    <output className="block">{message || (state?.status === 'verified' ? 'Your receiving account has been reviewed. Contact support if it needs changing.' : state?.status === 'pending' ? 'Your bank details are awaiting review. You can replace them below if corrections are needed.' : 'Bank details have not been added. Payouts are unavailable until review is complete.')}</output>
    {state && state.status !== 'verified' ? <form data-form-id="seller.bank-details" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {([['payoutBeneficiary', 'Account beneficiary name'], ['bankName', 'Bank name'], ['bankBranch', 'Bank branch'], ['bankAccountNumber', 'Bank account number']] as const).map(([name, label]) =>
        <label key={name} className="space-y-2 text-sm">{label} *<Input name={name} required minLength={name === 'bankAccountNumber' ? 4 : 3} maxLength={name === 'bankAccountNumber' ? 40 : 160} autoComplete="off" spellCheck={false} /></label>)}
      <label htmlFor="payout-bank-evidence" className="space-y-2 text-sm sm:col-span-2">Bank evidence showing the beneficiary and account *<Input id="payout-bank-evidence" name="bankVerification" type="file" required accept="application/pdf,image/jpeg,image/png" /><span>PDF, JPG or PNG, up to 5 MB. Stored privately.</span></label>
      <Button disabled={busy} type="submit">{busy ? 'Submitting…' : 'Submit bank details for review'}</Button>
    </form> : null}
  </section>;
}
