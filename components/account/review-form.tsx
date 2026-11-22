'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useId } from 'react';
import { Camera, ShieldCheck, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfiguredFields, focusConfiguredField } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import {useAccountCommand} from './use-account-command';
import {AccountCommandRecovery} from './account-command-recovery';
import { touchTargets } from './account-sections';

const ratings = ['Very poor', 'Poor', 'Okay', 'Good', 'Excellent'];

const BASE_KEYS = ['rating', 'title', 'body', 'orderItemId', 'idempotencyKey', 'photos', 'customerId'] as const;

export function ReviewForm(props:{actorId:string;productId:string;orderItemId:string;orderNumber:string}){return <CurrentReviewForm key={JSON.stringify([props.actorId,props.productId,props.orderItemId])} {...props}/>;}
function CurrentReviewForm({
  actorId,
  productId,
  orderItemId,
  orderNumber,
}: {
  actorId:string;
  productId: string;
  orderItemId: string;
  orderNumber: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const inputId = useId();
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const requestId = useRef(crypto.randomUUID());
  const formRef=useRef<HTMLFormElement|null>(null);
  const command=useAccountCommand({actorId,scopeKey:JSON.stringify(['review',productId,orderItemId]),onRecorded:(_data,current)=>{if(!current())return;setMessage('Your verified-purchase review submission is recorded. Its current public status follows moderation.');setFieldErrors({});formRef.current?.reset();setRating(5);requestId.current=crypto.randomUUID();command.setMessage('');router.refresh();},onDenied:()=>router.refresh()});
  const { config, status, message: configMessage, canSubmit, refresh, handleSubmissionResponse } = usePublishedFormConfig('account.review');
  useEffect(()=>{const fieldId=Object.keys(fieldErrors)[0];if(!busy&&!command.blocked&&fieldId&&formRef.current)focusConfiguredField(formRef.current,fieldId);},[busy,command.blocked,fieldErrors]);
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy || command.blocked || !canSubmit || !config) return;
    const current=command.capture();
    const formElement = event.currentTarget;
    setBusy(true);
    setMessage('');
    setFieldErrors({});
    const data = new FormData(event.currentTarget);
    try {
      const { answers } = readConfiguredSubmission(formElement, config, BASE_KEYS);
      const payload = configuredJsonPayload(config, answers, BASE_KEYS);
      data.set('formVersion', String(payload.formVersion));
      data.set('customAnswers', JSON.stringify(payload.customAnswers));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Review your form answers.');
      setBusy(false);
      return;
    }
    data.set('orderItemId', orderItemId);
    data.set('idempotencyKey', requestId.current);
    try {
      const files = data
        .getAll('photos')
        .filter((f): f is File => f instanceof File && f.size > 0);
      if (files.length > 3 || files.some((f) => f.size > 5 * 1024 * 1024))
        throw new Error('Choose up to three photos, each no larger than 5 MB.');
      const response = await command.run({action:'review.submit',sourceId:orderItemId,relatedId:productId,requestId:requestId.current,endpoint:`/api/products/${encodeURIComponent(productId)}/reviews`,method:'POST',body:data});
      if(!response||!current())return;
      const result = response.data as {
        id?: string;
        error?: string;
        fieldId?: string;
      } | null;
      if (!response.ok)
      {
        if (response.status === 409 && (result as { code?: unknown } | null)?.code === 'stale_version') handleSubmissionResponse(response, 'stale_version');
        else if (response.status === 400 || response.status === 409) requestId.current = crypto.randomUUID();
        const explanation = result?.error ?? 'Review could not be submitted. Please try again.';
        if (typeof result?.fieldId === 'string') {
          setFieldErrors({ [result.fieldId]: explanation });
        }
        throw new Error(explanation);
      }
    } catch (reason) {
      if(!current())return;
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Review could not be submitted.',
      );
    } finally {
      if(current())setBusy(false);
    }
  }
  if(command.accessDenied)return <section role="alert" className="space-y-3 rounded-xl border bg-card p-5"><p>Review access changed. Reopen the current product before viewing or submitting private review details.</p><Button type="button" variant="outline" onClick={()=>router.refresh()}>Refresh current product</Button></section>;
  return (
    <form
      ref={formRef}
      data-form-id="account.review"
      onSubmit={submit}
      onChange={() => {
        if (!busy&&!command.blocked) requestId.current = crypto.randomUUID();
      }}
      className={touchTargets + ' customer-form mt-3 grid min-w-0 gap-4'}
    >
      <FormGuide formId="account.review" />

      <p className="text-xs text-muted-foreground">Verified purchase · {orderNumber}</p>
      <AccountCommandRecovery command={command}/>
      <fieldset disabled={busy||command.blocked} className="grid gap-4">
        {config ? <ConfiguredFields config={config} baseKeys={BASE_KEYS} errors={fieldErrors} /> : null}
        <fieldset>
          <legend className="text-sm font-semibold">Your rating <span aria-hidden="true">*</span></legend>
          <div className="mt-1 flex flex-wrap items-center gap-y-1">
            {ratings.map((label, i) => {
              const stars = i + 1;
              return (
                <label key={label} className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-md">
                  <input type="radio" name="rating" value={stars} required checked={rating === stars} onChange={() => setRating(stars)}
                    className="peer sr-only" aria-label={`${stars} ${stars === 1 ? 'star' : 'stars'} · ${label}`} />
                  <span className="absolute inset-1 rounded-md peer-focus-visible:outline-2 peer-focus-visible:outline-[#a8232e]" />
                  <Star className={`size-5 ${rating >= stars ? 'fill-[#a67526] text-[#8a5d1b]' : 'text-[#a39375]'}`} aria-hidden="true" />
                </label>
              );
            })}
            <span className="ml-2 text-sm text-[#465573]">{rating ? ratings[rating - 1] : 'Tap a star'}</span>
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor={inputId + "-review-title"}>Title (optional)</Label>
          <Input id={inputId + "-review-title"} name="title" maxLength={120} placeholder="What stood out?" className="min-h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={inputId + "-review-body"}>Your review <span aria-hidden="true">*</span></Label>
          <Textarea
            id={inputId + "-review-body"}
            name="body"
            placeholder="What did you like? How was the size, finish and packing?"
            className="min-h-24"
            minLength={10}
            maxLength={2000}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${inputId}-review-photos`} className="flex items-center gap-2">
            <Camera className="size-4" aria-hidden="true" /> Customer photos (optional)
          </Label>
          <input
            id={`${inputId}-review-photos`}
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            aria-describedby={`${inputId}-photo-help`}
            className="block min-h-11 w-full min-w-0 rounded-lg border border-dashed p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1.5"
          />
          <p
            id={`${inputId}-photo-help`}
            className="text-xs leading-5 text-muted-foreground"
          >
            Up to 3 JPG, PNG or WebP photos, 5 MB each. Choose photos you own
            and are happy to share publicly. Avoid faces, addresses, receipts
            and location metadata. New photos are processed to remove embedded metadata before storage.
          </p>
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-[#ebe1d1] p-3 text-sm text-[#675c4b]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Reviews and photos appear after moderation.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {status !== 'ready' ? <div>
            <output className="text-sm text-muted-foreground">{status === 'loading' ? 'Form configuration is loading.' : configMessage}</output>
            {status !== 'loading' ? <Button type="button" variant="outline" onClick={refresh}>Refresh form</Button> : null}
          </div> : null}
          <Button type="submit" className="min-h-11 w-full bg-[#a8232e] hover:bg-[#8b1b26] sm:w-auto" disabled={busy || command.blocked || !canSubmit}>
            {busy ? 'Submitting…' : 'Submit review'}
          </Button>
          {message ? (
            <output className="text-sm text-muted-foreground">{message}</output>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
