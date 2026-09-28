'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { ReferralCampaign } from '@/lib/db/repositories/wallet';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const baseKeys = ['enabled', 'discount', 'reward', 'minimum', 'days', 'reason', 'requestId', 'formVersion', 'customAnswers'];

export function ReferralSettings({ campaign }: { campaign: ReferralCampaign }) {
  const [message, setMessage] = useState('');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const attemptKey = sessionAttemptKey('staff.referral-settings', 'current');
  useEffect(() => { const timer = window.setTimeout(() => setRetry(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  const catalog = usePublishedFormConfig('staff.referral-settings');
  return (
    <form
      data-form-id="staff.referral-settings"
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!catalog.config || !catalog.canSubmit) return;
        setMessage('');
        let configured: ReturnType<typeof configuredJsonPayload>;
        try {
          const values = readConfiguredSubmission(e.currentTarget, catalog.config, baseKeys);
          configured = configuredJsonPayload(catalog.config, values.answers, baseKeys);
          const f = new FormData(e.currentTarget);
          const body = {
              enabled: f.get('enabled') === 'on',
              friendDiscountPaisa: Math.round(Number(f.get('discount')) * 100),
              rewardPaisa: Math.round(Number(f.get('reward')) * 100),
              minimumSubtotalPaisa: Math.round(Number(f.get('minimum')) * 100),
              returnWindowDays: Number(f.get('days')),
              reason: f.get('reason'),
              ...configured,
          };
          setPending(true); setRetry(true);
          try {
            const requestId = getOrCreateSessionAttempt(attemptKey);
            const response = await fetch('/api/admin/referrals', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, requestId }) });
            const result = await response.json().catch(() => null) as { saved?: boolean; error?: string; code?: string } | null;
            if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
            if (!response.ok) throw new Error(result?.error ?? 'Referral offer could not be saved. Retry the same request.');
            if (result?.saved !== true) throw new Error('The response could not confirm this change. Retry the same request.');
            clearSessionAttempt(attemptKey); setRetry(false); setMessage('Offer saved. Existing orders keep their original offer.'); router.refresh();
          } finally { setPending(false); }
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : 'Could not save settings.',
          );
        }
      }}
    >
<p className="text-xs text-muted-foreground">* Required field</p>

      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={!!campaign.enabled}
        />
        Accept new referrals
      </label>
      <Link href="/admin/staff-form-history?kind=referral-settings&id=default" className="block text-sm underline">View referral form history</Link>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={baseKeys} /> : null}
      {!catalog.canSubmit ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Loading form configuration…'}</p> : null}
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
             <span aria-hidden="true">*</span><span>{label}</span>
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
         <span aria-hidden="true">*</span><input
          name="reason"
          minLength={10}
          maxLength={300}
          required
          className="mt-2 block w-full rounded-xl border bg-background p-3"
        />
      </label>
      <p className="text-sm leading-6 text-muted-foreground">
        The marketplace funds both rewards. Seller earnings are unchanged. Pause
        the offer here when you want to stop accepting new referral costs.
      </p>
      <Button disabled={pending || !catalog.canSubmit}>{pending ? 'Saving…' : 'Save offer'}</Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {retry ? <div className="space-y-2 text-xs text-muted-foreground"><p>A referral change may already have succeeded. Check the current offer before retrying. Changed values keep the same request reference and may conflict.</p><Button type="button" variant="outline" disabled={pending} onClick={() => {
        if (!window.confirm('A prior referral change may already have succeeded. Check the offer first. Starting a new attempt may duplicate it. Continue?')) return;
        clearSessionAttempt(attemptKey); setRetry(false); setMessage(''); setError('');
        if (catalog.status === 'stale') catalog.refresh();
      }}>Start a new attempt</Button></div> : null}
      <output className="block text-sm">
        {message}
      </output>
    </form>
  );
}
