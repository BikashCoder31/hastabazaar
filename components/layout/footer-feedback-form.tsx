'use client';

import { FormGuide } from '@/components/forms/form-guide';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { feedbackTopics } from '@/lib/feedback/customer-feedback';
import { clearFeedbackAttemptId, reserveFeedbackAttemptId } from '@/lib/feedback/attempt-id';
import { ConfiguredFields, fieldDisplay, focusConfiguredField } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { readConfiguredSubmission } from '@/lib/forms/submission';

type SubmissionState =
  | { kind: 'idle'; message: '' }
  | { kind: 'success' | 'error'; message: string };

const fieldClass =
  'mt-1.5 min-h-11 w-full rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50 focus:border-[#f4c46b] focus:ring-2 focus:ring-[#f4c46b]/30 disabled:opacity-60';
const displayKeys = ['name', 'email', 'topic', 'message'] as const;
const uncertainDeliveryMessage = 'Delivery is uncertain. Your message may have been accepted. Contact support before sending a new message.';

export function FooterFeedbackForm() {
  const pathname = usePathname();
  const catalog = usePublishedFormConfig('public.footer-feedback');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SubmissionState>({
    kind: 'idle',
    message: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const fieldId = Object.keys(fieldErrors)[0];
    if (!busy && fieldId && formRef.current) focusConfiguredField(formRef.current, fieldId);
  }, [busy, fieldErrors]);
  function startNewMessage(form: HTMLFormElement) {
    if (!window.confirm('Have you contacted support to check your earlier message? Starting a new message may create a duplicate.')) return;
    clearFeedbackAttemptId('public.footer-feedback');
    setState({ kind: 'idle', message: '' });
    setFieldErrors({});
    form.reset();
  }

  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setState({ kind: 'idle', message: '' });
    setFieldErrors({});

    try {
      if (!catalog.config || !catalog.canSubmit) throw new Error(catalog.message || 'Form configuration is loading.');
      readConfiguredSubmission(form, catalog.config, displayKeys);
      const body = new FormData(form);
      body.set('requestId', reserveFeedbackAttemptId('public.footer-feedback'));
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
      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error ?? uncertainDeliveryMessage,
        );
      }
      form.reset();
      clearFeedbackAttemptId('public.footer-feedback');
      setState({
        kind: 'success',
        message: 'Thank you. Your query has been sent to the HastaBazaar team.',
      });
    } catch (reason) {
      setState({
        kind: 'error',
        message:
          reason instanceof Error
            ? reason.message
            : uncertainDeliveryMessage,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="footer-feedback-title"
      className="mt-10 border-t border-white/15 pt-10"
    >
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#f4c46b]">
            Questions and feedback
          </p>
          <h2 id="footer-feedback-title" className="mt-2 font-heading text-3xl">
            How can we help?
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/70">
            Send a product question, order query or suggestion. Please do not
            include passwords, payment card details or identity documents.
          </p>
        </div>

        <form ref={formRef} data-form-id="public.footer-feedback" onSubmit={submit}
          className="grid gap-4 sm:grid-cols-2">
      <FormGuide formId="public.footer-feedback" />

          <input type="hidden" name="pagePath" value={pathname || '/'} />
          <input type="hidden" name="kind" value="footer" />
          <div
            aria-hidden="true"
            className="absolute -left-[10000px] h-px w-px overflow-hidden"
          >
            <label htmlFor="footer-website">Website</label>
            <input
              id="footer-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <label className="block text-sm font-medium">
            {fieldDisplay(catalog.config, 'name')?.label ?? 'Your name'} <span aria-hidden="true">*</span>
            <input
              className={fieldClass}
              name="name"
              placeholder={fieldDisplay(catalog.config, 'name')?.placeholder}
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
              disabled={busy}
            />
            {fieldDisplay(catalog.config, 'name')?.helpText ? <span className="mt-1 block text-xs text-white/70">{fieldDisplay(catalog.config, 'name')?.helpText}</span> : null}
          </label>
          <label className="block text-sm font-medium">
            {fieldDisplay(catalog.config, 'email')?.label ?? 'Email address'} <span aria-hidden="true">*</span>
            <input
              className={fieldClass}
              name="email"
              placeholder={fieldDisplay(catalog.config, 'email')?.placeholder}
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              required
              disabled={busy}
            />
            {fieldDisplay(catalog.config, 'email')?.helpText ? <span className="mt-1 block text-xs text-white/70">{fieldDisplay(catalog.config, 'email')?.helpText}</span> : null}
          </label>
          <label className="block text-sm font-medium">
            {fieldDisplay(catalog.config, 'topic')?.label ?? 'Query type'} <span aria-hidden="true">*</span>
            <select
              className={fieldClass}
              name="topic"
              defaultValue=""
              required
              disabled={busy}
            >
              <option value="" disabled className="text-foreground">
                Choose a topic
              </option>
              {feedbackTopics.map((topic) => (
                <option key={topic} value={topic} className="text-foreground">
                  {topic}
                </option>
              ))}
            </select>
            {fieldDisplay(catalog.config, 'topic')?.helpText ? <span className="mt-1 block text-xs text-white/70">{fieldDisplay(catalog.config, 'topic')?.helpText}</span> : null}
          </label>
          <label className="block text-sm font-medium">
            Order reference (optional)
            <input
              className={fieldClass}
              name="orderReference"
              autoComplete="off"
              maxLength={80}
              disabled={busy}
            />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            {fieldDisplay(catalog.config, 'message')?.label ?? 'Your query'} <span aria-hidden="true">*</span>
            <textarea
              className={`${fieldClass} min-h-28 resize-y`}
              name="message"
              minLength={10}
              maxLength={2_000}
              required
              disabled={busy}
              placeholder={fieldDisplay(catalog.config, 'message')?.placeholder ?? 'Tell us what you need help with.'}
            />
            {fieldDisplay(catalog.config, 'message')?.helpText ? <span className="mt-1 block text-xs text-white/70">{fieldDisplay(catalog.config, 'message')?.helpText}</span> : null}
          </label>
          <label className="flex items-start gap-3 text-xs leading-5 text-white/70 sm:col-span-2">
            <input
              type="checkbox"
              name="privacyAcknowledgement"
              value="accepted"
              required
              disabled={busy}
              className="mt-1 size-4 shrink-0 accent-[#f4c46b]"
            />
            <span>
              I understand that HastaBazaar will use these details to respond to
              my query, as described in the{' '}
              <Link
                href="/privacy"
                className="font-semibold text-white underline underline-offset-2 hover:text-[#f4c46b]"
              >
                privacy policy
              </Link>
              .
            </span>
          </label>
          {catalog.config ? <fieldset disabled={busy} className="min-w-0 sm:col-span-2 [&_[data-configured-field]_input]:text-foreground [&_[data-configured-field]_select]:text-foreground [&_[data-configured-field]_textarea]:text-foreground [&_[data-configured-field]_p]:text-white/70"><ConfiguredFields config={catalog.config} baseKeys={displayKeys} errors={fieldErrors} /></fieldset> : null}
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <button
              type="submit"
              disabled={busy || !catalog.canSubmit}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#f4c46b] px-6 text-sm font-semibold text-[#101f39] transition-colors hover:bg-[#ffd98f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4c46b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send query'}
            </button>
            {!catalog.canSubmit ? <output className="text-sm text-white/70">{catalog.message || 'Form configuration is loading.'}</output> : null}
            {catalog.status === 'stale' || catalog.status === 'unavailable' ? <button type="button" disabled={busy} onClick={catalog.refresh}>Refresh form</button> : null}
            <button type="button" disabled={busy}
              className="min-h-11 rounded-full border border-white/40 px-4 text-sm font-semibold"
              onClick={(event) => {
                const form = event.currentTarget.closest('form');
                if (form) startNewMessage(form);
              }}>Start a new message after contacting support</button>
            <output
              aria-live="polite"
              className={
                state.kind === 'error'
                  ? 'text-sm font-medium text-red-200'
                  : 'text-sm font-medium text-white/80'
              }
            >
              {state.message}
            </output>
          </div>
        </form>
      </div>
    </section>
  );
}
