'use client';
import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DISTRICTS_BY_PROVINCE } from '@/lib/checkout/nepal-address';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
const applicationKeys = ['legalName', 'phone', 'identityNumber', 'district', 'identityType', 'identityPhoto', 'requestId', 'formVersion'];
const reportKeys = ['jobId', 'version', 'requestId', 'kind', 'note', 'cash', 'cashPaisa', 'proof', 'photo', 'video', 'openBoxOutcome', 'formVersion'];
const remittanceKeys = ['jobId', 'amount', 'amountPaisa', 'reference', 'requestId', 'formVersion', 'customAnswers'];
const input = 'mt-1 block w-full rounded-lg border bg-background p-2';
function Star() {
  return <span aria-hidden="true"> *</span>;
}
export function RiderApplicationForm() {
  const router = useRouter(),
    catalog = usePublishedFormConfig('rider.application'),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!catalog.canSubmit) return;
    setBusy(true);
    try {
      const data = new FormData(e.currentTarget);
      data.set('requestId', requestId);
      const r = await fetch('/api/rider/application', {
          method: 'POST',
          body: data,
        }),
        result = (await r.json()) as { error?: string; code?: string };
      if (!catalog.handleSubmissionResponse(r, result.code)) throw new Error(result.error ?? 'Application failed.');
      setRequestId(crypto.randomUUID());
      setMessage('Application submitted for Super Admin review.');
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Application failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      data-form-id="rider.application"
      onSubmit={(e) => void submit(e)}
      className="space-y-4 rounded-xl border p-5"
    >
      <h2 className="text-xl font-semibold">Apply as a rider</h2>
      <p>
        * Required. Your identity document is private and reviewed by Super
        Admin. It is retained with your application; automatic deletion is not
        enabled.
      </p>
      {[
        ['legalName', 'Legal name'],
        ['phone', 'Phone number'],
        ['identityNumber', 'Identity document number'],
      ].map(([name, label]) => (
        <label className="block" key={name}>
          {label}
          <Star />
          <input
            className={input}
            name={name}
            required
            maxLength={
              name === 'identityNumber' ? 80 : name === 'phone' ? 20 : 160
            }
          />
        </label>
      ))}
      <label className="block">
        Service district
        <Star />
        <select className={input} name="district" required>
          <option value="">Select district</option>
          {Object.values(DISTRICTS_BY_PROVINCE)
            .flat()
            .sort((a, b) => a.localeCompare(b))
            .map((d) => (
              <option key={d}>{d}</option>
            ))}
        </select>
      </label>
      <label className="block">
        Identity type
        <Star />
        <select className={input} name="identityType" required>
          {[
            ['citizenship', 'Citizenship'],
            ['national_id', 'National identity card'],
            ['passport', 'Passport'],
            ['driving_licence', 'Driving licence'],
          ].map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Private identity photo
        <Star />
        <input
          className={input}
          type="file"
          name="identityPhoto"
          accept="image/jpeg,image/png,image/webp"
          required
        />
        <span className="text-sm">
          JPG, PNG or WebP up to 5 MB; show the document clearly.
        </span>
      </label>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={applicationKeys} /> : null}
      <button
        className="rounded-lg bg-primary p-3 text-primary-foreground"
        disabled={busy || !catalog.canSubmit}
      >
        Submit rider application
      </button>
      <output aria-live="polite" className="block">
        {message || catalog.message}
      </output>
    </form>
  );
}
export function RiderReportForm({
  jobId,
  version,
  remaining,
  openBoxRequired,
}: {
  jobId: string;
  version: number;
  remaining: number;
  openBoxRequired: boolean;
}) {
  const router = useRouter(),
    catalog = usePublishedFormConfig('rider.report'),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [kind, setKind] = useState('delivered'),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!catalog.canSubmit) return;
    const form = new FormData(e.currentTarget);
    form.set('jobId', jobId);
    form.set('version', String(version));
    form.set('requestId', requestId);
    const proof = form.get('proof');
    form.delete('proof');
    if (proof instanceof File && proof.size)
      form.set(proof.type === 'video/mp4' ? 'video' : 'photo', proof);
    const rawCash = form.get('cash');
    const cash = typeof rawCash === 'string' ? rawCash : '0';
    if (!/^\d+(?:\.\d{1,2})?$/.test(cash)) {
      setMessage('Use a cash amount with up to two decimal places.');
      return;
    }
    const [whole, fraction = ''] = cash.split('.');
    const paisa = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
    if (paisa > BigInt(Number.MAX_SAFE_INTEGER)) {
      setMessage('Cash amount is too large.');
      return;
    }
    form.set('cashPaisa', paisa.toString());
    setBusy(true);
    try {
      const r = await fetch('/api/rider/reports', {
          method: 'POST',
          body: form,
        }),
        data = (await r.json()) as { error?: string; code?: string };
      if (!catalog.handleSubmissionResponse(r, data.code)) throw new Error(data.error ?? 'Report failed.');
      setRequestId(crypto.randomUUID());
      setMessage(
        'Report saved. Staff must verify it before delivery or COD records change.',
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Report failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      data-form-id="rider.report"
      onSubmit={(e) => void submit(e)}
      className="space-y-3 rounded-lg bg-muted p-4"
    >
      <h3 className="font-semibold">Report this delivery attempt</h3>
      <p className="text-sm">
        * Required. Proof and cash reports need staff confirmation. COD does not
        require OTP.
      </p>
      <label className="block">
        Report
        <Star />
        <select
          className={input}
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="delivered">Handed over to customer</option>
          <option value="failed_delivery">Delivery failed</option>
          <option value="customer_unavailable">Customer unavailable</option>
        </select>
      </label>
      {openBoxRequired ? (
        <div className="rounded-lg border border-primary/30 bg-background p-3 text-sm">
          <p className="font-semibold">
            Whole-parcel open-box inspection applies
          </p>
          <p>
            Inspect only what the recipient authorizes. Opening the outer
            shipping packaging does not require breaking an inner hygiene or
            protective seal. Record one outcome for this parcel. Acceptance or
            OTP does not waive a later valid wrong-item, damage, defect,
            description, or statutory claim.
          </p>
        </div>
      ) : null}
      {openBoxRequired && kind !== 'customer_unavailable' ? (
        <label className="block">
          Open-box outcome
          <Star />
          <select
            className={input}
            name="openBoxOutcome"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select the recorded whole-parcel outcome
            </option>
            {kind === 'delivered' ? (
              <>
                <option value="accepted_after_inspection">
                  Accepted after permitted inspection
                </option>
                <option value="accepted_outer_packaging_inner_seal_intact">
                  Accepted after outer packaging check; inner seal remained
                  intact
                </option>
                <option value="inspection_declined">
                  Recipient declined inspection and accepted parcel
                </option>
              </>
            ) : (
              <>
                <option value="refused_whole_parcel_wrong_item">
                  Whole parcel refused — wrong item
                </option>
                <option value="refused_whole_parcel_damage">
                  Whole parcel refused — visible damage
                </option>
                <option value="refused_whole_parcel_other">
                  Whole parcel refused — other reason in note
                </option>
              </>
            )}
          </select>
        </label>
      ) : (
        <input type="hidden" name="openBoxOutcome" value="not_applicable" />
      )}
      <label className="block">
        What happened / next action needed
        <Star />
        <textarea
          className={input}
          name="note"
          required
          minLength={8}
          maxLength={500}
        />
      </label>
      {kind === 'delivered' ||
      (openBoxRequired && kind === 'failed_delivery') ? (
        <>
          <label className="block">
            One proof photo OR video
            <Star />
            <input
              className={input}
              name="proof"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              required
            />
            <span className="text-sm">
              Photo up to 5 MB or MP4 up to 20 MB / 60 seconds. Show handover
              evidence; avoid unrelated people and documents.
            </span>
          </label>
          {kind === 'delivered' ? (
            <label className="block">
              COD cash received (NPR)
              <Star />
              <input
                className={input}
                name="cash"
                type="number"
                required
                min="0"
                max={remaining / 100}
                step="0.01"
                defaultValue="0"
              />
            </label>
          ) : (
            <input type="hidden" name="cash" value="0" />
          )}
        </>
      ) : (
        <input type="hidden" name="cash" value="0" />
      )}
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={reportKeys} /> : null}
      <button
        className="rounded-lg bg-primary p-3 text-primary-foreground"
        disabled={busy || !catalog.canSubmit}
      >
        Submit for staff confirmation
      </button>
      <output className="block" aria-live="polite">
        {message || catalog.message}
      </output>
    </form>
  );
}

export function RiderRemittanceForm({
  jobId,
  orderNumber,
  outstandingPaisa,
}: {
  jobId: string;
  orderNumber: string;
  outstandingPaisa: number;
}) {
  const router = useRouter(),
    catalog = usePublishedFormConfig('rider.remittance'),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!catalog.canSubmit || !catalog.config) return;
    const form = new FormData(e.currentTarget),
      rawAmount = form.get('amount'),
      reference = form.get('reference'),
      amount = typeof rawAmount === 'string' ? rawAmount : '';
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      setMessage('Use a positive cash amount with up to two decimal places.');
      return;
    }
    const [whole, fraction = ''] = amount.split('.'),
      paisa = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
    if (paisa < 1 || paisa > BigInt(Number.MAX_SAFE_INTEGER)) {
      setMessage('Enter a supported positive remittance amount.');
      return;
    }
    setBusy(true);
    try {
      const configured = readConfiguredSubmission(e.currentTarget, catalog.config, remittanceKeys);
      const response = await fetch('/api/rider/remittances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            amountPaisa: Number(paisa),
            reference,
            requestId,
            ...configuredJsonPayload(catalog.config, configured.answers, remittanceKeys),
          }),
        }),
        data = (await response.json()) as { error?: string; code?: string };
      if (!catalog.handleSubmissionResponse(response, data.code))
        throw new Error(data.error ?? 'Remittance submission failed.');
      setRequestId(crypto.randomUUID());
      setMessage(
        'Cash handover submitted. A different authorized finance reviewer must verify actual receipt.',
      );
      e.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Remittance submission failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      data-form-id="rider.remittance"
      onSubmit={(event) => void submit(event)}
      className="space-y-3 rounded-lg border bg-background p-4"
    >
      <h3 className="font-semibold">Submit cash handover — {orderNumber}</h3>
      <p className="text-sm">
        Outstanding recorded rider cash: NPR{' '}
        {(outstandingPaisa / 100).toFixed(2)}. This submission does not mark
        cash received by Hastabazaar; a different authorized person must verify
        actual receipt.
      </p>
      <label className="block">
        Amount handed over (NPR)
        <Star />
        <input
          className={input}
          name="amount"
          type="number"
          required
          min="0.01"
          max={outstandingPaisa / 100}
          step="0.01"
        />
      </label>
      <label className="block">
        Receipt or handover reference
        <Star />
        <input
          className={input}
          name="reference"
          required
          minLength={4}
          maxLength={120}
        />
      </label>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={remittanceKeys} /> : null}
      <button
        className="rounded-lg bg-primary p-3 text-primary-foreground"
        disabled={busy || !catalog.canSubmit}
      >
        Submit for finance verification
      </button>
      <output className="block" aria-live="polite">
        {message || catalog.message}
      </output>
    </form>
  );
}
