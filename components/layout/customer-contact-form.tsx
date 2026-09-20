'use client';

import Link from 'next/link';
import { useState } from 'react';
import { feedbackTopics } from '@/lib/feedback/customer-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function CustomerContactForm({
  kind,
}: {
  kind: 'feedback' | 'contact';
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        body: new FormData(form),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok)
        throw new Error(result.error || 'Your message could not be sent.');
      form.reset();
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
      onSubmit={submit}
      className="grid gap-5 rounded-3xl border bg-card p-6 shadow-sm sm:grid-cols-2 sm:p-8"
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
      <Field label="Name">
        <Input
          name="name"
          autoComplete="name"
          minLength={2}
          maxLength={100}
          required
          disabled={busy}
        />
      </Field>
      <Field label="Email">
        <Input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={busy}
        />
      </Field>
      <Field label="Phone number (optional)">
        <Input
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={30}
          disabled={busy}
        />
      </Field>
      <Field
        label={kind === 'feedback' ? 'Feedback category' : 'Contact category'}
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
        <Field
          label={
            kind === 'feedback' ? 'Feedback / message' : 'How can we help?'
          }
        >
          <Textarea
            name="message"
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
        <Button type="submit" disabled={busy}>
          {busy
            ? 'Sending…'
            : kind === 'feedback'
              ? 'Submit feedback'
              : 'Send message'}
        </Button>
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span>{label}</span>
      {children}
    </label>
  );
}
