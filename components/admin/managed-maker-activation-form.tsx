'use client';

import { FormGuide } from '@/components/forms/form-guide';
import type { ManagedMakerCompanyAccount } from '@/lib/configuration/types';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const BASE_KEYS = ['model', 'legalSellerReference', 'invoiceIssuerReference', 'payoutBeneficiaryReference',
  'agreementVersion', 'agreementLanguage', 'agreementAcceptedAt', 'requestId'];
// Hydrate the absent server snapshot; own attempt mutations rerender the client.
const subscribeToAttempt = () => () => undefined;

export function ManagedMakerActivationForm({ sellerId, companyAccount }: { sellerId: string; companyAccount?: ManagedMakerCompanyAccount }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fingerprint = useRef<string | null>(null);
  const attemptKey = sessionAttemptKey('staff.managed-maker-activation', sellerId);
  const [, setAttemptRevision] = useState(0);
  const attemptPresent = useSyncExternalStore(subscribeToAttempt,
    () => hasSessionAttempt(attemptKey), () => false);
  const catalog = usePublishedFormConfig('staff.managed-maker-activation');
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !catalog.config || !catalog.canSubmit) return;
    let configured: ReturnType<typeof configuredJsonPayload>;
    try {
      const submission = readConfiguredSubmission(event.currentTarget, catalog.config, BASE_KEYS);
      configured = configuredJsonPayload(catalog.config, submission.answers, BASE_KEYS);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review the configured fields.'); return; }
    const form = new FormData(event.currentTarget);
    const protectedFields = ['model', 'legalSellerReference', 'invoiceIssuerReference',
      'payoutBeneficiaryReference', 'agreementVersion', 'agreementLanguage'];
    const body = { ...Object.fromEntries(protectedFields.map((key) => [key, form.get(key)])), ...configured };
    const currentFingerprint = JSON.stringify(body);
    if (fingerprint.current && fingerprint.current !== currentFingerprint) {
      setMessage('This differs from the prior attempt. Check its outcome, then explicitly start a new attempt.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setAttemptRevision((revision) => revision + 1);
      fingerprint.current = currentFingerprint;
      const response = await fetch(`/api/admin/managed-makers/${encodeURIComponent(sellerId)}/activate`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...body,requestId}),
      });
      const result = await response.json().catch(() => null) as {error?:string;code?:string;ok?:boolean;simulation?:boolean}|null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error ?? 'Activation failed.');
      if (result?.ok !== true || result.simulation !== true)
        throw new Error('The response could not be verified. Retry with the same request.');
      clearSessionAttempt(attemptKey); setAttemptRevision((revision) => revision + 1); fingerprint.current = null;
      setMessage('Simulated Managed Maker route activated for local staging.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Activation failed.'); }
    finally { setBusy(false); }
  }
  return <form id="managed-maker-activation" data-form-id="staff.managed-maker-activation"
    className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/20"
    onSubmit={submit}>
    <h3 className="font-semibold">Local-staging activation only</h3>
      <FormGuide formId="staff.managed-maker-activation" />

    <a className="text-sm underline" href={`/admin/staff-form-history?kind=managed-maker-activation&id=${encodeURIComponent(sellerId)}`}>View activation form history</a>
    {companyAccount ? <p>Operational company account: {companyAccount.storeName} ({companyAccount.entityReference}). Its actual identity is recorded separately in the maker’s agreement; the references below remain fictional simulation references.</p> : null}
    <p>This form is rejected outside the guarded disposable environment. All references must be fictional.</p>
    <label className="block">Implemented commercial model<select name="model" required className="mt-1 w-full rounded border p-2"><option value="managed_sale_linked_percentage_v1">Sale-linked percentage settlement (configured rate applies)</option><option value="managed_fixed_supplier_price_v1">Fixed supplier price: owed at documented supply acceptance; no automatic percentage deduction</option></select></label>
    <label className="block">Simulated legal seller reference<input name="legalSellerReference" required minLength={3} maxLength={191} className="mt-1 w-full rounded border p-2" defaultValue="SIM-LEGAL-SELLER"/></label>
    <label className="block">Simulated invoice issuer reference<input name="invoiceIssuerReference" required minLength={3} maxLength={191} className="mt-1 w-full rounded border p-2" defaultValue="SIM-INVOICE-ISSUER"/></label>
    <label className="block">Simulated payout beneficiary<input name="payoutBeneficiaryReference" required minLength={3} maxLength={191} className="mt-1 w-full rounded border p-2" defaultValue="SIM-MAKER-ACCOUNT"/></label>
    <label className="block">Simulated agreement version<input name="agreementVersion" required minLength={3} maxLength={191} className="mt-1 w-full rounded border p-2" defaultValue="SIM-MANAGED-AGREEMENT-V1"/></label>
    <label className="block">Language presented<select name="agreementLanguage" className="mt-1 w-full rounded border p-2"><option value="ne">Nepali</option><option value="en">English</option></select></label>
    {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /> : null}
    {!catalog.canSubmit ? <output aria-live="polite" className="block">{catalog.message || 'Form configuration is loading.'}</output> : null}
    {attemptPresent ? <p>A prior activation may have succeeded. Retry only identical details, or check the seller record before starting a new attempt.</p> : null}
    {attemptPresent ? <Button type="button" variant="outline" disabled={busy}
      onClick={() => { if (window.confirm('This activation may already have succeeded. Check the seller record first. Start a new request reference?')) {
        clearSessionAttempt(attemptKey); setAttemptRevision((revision) => revision + 1); fingerprint.current = null; setMessage('');
        if (catalog.status === 'stale') catalog.refresh();
      } }}>Start a new attempt</Button> : null}
    <Button type="submit" disabled={busy || !catalog.canSubmit}>{busy?'Activating…':'Activate simulated route'}</Button>
    <output className="block" aria-live="polite">{message}</output>
  </form>;
}
