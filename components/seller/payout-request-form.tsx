'use client';
import { FormGuide } from '@/components/forms/form-guide';
import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { payoutRequestBlock } from '@/lib/seller/presentation';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import {useCaseCommand} from '@/components/admin/use-case-command';

const catalogBaseKeys = ['amount', 'availablePaisa', 'note', 'requestId', 'sellerId', 'formVersion', 'customAnswers'];

export function PayoutRequestForm({
  availablePaisa,
  actorId,
  hasOpenRequest,
  sellerId,
  readiness,
}: {
  availablePaisa: number;
  actorId:string;
  readiness:{ready:boolean;maskedBeneficiary:string|null;blocker:string|null};
  hasOpenRequest: boolean;
  sellerId: string;
}) {
  const catalog = usePublishedFormConfig('seller.payout-request');
  const [submitted, setSubmitted] = useState(false);
  const command=useCaseCommand('seller.payout-request',actorId,'request',sellerId,'/api/seller/payout-requests',{created:true,onSuccess:()=>setSubmitted(true)});
  const {busy,message:error,setMessage:setError}=command;
  const blocked = readiness.blocker ?? payoutRequestBlock(
    availablePaisa,
    hasOpenRequest || submitted,
  );
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy || blocked || !catalog.canSubmit || !catalog.config) return;
    const form = new FormData(event.currentTarget);
    setError('');
    try {
      const configured = readConfiguredSubmission(event.currentTarget, catalog.config, catalogBaseKeys);
      await command.submit({note:form.get('note')??'',...configuredJsonPayload(catalog.config,configured.answers,catalogBaseKeys)});
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Payout request could not be submitted.',
      );
    }
  }
  return (
    <section className="rounded-2xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-heading text-2xl">
        <HandCoins className="size-5 text-primary" />Request available payout
      </h2>
      <p className="mt-3 text-base leading-7 text-muted-foreground">
        We review your eligible earnings and verified bank details.
        Submitting a request does not transfer money.
      </p>
      <p className="mt-3">Eligible earnings: {new Intl.NumberFormat('en-NP',{style:'currency',currency:'NPR'}).format(availablePaisa/100)} · {readiness.maskedBeneficiary??'Verified beneficiary needs review'}</p>
      {command.saved?<div className="mt-3 space-x-3"><button disabled={busy} onClick={()=>void command.recover()}>Check original request</button>{command.canRetry?<button disabled={busy} onClick={()=>void command.retry()}>Retry unchanged request</button>:null}{command.unrecorded?<button disabled={busy} onClick={command.restart}>Review and start a new attempt</button>:null}</div>:null}
      {blocked ? (
        <output className="mt-4 block rounded-xl bg-secondary p-4 text-sm font-semibold text-primary">
          {blocked}
        </output>
      ) : (
        <form onSubmit={submit} data-form-id="seller.payout-request" className="mt-5 space-y-3">
      <FormGuide formId="seller.payout-request" />

<p>Purpose: Seller earnings payout</p>

          <Label htmlFor="payout-note">Note (optional)</Label>
          <Textarea
            id="payout-note"
            name="note"
            maxLength={500}
            disabled={busy||command.saved}
            placeholder="For example, payment for my completed orders."
            className="min-h-24 text-base"
            aria-describedby="payout-note-help"
          />
          <p id="payout-note-help" className="text-sm text-muted-foreground">You may add context up to 500 characters; no explanation is required for a normal payout.</p>
          {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={catalogBaseKeys} /> : null}
          {catalog.status !== 'ready' ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Form configuration is unavailable. Please try again.'}</p> : null}
          <Button
            type="submit"
            disabled={busy || command.saved || !catalog.canSubmit}
            className="min-h-11 rounded-full"
          >
            {busy ? 'Submitting…' : 'Request available payout'}
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
