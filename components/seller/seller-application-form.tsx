'use client';

import { useEffect, useRef, useState } from 'react';
import { sellerDocumentsForApplication } from '@/lib/sellers/application';
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
import { Textarea } from '@/components/ui/textarea';

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
}: {
  accountEmail?: string;
}) {
  const [applicantType, setApplicantType] = useState<'individual' | 'company'>(
    'individual',
  );
  const [taxMode, setTaxMode] = useState<'PAN' | 'VAT' | 'BOTH'>('PAN');
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });

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
        'Fill the main HastaBazaar seller application fields. The applicant must review the form, attach verification documents, accept the terms, and submit it.',
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
    setState({ status: 'submitting' });

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch('/api/seller-applications', {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });
      const body = (await response.json()) as {
        error?: string;
        applicationReference?: string;
      };

      if (!response.ok || !body.applicationReference) {
        throw new Error(
          body.error ?? 'The application could not be submitted.',
        );
      }

      setState({ status: 'success', reference: body.applicationReference });
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
        <h2 className="mt-5 font-heading text-3xl">Application received</h2>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          Keep this reference for future communication. HastaBazaar will verify
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
      ref={formRef}
      onSubmit={submitApplication}
      className="space-y-10 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10"
    >
      <p className="text-xs text-muted-foreground">* Required field</p>

      <div className="sr-only" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <FieldSet>
        <FieldLegend>Seller identity</FieldLegend>
        <FieldDescription>
          Enter the details exactly as they appear on your registration
          documents.
        </FieldDescription>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="applicantType">
              Applicant type <span aria-hidden="true">*</span>
            </FieldLabel>
            <NativeSelect
              id="applicantType"
              name="applicantType"
              value={applicantType}
              onChange={(e) =>
                setApplicantType(e.target.value as 'individual' | 'company')
              }
              required
            >
              <NativeSelectOption value="individual">
                Individual
              </NativeSelectOption>
              <NativeSelectOption value="company">Company</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="legalName">
              Legal name <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input id="legalName" name="legalName" required maxLength={160} />
          </Field>
          <Field>
            <FieldLabel htmlFor="tradingName">
              Shop or trading name <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input
              id="tradingName"
              name="tradingName"
              required
              maxLength={160}
            />
          </Field>
          {applicantType === 'company' && (
            <>
              <Field>
                <FieldLabel htmlFor="registrationAuthority">
                  Registration authority
                  <span aria-hidden="true">*</span>
                </FieldLabel>
                <Input
                  id="registrationAuthority"
                  name="registrationAuthority"
                  required
                  maxLength={160}
                  placeholder="For example, Office of Company Registrar"
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
          <Field>
            <FieldLabel htmlFor="taxMode">
              Tax registration <span aria-hidden="true">*</span>
            </FieldLabel>
            <NativeSelect
              id="taxMode"
              name="taxMode"
              value={taxMode}
              onChange={(e) =>
                setTaxMode(e.target.value as 'PAN' | 'VAT' | 'BOTH')
              }
              required
              className="w-full"
            >
              <NativeSelectOption value="PAN">PAN</NativeSelectOption>
              <NativeSelectOption value="VAT">VAT</NativeSelectOption>
              <NativeSelectOption value="BOTH">
                Both PAN and VAT
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="taxRegistrationNumber">
              PAN / VAT identifier (shared identifier allowed for Both)
              <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input
              id="taxRegistrationNumber"
              name="taxRegistrationNumber"
              required
              minLength={5}
              maxLength={24}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Representative and contact</FieldLegend>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {applicantType === 'company' && (
            <>
              <Field>
                <FieldLabel htmlFor="representativeName">
                  Authorised representative
                  <span aria-hidden="true">*</span>
                </FieldLabel>
                <Input
                  id="representativeName"
                  name="representativeName"
                  required
                  maxLength={160}
                  autoComplete="name"
                />
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
                ? 'After Admin approval, this signed-in account will have seller access.'
                : 'Already have a customer account? Sign in before applying. Seller access will belong to this email after Admin approval.'}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">
              Business phone <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input
              id="phone"
              name="phone"
              type="tel"
              required
              maxLength={20}
              autoComplete="tel"
              placeholder="+977 98…"
            />
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
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Your products</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="productCategories">
              Product types <span aria-hidden="true">*</span>
            </FieldLabel>
            <Input
              id="productCategories"
              name="productCategories"
              required
              maxLength={500}
              placeholder="For example, textiles, jewellery, pottery"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="businessDescription">
              Tell us about your work
              <span aria-hidden="true">*</span>
            </FieldLabel>
            <Textarea
              id="businessDescription"
              name="businessDescription"
              required
              maxLength={1500}
              rows={6}
              placeholder="Describe what you make, who makes it, your materials, and your process."
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Verification documents</FieldLegend>
        <FieldDescription>
          PDF, JPG, or PNG. Maximum 5 MB per file. Documents remain private and
          are available only to authorised reviewers.
        </FieldDescription>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {sellerDocumentsForApplication({ applicantType, taxMode }).map(
            (document) => (
              <DocumentField
                key={document.field}
                id={document.field}
                label={document.label}
                required={document.required}
              />
            ),
          )}
        </FieldGroup>
      </FieldSet>

      <Field orientation="horizontal">
        <Checkbox
          id="acceptedTerms"
          name="acceptedTerms"
          value="yes"
          required
        />
        <FieldLabel htmlFor="acceptedTerms" className="max-w-2xl font-normal">
          I agree to the{' '}
          <a
            href="/seller-agreement"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline"
          >
            Seller Marketplace Agreement
          </a>
          , including the 9% commission on completed, paid product sales, and the{' '}
          <a
            href="/prohibited-products"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline"
          >
            Prohibited & Restricted Products Policy
          </a>
          . I confirm that the information provided is accurate.{' '}
          <span aria-hidden="true">*</span>
        </FieldLabel>
      </Field>
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
          <AlertTitle>Application not submitted</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

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
          disabled={state.status === 'submitting'}
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
    </form>
  );
}

function DocumentField({
  id,
  label,
  required = false,
}: {
  id: string;
  label: string;
  required?: boolean;
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
        required={required}
        className="h-11 py-2"
      />
    </Field>
  );
}
