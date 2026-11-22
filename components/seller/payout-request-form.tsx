'use client';
import { FormGuide } from '@/components/forms/form-guide';
import { useState } from 'react';
import { Clock3 } from 'lucide-react';
import { sellerMoney } from '@/lib/seller/presentation';
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
  const open = hasOpenRequest || submitted;
  const blocked = open
    ? 'Your payout request is with Hastabazaar. You can ask again once it’s reviewed.'
    : readiness.blocker ?? payoutRequestBlock(availablePaisa, false);
  const amount = sellerMoney(availablePaisa);
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
    <section className="min-w-0 space-y-4 rounded-[0.9rem] border border-[#E4DACA] bg-white p-4 sm:p-5" aria-labelledby="ask-payout">
      <h2 id="ask-payout" className="font-bold">Ask for a payout</h2>
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="text-[#46536F]">Available now</span><strong className="text-xl tabular-nums">{amount}</strong></p>
      {command.saved?<div className="mt-3 space-x-3"><button disabled={busy} onClick={()=>void command.recover()}>Check original request</button>{command.canRetry?<button disabled={busy} onClick={()=>void command.retry()}>Retry unchanged request</button>:null}{command.unrecorded?<button disabled={busy} onClick={command.restart}>Review and start a new attempt</button>:null}</div>:null}
      {blocked ? (
        <div className="space-y-2">
          <Button type="button" disabled aria-describedby="why-payout-blocked" className="min-h-11 w-full rounded-xl bg-[#A8232E] text-white">Ask for {amount}</Button>
          <p id="why-payout-blocked" className="flex items-start gap-2 text-sm leading-relaxed text-[#46536F]"><Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{blocked}</p>
        </div>
      ) : (
        <form onSubmit={submit} data-form-id="seller.payout-request" className="space-y-3">
      <FormGuide formId="seller.payout-request" />

{readiness.maskedBeneficiary ? <p className="text-sm text-[#46536F]">Bank account · {readiness.maskedBeneficiary}</p> : null}

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
            className="min-h-11 w-full rounded-xl bg-[#A8232E] text-white hover:bg-[#8D1D27]"
          >
            {busy ? 'Submitting…' : 'Ask for ' + amount}
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
