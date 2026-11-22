'use client';
import { useState,useEffect,useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ManagedTermsOffer } from '@/lib/managed-commerce/accepted-terms';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import {readManagedTermsAttempt,retainManagedTermsAttempt,verifiedManagedTermsReceipt,managedTermsAttemptKey,type ManagedTermsAttempt} from './managed-terms-attempt';
import { Button } from '@/components/ui/button';

const formId = 'seller.managed-terms-acceptance';
const baseKeys = ['offerId', 'context', 'language', 'accepted', 'requestId', 'sellerId', 'formVersion', 'customAnswers'];
const date = (at: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', dateStyle: 'medium', timeStyle: 'short' }).format(at);
export function ManagedTermsAcceptance({ ownerId,sellerId, offer:currentOffer, future, alreadyAccepted,recovery=false }: {
  ownerId:string;sellerId: string; offer: ManagedTermsOffer; future: boolean; alreadyAccepted: boolean;recovery?:boolean;
}) {
  const catalog = usePublishedFormConfig(formId, { enabled: !alreadyAccepted });
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [attempt,setAttempt]=useState<ManagedTermsAttempt|null>(null),[loaded,setLoaded]=useState(false),[storageError,setStorageError]=useState('');
  const [confirmedOffer,setConfirmedOffer]=useState<string|null>(null);
  const busyRef=useRef(false);const offer=attempt?.offer??currentOffer;
  useEffect(()=>{let live=true;Promise.resolve().then(async()=>{
    const prior=await readManagedTermsAttempt(sessionStorage,ownerId,sellerId,currentOffer.id);
    if(live){setAttempt(prior);setLoaded(true);}
  }).catch(cause=>{if(live){setStorageError(cause instanceof Error?cause.message:'The saved acceptance needs review.');setLoaded(true);}});return()=>{live=false;};},[ownerId,sellerId,currentOffer.id]);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current||!loaded||storageError||!attempt&&(!catalog.canSubmit||!catalog.config)) return;
    const element = event.currentTarget;
    busyRef.current=true;setBusy(true); setMessage('');
    try {
      let original=attempt;
      if(!original){if(!element.reportValidity())return;const config=catalog.config!;
        const configured=readConfiguredSubmission(element,config,baseKeys);const requestId=crypto.randomUUID();
        original=await retainManagedTermsAttempt(sessionStorage,ownerId,sellerId,offer,config,{offerId:offer.id,context:offer.context,language:offer.language,accepted:true,requestId,
          ...configuredJsonPayload(config,configured.answers,baseKeys)});setAttempt(original);}
      const response = await fetch('/api/seller-applications/managed-terms', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(original.body) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; code?: string; detailId?: string; offerId?: string } | null;
      catalog.handleSubmissionResponse(response, result?.code);
      if (!response.ok || !verifiedManagedTermsReceipt(original,result))
        throw new Error(result?.error ?? 'The acceptance result could not be verified. Retry the original acceptance.');
      sessionStorage.removeItem(managedTermsAttemptKey(ownerId,sellerId,original.offer.id));setAttempt(null);setConfirmedOffer(original.offer.id);setMessage('Terms accepted. Earlier sales keep their original terms.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Acceptance could not be confirmed. Retry the same details.'); }
    finally { busyRef.current=false;setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl border bg-card p-6">
    <h2 className="font-heading text-2xl">{recovery?'Earlier recorded company-store terms':future ? 'Upcoming company-store terms' : 'Current company-store terms'}</h2>
    <p>Sold by {offer.snapshot.company.legalName} through {offer.snapshot.companyAccount.storeName}.</p>
    <p>Company keeps {offer.retentionBps / 100}%. You receive {(10000 - offer.retentionBps) / 100}% of eligible product value after a completed, paid sale.</p>
    {future ? <p>Starts {date(offer.effectiveFrom)} Nepal time. Acceptance now keeps today’s agreement unchanged until this time.</p> : null}
    <details><summary className="cursor-pointer font-semibold">Read the full selling terms</summary><ul className="mt-3 list-disc space-y-3 pl-5">{offer.snapshot.terms.map(term => <li key={term}>{term}</li>)}</ul></details>
    {storageError?<p role="alert">{storageError}</p>:null}
    {attempt||storageError?<button type="button" className="underline" disabled={busy} onClick={()=>{
      if(!window.confirm('Check the saved agreement and answer history first. Clear this recorded attempt and start a new acceptance only if needed?'))return;
      sessionStorage.removeItem(managedTermsAttemptKey(ownerId,sellerId,currentOffer.id));setAttempt(null);setStorageError('');setMessage('Recorded attempt cleared after your history review.');
    }}>Start again after checking history</button>:null}
    {attempt?<form onSubmit={event=>void submit(event)} className="space-y-3" data-form-id={formId}><p>A previous acceptance is awaiting confirmation. Retry uses your original terms, form and private answers.</p><Button type="submit" disabled={busy||!loaded||Boolean(storageError)}>Retry original acceptance</Button></form>:alreadyAccepted||confirmedOffer===currentOffer.id ? <p className="font-semibold">You have accepted these terms.</p> : recovery?<p>The recorded attempt is cleared. Review the current terms above before starting another acceptance.</p>:<form onSubmit={event => void submit(event)} className="space-y-4" data-form-id={formId}>
      <label className="flex items-start gap-3"><input type="checkbox" required name="accepted" disabled={busy} className="mt-1" />
        <span>I have read and accept the English selling terms, company identity and payment rate shown above.</span></label>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={baseKeys} /> : null}
      {catalog.status !== 'ready' ? <p role="alert">{catalog.message || 'Loading the terms form…'}</p> : null}
      <Button type="submit" disabled={busy || !loaded || Boolean(storageError)|| !catalog.canSubmit}>{busy ? 'Saving acceptance…' : 'Accept these terms'}</Button>
    </form>}
    {message ? <output className="block">{message}</output> : null}
  </section>;
}
