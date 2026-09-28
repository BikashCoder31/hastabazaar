'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EditableSellerProfile } from '@/lib/db/repositories/seller-profile';
import { sendJson } from '@/lib/http/client-request';
import { NEPAL_PROVINCES } from '@/lib/checkout/validation';
import { ConfiguredFields, fieldDisplay } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const catalogBaseKeys = ['tradingName', 'businessDescription', 'sellerId', 'idempotencyKey',
  'legalName', 'payoutAccountReference', 'supportPhone', 'supportEmail', 'province', 'district',
  'municipality', 'ward', 'locality', 'productCategories', 'requestId', 'formVersion', 'customAnswers'];

export function SellerProfileForm({
  profile,
  sellerId,
}: {
  profile: EditableSellerProfile;
  sellerId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const attemptKey = sessionAttemptKey('seller.profile', sellerId);
  const [hasPendingAttempt, setHasPendingAttempt] = useState(false);
  const catalog = usePublishedFormConfig('seller.profile');
  useEffect(() => {
    const timeout = window.setTimeout(() => setHasPendingAttempt(hasSessionAttempt(attemptKey)), 0);
    return () => window.clearTimeout(timeout);
  }, [attemptKey]);
  function resetAttempt() {
    if (!window.confirm('A previous seller profile save may already have succeeded. Check your profile history first. Starting a new attempt can create duplicate history. Start a new attempt anyway?')) return;
    try { sessionStorage.removeItem(attemptKey); }
    catch { setMessage('Browser session storage is unavailable. Please enable it before submitting.'); return; }
    setHasPendingAttempt(false);
    setMessage('New seller profile attempt ready.');
  }
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy || !catalog.canSubmit || !catalog.config) return;
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    const next = Object.fromEntries([...data.entries()].filter(([key]) => key !== 'formVersion' && !key.startsWith('custom.')));
    try {
      const configured = readConfiguredSubmission(event.currentTarget, catalog.config, catalogBaseKeys);
      const attemptId = getOrCreateSessionAttempt(attemptKey);
      setHasPendingAttempt(true);
      await sendJson(
        '/api/seller/profile',
        'PATCH',
        { profile: next, idempotencyKey: attemptId,
          ...configuredJsonPayload(catalog.config, configured.answers, catalogBaseKeys) },
        'Profile could not be saved.',
      );
      setMessage('Seller profile saved.');
      clearSessionAttempt(attemptKey);
      setHasPendingAttempt(false);
      router.refresh();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Profile could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      data-form-id="seller.profile"
      onSubmit={submit}
      className="seller-form mt-7 grid gap-5 rounded-2xl border bg-card p-6 sm:grid-cols-2"
    >
      <Field
        name="tradingName"
        label={fieldDisplay(catalog.config, 'tradingName')?.label ?? 'Public trading name'}
        help={fieldDisplay(catalog.config, 'tradingName')?.helpText}
        placeholder={fieldDisplay(catalog.config, 'tradingName')?.placeholder}
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
        type="tel"
        autoComplete="tel"
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
        <Label htmlFor="businessDescription">{fieldDisplay(catalog.config, 'businessDescription')?.label ?? 'Maker story'}</Label>
        <Textarea
          id="businessDescription"
          name="businessDescription"
          defaultValue={profile.businessDescription ?? ''}
          maxLength={2000}
          rows={6}
          placeholder={fieldDisplay(catalog.config, 'businessDescription')?.placeholder}
          aria-describedby={fieldDisplay(catalog.config, 'businessDescription')?.helpText ? 'businessDescription-catalog-help' : undefined}
        />
        {fieldDisplay(catalog.config, 'businessDescription')?.helpText ? <p id="businessDescription-catalog-help" className="text-sm text-muted-foreground">{fieldDisplay(catalog.config, 'businessDescription')?.helpText}</p> : null}
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
      {catalog.config ? <div className="sm:col-span-2"><ConfiguredFields config={catalog.config} baseKeys={catalogBaseKeys} /></div> : null}
      {catalog.status !== 'ready' ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{catalog.message || 'Form configuration is unavailable. Please try again.'}</p> : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button
          type="submit"
          disabled={busy || !catalog.canSubmit}
          className="min-h-11 rounded-full px-6"
        >
          {busy ? 'Saving…' : 'Save profile'}
        </Button>
        {message ? (
          <output className="text-sm text-muted-foreground">{message}</output>
        ) : null}
      </div>
      <p className="text-sm leading-6 text-muted-foreground sm:col-span-2">
        Legal name, registration, tax and payout details stay locked to the
        reviewed application and require Admin-controlled change verification.
      </p>
      {hasPendingAttempt ? <div className="space-y-2 sm:col-span-2">
        <p className="text-sm text-muted-foreground">If a save response was lost, retrying reuses its request reference. Check your profile history before starting a different attempt.</p>
        <Button type="button" variant="outline" onClick={resetAttempt}>Start a new seller profile attempt</Button>
      </div> : null}
    </form>
  );
}
function Field({
  name,
  label,
  help,
  ...props
}: { name: string; label: string; help?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-describedby={help ? `${name}-catalog-help` : undefined} {...props} />
      {help ? <p id={`${name}-catalog-help`} className="text-sm text-muted-foreground">{help}</p> : null}
    </div>
  );
}
