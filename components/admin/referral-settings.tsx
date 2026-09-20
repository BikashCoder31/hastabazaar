'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ReferralCampaign } from '@/lib/db/repositories/wallet';

export function ReferralSettings({ campaign }: { campaign: ReferralCampaign }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage('');
        const f = new FormData(e.currentTarget);
        try {
          const response = await fetch('/api/admin/referrals', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              enabled: f.get('enabled') === 'on',
              friendDiscountPaisa: Math.round(Number(f.get('discount')) * 100),
              rewardPaisa: Math.round(Number(f.get('reward')) * 100),
              minimumSubtotalPaisa: Math.round(Number(f.get('minimum')) * 100),
              returnWindowDays: Number(f.get('days')),
              reason: f.get('reason'),
            }),
          });
          const result = (await response.json()) as { error?: string };
          if (!response.ok)
            throw new Error(result.error || 'Could not save settings.');
          setMessage('Offer saved. Existing orders keep their original offer.');
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : 'Could not save settings.',
          );
        } finally {
          setBusy(false);
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
      <Button disabled={busy}>{busy ? 'Saving…' : 'Save offer'}</Button>
      <output className="block text-sm">
        {message}
      </output>
    </form>
  );
}
