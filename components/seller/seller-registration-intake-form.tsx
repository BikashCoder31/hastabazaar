'use client';
import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { useSellerDraft, type RouteValues } from './use-seller-draft';
import { useOwnedFormScope } from '@/components/forms/use-owned-form-scope';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { ManagedMakerAgreementFields } from './managed-maker-identity-fields';
import type { ManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import { registrationFields } from '@/lib/sellers/registration-intake';
import { sellerPhoneCountries, sellerPhoneConstraints } from '@/lib/sellers/contact-phone';
import { governmentIdTypes } from '@/lib/sellers/managed-identity';
import { maximumDocumentBytes, sellerDocumentsForApplication } from '@/lib/sellers/application';
import { DISTRICTS_BY_PROVINCE, NEPAL_PROVINCES, normalizeProvince } from '@/lib/checkout/nepal-address';
import { CURRENT_ONBOARDING_VERSION } from '@/lib/sellers/onboarding';
import type { DraftAnswers } from '@/lib/sellers/draft-contract';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { normalizeSellerRegistrationEmail, savedSellerRegistrationEmail } from '@/lib/sellers/registration-email';
import { RegistrationEmailVerification } from './registration-email-verification';

type SavedRegistration = { version: number; answers: DraftAnswers; documents: Record<string, { name: string }>; missing: string[]; editable?: boolean; approvedCompletion?: boolean; lockedFields?: string[]; lockedDocumentKinds?: string[] };
type Props = { accountId: string; accountEmail: string; managedTerms?: ManagedMakerApplicationTerms;
  registeredTerms?: { percent: number; context: string }; initial?: SavedRegistration; onSaved?: () => void; lockedFields?: readonly string[]; lockedDocumentKinds?: readonly string[]; workspace?: boolean;
  wizard?: boolean; verifiedEmails?: readonly string[] };
const baseKeys = [...registrationFields.map(([key]) => key), 'hasBusinessTaxRegistration', 'applicantType', 'taxStatus', 'phoneCountry', 'province', 'governmentIdType', 'email',
  'businessDescription', 'productCategories', 'acceptedTerms', 'applicationAcknowledgement', 'managedAgreementAccepted', 'managedAgreementVersion', 'managedAgreementContext', 'sellerAgreementContext', 'registrationEmailChoice'];

const steps = [
  ['How you’ll sell', '', 'How do you want to sell?'],
  ['Your business', 'Name, type, PAN', 'Your business'],
  ['Contact & pickup', 'Verify your email', 'Contact & pickup'],
  ['Documents', 'Optional now', 'Documents'],
  ['Agree & submit', '', 'Agree & submit'],
] as const;
const contactFields = new Set(['district', 'municipality', 'ward', 'locality']);
const panel = 'min-w-0 rounded-[18px] border border-[#E4DACA] bg-[#FCF9F4] p-5 sm:p-7';
const fieldStyle = 'h-11 border-[#D7C7AD] bg-white text-[#14213D]';
const selectStyle = 'w-full [&_select]:h-11 [&_select]:border-[#D7C7AD] [&_select]:bg-white';
const primaryAction = 'min-h-11 rounded-[10px] bg-[#14213D] px-5 text-white hover:bg-[#223557]';

export function SellerRegistrationIntakeForm(props: Props) {
  const scope = useOwnedFormScope(`${props.accountId}:${props.initial?.version ?? 'new'}`);
  return <OwnedSellerRegistrationIntakeForm key={scope.key} {...props} isCurrent={scope.isCurrent} />;
}

function recordedIdentity(answers?: DraftAnswers): string {
  const type = answers?.governmentIdType?.[0] ?? '';
  return governmentIdTypes.some(value => value === type) ? type : answers?.governmentIdDescription?.[0] ? '' : 'citizenship';
}

function OwnedSellerRegistrationIntakeForm({ accountId, accountEmail, managedTerms, registeredTerms, initial, onSaved, lockedFields=[],lockedDocumentKinds=[], workspace=false, wizard=false, verifiedEmails=[], isCurrent }: Props & {isCurrent: () => boolean}) {
  const router = useRouter(); const formRef = useRef<HTMLFormElement>(null);
  const controlId = useId();
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [routeChosen, setRouteChosen] = useState(!wizard || Boolean(initial));
  const [registration, setRegistration] = useState<'yes' | 'no'>(initial?.answers.hasBusinessTaxRegistration?.[0] === 'yes' ? 'yes' : 'no');
  const [applicant, setApplicant] = useState<'company' | 'individual'>(initial?.answers.applicantType?.[0] === 'company' ? 'company' : 'individual');
  const [tax, setTax] = useState<'business_pan_only' | 'vat_registered'>(initial?.answers.taxStatus?.[0] === 'vat_registered' ? 'vat_registered' : 'business_pan_only');
  const [sameAddress, setSameAddress] = useState(Boolean(initial?.answers.pickupAddress?.[0] && initial.answers.pickupAddress[0] === initial.answers.returnAddress?.[0]));
  const [identityType, setIdentityType] = useState(() => recordedIdentity(initial?.answers));
  const [accessDenied, setAccessDenied] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState(initial?.answers.phoneCountry?.[0] || 'NP');
  const [province, setProvince] = useState(initial?.answers.province?.[0] ?? '');
  const savedEmail = savedSellerRegistrationEmail(initial?.answers);
  const [email, setEmail] = useState(savedEmail ?? accountEmail);
  const normalizedEmail = normalizeSellerRegistrationEmail(email);
  const [verifiedThisSession, setVerifiedThisSession] = useState<string>();
  const verified = Boolean(normalizedEmail && (verifiedEmails.includes(normalizedEmail) || normalizedEmail === verifiedThisSession ||
    (savedEmail === normalizedEmail && normalizedEmail !== accountEmail.toLowerCase())));
  const phoneConstraints = sellerPhoneConstraints(phoneCountry);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [reference, setReference] = useState('');
  const [remaining, setRemaining] = useState<string[]>([]);
  const [acceptedAgreement, setAcceptedAgreement] = useState<{ route: string; context: string }>();
  const [acknowledgedRoute, setAcknowledgedRoute] = useState<string>();
  const registered = registration === 'yes';
  const documentFields = sellerDocumentsForApplication({
    participationRoute: registered ? 'registered_seller' : 'managed_maker',
    applicantType: registered ? applicant : 'individual',
    taxMode: registered ? tax === 'vat_registered' ? 'VAT' : 'PAN' : 'NONE',
    onboarding: { version: CURRENT_ONBOARDING_VERSION, bankDetailsDeferred: true },
  });
  function labelDocumentMessage(text: string) {
    const document = documentFields.find(({ field }) => text.startsWith(field + ': '));
    return document ? document.label + text.slice(document.field.length) : text;
  }
  const currentContext = (registered ? registeredTerms : managedTerms)?.context;
  const canSubmitNew = Boolean(routeChosen && (!wizard || verified) && currentContext && acceptedAgreement?.route === registration &&
    acceptedAgreement.context === currentContext && acknowledgedRoute === registration);
  const catalog = usePublishedFormConfig('seller.application');
  const restore = useCallback((values: RouteValues) => {
    setRegistration(initial ? initial.answers.hasBusinessTaxRegistration?.[0] === 'yes' ? 'yes' : 'no' : values.registration);
    setApplicant(lockedFields.includes('applicantType')?(initial?.answers.applicantType?.[0]==='company'?'company':'individual'):values.applicant);
    setTax(lockedFields.includes('taxStatus')?(initial?.answers.taxStatus?.[0]==='vat_registered'?'vat_registered':'business_pan_only'):values.tax);
    setIdentityType(lockedFields.includes('governmentIdType') ? recordedIdentity(initial?.answers) : recordedIdentity(values.identityAnswers));
    setSameAddress(values.addressesMatch);
    setPhoneCountry(values.phoneCountry);
    setProvince(values.identityAnswers.province?.[0] ?? initial?.answers.province?.[0] ?? '');
    setRouteChosen(!wizard || !!initial || ['yes', 'no'].includes(values.identityAnswers.hasBusinessTaxRegistration?.[0] ?? ''));
    setEmail(values.email === undefined ? savedEmail ?? accountEmail : values.email || accountEmail);
  }, [initial,lockedFields,savedEmail,accountEmail,wizard]);
  const draft = useSellerDraft(formRef, accountId, catalog.config, restore, true, initial ? `registration_v${initial.version}` : 'new', isCurrent);
  useEffect(() => { if (draft.accessDenied && isCurrent()) router.refresh(); }, [draft.accessDenied, isCurrent, router]);
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
  function changeRoute(next: 'yes' | 'no') {
    setRegistration(next);
    setRouteChosen(true);
    setAcceptedAgreement(undefined);
    setAcknowledgedRoute(undefined);
  }
  function openStep(next: number, focus = true) {
    setStep(next);
    if (focus) requestAnimationFrame(() => document.getElementById(controlId + 'step-' + next)?.focus());
  }
  async function advance() {
    if (step >= steps.length - 1 || (step === 0 && !routeChosen) || !draft.canEdit || draft.status === 'conflict') return;
    if (draft.hasUnsaved && !await draft.flush()) return;
    if (!isCurrent()) return;
    setVisited(Math.max(visited, step + 1));
    openStep(step + 1);
  }
  const attemptKey = sessionAttemptKey('seller.application', `${accountId}:${initial?.version ?? 'new'}`);
  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (wizard && step < steps.length - 1) { await advance(); return; }
    if (!isCurrent() || accessDenied || draft.accessDenied || busy || !catalog.canSubmit || draft.status === 'loading' || (!initial && !canSubmitNew)) return;
    const form = event.currentTarget;
    if (wizard) {
      const invalid = Array.from(form.elements).find(field =>
        (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)
        && field.willValidate && !field.validity.valid);
      if (invalid instanceof HTMLInputElement || invalid instanceof HTMLSelectElement || invalid instanceof HTMLTextAreaElement) {
        const invalidStep = invalid.closest<HTMLElement>('[data-registration-step]')?.dataset.registrationStep;
        if (invalidStep !== undefined) openStep(Number(invalidStep), false);
        requestAnimationFrame(() => invalid.reportValidity());
        return;
      }
    }
    setBusy(true); setMessage('');
    try {
      if (!await draft.flush()) throw new Error(draft.getSaveError() ?? 'Your current progress could not be confirmed. Review the save status and retry before submitting.');
      if (!isCurrent()) return;
      const data = new FormData(form);
      data.delete('registrationEmailChoice');
      await draft.attachSavedFiles(data);
      if (!isCurrent()) return;
      data.set('requestId', draft.attemptId() ?? getOrCreateSessionAttempt(attemptKey));
      if (initial) data.set('revision', String(initial.version));
      const response = await fetch('/api/seller-registrations', { method: initial ? 'PUT' : 'POST', headers: {[ACTOR_INTENT_HEADER]: accountId}, body: data });
      const body = await response.json() as { error?: string; code?: string; applicationReference?: string; missing?: string[] };
      if (!isCurrent()) return;
      if (response.status === 401 || response.status === 403) { setAccessDenied(true); router.refresh(); return; }
      catalog.handleSubmissionResponse(response, body.code);
      if (wizard && body.code === 'email_verification_required') openStep(2);
      if (!response.ok) throw new Error(body.error ?? 'Application could not be submitted.');
      if (!body.applicationReference) throw new Error('Submission could not be confirmed. Retry the same details or check your dashboard.');
      await draft.confirmedSubmission();
      if (!isCurrent()) return;
      clearSessionAttempt(attemptKey); setReference(body.applicationReference);
      setRemaining(body.missing ?? []);
      setMessage(initial?.approvedCompletion ? 'Your registration details were saved. New documents are sent for review.' : initial ? 'Your changes were sent for Super Admin review.' : 'Your application has been submitted. You can add missing details and prepare product listings in your dashboard.');
    } catch (error) { if (!isCurrent()) return; setMessage(error instanceof Error ? error.message : 'Submission could not be confirmed. Keep this page open and retry.'); }
    finally { if (isCurrent()) setBusy(false); }
  }
  if (accessDenied || draft.accessDenied) return <p role="alert">Your account access changed. Refresh this page to check your current account before continuing.</p>;
  const ConfirmationHeading = wizard ? 'h1' : 'h2';
  if (reference) return (
    <section className={panel + ' max-w-3xl space-y-5'} aria-labelledby={controlId + 'sent'}>
      <CircleCheck className="size-9 text-[#236548]" aria-hidden="true" />
      <ConfirmationHeading id={controlId + 'sent'} className="font-heading text-3xl">{initial ? 'Registration details saved' : wizard ? 'Application sent' : 'Application submitted'}</ConfirmationHeading>
      <output className="block text-[#465573]">{message}</output>
      <p>Reference <strong className="break-words">{reference}</strong></p>
      {remaining.length ? <div className="space-y-2 rounded-xl bg-[#F3EEE3] p-4">
        <h3 className="font-semibold">Still to add from your dashboard</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">{remaining.map((item, index) => <li key={index}>{labelDocumentMessage(item)}</li>)}</ul>
      </div> : null}
      {initial
        ? <Button type="button" className={primaryAction} onClick={() => { if (onSaved) onSaved(); else router.refresh(); }}>Continue editing details</Button>
        : <Link className={primaryAction + ' inline-flex items-center gap-2'} href="/seller">Open Seller Center <ArrowRight className="size-4" aria-hidden="true" /></Link>}
    </section>
  );

  const value = (name: string) => initial?.answers[name]?.[0] ?? '';
  const availableFields = registrationFields.filter(([key]) => registered
    ? !['governmentIdDescription', 'personalPan'].includes(key)
    : !['registrationAuthority', 'registrationNumber', 'taxRegistrationNumber', 'representativeName'].includes(key));
  const currentProvince = normalizeProvince(province);
  function field([name, label, maximum]: typeof registrationFields[number]) {
    const locked = lockedFields.includes(name);
    return (
      <label key={name} className="grid min-w-0 gap-1.5 text-sm font-medium">
        {name === 'governmentIdDescription' && identityType !== 'citizenship'
          ? `Recorded ${identityType ? identityType.replaceAll('_', ' ') : 'identity'} number` : label}
        {locked ? ' — verified, read-only' : ''}
        <Input name={name} className={fieldStyle} defaultValue={value(name)} maxLength={name === 'ward' ? undefined : maximum}
          readOnly={locked} type={name === 'ward' ? 'number' : 'text'}
          list={name === 'district' && currentProvince ? controlId + 'districts' : undefined}
          inputMode={['ward', 'personalPan', 'taxRegistrationNumber'].includes(name) ? 'numeric' : undefined}
          min={name === 'ward' ? 1 : undefined} max={name === 'ward' ? 99 : undefined} step={name === 'ward' ? 1 : undefined}
          pattern={['personalPan', 'taxRegistrationNumber'].includes(name) ? '[0-9]{9}' : undefined} />
      </label>
    );
  }
  const submitButton = <Button type="submit" size={workspace ? 'workspace' : undefined} variant={workspace ? 'workspace-decision' : undefined}
    className={primaryAction} disabled={busy || !catalog.canSubmit || !draft.canEdit || draft.status === 'conflict' || (!initial && !canSubmitNew)}>
    {busy ? 'Submitting…' : initial ? 'Submit updated details for review' : 'Submit application'}
  </Button>;
  const saveButton = <Button type="button" variant={workspace ? 'workspace-outline' : 'ghost'} size={workspace ? 'workspace' : undefined}
    className="min-h-11" disabled={busy || draft.status === 'loading' || draft.status === 'saving' || draft.status === 'conflict'}
    onClick={() => void draft.flush()}>{wizard ? 'Save progress' : 'Save progress now'}</Button>;
  const status = (
    <aside aria-label="Saved registration progress" className={wizard ? 'text-sm' : 'space-y-2'}>
      {wizard && draft.status === 'ready' && draft.draft ? (
        <output className="flex items-center gap-2 font-semibold text-[#236548]">
          <Check className="size-4 shrink-0" aria-hidden="true" /> Progress saved
        </output>
      ) : <output className="block text-[#465573]">{labelDocumentMessage(draft.message)}</output>}
      {draft.draft ? <p className="mt-1 text-xs text-[#465573]">Draft expires {new Date(draft.draft.expiresAt).toLocaleDateString('en-NP', { timeZone: 'Asia/Kathmandu' })}.</p> : null}
      {wizard && draft.status === 'ready' && draft.draft && draft.message.includes('questions have changed')
        ? <p className="mt-1 text-[#465573]">{labelDocumentMessage(draft.message)}</p> : null}
      {!wizard ? saveButton : null}
      {draft.status === 'conflict' ? <div className="mt-3 space-y-3 rounded-xl border border-[#E4DACA] bg-white p-4">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void draft.reviewLatest()}>Review latest saved progress</Button>
        {draft.conflictDraft ? <>
          <details open><summary className="min-h-11 cursor-pointer py-2 font-semibold">Latest saved values — compare with your form below</summary>
            <dl className="mt-3 space-y-2">
              {Object.entries(draft.conflictDraft.answers).map(([key, values]) => <div key={key}>
                <dt className="font-semibold">{registrationFields.find(([name]) => name === key)?.[1] ?? key}</dt>
                <dd className="whitespace-pre-wrap break-words">{values.join(', ') || 'Blank'}</dd>
              </div>)}
              {Object.entries(draft.conflictDraft.files).map(([key, file]) => <div key={key}><dt>{key}</dt><dd className="break-words">Saved file: {file.name}</dd></div>)}
            </dl>
          </details>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => draft.resolveConflict(true)}>Use saved progress</Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => draft.resolveConflict(false)}>Keep my current entries</Button>
          </div>
          <p className="text-sm">Your choice saves only the private draft. Submit separately to send the application or the details for review.</p>
        </> : null}
      </div> : null}
    </aside>
  );
  const panelHeading = (index: number) =>
    <h2 id={controlId + 'step-' + index} tabIndex={-1} className="mb-5 scroll-mt-44 font-heading text-3xl leading-tight outline-none">{steps[index][2]}</h2>;

  return (
    <form ref={formRef} onSubmit={submit} onChange={draft.changed} noValidate={wizard} className="min-w-0 space-y-5 text-[#14213D]" data-form-id="seller.application">
      {wizard ? (
        <header className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="max-w-[10ch] font-heading text-[clamp(3rem,5.2vw,4.1rem)] leading-none tracking-tight sm:max-w-none">Seller application</h1>
          {status}
        </header>
      ) : status}
      {initial?.missing.length ? <details className="rounded-xl border border-[#E4DACA] bg-white px-4" open={initial.approvedCompletion}>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">Registration items to complete ({initial.missing.length})</summary>
        <ul className="list-disc space-y-1 pb-4 pl-5 text-sm">{initial.missing.map((item, index) => <li key={index}>{item}</li>)}</ul>
      </details> : null}
      <div className={wizard ? 'grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2.1fr)] xl:grid-cols-[minmax(0,0.9fr)_minmax(0,2.1fr)_minmax(0,1.1fr)]' : 'grid min-w-0 gap-4'}>
        {wizard ? <nav aria-label="Application steps" className="relative min-w-0 overflow-x-auto pb-1 lg:pb-0">
          <ol className="flex w-max items-center gap-1.5 lg:w-full lg:flex-col lg:items-stretch">
            {steps.map(([label, detail], index) => <li key={label} className="min-w-0">
              <button type="button" aria-current={step === index ? 'step' : undefined} onClick={() => openStep(index)}
                disabled={busy}
                className={`flex min-h-11 w-full items-center gap-2.5 rounded-[12px] border px-2.5 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 ${step === index ? 'border-[#E4DACA] bg-white font-semibold' : 'border-transparent text-[#465573] hover:bg-[#FCF9F4]'}`}>
                <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${step === index ? 'bg-[#14213D] text-white' : index < visited ? 'bg-[#236548] text-white' : 'bg-[#EBE2CF] text-[#465573]'}`}>
                  {index < visited && step !== index ? <Check className="size-4" /> : index + 1}
                </span>
                <span className="min-w-0 max-lg:whitespace-nowrap">{label}
                  {index < visited ? <span className="sr-only">, completed</span> : null}
                  {index === 0 && routeChosen ? <small className="hidden text-[11px] font-normal text-[#665B4D] lg:block">{registered ? 'Registered business' : 'Company supply'}</small>
                    : detail ? <small className="hidden text-[11px] font-normal text-[#665B4D] lg:block">{detail}</small> : null}
                </span>
              </button>
            </li>)}
          </ol>
        </nav> : null}

        <div className="min-w-0 space-y-4">
          <fieldset disabled={!draft.canEdit} inert={busy} className="contents [&_summary]:min-h-11 [&_summary]:py-2 [&_[data-slot=input]]:min-h-11 [&_textarea]:min-h-11 [&_button:not([role=checkbox])]:min-h-11">
            <section className={panel} hidden={wizard && step !== 0} data-registration-step="0">
              {panelHeading(0)}
              {wizard && !initial ? (
                <fieldset className="space-y-2.5">
                  <legend className="sr-only">How you want to sell</legend>
                  {([
                    ['no', 'Sell through Hastabazaar', 'You supply. Hastabazaar sells and invoices. Your listings show “Supplied by …”.'],
                    ['yes', 'Registered business seller', 'Your registered business sells and invoices. Your listings show “Sold by …”. Personal PAN alone doesn’t qualify.'],
                  ] as const).map(([route, label, detail]) => (
                    <label key={route} aria-label={label} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 text-sm ${routeChosen && registration === route ? 'border-[#14213D] ring-1 ring-[#14213D]' : 'border-[#D7C7AD]'}`}>
                      <input type="radio" name="hasBusinessTaxRegistration" value={route}
                        checked={routeChosen && registration === route} onChange={() => changeRoute(route)}
                        className="mt-1 size-4 shrink-0 accent-[#14213D]" required />
                      <span><strong className="block">{label}</strong><span className="mt-1 block text-[#465573]">{detail}</span></span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <label htmlFor={controlId + 'hasBusinessTaxRegistration'} className="grid gap-1.5 text-sm font-medium">
                  How you want to sell
                  <NativeSelect id={controlId + 'hasBusinessTaxRegistration'} className={selectStyle} name="hasBusinessTaxRegistration"
                    value={registration} onChange={event => changeRoute(event.target.value as 'yes' | 'no')} disabled={Boolean(initial)}>
                    <NativeSelectOption value="no">Sell through Hastabazaar</NativeSelectOption>
                    <NativeSelectOption value="yes">Registered business seller</NativeSelectOption>
                  </NativeSelect>
                  {initial ? <input type="hidden" name="hasBusinessTaxRegistration" value={registration} /> : null}
                </label>
              )}
            </section>

            <section className={panel} hidden={wizard && step !== 1} data-registration-step="1">
              {panelHeading(1)}
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {availableFields.filter(([name]) => !contactFields.has(name) && !['phone', 'pickupAddress', 'returnAddress'].includes(name)).map(field)}
                {registered ? <>
                  <label htmlFor={controlId + 'applicantType'} className="grid min-w-0 gap-1.5 text-sm font-medium">Business registration type
                    <NativeSelect id={controlId + 'applicantType'} className={selectStyle} name="applicantType" value={applicant}
                      onChange={event => setApplicant(event.target.value as typeof applicant)} disabled={lockedFields.includes('applicantType')}>
                      <NativeSelectOption value="individual">Sole proprietor / individual business</NativeSelectOption>
                      <NativeSelectOption value="company">Company / organisation</NativeSelectOption>
                    </NativeSelect>
                    {lockedFields.includes('applicantType') ? <input type="hidden" name="applicantType" value={applicant} /> : null}
                  </label>
                  <label htmlFor={controlId + 'taxStatus'} className="grid min-w-0 gap-1.5 text-sm font-medium">Tax registration
                    <NativeSelect id={controlId + 'taxStatus'} className={selectStyle} name="taxStatus" value={tax}
                      onChange={event => setTax(event.target.value as typeof tax)} disabled={lockedFields.includes('taxStatus')}>
                      <NativeSelectOption value="business_pan_only">Business PAN</NativeSelectOption>
                      <NativeSelectOption value="vat_registered">VAT registered</NativeSelectOption>
                    </NativeSelect>
                    {lockedFields.includes('taxStatus') ? <input type="hidden" name="taxStatus" value={tax} /> : null}
                  </label>
                </> : <>
                  <input type="hidden" name="applicantType" value="individual" />
                  <input type="hidden" name="governmentIdType" value={identityType} />
                  {identityType !== 'citizenship' ? <div className="space-y-2 text-sm">
                    <p>Recorded identity type: {identityType ? identityType.replaceAll('_', ' ') : 'not specified in the saved record'}. Your recorded reference keeps this type.</p>
                    {!lockedFields.includes('governmentIdType') && !lockedFields.includes('governmentIdDescription') ? <Button type="button" variant="outline" className="min-h-11" onClick={() => {
                      const control = formRef.current?.elements.namedItem('governmentIdDescription');
                      if (control instanceof HTMLInputElement) control.value = '';
                      setIdentityType('citizenship');
                      draft.changed();
                    }}>Use citizenship number instead</Button> : null}
                  </div> : <p className="text-sm text-[#465573]">Add your citizenship number now or later.</p>}
                </>}
              </div>
            </section>

            <section className={panel} hidden={wizard && step !== 2} data-registration-step="2">
              {panelHeading(2)}
              <div className="space-y-4">
                <div className="grid min-w-0 gap-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label htmlFor={controlId + 'email'} className="font-medium sm:col-span-full">{wizard ? 'Seller updates email' : 'Seller registration email'}</label>
                  <Input id={controlId + 'email'} name="email" type="email" autoComplete="email" maxLength={254} required
                    className={fieldStyle} value={email} onChange={event => setEmail(event.target.value)} aria-describedby={controlId + 'email-help'} />
                  <input type="hidden" name="registrationEmailChoice" value={normalizedEmail === accountEmail.toLowerCase() ? '' : email} />
                  <RegistrationEmailVerification key={normalizedEmail ?? ''} accountId={accountId} email={normalizedEmail}
                    alreadyVerified={verified} applicationStyle={wizard} onVerified={setVerifiedThisSession} />
                  <p id={controlId + 'email-help'} className="text-[#665B4D] sm:col-span-full">Use your sign-in email or enter another address for seller updates.</p>
                  {email !== accountEmail ? <Button type="button" variant="ghost" className="min-h-11 justify-self-start sm:col-span-full" onClick={() => {
                    setEmail(accountEmail);
                    draft.changed();
                  }}>Use sign-in email</Button> : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor={controlId + 'phoneCountry'} className="grid min-w-0 gap-1.5 text-sm font-medium">Phone country
                    <NativeSelect id={controlId + 'phoneCountry'} className={selectStyle} name="phoneCountry" value={phoneCountry} onChange={event => setPhoneCountry(event.target.value)}>
                      {sellerPhoneCountries.map(country => <NativeSelectOption key={country.code} value={country.code}>{country.name} (+{country.dial})</NativeSelectOption>)}
                    </NativeSelect>
                  </label>
                  <label htmlFor={controlId + 'phone'} className="grid min-w-0 gap-1.5 text-sm font-medium">Contact phone
                    <Input id={controlId + 'phone'} name="phone" type="tel" className={fieldStyle} defaultValue={value('phone')}
                      maxLength={phoneConstraints.maxLength} inputMode="numeric" pattern={phoneConstraints.pattern} placeholder={phoneConstraints.guidance} />
                    <span className="font-normal text-[#665B4D]">{wizard ? 'No phone code needed.' : 'Phone OTP verification is not required.'}</span>
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor={controlId + 'province'} className="grid min-w-0 gap-1.5 text-sm font-medium">Province
                    <NativeSelect id={controlId + 'province'} className={selectStyle} name="province" value={province} onChange={event => setProvince(event.target.value)}>
                      <NativeSelectOption value="">Add later</NativeSelectOption>
                      {NEPAL_PROVINCES.map(name => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}
                    </NativeSelect>
                  </label>
                  {availableFields.filter(([name]) => contactFields.has(name)).map(field)}
                  {currentProvince ? <datalist id={controlId + 'districts'}>
                    {DISTRICTS_BY_PROVINCE[currentProvince].map(district => <option key={district} value={district}>{district}</option>)}
                  </datalist> : null}
                </div>
                {registrationFields.filter(([name]) => name === 'pickupAddress' || name === 'returnAddress').map(([name, label, maximum]) =>
                  <label key={name} className="space-y-1.5 text-sm font-medium" hidden={wizard && sameAddress && name === 'returnAddress'}>
                    {wizard && name === 'pickupAddress' ? 'Pickup address' : label}
                    <Input name={name} className={fieldStyle} defaultValue={value(name)} maxLength={maximum} onInput={event => syncAddress(event.currentTarget)} />
                    {name === 'pickupAddress' ? <span className="block font-normal text-[#665B4D]">Couriers collect parcels from here.</span> : null}
                  </label>
                )}
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" className="size-4 shrink-0 accent-[#14213D]" checked={sameAddress} onChange={event => toggleSameAddress(event.target.checked)}
                    aria-describedby={wizard ? undefined : controlId + 'sameAddress-help'} />
                  {wizard ? 'Returns come back to the same address' : 'Pickup and return addresses are the same'}
                </label>
                {!wizard ? <p id={controlId + 'sameAddress-help'} className="text-sm text-[#665B4D]">Use the pickup address for both, or the return address if pickup is blank. While checked, editing either updates both. You can change these addresses later in your dashboard.</p> : null}
              </div>
            </section>

            <section id="registration-documents" className={panel + ' scroll-mt-40'} hidden={wizard && step !== 3} data-registration-step="3">
              {panelHeading(3)}
              <p className="mb-5 text-sm leading-relaxed text-[#465573]">Add the files you have now. PDF, JPG or PNG files can be up to {maximumDocumentBytes / (1024 * 1024)} MB each. Your files stay private.</p>
              <fieldset className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="sr-only">Verification documents — add now or later</legend>
                {documentFields.map(document => {
                  const saved = draft.draft?.files[document.field]?.name ?? initial?.documents[document.field]?.name;
                  const locked = lockedDocumentKinds.includes(document.kind);
                  return (
                    <div key={document.field} className="min-w-0 text-sm">
                      <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 font-medium">{document.label}
                        <Input name={document.field} type="file" className={fieldStyle + ' min-w-0 max-w-full py-1.5 file:h-8'} accept="application/pdf,image/jpeg,image/png" disabled={locked} />
                      </label>
                      {saved ? <p className="mt-1.5 break-words text-[#465573]">Saved: {saved}. {locked ? 'Verified evidence is locked. Use its change request below.' : 'Choose a file to replace it.'}</p> : null}
                      {draft.draft?.files[document.field] ? <Button type="button" className="mt-1 min-h-11" variant={workspace ? 'workspace-destructive' : 'ghost'}
                        onClick={() => { if (!workspace || window.confirm('Remove this file from your saved draft?')) draft.removeFile(document.field); }}>Remove saved draft file</Button> : null}
                    </div>
                  );
                })}
              </fieldset>
            </section>

            <section className={panel} hidden={wizard && step !== 4} data-registration-step="4">
              {panelHeading(4)}
              {wizard && !verified ? <p className="mb-4 text-sm text-[#465573]">
                Verify the email for seller updates before submitting.{' '}
                <button type="button" className="min-h-11 font-semibold text-[#A8232E] underline" onClick={() => openStep(2)}>Go to Contact &amp; pickup</button>
              </p> : null}
              {!initial && !currentContext ? <output className="block text-[#465573]">Current agreement terms are unavailable. You can save your progress and try again later.</output> : null}
              {!initial && currentContext ? <div key={registration + currentContext} className="space-y-4">
                {registered && registeredTerms ? <>
                  <input type="hidden" name="sellerAgreementContext" value={registeredTerms.context} />
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#14213D]" name="acceptedTerms" value="yes" required
                      onChange={event => setAcceptedAgreement(event.target.checked ? { route: registration, context: currentContext } : undefined)} />
                    <span>I accept the <a href="/seller-agreement" target="_blank" rel="noreferrer" className="font-semibold text-[#A8232E] underline">Seller Marketplace Agreement</a>, including the displayed {registeredTerms.percent}% commission.</span>
                  </label>
                </> : managedTerms && <ManagedMakerAgreementFields terms={managedTerms} collapseTerms
                  onAcceptedChange={checked => setAcceptedAgreement(checked ? { route: registration, context: currentContext } : undefined)} />}
                <label className="flex min-h-11 items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#14213D]" name="applicationAcknowledgement" value="yes" required
                    onChange={event => setAcknowledgedRoute(event.target.checked ? registration : undefined)} />
                  <span>I agree to the <a href="/prohibited-products" target="_blank" rel="noreferrer" className="font-semibold text-[#A8232E] underline">Prohibited &amp; Restricted Products Policy</a>.
                    {registered ? null : ' I understand that commercial activation requires a separate review.'}</span>
                </label>
              </div> : null}
              {initial && !registered && managedTerms ? <div className="space-y-4">
                {value('managedAgreementAccepted') === 'yes' && value('managedAgreementContext') === managedTerms.context ? <>
                  <input type="hidden" name="managedAgreementAccepted" value="yes" />
                  <input type="hidden" name="managedAgreementContext" value={managedTerms.context} />
                  <p className="text-sm">Your acceptance of the current Managed Supplier/Maker Agreement is saved.</p>
                </> : <ManagedMakerAgreementFields terms={managedTerms} optional collapseTerms />}
                <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#14213D]"
                  name="applicationAcknowledgement" value="yes" defaultChecked={value('applicationAcknowledgement') === 'yes'} />
                  I understand that commercial activation requires a separate review. You may confirm this later.
                </label>
              </div> : null}
              {initial && registered && registeredTerms ? <>
                <input type="hidden" name="sellerAgreementContext" value={registeredTerms.context} />
                <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#14213D]"
                  name="acceptedTerms" value="yes" defaultChecked={value('acceptedTerms') === 'yes' && value('sellerAgreementContext') === registeredTerms.context} />
                  <span>I accept the <a href="/seller-agreement" target="_blank" rel="noreferrer" className="font-semibold text-[#A8232E] underline">Seller Marketplace Agreement</a>,
                    including the displayed {registeredTerms.percent}% commission. You may review and accept it later.</span>
                </label>
              </> : null}
              {catalog.config ? <ConfiguredFields config={{ ...catalog.config, fields: catalog.config.fields.map(item => ({ ...item, required: false })) }}
                baseKeys={baseKeys} defaultAnswers={initial?.answers} showOptionalLabel={false} /> : null}
            </section>
            <div className="sr-only" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            {message ? <p role="alert" className="text-sm text-destructive">{labelDocumentMessage(message)}</p> : null}
            {catalog.status !== 'ready' ? <div role="alert">
              <p>{catalog.message || 'Loading form questions…'}</p>
              {catalog.status !== 'loading' ? <Button type="button" className="min-h-11" onClick={catalog.refresh}>Refresh questions and keep my answers</Button> : null}
            </div> : null}
            {wizard ? <div className="flex flex-wrap items-center justify-between gap-2">
              {step > 0 ? <Button type="button" variant="outline" className="min-h-11" onClick={() => openStep(step - 1)}>
                <ArrowLeft className="size-4" aria-hidden="true" /> Back
              </Button> : null}
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {saveButton}
                {step === steps.length - 1 ? submitButton : <Button type="button" className={primaryAction}
                  disabled={busy || !draft.canEdit || draft.status === 'conflict' || (step === 0 && !routeChosen)}
                  onClick={() => void advance()}>
                  Continue <ArrowRight className="size-4" aria-hidden="true" />
                </Button>}
              </div>
            </div> : submitButton}
          </fieldset>
        </div>

        {wizard ? <aside id="seller-guide" className={panel + ' scroll-mt-40 space-y-4 text-sm lg:col-start-2 xl:col-auto'}>
          <div>
            <h2 className="font-semibold">Submit now, finish later</h2>
            <p className="mt-2 leading-relaxed text-[#465573]">Only your choice of how to sell, a verified email and the agreements are needed to submit. Everything else can be added from your seller dashboard.</p>
          </div>
          <div className="border-t border-[#E4DACA] pt-4">
            <h2 className="font-semibold">After you submit</h2>
            <p className="mt-2 leading-relaxed text-[#465573]">Hastabazaar reviews your application by hand. You can draft products while you wait. Each is reviewed before it goes live.</p>
            <Link href="/help#seller-guide" className="inline-flex min-h-11 items-center font-semibold text-[#A8232E] underline">Written seller guide</Link>
          </div>
        </aside> : null}
      </div>
    </form>
  );
}

export function SellerRegistrationDetails(props: Omit<Props, 'initial'>) {
  const scope = useOwnedFormScope(props.accountId);
  return <OwnedSellerRegistrationDetails key={scope.key} {...props} isCurrent={scope.isCurrent} />;
}

function OwnedSellerRegistrationDetails({isCurrent, ...props}: Omit<Props, 'initial'> & {isCurrent: () => boolean}) {
  const router = useRouter();
  const [record, setRecord] = useState<SavedRegistration | null>(null); const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const refreshCurrent=useEffectEvent(()=>router.refresh());
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/seller-registrations', { cache: 'no-store', headers: {[ACTOR_INTENT_HEADER]: props.accountId}, signal: controller.signal }).then(async response => {
      const body = await response.json() as { registration: SavedRegistration | null; error?: string };
      if (controller.signal.aborted || !isCurrent()) return;
      if (!response.ok) { if (response.status === 401 || response.status === 403) { setRecord(null); refreshCurrent(); } throw new Error(body.error ?? 'Registration details could not be loaded.'); }
      setRecord(body.registration);
    }).catch(error => { if (!controller.signal.aborted && isCurrent()) setMessage(error.message); });
    return () => controller.abort();
  }, [refresh, props.accountId,isCurrent]);
  if (!record) return message ? <p role="alert">{message}</p> : null;
  if (record.editable === false) return <section className="space-y-3"><h2 className="font-heading text-2xl">Recorded registration details</h2><p>Direct application edits are closed. Your recorded identity is retained; use a reviewed change for protected evidence.</p><Link href="/seller/registration" className="section-link">Registration, documents and reviewed changes →</Link></section>;
  return <section className="space-y-4" id="registration-details"><h2 className="font-heading text-2xl">Complete or update registration details</h2>{message ? <p role="alert">{message}</p> : null}<SellerRegistrationIntakeForm key={record.version} {...props} initial={record} lockedFields={record.lockedFields ?? props.lockedFields} lockedDocumentKinds={record.lockedDocumentKinds ?? props.lockedDocumentKinds} onSaved={() => { if (!isCurrent()) return; setMessage(''); setRefresh(value => value + 1); }} /></section>;
}
