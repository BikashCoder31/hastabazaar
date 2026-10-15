'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ManagedTermsOffer } from '@/lib/managed-commerce/accepted-terms';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { getOrCreateSessionAttempt, clearSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { Button } from '@/components/ui/button';

const formId = 'seller.managed-terms-acceptance';
const baseKeys = ['offerId', 'context', 'language', 'accepted', 'requestId', 'sellerId', 'formVersion', 'customAnswers'];
const date = (at: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', dateStyle: 'medium', timeStyle: 'short' }).format(at);
export function ManagedTermsAcceptance({ sellerId, offer, future, alreadyAccepted }: {
  sellerId: string; offer: ManagedTermsOffer; future: boolean; alreadyAccepted: boolean;
}) {
  const catalog = usePublishedFormConfig(formId, { enabled: !alreadyAccepted });
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !catalog.canSubmit || !catalog.config) return;
    const element = event.currentTarget;
    setBusy(true); setMessage('');
    const key = sessionAttemptKey(formId, `${sellerId}:${offer.id}`);
    try {
      const configured = readConfiguredSubmission(element, catalog.config, baseKeys);
      const requestId = getOrCreateSessionAttempt(key);
      const response = await fetch('/api/seller-applications/managed-terms', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: offer.id, context: offer.context, language: offer.language, accepted: true, requestId,
          ...configuredJsonPayload(catalog.config, configured.answers, baseKeys) }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; code?: string; detailId?: string; offerId?: string } | null;
      catalog.handleSubmissionResponse(response, result?.code);
      if (!response.ok || result?.ok !== true || result.offerId !== offer.id || typeof result.detailId !== 'string')
        throw new Error(result?.error ?? 'Acceptance is uncertain. Keep the same details and retry to recover its result.');
      clearSessionAttempt(key); setMessage('Terms accepted. Earlier sales keep their original terms.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Acceptance could not be confirmed. Retry the same details.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl border bg-card p-6">
    <h2 className="font-heading text-2xl">{future ? 'Upcoming company-store terms' : 'Current company-store terms'}</h2>
    <p>Sold by {offer.snapshot.company.legalName} through {offer.snapshot.companyAccount.storeName}.</p>
    <p>Company keeps {offer.retentionBps / 100}%. You receive {(10000 - offer.retentionBps) / 100}% of eligible product value after a completed, paid sale.</p>
    {future ? <p>Starts {date(offer.effectiveFrom)} Nepal time. Acceptance now keeps today’s agreement unchanged until this time.</p> : null}
    <details><summary className="cursor-pointer font-semibold">Read the full selling terms</summary><ul className="mt-3 list-disc space-y-3 pl-5">{offer.snapshot.terms.map(term => <li key={term}>{term}</li>)}</ul></details>
    {alreadyAccepted ? <p className="font-semibold">You have accepted these terms.</p> : <form onSubmit={event => void submit(event)} className="space-y-4" data-form-id={formId}>
      <label className="flex items-start gap-3"><input type="checkbox" required name="accepted" disabled={busy} className="mt-1" />
        <span>I have read and accept the English selling terms, company identity and payment rate shown above.</span></label>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={baseKeys} /> : null}
      {catalog.status !== 'ready' ? <p role="alert">{catalog.message || 'Loading the terms form…'}</p> : null}
      <Button type="submit" disabled={busy || !catalog.canSubmit}>{busy ? 'Saving acceptance…' : 'Accept these terms'}</Button>
    </form>}
    {message ? <output className="block">{message}</output> : null}
  </section>;
}
