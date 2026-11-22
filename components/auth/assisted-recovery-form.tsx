'use client';

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const subscribe = () => () => {};
export function AssistedRecoveryForm() {
  const [token, setToken] = useState(() =>
      typeof window === 'undefined' ? '' : window.location.hash.slice(1),
    ),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const ready = useSyncExternalStore(
      subscribe,
      () => true,
      () => false,
    ),
    parsed = token.split('.')[1],
    kind = parsed === 'password' || parsed === 'mfa' ? parsed : null;
  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname);
  }, []);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/security/assisted-recovery/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          password: data.get('password'),
          confirmation: data.get('confirmation'),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        replacementRequired: boolean;
        notificationDelivered: boolean;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Recovery could not finish.');
      setToken('');
      form.reset();
      setDone(true);
      setMessage(
        (result.replacementRequired
          ? 'Your old authenticator and recovery codes are invalid. Sign in with your password and enroll a replacement authenticator before continuing.'
          : 'Your password has been changed and previous sessions were signed out. Existing two-step verification remains required.') +
          (result.notificationDelivered
            ? ' A confirmation email has been sent.'
            : ' The change succeeded, but the confirmation email could not be delivered. Contact support if needed.'),
      );
    } catch (cause) {
      form.reset();
      setError(
        cause instanceof Error
          ? cause.message
          : 'Connection interrupted. Try signing in to check whether recovery completed before requesting another invitation.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return <output>Preparing your private recovery form…</output>;
  if (done)
    return (
      <div className="space-y-4">
        <output className="leading-7">{message}</output>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center font-semibold underline"
        >
          Continue to sign in
        </Link>
      </div>
    );
  if (!kind || !token)
    return (
      <p role="alert">
        Open the complete private link from your recovery email. If the page was
        refreshed or the invitation expired, reopen that email link or ask Super
        Admin for a new invitation.
      </p>
    );
  return (
    <form
      data-form-id="system.assisted-recovery-complete"
      onSubmit={submit}
      className="space-y-5"
    >
      <p className="text-sm leading-6 text-muted-foreground">
        {kind === 'mfa'
          ? 'Enter your current password to complete the approved authenticator recovery. Your previous authenticator and recovery codes will stop working. You must enroll a replacement after signing in.'
          : 'Choose a new password for your account. Only you enter this password. Existing authenticator verification remains required when you sign in.'}
      </p>
      <div className="space-y-2">
        <label htmlFor="recovery-password" className="text-sm font-semibold">
          {kind === 'mfa' ? 'Current password' : 'New password'}
        </label>
        <Input
          id="recovery-password"
          name="password"
          type="password"
          autoComplete={kind === 'mfa' ? 'current-password' : 'new-password'}
          minLength={kind === 'password' ? 10 : undefined}
          maxLength={256}
          required
          disabled={busy}
        />
      </div>
      {kind === 'password' ? (
        <div className="space-y-2">
          <label
            htmlFor="recovery-confirmation"
            className="text-sm font-semibold"
          >
            Confirm new password
          </label>
          <Input
            id="recovery-confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={256}
            required
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            Use 10 to 256 characters.
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm leading-6">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy
          ? 'Completing recovery…'
          : kind === 'mfa'
            ? 'Confirm authenticator recovery'
            : 'Save new password'}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        This private invitation expires after 15 minutes and works once. Do not
        share the link or your password. If you did not request recovery, close
        this page and contact support.
      </p>
    </form>
  );
}
