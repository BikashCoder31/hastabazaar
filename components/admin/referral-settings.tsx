'use client';
import { FormGuide } from '@/components/forms/form-guide';
import {useCommercialScope,CommercialRecovery} from '@/components/admin/commercial-recovery';
import {FinanceAccessNotice} from '@/components/admin/finance-access-notice';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { ReferralCampaign } from '@/lib/db/repositories/wallet';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import {
  configuredJsonPayload,
  readConfiguredSubmission,
} from '@/lib/forms/client-submission';
import {
  clearSessionAttempt,
  getOrCreateSessionAttempt,
  hasSessionAttempt,
  sessionAttemptKey,
} from '@/lib/forms/client-attempt';
import { incentiveMoney } from '@/lib/incentives/presentation';

const baseKeys = [
  'enabled',
  'discount',
  'reward',
  'minimum',
  'days',
  'reason',
  'requestId',
  'expectedUpdatedAt',
  'formVersion',
  'customAnswers',
];
type ReviewedOffer = Omit<ReferralCampaign, 'enabled'|'updatedAt'> & {
  expectedUpdatedAt:number;
  enabled: boolean;
  reason: string;
} & ReturnType<typeof configuredJsonPayload>;

export function ReferralSettings(props:{actorId:string;campaign:ReferralCampaign}){return <ReferralSettingsScope key={props.actorId} {...props}/>;}
function ReferralSettingsScope({actorId,campaign}:{actorId:string;campaign:ReferralCampaign}) {
  const commercial=useCommercialScope(actorId);
  const[sourceAt,setSourceAt]=useState(campaign.updatedAt);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const [review, setReview] = useState<ReviewedOffer | null>(null);
  const reviewPanel = useRef<HTMLElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const attemptKey = sessionAttemptKey('staff.referral-settings', actorId+':current');
  useEffect(() => {
    const timer = window.setTimeout(
      () => setRetry(hasSessionAttempt(attemptKey)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [attemptKey]);
  const catalog = usePublishedFormConfig('staff.referral-settings');
  useEffect(() => {
    if (review) reviewPanel.current?.focus();
  }, [review]);
  async function saveReviewedOffer() {
    if (!review || pending || !catalog.canSubmit) return;
    setMessage('');
    setError('');
    setPending(true);
    setRetry(true);
    try {
      const requestId = getOrCreateSessionAttempt(attemptKey);
      const response = await fetch('/api/admin/referrals', {
        method: 'PUT',
        headers: { 'content-type': 'application/json',...commercial.headers },
        body: JSON.stringify({ ...review, requestId }),
      });
      const result = (await response.json().catch(() => null)) as {
        saved?: boolean;
        error?: string;
        code?: string;
      } | null;
      if(!commercial.current())return;commercial.observe(response);
      if (result?.code === 'stale_version')
        catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok)
        throw new Error(
          result?.error ??
            'Referral offer could not be saved. Retry the same request.',
        );
      if (result?.saved !== true)
        throw new Error(
          'The response could not confirm this change. Retry the same request.',
        );
      clearSessionAttempt(attemptKey);
      setRetry(false);
      setReview(null);
      setMessage('Offer saved. Existing orders keep their original offer.');
      router.refresh();
    } catch (error) {
      if(!commercial.current())return;
      setError(
        error instanceof Error ? error.message : 'Could not save settings.',
      );
    } finally {
      if(commercial.current())setPending(false);
    }
  }
  const recovery=<CommercialRecovery actorId={actorId} kind="referral" attemptKey={attemptKey} onDenied={commercial.deny} onReauthorized={commercial.reauthorize} onRecovered={()=>{clearSessionAttempt(attemptKey);setRetry(false);setReview(null);setMessage('Original committed offer confirmed. Review its current source before another action.');router.refresh();}}/>;
  if(commercial.accessDenied)return <div className="space-y-3"><FinanceAccessNotice message={error}/>{recovery}</div>;
  return (
    <form
      data-form-id="staff.referral-settings"
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!catalog.config || !catalog.canSubmit || pending || review) return;
        if(!Number.isSafeInteger(sourceAt)||Number(sourceAt)<0){setError('The original offer version is unavailable. Refresh this source; your draft is retained.');return;}
        setMessage('');
        setError('');
        let configured: ReturnType<typeof configuredJsonPayload>;
        try {
          const values = readConfiguredSubmission(
            e.currentTarget,
            catalog.config,
            baseKeys,
          );
          configured = configuredJsonPayload(
            catalog.config,
            values.answers,
            baseKeys,
          );
          const f = new FormData(e.currentTarget);
          const reason = f.get('reason');
          const body = {
            expectedUpdatedAt:sourceAt!,
            enabled: f.get('enabled') === 'on',
            friendDiscountPaisa: Math.round(Number(f.get('discount')) * 100),
            rewardPaisa: Math.round(Number(f.get('reward')) * 100),
            minimumSubtotalPaisa: Math.round(Number(f.get('minimum')) * 100),
            returnWindowDays: Number(f.get('days')),
            reason: typeof reason === 'string' ? reason.trim() : '',
            ...configured,
          };
          if (
            !Number.isSafeInteger(body.expectedUpdatedAt)||body.expectedUpdatedAt<0||
            ![
              body.friendDiscountPaisa,
              body.rewardPaisa,
              body.minimumSubtotalPaisa,
              body.returnWindowDays,
            ].every(Number.isSafeInteger) ||
            body.friendDiscountPaisa < 100 ||
            body.friendDiscountPaisa > 1000000 ||
            body.rewardPaisa < 100 ||
            body.rewardPaisa > 1000000 ||
            body.minimumSubtotalPaisa <= body.friendDiscountPaisa ||
            body.minimumSubtotalPaisa > 100000000 ||
            body.returnWindowDays < 7 ||
            body.returnWindowDays > 90 ||
            body.reason.length < 10 ||
            body.reason.length > 300
          )
            throw new Error(
              'Check the amounts, a minimum greater than the discount, a 7–90 day wait and your change reason.',
            );
          setReview(body);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : 'Could not save settings.',
          );
        }
      }}
    >
      <details className="rounded-xl border p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Help with this offer
        </summary>
      {retry?recovery:null}
      {campaign.updatedAt!==sourceAt?<section className="space-y-2 rounded border p-3"><output className="block" aria-live="polite">The current offer changed. Your proposed draft is retained; it has not overwritten the saved source.</output><p>Current friend discount {incentiveMoney(campaign.friendDiscountPaisa)} · referrer reward {incentiveMoney(campaign.rewardPaisa)} · minimum {incentiveMoney(campaign.minimumSubtotalPaisa)} · release window {campaign.returnWindowDays} days.</p><Button type="button" disabled={pending||retry||!Number.isSafeInteger(campaign.updatedAt)} onClick={()=>{setSourceAt(campaign.updatedAt);setReview(null);setMessage('Current source acknowledged. Review the retained proposed values before saving.');}}>Use this current source for a reviewed draft</Button></section>:null}
      <FormGuide formId="staff.referral-settings" />
      </details>

      <p className="text-xs text-muted-foreground">* Required field</p>

      <fieldset disabled={pending || !!review} className="space-y-4">
        <label className="flex gap-3 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={!!campaign.enabled}
          />
          Accept new referrals
        </label>
        <Link
          href="/admin/staff-form-history?kind=referral-settings&id=default"
          className="block text-sm underline"
        >
          View referral form history
        </Link>
        {catalog.config ? (
          <ConfiguredFields config={catalog.config} baseKeys={baseKeys} />
        ) : null}
        {!catalog.canSubmit ? (
          <p role="alert" className="text-sm text-destructive">
            {catalog.message || 'Loading form configuration…'}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            [
              'discount',
              'Friend discount (NPR)',
              campaign.friendDiscountPaisa / 100,
              1,
              10000,
            ],
            [
              'reward',
              'Referrer reward (NPR)',
              campaign.rewardPaisa / 100,
              1,
              10000,
            ],
            [
              'minimum',
              'Minimum product subtotal (NPR)',
              campaign.minimumSubtotalPaisa / 100,
              2,
              1000000,
            ],
            [
              'days',
              'Wait after delivery (days)',
              campaign.returnWindowDays,
              7,
              90,
            ],
          ].map(([name, label, value, min, max]) => (
            <label className="block text-sm" key={name}>
              <span aria-hidden="true">*</span>
              <span>{label}</span>
              <input
                name={String(name)}
                defaultValue={value}
                type="number"
                min={min}
                max={max}
                step="1"
                required
                className="mt-2 block w-full rounded-xl border bg-background p-3"
              />
            </label>
          ))}
        </div>
        <label className="block text-sm">
          Reason for this change
          <span aria-hidden="true">*</span>
          <input
            name="reason"
            minLength={10}
            maxLength={300}
            required
            className="mt-2 block w-full rounded-xl border bg-background p-3"
          />
        </label>
      </fieldset>
      <p className="text-sm leading-6 text-muted-foreground">
        The marketplace funds both rewards. Seller earnings are unchanged. Pause
        the offer here when you want to stop accepting new referral costs.
      </p>
      <Button
        ref={reviewButton}
        type="submit"
        disabled={pending || !!review || !catalog.canSubmit}
      >
        Review changes
      </Button>
      {review ? (
        <section
          ref={reviewPanel}
          tabIndex={-1}
          aria-label="Review referral offer"
          className="space-y-4 rounded-xl border-2 border-primary/30 bg-secondary/20 p-4 focus:outline-none"
        >
          <h3 className="font-heading text-xl">Review referral offer</h3>
          <p className="text-sm text-muted-foreground">
            Check the current and proposed values before confirming. If an
            earlier save was interrupted, check the saved offer before retrying.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="p-2">
                    Setting
                  </th>
                  <th scope="col" className="p-2">
                    Current
                  </th>
                  <th scope="col" className="p-2">
                    Proposed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  [
                    'New referrals',
                    campaign.enabled ? 'Active' : 'Paused',
                    review.enabled ? 'Active' : 'Paused',
                  ],
                  [
                    'Friend discount',
                    incentiveMoney(campaign.friendDiscountPaisa),
                    incentiveMoney(review.friendDiscountPaisa),
                  ],
                  [
                    'Referrer reward',
                    incentiveMoney(campaign.rewardPaisa),
                    incentiveMoney(review.rewardPaisa),
                  ],
                  [
                    'Minimum product subtotal',
                    incentiveMoney(campaign.minimumSubtotalPaisa),
                    incentiveMoney(review.minimumSubtotalPaisa),
                  ],
                  [
                    'Wait after delivery',
                    `${campaign.returnWindowDays} days`,
                    `${review.returnWindowDays} days`,
                  ],
                ].map(([label, before, after]) => (
                  <tr key={label}>
                    <th scope="row" className="p-2 font-medium">
                      {label}
                    </th>
                    <td className="p-2">{before}</td>
                    <td className="p-2 font-semibold">{after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="break-words text-sm">
            <strong>Reason:</strong> {review.reason}
          </p>
          <p className="text-xs leading-6 text-muted-foreground">
            Saving updates the offer for new referrals. Existing orders keep
            their original discount, reward and waiting period. Pausing does not
            remove earned credit or cancel accepted referrals.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={pending || !catalog.canSubmit}
              onClick={() => void saveReviewedOffer()}
            >
              {pending ? 'Saving…' : 'Confirm and save offer'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setReview(null);
                window.setTimeout(() => reviewButton.current?.focus(), 0);
              }}
            >
              Go back
            </Button>
          </div>
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {retry ? (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            A referral change may already have succeeded. Check the current
            offer before retrying. Changed values keep the same request
            reference and may conflict.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  'A prior referral change may already have succeeded. Check the offer first. Starting a new attempt may duplicate it. Continue?',
                )
              )
                return;
              clearSessionAttempt(attemptKey);
              setRetry(false);
              setReview(null);
              setMessage('');
              setError('');
              if (catalog.status === 'stale') catalog.refresh();
              router.refresh();
            }}
          >
            Start a new attempt
          </Button>
        </div>
      ) : null}
      <output aria-live="polite" className="block text-sm">
        {message}
      </output>
    </form>
  );
}
