'use client';
import { FormGuide } from '@/components/forms/form-guide';
import type { RegisteredSellerTerms } from '@/lib/db/repositories/marketplace-settings';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSellerDraft } from './use-seller-draft';
import { CompanySellingIdentity, ManagedMakerIdentityFields, ManagedMakerAgreementFields } from './managed-maker-identity-fields';
import type { ManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import { sellerDocumentsForApplication } from '@/lib/sellers/application';
import { CURRENT_ONBOARDING_VERSION } from '@/lib/sellers/onboarding';
import { sellerPhoneCountries } from '@/lib/sellers/contact-phone';
import { SellerOnboardingFields } from './seller-onboarding-fields';
import { CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { ConfiguredFields, fieldDisplay } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const catalogBaseKeys = ['tradingName', 'businessDescription', 'legalName', 'representativeName',
  'email', 'phone', 'phoneCountry', 'applicantType', 'taxMode', 'taxRegistrationNumber', 'registrationNumber',
  'registrationAuthority', 'document', 'profileImage', 'makerVideo', 'applicationAcknowledgement',
  'payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber', 'pickupAddress', 'returnAddress',
  'sellerAgreementContext', 'participationRoute', 'governmentIdType', 'governmentIdDescription', 'personalPan', 'personalPanCertificate', 'managedAgreementAccepted', 'managedAgreementVersion', 'managedAgreementContext', 'website', 'requestId', 'formVersion', 'customAnswers'];
const applicationAttemptKey = sessionAttemptKey('seller.application', 'new');
const uncertainMessage = 'Application status is uncertain: your application may have been accepted. Retry with the same details to recover its reference, or contact support before starting a new attempt.';

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'error'; message: string }
  | { status: 'success'; reference: string };

interface ModelContext {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute(input: unknown): unknown;
    },
    options?: { signal?: AbortSignal },
  ): void | Promise<void>;
}

const provinces = [
  'Koshi',
  'Madhesh',
  'Bagmati',
  'Gandaki',
  'Lumbini',
  'Karnali',
  'Sudurpashchim',
];

function setFormValue(
  form: HTMLFormElement,
  name: string,
  value: string,
): void {
  const field = form.elements.namedItem(name);
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function SellerApplicationForm({
  accountEmail,
  accountId,
  managedTerms,
  registeredTerms,
}: {
  accountEmail?: string;
  accountId?: string;
  managedTerms?: ManagedMakerApplicationTerms;
  registeredTerms?: Pick<RegisteredSellerTerms, 'percent' | 'context'>;
}) {
  const [applicantType, setApplicantType] = useState<'individual' | 'company'>(
    'company',
  );
  const [registrationAnswer, setRegistrationAnswer] = useState<'yes' | 'no'>(registeredTerms || !managedTerms ? 'yes' : 'no');
  const [taxStatus, setTaxStatus] = useState<'business_pan_only' | 'vat_registered'>(
    'business_pan_only',
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [hasPendingAttempt, setHasPendingAttempt] = useState(false);
  const catalog = usePublishedFormConfig('seller.application');
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });
  const restoreRoute = useCallback((values: { registration: 'yes' | 'no'; applicant: 'individual' | 'company'; tax: 'business_pan_only' | 'vat_registered' }) => {
    setRegistrationAnswer(values.registration); setApplicantType(values.applicant); setTaxStatus(values.tax);
  }, []);
  const draft = useSellerDraft(formRef, accountId, catalog.config, restoreRoute);

  useEffect(() => {
    const timeout = window.setTimeout(() => setHasPendingAttempt(hasSessionAttempt(applicationAttemptKey)), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function resetAttempt() {
    if (!window.confirm('A previous application may already have succeeded. Check for your application reference or contact support first. Starting a new attempt can create a duplicate application. Start a new attempt anyway?')) return;
    try { sessionStorage.removeItem(applicationAttemptKey); }
    catch {
      setState({ status: 'error', message: 'Browser session storage is unavailable. Please enable it before submitting.' });
      return;
    }
    setHasPendingAttempt(false);
    setState({ status: 'idle' });
  }

  useEffect(() => {
    const modelContext = (
      document as Document & { modelContext?: ModelContext }
    ).modelContext;
    if (!modelContext?.registerTool) return;

    const lifecycle = new AbortController();
    const tool = {
      name: 'prepare_seller_application',
      title: 'Prepare seller application',
      description:
        'Fill the main Hastabazaar seller application fields. The applicant must review the form, attach verification documents, accept the terms, and submit it.',
      inputSchema: {
        type: 'object',
        properties: {
          legalName: { type: 'string' },
          tradingName: { type: 'string' },
          representativeName: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          district: { type: 'string' },
          municipality: { type: 'string' },
          locality: { type: 'string' },
          businessDescription: { type: 'string' },
          productCategories: { type: 'string' },
        },
        required: [
          'legalName',
          'tradingName',
          'representativeName',
          'email',
          'phone',
        ],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const form = formRef.current;
        if (!form || !input || typeof input !== 'object') {
          throw new Error('The seller application form is not available.');
        }
        const values = input as Record<string, unknown>;
        for (const [name, value] of Object.entries(values)) {
          if (typeof value === 'string') setFormValue(form, name, value);
        }
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        form
          .querySelector<HTMLInputElement>('input[name="legalName"]')
          ?.focus();
        return {
          status: 'prepared',
          next: 'Review fields and attach documents.',
        };
      },
    };

    try {
      void Promise.resolve(
        modelContext.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => undefined);
    } catch {
      // WebMCP is an optional progressive enhancement.
    }

    return () => lifecycle.abort();
  }, []);

  async function submitApplication(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    if (!catalog.canSubmit || !catalog.config || (registrationAnswer === 'yes' ? !registeredTerms : !managedTerms)) return;
    setState({ status: 'submitting' });

    const form = event.currentTarget;
    try {
      if (draft.status === 'conflict') throw new Error(draft.message);
      await draft.flush();
      const formData = new FormData(form);
      await draft.attachSavedFiles(formData);
      formData.set('requestId', draft.attemptId() ?? getOrCreateSessionAttempt(applicationAttemptKey));
      setHasPendingAttempt(true);
      const response = await fetch('/api/seller-applications', {
        method: 'POST', body: formData, headers: { Accept: 'application/json' },
      }).catch(() => { throw new Error(uncertainMessage); });
      const body = (await response.json().catch(() => { throw new Error(uncertainMessage); })) as {
        error?: string;
        applicationReference?: string;
        code?: string;
      };
      catalog.handleSubmissionResponse(response, body.code);

      if (!response.ok) {
        throw new Error(
          body.error ?? 'The application could not be submitted.',
        );
      }
      if (!body.applicationReference) throw new Error(uncertainMessage);

      await draft.confirmedSubmission();
      setState({ status: 'success', reference: body.applicationReference });
      clearSessionAttempt(applicationAttemptKey);
      setHasPendingAttempt(false);
      form.reset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'The application could not be submitted.',
      });
    }
  }

  if (state.status === 'success') {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 shadow-sm sm:p-10">
        <CheckCircle2 className="size-10 text-primary" aria-hidden="true" />
        <h2 className="mt-5 font-heading text-3xl">Under review</h2>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          Keep this reference for future communication. Hastabazaar will verify
          the business and documents before seller access is enabled.
        </p>
        <p className="mt-6 inline-flex rounded-full bg-secondary px-4 py-2 font-mono text-sm font-bold text-secondary-foreground">
          {state.reference}
        </p>
      </div>
    );
  }

  return (
    <form
      data-form-id="seller.application"
      ref={formRef}
      onSubmit={submitApplication}
      onInput={draft.changed}
      onChange={draft.changed}
      className="space-y-10 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10"
    >
      <FormGuide formId="seller.application" />
      <aside className="space-y-2 rounded-xl border bg-secondary/40 p-4" aria-label="Saved registration progress">
        <output className="block">{draft.message}</output>
        {draft.draft ? <p className="text-sm">Saved progress expires on {new Date(draft.draft.expiresAt).toLocaleDateString()}. Saving is separate from submitting your application.</p> : null}
        <Button type="button" variant="outline" disabled={draft.status === 'loading' || draft.status === 'saving' || draft.status === 'conflict'} onClick={() => void draft.flush()}>Save progress now</Button>
      </aside>
      <fieldset disabled={!draft.canEdit} inert={state.status === 'submitting'} className="contents">

      <p className="text-xs text-muted-foreground">* Required field</p>

      <div className="sr-only" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {registrationAnswer === 'no' && managedTerms ? <CompanySellingIdentity terms={managedTerms}/> : null}
      <FieldSet>
        <FieldLegend>Choose how you want to sell</FieldLegend>
        <FieldDescription>
          You will have a public maker profile with either option. Your account and products must be approved before you can start selling.
        </FieldDescription>
        {!registeredTerms ? <p role="alert">Registered Seller applications are unavailable because no published commission terms are effective. Please return when terms are available.</p> : null}
        {!managedTerms ? <p role="alert">Managed Maker applications are unavailable because no published retention terms are effective. Please return when terms are available.</p> : null}
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="hasBusinessTaxRegistration">
              Your onboarding route <span aria-hidden="true">*</span>
            </FieldLabel>
            <NativeSelect
              id="hasBusinessTaxRegistration"
              name="hasBusinessTaxRegistration"
              value={registrationAnswer}
              onChange={(event) => setRegistrationAnswer(event.target.value as 'yes' | 'no')}
              required
            >
              <NativeSelectOption value="no" disabled={!managedTerms}>Sell through Hastabazaar{!managedTerms ? ' (unavailable)' : ''}</NativeSelectOption>
              <NativeSelectOption value="yes" disabled={!registeredTerms}>Registered business seller{!registeredTerms ? ' (unavailable)' : ''}</NativeSelectOption>
            </NativeSelect>
            <FieldDescription>
              Registered businesses, including sole proprietors, must provide registration and business PAN. Personal PAN alone does not qualify.
              {registrationAnswer === 'yes'
                ? 'Registered Seller: provide only the registration evidence that applies to the selected status.'
                : 'Sell through Hastabazaar is an application for reviewed supply to the company. Personal PAN, its certificate, government ID and bank evidence are required. Registration and tax duties still need legal/accounting review before activation.'}
            </FieldDescription>
          </Field>
          {registrationAnswer === 'yes' ? (
            <Field>
              <FieldLabel htmlFor="applicantType">
                How your business is registered <span aria-hidden="true">*</span>
              </FieldLabel>
              <NativeSelect
                id="applicantType"
                name="applicantType"
                value={applicantType}
                onChange={(event) => setApplicantType(event.target.value as 'individual' | 'company')}
                required
              >
                <NativeSelectOption value="individual">Registered sole proprietor / individual business</NativeSelectOption>
                <NativeSelectOption value="company">Registered company or organisation</NativeSelectOption>
              </NativeSelect>
            </Field>
          ) : <input type="hidden" name="applicantType" value="individual" />}
          <Field>
            <FieldLabel htmlFor="legalName">
              {registrationAnswer === 'yes' ? 'Registered legal business name' : 'Account holder full name'} <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input id="legalName" name="legalName" required maxLength={160} />
          </Field>
          <Field>
            <FieldLabel htmlFor="tradingName">
              {fieldDisplay(catalog.config, 'tradingName')?.label ?? 'Shop or trading name'} <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input
              id="tradingName"
              name="tradingName"
              required
              maxLength={160}
              placeholder={fieldDisplay(catalog.config, 'tradingName')?.placeholder}
              aria-describedby={fieldDisplay(catalog.config, 'tradingName')?.helpText ? 'tradingName-catalog-help' : undefined}
            />
            {fieldDisplay(catalog.config, 'tradingName')?.helpText ? <FieldDescription id="tradingName-catalog-help">{fieldDisplay(catalog.config, 'tradingName')?.helpText}</FieldDescription> : null}
          </Field>
          {registrationAnswer === 'yes' && (
            <>
              <Field>
                <FieldLabel htmlFor="registrationAuthority">Office that registered your business
                  <span aria-hidden="true">*</span>
                </FieldLabel>
                <Input
                  id="registrationAuthority"
                  name="registrationAuthority"
                  required
                  maxLength={160}
                  placeholder="For example, your firm or company registration office"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="registrationNumber">
                  Registration number
                  <span aria-hidden="true">*</span>
                </FieldLabel>
                <Input
                  id="registrationNumber"
                  name="registrationNumber"
                  required
                  maxLength={80}
                />
              </Field>
            </>
          )}
          {registrationAnswer === 'yes' && <>
            <Field>
              <FieldLabel htmlFor="taxStatus">
                Your business tax registration <span aria-hidden="true">*</span>
              </FieldLabel>
              <NativeSelect
                id="taxStatus"
                name="taxStatus"
                value={taxStatus}
                onChange={(event) => setTaxStatus(event.target.value as 'business_pan_only' | 'vat_registered')}
                required
              >
                <NativeSelectOption value="business_pan_only">Business PAN — not VAT registered</NativeSelectOption>
                <NativeSelectOption value="vat_registered">VAT registered</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="taxRegistrationNumber">
                Business PAN or VAT number <span aria-hidden="true">*</span>
              </FieldLabel>
              <Input id="taxRegistrationNumber" name="taxRegistrationNumber" required inputMode="numeric" pattern="[0-9]{9}" minLength={9} maxLength={9} />
              <FieldDescription>PAN and VAT may use the same nine-digit identifier; do not enter a personal PAN as proof of business registration.</FieldDescription>
            </Field>
          </>}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Contact person and address</FieldLegend>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {registrationAnswer === 'yes' && (
            <>
              <Field>
                <FieldLabel htmlFor="representativeName">
                  Person applying for the business
                  <span aria-hidden="true">*</span>
                </FieldLabel>
                <Input
                  id="representativeName"
                  name="representativeName"
                  required
                  maxLength={160}
                  autoComplete="name"
                />
                <FieldDescription>This person must have permission to apply on behalf of the business.</FieldDescription>
              </Field>
            </>
          )}
          <Field>
            <FieldLabel htmlFor="email">
              Seller account email <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input
              id="email"
              name="email"
              defaultValue={accountEmail}
              readOnly={Boolean(accountEmail)}
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
            <FieldDescription>
              {accountEmail
                ? 'Use your verified account email. Submission starts review; selling access requires separate approval.'
                : 'Sign in and verify your account email before applying.'}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">
              Contact phone <span aria-hidden="true">*</span>
            </FieldLabel>
            <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="phoneCountry" className="mb-1 block text-sm">Phone country</label>
              <NativeSelect id="phoneCountry" name="phoneCountry" defaultValue="NP" required>
                {sellerPhoneCountries.map(country => <NativeSelectOption key={country.code} value={country.code}>{country.name} (+{country.dial})</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <Input
              id="phone"
              name="phone"
              type="tel"
              required
              minLength={10}
              maxLength={10}
              pattern="[0-9]{10}"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="9800000000"
            />
            </div>
            <FieldDescription>Enter 10 digits without the country code. Phone OTP verification is not required to submit this application.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="province">
              Province <span aria-hidden="true">*</span>
            </FieldLabel>
            <NativeSelect
              id="province"
              name="province"
              required
              className="w-full"
            >
              <NativeSelectOption value="">Select province</NativeSelectOption>
              {provinces.map((province) => (
                <NativeSelectOption key={province} value={province}>
                  {province}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="district">
              District <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input id="district" name="district" required maxLength={100} />
          </Field>
          <Field>
            <FieldLabel htmlFor="municipality">
              Municipality <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input
              id="municipality"
              name="municipality"
              required
              maxLength={120}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ward">Ward number</FieldLabel>
            <Input id="ward" name="ward" maxLength={20} inputMode="numeric" />
          </Field>
          <Field>
            <FieldLabel htmlFor="locality">
              Locality or street <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input id="locality" name="locality" required maxLength={180} />
            <FieldDescription>This verification/operational address stays private. It is not shown as the public maker location.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="publicCity">
              City customers will see <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input id="publicCity" name="publicCity" required maxLength={120} placeholder="For example, Birgunj" />
            <FieldDescription>Only this city/town is displayed publicly.</FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>



      <p className="text-sm text-muted-foreground">Add your public maker profile and bank details later from your dashboard. Public profile updates have a 7-day cooldown; payouts require reviewed bank details.</p>

      <FieldSet>
        <FieldLegend>Documents we need to check your details</FieldLegend>
        <FieldDescription>
          PDF, JPG, or PNG. Maximum 5 MB per file. Documents remain private and
          are available only to authorised reviewers.
        </FieldDescription>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {sellerDocumentsForApplication({
            applicantType: registrationAnswer === 'yes' ? applicantType : 'individual',
            taxMode: registrationAnswer === 'no' ? 'NONE' : taxStatus === 'vat_registered' ? 'VAT' : 'PAN',
            participationRoute: registrationAnswer === 'yes' ? 'registered_seller' : 'managed_maker',
            hasBusinessTaxRegistration: registrationAnswer === 'yes',
            onboarding: { version: CURRENT_ONBOARDING_VERSION, bankDetailsDeferred: true },
          }).map(
            (document) => (
              <DocumentField
                key={document.field}
                id={document.field}
                label={document.label}
                required={document.required}
                savedName={draft.draft?.files[document.field]?.name}
                onRemove={() => draft.removeFile(document.field)}
              />
            ),
          )}
        </FieldGroup>
      </FieldSet>

      <SellerOnboardingFields deferBank />
      <p className="text-sm"><a href="/account/profile" target="_blank" rel="noreferrer" className="underline">Verify your account email</a> before submitting. Your contact phone does not require OTP verification.</p>
      {registrationAnswer === 'no' ? <ManagedMakerIdentityFields requirePersonalPan/> : null}
      {registrationAnswer === 'no' && managedTerms ? <ManagedMakerAgreementFields terms={managedTerms}/> : null}
      {registrationAnswer === 'yes' && registeredTerms ? <input type="hidden" name="sellerAgreementContext" value={registeredTerms.context} /> : null}
      {registrationAnswer === 'yes' && registeredTerms ? (
        <Field orientation="horizontal">
          <Checkbox id="acceptedTerms" name="acceptedTerms" value="yes" required />
          <FieldLabel htmlFor="acceptedTerms" className="max-w-2xl font-normal">
            I agree to the <a href="/seller-agreement" target="_blank" rel="noreferrer" className="font-semibold text-primary underline">Seller Marketplace Agreement</a>, including the independent-seller {registeredTerms.percent}% commission on completed, paid product sales, and the <a href="/prohibited-products" target="_blank" rel="noreferrer" className="font-semibold text-primary underline">Prohibited & Restricted Products Policy</a>. <span aria-hidden="true">*</span>
          </FieldLabel>
        </Field>
      ) : registrationAnswer === 'no' && managedTerms ? (
        <Field orientation="horizontal">
          <Checkbox id="applicationAcknowledgement" name="applicationAcknowledgement" value="yes" required />
          <FieldLabel htmlFor="applicationAcknowledgement" className="max-w-2xl font-normal">
            I confirm this is a Managed Maker application only. I understand that profile and product drafts may be prepared, but publication, orders, invoicing, and payment remain unavailable until the program, maker, product, applicable supplier requirements, and reviewed agreement are ready. <span aria-hidden="true">*</span>
          </FieldLabel>
        </Field>
      ) : null}
      <p className="text-sm leading-6 text-muted-foreground">
        Your application information is handled under our{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-primary underline"
        >
          Privacy Policy
        </a>
        .
      </p>

      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>Application needs attention</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {hasPendingAttempt ? <div className="space-y-2">
        <p className="text-sm text-muted-foreground">If a submission response was lost, retrying reuses its request reference. Check for an application reference before starting a different attempt.</p>
        <Button type="button" variant="outline" onClick={resetAttempt}>Start a new application attempt</Button>
      </div> : null}

      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={catalogBaseKeys} /> : null}
      {catalog.status !== 'ready' ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Form configuration is unavailable. Please try again.'}</p> : null}
      {catalog.status === 'stale' || catalog.status === 'unavailable' ? <Button type="button" variant="outline" onClick={catalog.refresh}>Refresh form questions and keep my answers</Button> : null}
      <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex max-w-lg items-start gap-2 text-sm leading-6 text-muted-foreground">
          <ShieldCheck
            className="mt-1 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          Submission starts verification; it does not automatically approve or
          publish a seller account.
        </p>
        <Button
          type="submit"
          size="lg"
          className="h-11 px-6"
          disabled={state.status === 'submitting' || !catalog.canSubmit || (registrationAnswer === 'yes' ? !registeredTerms : !managedTerms)}
        >
          {state.status === 'submitting' ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            'Submit for review'
          )}
        </Button>
      </div>
      </fieldset>
    </form>
  );
}

function DocumentField({
  id,
  label,
  required = false,
  savedName,
  onRemove,
}: {
  id: string;
  label: string;
  required?: boolean;
  savedName?: string;
  onRemove?: () => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <span aria-hidden="true">*</span>}
      </FieldLabel>
      <Input
        id={id}
        name={id}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        required={required && !savedName}
        className="h-11 py-2"
      />
      {savedName ? <p className="text-sm">Saved: {savedName}. Choose a file above to replace it. <button type="button" className="underline" onClick={onRemove}>Remove saved file</button></p> : null}
    </Field>
  );
}
