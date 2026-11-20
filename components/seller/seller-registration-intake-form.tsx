'use client';
import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
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
import { sellerDocumentsForApplication } from '@/lib/sellers/application';
import { CURRENT_ONBOARDING_VERSION } from '@/lib/sellers/onboarding';
import type { DraftAnswers } from '@/lib/sellers/draft-contract';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { normalizeSellerRegistrationEmail, savedSellerRegistrationEmail } from '@/lib/sellers/registration-email';
import { RegistrationEmailVerification } from './registration-email-verification';

type SavedRegistration = { version: number; answers: DraftAnswers; documents: Record<string, { name: string }>; missing: string[]; editable?: boolean; approvedCompletion?: boolean; lockedFields?: string[]; lockedDocumentKinds?: string[] };
type Props = { accountId: string; accountEmail: string; managedTerms?: ManagedMakerApplicationTerms;
  registeredTerms?: { percent: number; context: string }; initial?: SavedRegistration; onSaved?: () => void; lockedFields?: readonly string[]; lockedDocumentKinds?: readonly string[] };
const baseKeys = [...registrationFields.map(([key]) => key), 'hasBusinessTaxRegistration', 'applicantType', 'taxStatus', 'phoneCountry', 'province', 'governmentIdType', 'email',
  'businessDescription', 'productCategories', 'acceptedTerms', 'applicationAcknowledgement', 'managedAgreementAccepted', 'managedAgreementVersion', 'managedAgreementContext', 'sellerAgreementContext', 'registrationEmailChoice'];

export function SellerRegistrationIntakeForm(props: Props) {
  const scope = useOwnedFormScope(`${props.accountId}:${props.initial?.version ?? 'new'}`);
  return <OwnedSellerRegistrationIntakeForm key={scope.key} {...props} isCurrent={scope.isCurrent} />;
}

function recordedIdentity(answers?: DraftAnswers): string {
  const type = answers?.governmentIdType?.[0] ?? '';
  return governmentIdTypes.some(value => value === type) ? type : answers?.governmentIdDescription?.[0] ? '' : 'citizenship';
}

function OwnedSellerRegistrationIntakeForm({ accountId, accountEmail, managedTerms, registeredTerms, initial, onSaved, lockedFields=[],lockedDocumentKinds=[], isCurrent }: Props & {isCurrent: () => boolean}) {
  const router = useRouter(); const formRef = useRef<HTMLFormElement>(null);
  const controlId = useId();
  const [registration, setRegistration] = useState<'yes' | 'no'>(initial?.answers.hasBusinessTaxRegistration?.[0] === 'yes' ? 'yes' : 'no');
  const [applicant, setApplicant] = useState<'company' | 'individual'>(initial?.answers.applicantType?.[0] === 'company' ? 'company' : 'individual');
  const [tax, setTax] = useState<'business_pan_only' | 'vat_registered'>(initial?.answers.taxStatus?.[0] === 'vat_registered' ? 'vat_registered' : 'business_pan_only');
  const [sameAddress, setSameAddress] = useState(Boolean(initial?.answers.pickupAddress?.[0] && initial.answers.pickupAddress[0] === initial.answers.returnAddress?.[0]));
  const [identityType, setIdentityType] = useState(() => recordedIdentity(initial?.answers));
  const [accessDenied, setAccessDenied] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState(initial?.answers.phoneCountry?.[0] || 'NP');
  const savedEmail = savedSellerRegistrationEmail(initial?.answers);
  const [email, setEmail] = useState(savedEmail ?? accountEmail);
  const normalizedEmail = normalizeSellerRegistrationEmail(email);
  const phoneConstraints = sellerPhoneConstraints(phoneCountry);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [reference, setReference] = useState('');
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
  const canSubmitNew = Boolean(currentContext && acceptedAgreement?.route === registration &&
    acceptedAgreement.context === currentContext && acknowledgedRoute === registration);
  const catalog = usePublishedFormConfig('seller.application');
  const restore = useCallback((values: RouteValues) => {
    setRegistration(initial ? initial.answers.hasBusinessTaxRegistration?.[0] === 'yes' ? 'yes' : 'no' : values.registration);
    setApplicant(lockedFields.includes('applicantType')?(initial?.answers.applicantType?.[0]==='company'?'company':'individual'):values.applicant);
    setTax(lockedFields.includes('taxStatus')?(initial?.answers.taxStatus?.[0]==='vat_registered'?'vat_registered':'business_pan_only'):values.tax);
    setIdentityType(lockedFields.includes('governmentIdType') ? recordedIdentity(initial?.answers) : recordedIdentity(values.identityAnswers));
    setSameAddress(values.addressesMatch);
    setPhoneCountry(values.phoneCountry);
    setEmail(values.email === undefined ? savedEmail ?? accountEmail : values.email || accountEmail);
  }, [initial,lockedFields,savedEmail,accountEmail]);
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
  const attemptKey = sessionAttemptKey('seller.application', `${accountId}:${initial?.version ?? 'new'}`);
  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault(); if (!isCurrent() || accessDenied || draft.accessDenied || busy || !catalog.canSubmit || draft.status === 'loading' || (!initial && !canSubmitNew)) return;
    const form = event.currentTarget; setBusy(true); setMessage('');
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
      if (!response.ok) throw new Error(body.error ?? 'Application could not be submitted.');
      if (!body.applicationReference) throw new Error('Submission could not be confirmed. Retry the same details or check your dashboard.');
      await draft.confirmedSubmission();
      if (!isCurrent()) return;
      clearSessionAttempt(attemptKey); setReference(body.applicationReference);
      setMessage(initial?.approvedCompletion ? 'Your registration details were saved. New documents are sent for review.' : initial ? 'Your changes were sent for Super Admin review.' : 'Your application has been submitted. You can add missing details and prepare product listings in your dashboard.');
    } catch (error) { if (!isCurrent()) return; setMessage(error instanceof Error ? error.message : 'Submission could not be confirmed. Keep this page open and retry.'); }
    finally { if (isCurrent()) setBusy(false); }
  }
  if (accessDenied || draft.accessDenied) return <p role="alert">Your account access changed. Refresh this page to check your current account before continuing.</p>;
  if (reference) return <section className="space-y-4 rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">{initial ? 'Registration details saved' : 'Application submitted'}</h2><p>{message}</p><p>Reference: <strong>{reference}</strong></p>{initial ? <Button type="button" onClick={() => { if (onSaved) onSaved(); else router.refresh(); }}>Continue editing details</Button> : <Link className="section-link" href="/seller">Open your seller dashboard →</Link>}</section>;
  const value = (name: string) => initial?.answers[name]?.[0] ?? '';
  const fields = registrationFields.filter(([key]) => !registered ? !['registrationAuthority', 'registrationNumber', 'taxRegistrationNumber', 'representativeName'].includes(key) : !['governmentIdDescription', 'personalPan'].includes(key));
  // A native select fires input first. Saving there can reset its controlled value before change.
  return <form ref={formRef} onSubmit={submit} onChange={draft.changed} className="space-y-6 rounded-2xl border bg-card p-5 sm:p-8" data-form-id="seller.application">
    <p className="rounded-xl bg-secondary/50 p-4 text-sm leading-6">{initial?.approvedCompletion
      ? 'You can save progress as information becomes available. Complete registration, accept the applicable agreement and have your documents and receiving details verified before payouts.'
      : 'Submit the registration information you have. You can add missing details and submit products for review from your dashboard. Payouts require completed registration and verified receiving details.'}</p>
    <aside aria-label="Saved registration progress" className="space-y-2"><output className="block">{labelDocumentMessage(draft.message)}</output>{draft.draft ? <p className="text-sm">Draft expires {new Date(draft.draft.expiresAt).toLocaleDateString('en-NP', { timeZone: 'Asia/Kathmandu' })}.</p> : null}<Button type="button" variant="outline" disabled={draft.status === 'loading' || draft.status === 'saving' || draft.status === 'conflict'} onClick={() => void draft.flush()}>Save progress now</Button>
      {draft.status === 'conflict' ? <div className="space-y-3 rounded-xl border p-4">
        <Button type="button" variant="outline" onClick={() => void draft.reviewLatest()}>Review latest saved progress</Button>
        {draft.conflictDraft ? <><details open><summary>Latest saved values — compare with your form below</summary><dl className="mt-3 space-y-2">{Object.entries(draft.conflictDraft.answers).map(([key, values]) => <div key={key}><dt className="font-semibold">{registrationFields.find(([name]) => name === key)?.[1] ?? key}</dt><dd className="whitespace-pre-wrap break-words">{values.join(', ') || 'Blank'}</dd></div>)}{Object.entries(draft.conflictDraft.files).map(([key, file]) => <div key={key}><dt>{key}</dt><dd>Saved file: {file.name}</dd></div>)}</dl></details>
          <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => draft.resolveConflict(true)}>Use saved progress</Button><Button type="button" variant="outline" onClick={() => draft.resolveConflict(false)}>Keep my current entries</Button></div>
          <p className="text-sm">Your choice updates only the private draft. Submit separately to request a registration change.</p></> : null}
      </div> : null}
    </aside>
    {initial?.missing.length ? <details className="rounded-xl border p-4" open={initial.approvedCompletion}><summary>Registration items to complete ({initial.missing.length})</summary><ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{initial.missing.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}
    <fieldset disabled={!draft.canEdit} inert={busy} className="contents">
      <div className="grid gap-5 sm:grid-cols-2">
        <label htmlFor={controlId + 'hasBusinessTaxRegistration'} className="space-y-2 text-sm">How you want to sell<NativeSelect id={controlId + 'hasBusinessTaxRegistration'} name="hasBusinessTaxRegistration" value={registration} onChange={event => {
          setRegistration(event.target.value as 'yes' | 'no');
          setAcceptedAgreement(undefined);
          setAcknowledgedRoute(undefined);
        }} disabled={Boolean(initial)}><NativeSelectOption value="no">Sell through Hastabazaar</NativeSelectOption><NativeSelectOption value="yes">Registered business seller</NativeSelectOption></NativeSelect>{initial ? <input type="hidden" name="hasBusinessTaxRegistration" value={registration} /> : null}</label>
        {registered ? <><label htmlFor={controlId + 'applicantType'} className="space-y-2 text-sm">Business registration type<NativeSelect id={controlId + 'applicantType'} name="applicantType" value={applicant} onChange={event => setApplicant(event.target.value as 'company' | 'individual')} disabled={lockedFields.includes('applicantType')}><NativeSelectOption value="individual">Sole proprietor / individual business</NativeSelectOption><NativeSelectOption value="company">Company / organisation</NativeSelectOption></NativeSelect>{lockedFields.includes('applicantType')?<input type="hidden" name="applicantType" value={applicant}/>:null}</label><label htmlFor={controlId + 'taxStatus'} className="space-y-2 text-sm">Tax registration<NativeSelect id={controlId + 'taxStatus'} name="taxStatus" value={tax} onChange={event => setTax(event.target.value as typeof tax)} disabled={lockedFields.includes('taxStatus')}><NativeSelectOption value="business_pan_only">Business PAN</NativeSelectOption><NativeSelectOption value="vat_registered">VAT registered</NativeSelectOption></NativeSelect>{lockedFields.includes('taxStatus')?<input type="hidden" name="taxStatus" value={tax}/>:null}</label></> : <input type="hidden" name="applicantType" value="individual" />}
        <div className="space-y-2 text-sm">
          <label htmlFor={controlId + 'email'}>Seller registration email</label>
          <Input id={controlId + 'email'} name="email" type="email" autoComplete="email" maxLength={254} required
            value={email} onChange={event => setEmail(event.target.value)} aria-describedby={controlId + 'email-help'} />
          <input type="hidden" name="registrationEmailChoice" value={normalizedEmail === accountEmail.toLowerCase() ? '' : email} />
          <p id={controlId + 'email-help'}>Use your sign-in email or enter another address. Seller updates go to the address you verify here.</p>
          {email !== accountEmail ? <Button type="button" variant="ghost" onClick={() => {
            setEmail(accountEmail);
            draft.changed();
          }}>Use sign-in email</Button> : null}
          <RegistrationEmailVerification key={normalizedEmail ?? ''} accountId={accountId} email={normalizedEmail}
            alreadyVerified={savedEmail !== null && savedEmail === normalizedEmail && normalizedEmail !== accountEmail.toLowerCase()} />
        </div>
        <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2"><label htmlFor={controlId + 'phoneCountry'} className="space-y-2 text-sm">Phone country<NativeSelect id={controlId + 'phoneCountry'} name="phoneCountry" value={phoneCountry} onChange={event => setPhoneCountry(event.target.value)}>{sellerPhoneCountries.map(country => <NativeSelectOption key={country.code} value={country.code}>{country.name} (+{country.dial})</NativeSelectOption>)}</NativeSelect></label><label htmlFor={controlId + 'phone'} className="space-y-2 text-sm">Contact phone<Input id={controlId + 'phone'} name="phone" type="tel" defaultValue={value('phone')} maxLength={phoneConstraints.maxLength} inputMode="numeric" pattern={phoneConstraints.pattern} placeholder={phoneConstraints.guidance} /><span>Phone OTP verification is not required.</span></label></div>
        {fields.filter(([name]) => !['phone', 'pickupAddress', 'returnAddress'].includes(name)).map(([name, label, maximum]) => <label key={name} className="space-y-2 text-sm">{name === 'governmentIdDescription' && identityType !== 'citizenship' ? `Recorded ${identityType ? identityType.replaceAll('_', ' ') : 'identity'} number` : label}{lockedFields.includes(name)?' — verified, read-only':''}<Input name={name} defaultValue={value(name)} maxLength={name === 'ward' ? undefined : maximum} readOnly={lockedFields.includes(name)}
          type={name === 'ward' ? 'number' : 'text'} inputMode={['ward', 'personalPan', 'taxRegistrationNumber'].includes(name) ? 'numeric' : undefined}
          min={name === 'ward' ? 1 : undefined} max={name === 'ward' ? 99 : undefined} step={name === 'ward' ? 1 : undefined}
          pattern={['personalPan', 'taxRegistrationNumber'].includes(name) ? '[0-9]{9}' : undefined} /></label>)}
        <div className="space-y-3 sm:col-span-2">
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={sameAddress} onChange={event => toggleSameAddress(event.target.checked)} aria-describedby={controlId + 'sameAddress-help'} />Pickup and return addresses are the same</label>
          <p id={controlId + 'sameAddress-help'} className="text-sm text-muted-foreground">Use the pickup address for both, or the return address if pickup is blank. While checked, editing either updates both. You can change these addresses later in your dashboard.</p>
          <div className="grid gap-5 sm:grid-cols-2">{registrationFields.filter(([name]) => name === 'pickupAddress' || name === 'returnAddress').map(([name, label, maximum]) => <label key={name} className="space-y-2 text-sm">{label}<Input name={name} defaultValue={value(name)} maxLength={maximum} onInput={event => syncAddress(event.currentTarget)} /></label>)}</div>
        </div>
        <label htmlFor={controlId + 'province'} className="space-y-2 text-sm">Province<NativeSelect id={controlId + 'province'} name="province" defaultValue={value('province')}><NativeSelectOption value="">Add later</NativeSelectOption>{['Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim'].map(province => <NativeSelectOption key={province} value={province}>{province}</NativeSelectOption>)}</NativeSelect></label>
        {!registered ? <div className="space-y-2 text-sm"><input type="hidden" name="governmentIdType" value={identityType} />{identityType !== 'citizenship' ? <><p>Recorded identity type: {identityType ? identityType.replaceAll('_', ' ') : 'not specified in the saved record'}. Your recorded reference keeps this type.</p>{!lockedFields.includes('governmentIdType') && !lockedFields.includes('governmentIdDescription') ? <Button type="button" variant="outline" onClick={() => { const field = formRef.current?.elements.namedItem('governmentIdDescription'); if (field instanceof HTMLInputElement) field.value = ''; setIdentityType('citizenship'); draft.changed(); }}>Use citizenship number instead</Button> : null}</> : <p>Add your citizenship number now or later.</p>}</div> : null}
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Verification documents — add now or later</legend>
        {documentFields.map(document => {
          const saved = draft.draft?.files[document.field]?.name ?? initial?.documents[document.field]?.name;
          const locked=lockedDocumentKinds.includes(document.kind);
          return <label key={document.field} className="space-y-2 text-sm">{document.label}<Input name={document.field} type="file" accept="application/pdf,image/jpeg,image/png" disabled={locked} />{saved ? <span>Saved: {saved}. {locked?'Verified evidence is locked; use its change request below.':'Choose a file to replace it.'}{draft.draft?.files[document.field] ? <button type="button" className="ml-2 underline" onClick={() => draft.removeFile(document.field)}>Remove saved draft file</button> : null}</span> : null}</label>;
        })}<p className="text-sm text-muted-foreground sm:col-span-2">PDF, JPG or PNG; up to 5 MB each. Documents remain private.</p>
      </fieldset>
      {!initial && !currentContext ? <output className="block">Current agreement terms are unavailable. You can save your progress and try again later.</output> : null}
      {!initial && currentContext ? <div key={registration + currentContext} className="space-y-4">
        {registered && registeredTerms ? <>
          <input type="hidden" name="sellerAgreementContext" value={registeredTerms.context} />
          <label className="flex gap-3 text-sm">
            <input type="checkbox" name="acceptedTerms" value="yes" required onChange={event => setAcceptedAgreement(event.target.checked ? { route: registration, context: currentContext } : undefined)} />
            <span>I accept the <a href="/seller-agreement" target="_blank" rel="noreferrer" className="underline">Seller Marketplace Agreement</a>, including the displayed {registeredTerms.percent}% commission.</span>
          </label>
        </> : managedTerms && <ManagedMakerAgreementFields terms={managedTerms} collapseTerms
          onAcceptedChange={checked => setAcceptedAgreement(checked ? { route: registration, context: currentContext } : undefined)} />}
        <label className="flex gap-3 text-sm">
          <input type="checkbox" name="applicationAcknowledgement" value="yes" required
            onChange={event => setAcknowledgedRoute(event.target.checked ? registration : undefined)} />
          {registered ? <span>I agree to the <a href="/prohibited-products" target="_blank" rel="noreferrer" className="underline">Prohibited &amp; Restricted Products Policy</a>.</span>
            : 'I understand that commercial activation requires a separate review.'}
        </label>
      </div> : null}
      {initial && !registered && managedTerms ? <>{value('managedAgreementAccepted') === 'yes' && value('managedAgreementContext') === managedTerms.context
        ? <><input type="hidden" name="managedAgreementAccepted" value="yes" /><input type="hidden" name="managedAgreementContext" value={managedTerms.context} /><p className="text-sm">Your acceptance of the current Managed Supplier/Maker Agreement is saved.</p></>
        : <ManagedMakerAgreementFields terms={managedTerms} optional collapseTerms />}
        <label className="flex gap-3 text-sm"><input type="checkbox" name="applicationAcknowledgement" value="yes" defaultChecked={value('applicationAcknowledgement') === 'yes'} />I understand that commercial activation requires a separate review. You may confirm this later.</label></> : null}
      {initial && registered && registeredTerms ? <><input type="hidden" name="sellerAgreementContext" value={registeredTerms.context} /><label className="flex gap-3 text-sm"><input type="checkbox" name="acceptedTerms" value="yes" defaultChecked={value('acceptedTerms') === 'yes' && value('sellerAgreementContext') === registeredTerms.context} /><span>I accept the <a href="/seller-agreement" target="_blank" rel="noreferrer" className="underline">Seller Marketplace Agreement</a>, including the displayed {registeredTerms.percent}% commission. You may review and accept it later.</span></label></> : null}
      {catalog.config ? <ConfiguredFields config={{ ...catalog.config, fields: catalog.config.fields.map(field => ({ ...field, required: false })) }} baseKeys={baseKeys} defaultAnswers={initial?.answers} showOptionalLabel={false} /> : null}
      <div className="sr-only" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {message ? <p role="alert" className="text-sm text-destructive">{labelDocumentMessage(message)}</p> : null}
      {catalog.status !== 'ready' ? <div role="alert"><p>{catalog.message || 'Loading form questions…'}</p>{catalog.status !== 'loading' ? <Button type="button" onClick={catalog.refresh}>Refresh questions and keep my answers</Button> : null}</div> : null}
      <Button type="submit" disabled={busy || !catalog.canSubmit || !draft.canEdit || (!initial && !canSubmitNew)}>{busy ? 'Submitting…' : initial ? 'Submit updated details for review' : 'Submit application'}</Button>
    </fieldset>
  </form>;
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
