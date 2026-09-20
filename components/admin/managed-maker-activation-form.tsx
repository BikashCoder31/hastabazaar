'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

export function ManagedMakerActivationForm({ sellerId }: { sellerId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`/api/admin/managed-makers/${encodeURIComponent(sellerId)}/activate`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...body,agreementAcceptedAt:Date.now(),requestId:crypto.randomUUID()}),
      });
      const result = await response.json() as {error?:string};
      if (!response.ok) throw new Error(result.error ?? 'Activation failed.');
      setMessage('Simulated Managed Maker route activated for local staging.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Activation failed.'); }
    finally { setBusy(false); }
  }
  return <form className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/20" onSubmit={submit}>
    <h3 className="font-semibold">Local-staging activation only</h3>
    <p>This form is rejected outside the guarded disposable environment. All references must be fictional.</p>
    <label className="block">Commercial model<input className="mt-1 w-full rounded border p-2" value="Sale-linked: 9% platform retention / 91% maker entitlement" readOnly/></label>
    <label className="block">Simulated legal seller reference<input name="legalSellerReference" required minLength={3} maxLength={191} className="mt-1 w-full rounded border p-2" defaultValue="SIM-LEGAL-SELLER"/></label>
    <label className="block">Simulated invoice issuer reference<input name="invoiceIssuerReference" required minLength={3} maxLength={191} className="mt-1 w-full rounded border p-2" defaultValue="SIM-INVOICE-ISSUER"/></label>
    <label className="block">Simulated payout beneficiary<input name="payoutBeneficiaryReference" required minLength={3} maxLength={191} className="mt-1 w-full rounded border p-2" defaultValue="SIM-MAKER-ACCOUNT"/></label>
    <label className="block">Simulated agreement version<input name="agreementVersion" required minLength={3} maxLength={191} className="mt-1 w-full rounded border p-2" defaultValue="SIM-MANAGED-AGREEMENT-V1"/></label>
    <label className="block">Language presented<select name="agreementLanguage" className="mt-1 w-full rounded border p-2"><option value="ne">Nepali</option><option value="en">English</option></select></label>
    <Button disabled={busy}>{busy?'Activating…':'Activate simulated route'}</Button>
    <output className="block" aria-live="polite">{message}</output>
  </form>;
}
