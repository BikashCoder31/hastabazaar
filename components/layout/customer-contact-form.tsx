'use client';

import Link from 'next/link';
import { useState } from 'react';
import { feedbackTopics } from '@/lib/feedback/customer-feedback';
import { clearFeedbackAttemptId, reserveFeedbackAttemptId } from '@/lib/feedback/attempt-id';
import { ConfiguredFields, fieldDisplay } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { readConfiguredSubmission } from '@/lib/forms/submission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const displayKeys = ['name', 'email', 'phone', 'topic', 'message'] as const;
const uncertainDeliveryMessage = 'Delivery is uncertain. Your message may have been accepted. Contact support before sending a new message.';

export function CustomerContactForm({
  kind,
}: {
  kind: 'feedback' | 'contact';
}) {
  const formId = kind === 'feedback' ? 'public.feedback' : 'public.contact';
  const catalog = usePublishedFormConfig(formId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  function startNewMessage(form: HTMLFormElement) {
    if (!window.confirm('Have you contacted support to check your earlier message? Starting a new message may create a duplicate.')) return;
    clearFeedbackAttemptId(formId);
    setError('');
    setFieldErrors({});
    form.reset();
  }
  async function submit(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage('');
    setError('');
    setFieldErrors({});
    try {
      if (!catalog.config || !catalog.canSubmit) throw new Error(catalog.message || 'Form configuration is loading.');
      readConfiguredSubmission(form, catalog.config, displayKeys);
      const body = new FormData(form);
      body.set('requestId', reserveFeedbackAttemptId(formId));
      const response = await fetch('/api/feedback', {
        method: 'POST',
        body,
      }).catch(() => { throw new Error(uncertainDeliveryMessage); });
      const result = (await response.json().catch(() => { throw new Error(uncertainDeliveryMessage); })) as {
        ok?: boolean;
        error?: string;
        fieldId?: string;
        code?: string;
      } | null;
      catalog.handleSubmissionResponse(response, result?.code);
      if (result?.fieldId) setFieldErrors({ [result.fieldId]: result.error || 'Invalid answer.' });
      if (!response.ok || !result?.ok)
        throw new Error(result?.error || uncertainDeliveryMessage);
      form.reset();
      clearFeedbackAttemptId(formId);
      setMessage(
        kind === 'feedback'
          ? 'Thank you for your feedback. We appreciate you taking the time to help us improve.'
          : 'Thank you. Your message has been sent to the HastaBazaar support team.',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Your message could not be sent.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      data-form-id={kind === 'feedback' ? 'public.feedback' : 'public.contact'}
      onSubmit={submit}
      className="grid min-w-0 grid-cols-1 gap-5 rounded-3xl border bg-card p-6 shadow-sm sm:grid-cols-2 sm:p-8"
    >
      <input
        type="hidden"
        name="pagePath"
        value={kind === 'feedback' ? '/feedback' : '/contact-us'}
      />
      <input type="hidden" name="kind" value={kind} />
      <div
        aria-hidden="true"
        className="absolute -left-[10000px] h-px w-px overflow-hidden"
      >
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Field label={fieldDisplay(catalog.config, 'name')?.label ?? 'Name'} helpText={fieldDisplay(catalog.config, 'name')?.helpText}>
        <Input
          name="name"
          placeholder={fieldDisplay(catalog.config, 'name')?.placeholder}
          autoComplete="name"
          minLength={2}
          maxLength={100}
          required
          disabled={busy}
        />
      </Field>
      <Field label={fieldDisplay(catalog.config, 'email')?.label ?? 'Email'} helpText={fieldDisplay(catalog.config, 'email')?.helpText}>
        <Input
          name="email"
          placeholder={fieldDisplay(catalog.config, 'email')?.placeholder}
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={busy}
        />
      </Field>
      <Field label={fieldDisplay(catalog.config, 'phone')?.label ?? 'Phone number (optional)'} helpText={fieldDisplay(catalog.config, 'phone')?.helpText}>
        <Input
          name="phone"
          placeholder={fieldDisplay(catalog.config, 'phone')?.placeholder}
          type="tel"
          autoComplete="tel"
          maxLength={30}
          disabled={busy}
        />
      </Field>
      <Field
        label={fieldDisplay(catalog.config, 'topic')?.label ?? (kind === 'feedback' ? 'Feedback category' : 'Contact category')}
        helpText={fieldDisplay(catalog.config, 'topic')?.helpText}
      >
        <select
          name="topic"
          defaultValue=""
          required
          disabled={busy}
          className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="" disabled>
            Choose a category
          </option>
          {feedbackTopics.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Subject">
          <Input
            name="subject"
            minLength={3}
            maxLength={160}
            required
            disabled={busy}
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={fieldDisplay(catalog.config, 'message')?.label ?? (kind === 'feedback' ? 'Feedback / message' : 'How can we help?')}
          helpText={fieldDisplay(catalog.config, 'message')?.helpText}>
          <Textarea
            name="message"
            placeholder={fieldDisplay(catalog.config, 'message')?.placeholder}
            minLength={10}
            maxLength={2000}
            rows={7}
            required
            disabled={busy}
          />
        </Field>
      </div>
      {kind === 'feedback' ? (
        <Field label="Rating (optional)">
          <select
            name="rating"
            defaultValue=""
            disabled={busy}
            className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">No rating</option>
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>
                {rating} / 5
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Order reference (optional)">
          <Input name="orderReference" maxLength={80} disabled={busy} />
        </Field>
      )}
      {catalog.config ? <fieldset disabled={busy} className="min-w-0 sm:col-span-2"><ConfiguredFields config={catalog.config} baseKeys={displayKeys} errors={fieldErrors} /></fieldset> : null}
      <label className="flex items-start gap-3 text-sm leading-6 text-muted-foreground sm:col-span-2">
        <input
          type="checkbox"
          name="privacyAcknowledgement"
          value="accepted"
          required
          disabled={busy}
          className="mt-1 size-4 accent-primary"
        />
        <span>
          I understand that HastaBazaar will use these details to respond, as
          described in the{' '}
          <Link
            href="/privacy"
            className="font-semibold text-primary underline underline-offset-4"
          >
            privacy policy
          </Link>
          .
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <Button type="submit" disabled={busy || !catalog.canSubmit}>
          {busy
            ? 'Sending…'
            : kind === 'feedback'
              ? 'Submit feedback'
              : 'Send message'}
        </Button>
        {!catalog.canSubmit ? <output className="text-sm text-muted-foreground">{catalog.message || 'Form configuration is loading.'}</output> : null}
        {catalog.status === 'stale' || catalog.status === 'unavailable' ? <Button type="button" disabled={busy} onClick={catalog.refresh}>Refresh form</Button> : null}
        <Button type="button" className="h-auto min-h-8 max-w-full whitespace-normal" disabled={busy} onClick={(event) => {
          const form = event.currentTarget.closest('form');
          if (form) startNewMessage(form);
        }}>Start a new message after contacting support</Button>
        {message ? (
          <output className="text-sm font-medium text-emerald-700">
            {message}
          </output>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  helpText,
  children,
}: {
  label: string;
  helpText?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-semibold">
      <span>{label}</span>
      {children}
      {helpText ? <span className="text-xs font-normal text-muted-foreground">{helpText}</span> : null}
    </label>
  );
}
