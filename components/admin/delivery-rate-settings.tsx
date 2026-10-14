'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { DeliveryRates } from '@/lib/checkout/delivery-rates';
import { DISTRICTS_BY_PROVINCE } from '@/lib/checkout/nepal-address';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const districts = Object.values(DISTRICTS_BY_PROVINCE).flat().sort();
const baseKeys = ['expectedVersion', 'rates', 'reason', 'requestId', 'formVersion', 'customAnswers'];

export function DeliveryRateSettings({ rates }: { rates: DeliveryRates }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const attemptKey = sessionAttemptKey('staff.delivery-rate', 'default');
  useEffect(() => { const timer = window.setTimeout(() => setRetry(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  const catalog = usePublishedFormConfig('staff.delivery-rate');
  const [overrides, setOverrides] = useState(Object.keys(rates.districts));
  const [district, setDistrict] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog.config || !catalog.canSubmit) return;
    const form = event.currentTarget;
    let configured: ReturnType<typeof configuredJsonPayload>;
    try {
      const values = readConfiguredSubmission(form, catalog.config, baseKeys);
      configured = configuredJsonPayload(catalog.config, values.answers, baseKeys);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Review the configured fields.');
      return;
    }
    const fields = new FormData(form);
    const amount = (name: string) => Math.round(Number(fields.get(name)) * 100);
    const zones = { valley: amount('valley'), terai: amount('terai'), nationwide: amount('nationwide') };
    const districtRates = Object.fromEntries(overrides.map((name) => [name, amount(`district-${name}`)]));
    setMessage('');
    setPending(true); setRetry(true);
    try {
      const requestId = getOrCreateSessionAttempt(attemptKey);
      const response = await fetch('/api/admin/delivery-rates', { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: rates.version, rates: { zones, districts: districtRates }, reason: fields.get('reason'), ...configured, requestId }) });
      const result = await response.json().catch(() => null) as { saved?: boolean; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error ?? 'Delivery rates could not be saved. Retry the same request.');
      if (result?.saved !== true) throw new Error('The response could not confirm this change. Retry the same request.');
      clearSessionAttempt(attemptKey); setRetry(false); setMessage('Delivery rates saved for future orders.'); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Delivery rates could not be saved.'); }
    finally { setPending(false); }
  }

  const field = (name: string, label: string, initial: number) => (
    <label key={name} className="block" htmlFor={`rate-${name}`}>{label} (NPR) <span aria-hidden="true">*</span>
      <input id={`rate-${name}`} name={name} type="number" min="0" max="1000000" step="0.01"
        defaultValue={initial / 100} required className="mt-1 block w-full rounded border bg-background p-2" />
    </label>
  );

  return <form data-form-id="staff.delivery-rate" onSubmit={(event) => void submit(event)} className="space-y-5 rounded-xl border p-5">
      <FormGuide formId="staff.delivery-rate" />

    <p className="text-xs text-muted-foreground">* Required field</p>
    <fieldset disabled={pending} className="space-y-5">
      <legend className="font-semibold">Zone base rates</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        {field('valley', 'Kathmandu Valley', rates.zones.valley)}
        {field('terai', 'Terai priority districts', rates.zones.terai)}
        {field('nationwide', 'Other Nepal districts', rates.zones.nationwide)}
      </div>
      <p className="text-sm">These are first-store destination fees. Multiple products from one store share the fee; each additional store adds 50% of the selected base. Valley: Kathmandu, Bhaktapur and Lalitpur. Transit estimates remain 1–3, 2–5 and 3–7 days respectively.</p>
      <h2 className="font-semibold">District base-rate overrides</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor="rate-district">District
          <select id="rate-district" className="block rounded border bg-background p-2" value={district} onChange={(event) => setDistrict(event.target.value)}>
            <option value="">Select district</option>
            {districts.filter((name) => !overrides.includes(name)).map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <button type="button" className="rounded border p-2" disabled={!district} onClick={() => { setOverrides([...overrides, district]); setDistrict(''); }}>Add district rate</button>
      </div>
      {overrides.map((name) => <div key={name} className="flex items-end gap-3">
        {field(`district-${name}`, name, rates.districts[name] ?? 0)}
        <button type="button" className="rounded border p-2" onClick={() => setOverrides(overrides.filter((value) => value !== name))}>Use zone rate for {name}</button>
      </div>)}
      <label htmlFor="rate-reason" className="block">Reason for change <span aria-hidden="true">*</span>
        <textarea id="rate-reason" name="reason" minLength={10} maxLength={500} required className="mt-1 block w-full rounded border bg-background p-2" />
      </label>
      <Link href="/admin/staff-form-history?kind=delivery-rate" className="block text-sm underline">View delivery rate form history</Link>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={baseKeys} /> : null}
      {!catalog.canSubmit ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Loading form configuration…'}</p> : null}
      <button disabled={!catalog.canSubmit || pending} className="rounded bg-primary p-3 text-primary-foreground">Save rates for future orders</button>
    </fieldset>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {retry ? <div className="space-y-2 text-xs text-muted-foreground"><p>A rate change may already have succeeded. Check current rates before retrying. Changed values keep the same request reference and may conflict.</p><button type="button" className="rounded border p-2" disabled={pending} onClick={() => {
      if (!window.confirm('A prior rate change may already have succeeded. Check the rates first. Starting a new attempt may duplicate it. Continue?')) return;
      clearSessionAttempt(attemptKey); setRetry(false); setError('');
      if (catalog.status === 'stale') catalog.refresh();
    }}>Start a new attempt</button></div> : null}
    <output aria-live="polite">{message}</output>
  </form>;
}
