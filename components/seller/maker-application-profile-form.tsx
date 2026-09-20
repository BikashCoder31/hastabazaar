'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SellerParticipationProfile } from '@/lib/db/repositories/seller-applications';
import { sendJson } from '@/lib/http/client-request';

const networks = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['linkedin', 'LinkedIn'],
  ['tiktok', 'TikTok'],
  ['x', 'X'],
  ['youtube', 'YouTube'],
] as const;

export function MakerApplicationProfileForm({ profile }: { profile: SellerParticipationProfile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const experience = profile.craftExperience[0];
  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await sendJson('/api/seller-applications/profile', 'PATCH', {
        ...Object.fromEntries(form.entries()),
        expectedVersion: profile.version,
        requestId: crypto.randomUUID(),
      }, 'Maker profile could not be saved.');
      setMessage('Maker profile saved.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Maker profile could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return <form onSubmit={(event) => void submit(event)} className="mt-5 grid gap-4 rounded-2xl border bg-card p-6 sm:grid-cols-2">
    <Field name="publicName" label="Public maker/shop name" defaultValue={profile.publicName} required />
    <Field name="publicCity" label="Public city/town only" defaultValue={profile.publicCity} required />
    <Field name="experienceCraft" label="Craft for this experience (optional)" defaultValue={experience?.craft ?? ''} />
    <div className="space-y-2">
      <Label htmlFor="experienceBand">Experience in that craft (optional)</Label>
      <select id="experienceBand" name="experienceBand" defaultValue={experience?.band ?? ''} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">
        <option value="">Not provided</option>
        <option value="beginner">Beginner</option>
        <option value="less_than_one_year">Less than one year</option>
        <option value="one_to_three_years">1–3 years</option>
        <option value="four_to_ten_years">4–10 years</option>
        <option value="more_than_ten_years">More than 10 years</option>
      </select>
    </div>
    {networks.map(([network, label]) => <Field key={network} name={`${network}Url`} label={`${label} link (optional)`} type="url" defaultValue={profile.socialLinks[network] ?? ''} />)}
    <p className="text-sm leading-6 text-muted-foreground sm:col-span-2">Your private verification, pickup, return, and invoice addresses are not shown here. Empty optional public sections stay hidden.</p>
    <div className="flex items-center gap-3 sm:col-span-2">
      <Button disabled={busy}>{busy ? 'Saving…' : 'Save maker profile'}</Button>
      <output className="text-sm text-muted-foreground" aria-live="polite">{message}</output>
    </div>
  </form>;
}

function Field({ name, label, ...props }: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} maxLength={500} {...props} /></div>;
}
