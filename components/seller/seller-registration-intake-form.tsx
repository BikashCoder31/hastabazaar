'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { useSellerDraft } from './use-seller-draft';
import { ManagedMakerAgreementFields } from './managed-maker-identity-fields';
import type { ManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import { registrationFields } from '@/lib/sellers/registration-intake';
import { sellerPhoneCountries } from '@/lib/sellers/contact-phone';
import { governmentIdTypes } from '@/lib/sellers/managed-identity';
import { sellerDocumentsForApplication } from '@/lib/sellers/application';
import { CURRENT_ONBOARDING_VERSION } from '@/lib/sellers/onboarding';
import type { DraftAnswers } from '@/lib/sellers/draft-contract';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

type SavedRegistration = { version: number; answers: DraftAnswers; documents: Record<string, { name: string }>; missing: string[] };
type Props = { accountId: string; accountEmail: string; managedTerms?: ManagedMakerApplicationTerms;
  registeredTerms?: { percent: number; context: string }; initial?: SavedRegistration; onSaved?: () => void };
const baseKeys = [...registrationFields.map(([key]) => key), 'hasBusinessTaxRegistration', 'applicantType', 'taxStatus', 'phoneCountry', 'province', 'governmentIdType', 'email',
  'businessDescription', 'productCategories', 'acceptedTerms', 'applicationAcknowledgement', 'managedAgreementAccepted', 'managedAgreementVersion', 'managedAgreementContext', 'sellerAgreementContext'];

export function SellerRegistrationIntakeForm({ accountId, accountEmail, managedTerms, registeredTerms, initial, onSaved }: Props) {
  const router = useRouter(); const formRef = useRef<HTMLFormElement>(null);
  const controlId = useId();
  const [registration, setRegistration] = useState<'yes' | 'no'>(initial?.answers.hasBusinessTaxRegistration?.[0] === 'yes' ? 'yes' : 'no');
  const [applicant, setApplicant] = useState<'company' | 'individual'>(initial?.answers.applicantType?.[0] === 'company' ? 'company' : 'individual');
  const [tax, setTax] = useState<'business_pan_only' | 'vat_registered'>(initial?.answers.taxStatus?.[0] === 'vat_registered' ? 'vat_registered' : 'business_pan_only');
  const [sameAddress, setSameAddress] = useState(Boolean(initial?.answers.pickupAddress?.[0] && initial.answers.pickupAddress[0] === initial.answers.returnAddress?.[0]));
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [reference, setReference] = useState('');
  const catalog = usePublishedFormConfig('seller.application');
  const restore = useCallback((values: { registration: 'yes' | 'no'; applicant: 'individual' | 'company'; tax: 'business_pan_only' | 'vat_registered'; addressesMatch: boolean }) => {
    setRegistration(values.registration); setApplicant(values.applicant); setTax(values.tax);
    setSameAddress(values.addressesMatch);
  }, []);
  const draft = useSellerDraft(formRef, accountId, catalog.config, restore, !initial);
  function addressControls() {
    const pickup = formRef.current?.elements.namedItem('pickupAddress');
    const returns = formRef.current?.elements.namedItem('returnAddress');
    return pickup instanceof HTMLInputElement && returns instanceof HTMLInputElement ? { pickup, returns } : null;
  }
  function toggleSameAddress(checked: boolean) {
    setSameAddress(checked);
    const controls = addressControls();
    if (checked && controls) {
      const address = controls.pickup.value.trim() ? controls.pickup.value : controls.returns.value;
      controls.pickup.value = address; controls.returns.value = address;
    }
  }
  function syncAddress(source: HTMLInputElement) {
    if (!sameAddress) return;
    const controls = addressControls();
    if (controls) (source.name === 'pickupAddress' ? controls.returns : controls.pickup).value = source.value;
  }
  const attemptKey = sessionAttemptKey('seller.application', `${accountId}:${initial?.version ?? 'new'}`);
  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault(); if (busy || !catalog.canSubmit || draft.status === 'loading') return;
    const form = event.currentTarget; setBusy(true); setMessage('');
    try {
      if (draft.status === 'conflict') throw new Error(draft.message);
      if (!initial) await draft.flush();
      const data = new FormData(form);
      if (!initial) await draft.attachSavedFiles(data);
      data.set('requestId', draft.attemptId() ?? getOrCreateSessionAttempt(attemptKey));
      if (initial) data.set('revision', String(initial.version));
      const response = await fetch('/api/seller-registrations', { method: initial ? 'PUT' : 'POST', body: data });
      const body = await response.json() as { error?: string; code?: string; applicationReference?: string; missing?: string[] };
      catalog.handleSubmissionResponse(response, body.code);
      if (!response.ok) throw new Error(body.error ?? 'Application could not be submitted.');
      if (!body.applicationReference) throw new Error('Submission could not be confirmed. Retry the same details or check your dashboard.');
      if (!initial) await draft.confirmedSubmission();
      clearSessionAttempt(attemptKey); setReference(body.applicationReference);
      setMessage(initial ? 'Your changes were sent for Super Admin review.' : 'Your application has been submitted. You can add missing details and prepare product listings in your dashboard.');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Submission could not be confirmed. Keep this page open and retry.'); }
    finally { setBusy(false); }
  }
  if (reference) return <section className="space-y-4 rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">Application submitted</h2><p>{message}</p><p>Reference: <strong>{reference}</strong></p>{initial ? <Button type="button" onClick={onSaved}>Continue editing details</Button> : <Link className="section-link" href="/sell/application">Open your seller dashboard →</Link>}</section>;
  const value = (name: string) => initial?.answers[name]?.[0] ?? '';
  const registered = registration === 'yes';
  const fields = registrationFields.filter(([key]) => !registered ? !['registrationAuthority', 'registrationNumber', 'taxRegistrationNumber', 'representativeName'].includes(key) : !['governmentIdDescription', 'personalPan'].includes(key));
  return <form ref={formRef} onSubmit={submit} onInput={draft.changed} onChange={draft.changed} className="space-y-6 rounded-2xl border bg-card p-5 sm:p-8" data-form-id="seller.application">
    <p className="rounded-xl bg-secondary/50 p-4 text-sm leading-6">All registration fields are optional at this stage. Leave anything you do not have blank. You can complete it from your dashboard and prepare product listings after submission. Super Admin approval is required before selling; reviewed bank details are required before payouts.</p>
    {!initial ? <aside aria-label="Saved registration progress" className="space-y-2"><output className="block">{draft.message}</output>{draft.draft ? <p className="text-sm">Draft expires {new Date(draft.draft.expiresAt).toLocaleDateString()}.</p> : null}<Button type="button" variant="outline" disabled={draft.status === 'loading' || draft.status === 'saving' || draft.status === 'conflict'} onClick={() => void draft.flush()}>Save progress now</Button></aside> : null}
    {initial?.missing.length ? <details className="rounded-xl border p-4"><summary>Details still needed before approval ({initial.missing.length})</summary><ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{initial.missing.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}
    <fieldset disabled={!draft.canEdit} inert={busy} className="contents">
      <div className="grid gap-5 sm:grid-cols-2">
        <label htmlFor={controlId + 'hasBusinessTaxRegistration'} className="space-y-2 text-sm">How you want to sell<NativeSelect id={controlId + 'hasBusinessTaxRegistration'} name="hasBusinessTaxRegistration" value={registration} onChange={event => setRegistration(event.target.value as 'yes' | 'no')} disabled={Boolean(initial)}><NativeSelectOption value="no">Sell through Hastabazaar</NativeSelectOption><NativeSelectOption value="yes">Registered business seller</NativeSelectOption></NativeSelect>{initial ? <input type="hidden" name="hasBusinessTaxRegistration" value={registration} /> : null}</label>
        {registered ? <><label htmlFor={controlId + 'applicantType'} className="space-y-2 text-sm">Business registration type<NativeSelect id={controlId + 'applicantType'} name="applicantType" value={applicant} onChange={event => setApplicant(event.target.value as 'company' | 'individual')}><NativeSelectOption value="individual">Sole proprietor / individual business</NativeSelectOption><NativeSelectOption value="company">Company / organisation</NativeSelectOption></NativeSelect></label><label htmlFor={controlId + 'taxStatus'} className="space-y-2 text-sm">Tax registration<NativeSelect id={controlId + 'taxStatus'} name="taxStatus" value={tax} onChange={event => setTax(event.target.value as typeof tax)}><NativeSelectOption value="business_pan_only">Business PAN</NativeSelectOption><NativeSelectOption value="vat_registered">VAT registered</NativeSelectOption></NativeSelect></label></> : <input type="hidden" name="applicantType" value="individual" />}
        <label htmlFor={controlId + 'email'} className="space-y-2 text-sm">Account email<Input id={controlId + 'email'} name="email" value={accountEmail} readOnly /><span>Use your signed-in, verified email. <a href="/account/profile" target="_blank" rel="noreferrer" className="underline">Verify email</a></span></label>
        <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2"><label htmlFor={controlId + 'phoneCountry'} className="space-y-2 text-sm">Phone country<NativeSelect id={controlId + 'phoneCountry'} name="phoneCountry" defaultValue={value('phoneCountry') || 'NP'}>{sellerPhoneCountries.map(country => <NativeSelectOption key={country.code} value={country.code}>{country.name} (+{country.dial})</NativeSelectOption>)}</NativeSelect></label><label htmlFor={controlId + 'phone'} className="space-y-2 text-sm">Contact phone<Input id={controlId + 'phone'} name="phone" type="tel" defaultValue={value('phone')} maxLength={10} inputMode="numeric" pattern="[0-9]{10}" placeholder="10 digits, without country code" /><span>Phone OTP verification is not required.</span></label></div>
        {fields.filter(([name]) => !['phone', 'pickupAddress', 'returnAddress'].includes(name)).map(([name, label, maximum]) => <label key={name} className="space-y-2 text-sm">{label}<Input name={name} defaultValue={value(name)} maxLength={maximum}
          type={name === 'phone' ? 'tel' : 'text'} inputMode={['phone', 'personalPan', 'taxRegistrationNumber'].includes(name) ? 'numeric' : undefined}
          pattern={name === 'phone' ? '[0-9]{10}' : ['personalPan', 'taxRegistrationNumber'].includes(name) ? '[0-9]{9}' : undefined}
          placeholder={name === 'phone' ? '10 digits, without country code' : undefined} />{name === 'phone' ? <span>Phone OTP verification is not required.</span> : null}</label>)}
        <div className="space-y-3 sm:col-span-2">
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={sameAddress} onChange={event => toggleSameAddress(event.target.checked)} aria-describedby={controlId + 'sameAddress-help'} />Pickup and return addresses are the same</label>
          <p id={controlId + 'sameAddress-help'} className="text-sm text-muted-foreground">Use the pickup address for both, or the return address if pickup is blank. While checked, editing either updates both. You can change these addresses later in your dashboard.</p>
          <div className="grid gap-5 sm:grid-cols-2">{registrationFields.filter(([name]) => name === 'pickupAddress' || name === 'returnAddress').map(([name, label, maximum]) => <label key={name} className="space-y-2 text-sm">{label}<Input name={name} defaultValue={value(name)} maxLength={maximum} onInput={event => syncAddress(event.currentTarget)} /></label>)}</div>
        </div>
        <label htmlFor={controlId + 'province'} className="space-y-2 text-sm">Province<NativeSelect id={controlId + 'province'} name="province" defaultValue={value('province')}><NativeSelectOption value="">Add later</NativeSelectOption>{['Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim'].map(province => <NativeSelectOption key={province} value={province}>{province}</NativeSelectOption>)}</NativeSelect></label>
        {!registered ? <label htmlFor={controlId + 'governmentIdType'} className="space-y-2 text-sm">Government ID type<NativeSelect id={controlId + 'governmentIdType'} name="governmentIdType" defaultValue={value('governmentIdType')}><NativeSelectOption value="">Add later</NativeSelectOption>{governmentIdTypes.map(type => <NativeSelectOption key={type} value={type}>{type.replaceAll('_', ' ')}</NativeSelectOption>)}</NativeSelect></label> : null}
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Verification documents — add now or later</legend>
        {sellerDocumentsForApplication({ participationRoute: registered ? 'registered_seller' : 'managed_maker', applicantType: registered ? applicant : 'individual', taxMode: registered ? tax === 'vat_registered' ? 'VAT' : 'PAN' : 'NONE', onboarding: { version: CURRENT_ONBOARDING_VERSION, bankDetailsDeferred: true } }).map(document => {
          const saved = draft.draft?.files[document.field]?.name ?? initial?.documents[document.field]?.name;
          return <label key={document.field} className="space-y-2 text-sm">{document.label}<Input name={document.field} type="file" accept="application/pdf,image/jpeg,image/png" />{saved ? <span>Saved: {saved}. Choose a file to replace it.{!initial ? <button type="button" className="ml-2 underline" onClick={() => draft.removeFile(document.field)}>Remove</button> : null}</span> : null}</label>;
        })}<p className="text-sm text-muted-foreground sm:col-span-2">PDF, JPG or PNG; up to 5 MB each. Documents remain private.</p>
      </fieldset>
      {!registered && managedTerms ? <><ManagedMakerAgreementFields terms={managedTerms} optional collapseTerms /><label className="flex gap-3 text-sm"><input type="checkbox" name="applicationAcknowledgement" value="yes" />I understand that this is an application for review and does not automatically approve selling. You may confirm this later.</label></> : null}
      {registered && registeredTerms ? <><input type="hidden" name="sellerAgreementContext" value={registeredTerms.context} /><label className="flex gap-3 text-sm"><input type="checkbox" name="acceptedTerms" value="yes" /><span>I accept the <a href="/seller-agreement" target="_blank" rel="noreferrer" className="underline">Seller Marketplace Agreement</a>, including the displayed {registeredTerms.percent}% commission. You may review and accept it later.</span></label></> : null}
      {catalog.config ? <ConfiguredFields config={{ ...catalog.config, fields: catalog.config.fields.map(field => ({ ...field, required: false })) }} baseKeys={baseKeys} defaultAnswers={initial?.answers} showOptionalLabel={false} /> : null}
      <div className="sr-only" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
      {catalog.status !== 'ready' ? <div role="alert"><p>{catalog.message || 'Loading form questions…'}</p>{catalog.status !== 'loading' ? <Button type="button" onClick={catalog.refresh}>Refresh questions and keep my answers</Button> : null}</div> : null}
      <Button type="submit" disabled={busy || !catalog.canSubmit || !draft.canEdit}>{busy ? 'Submitting…' : initial ? 'Submit updated details for review' : 'Submit application'}</Button>
    </fieldset>
  </form>;
}

export function SellerRegistrationDetails(props: Omit<Props, 'initial'>) {
  const [record, setRecord] = useState<SavedRegistration | null>(null); const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { void fetch('/api/seller-registrations', { cache: 'no-store' }).then(async response => {
    const body = await response.json() as { registration: SavedRegistration | null; error?: string };
    if (!response.ok) throw new Error(body.error); setRecord(body.registration);
  }).catch(error => setMessage(error.message)); }, [refresh]);
  if (!record) return message ? <p role="alert">{message}</p> : null;
  return <section className="space-y-4" id="registration-details"><h2 className="font-heading text-2xl">Complete or update registration details</h2>{message ? <p role="alert">{message}</p> : null}<SellerRegistrationIntakeForm key={record.version} {...props} initial={record} onSaved={() => { setMessage(''); setRefresh(value => value + 1); }} /></section>;
}
