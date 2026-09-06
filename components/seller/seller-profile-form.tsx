'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EditableSellerProfile } from '@/lib/db/repositories/seller-profile';
import { NEPAL_PROVINCES } from '@/lib/checkout/validation';

export function SellerProfileForm({
  profile,
}: {
  profile: EditableSellerProfile;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    const next = Object.fromEntries(data.entries());
    const response = await fetch('/api/seller/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profile: next,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    setMessage(
      response.ok
        ? 'Seller profile saved.'
        : result.error || 'Profile could not be saved.',
    );
    if (response.ok) router.refresh();
  }
  return (
    <form
      onSubmit={submit}
      className="mt-7 grid gap-5 rounded-2xl border bg-card p-6 sm:grid-cols-2"
    >
      <Field
        name="tradingName"
        label="Public trading name"
        defaultValue={profile.tradingName}
        required
      />
      <Field
        name="supportEmail"
        label="Customer support email"
        type="email"
        defaultValue={profile.supportEmail}
        required
      />
      <Field
        name="supportPhone"
        label="Customer support phone"
        defaultValue={profile.supportPhone}
        required
      />
      <div className="space-y-2">
        <Label htmlFor="province">Province</Label>
        <select
          id="province"
          name="province"
          defaultValue={profile.province}
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {NEPAL_PROVINCES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <Field
        name="district"
        label="District"
        defaultValue={profile.district}
        required
      />
      <Field
        name="municipality"
        label="Municipality"
        defaultValue={profile.municipality}
        required
      />
      <Field name="ward" label="Ward" defaultValue={profile.ward ?? ''} />
      <Field
        name="locality"
        label="Workshop locality"
        defaultValue={profile.locality}
        required
      />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="businessDescription">Maker story</Label>
        <Textarea
          id="businessDescription"
          name="businessDescription"
          defaultValue={profile.businessDescription ?? ''}
          maxLength={2000}
          rows={6}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="productCategories">Crafts and specialties</Label>
        <Textarea
          id="productCategories"
          name="productCategories"
          defaultValue={profile.productCategories ?? ''}
          maxLength={1000}
          rows={3}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </Button>
        {message ? (
          <output className="text-sm text-muted-foreground">
            {message}
          </output>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
        Legal name, registration, tax and payout details stay locked to the
        reviewed application and require Admin-controlled change verification.
      </p>
    </form>
  );
}
function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
