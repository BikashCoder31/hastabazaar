'use client';

import { useId, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccountRecoveryAssistance({
  targetId,
  displayName,
  email,
  targetRole = 'seller',
}: {
  targetId: string;
  displayName: string;
  email: string;
  targetRole?: 'seller' | 'admin';
}) {
  const id = useId(),
    [kind, setKind] = useState<'password' | 'mfa'>('password'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const response = await fetch('/api/security/assisted-recovery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetId,
          kind,
          confirmedEmail: email,
          confirmedTarget: data.get('confirmedTarget') === 'on',
          supportReference: data.get('supportReference'),
          verificationMethod:
            targetRole === 'seller' ? 'seller_onboarding' : 'staff_records',
          verificationReference: data.get('verificationReference'),
          ownershipVerified: data.get('ownershipVerified') === 'on',
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'The invitation could not be sent.');
      setMessage(result.message);
      form.reset();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : 'The invitation could not be sent. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Account recovery for {displayName}
      </summary>
      <form
        data-form-id="system.assisted-recovery-request"
        onSubmit={submit}
        className="mt-4 max-w-xl space-y-4"
      >
        <p className="break-words text-sm">
          Registered email: <strong>{email}</strong>
        </p>
        <p className="text-sm text-muted-foreground">
          Verify your password and authenticator in{' '}
          <Link
            className="underline"
            href="/security?return_to=%2Fadmin%2Fteam"
          >
            Account security
          </Link>{' '}
          within five minutes before sending. Review the support request against
          existing {targetRole === 'seller' ? 'seller onboarding' : 'staff'}{' '}
          records. Enter record references only; never copy identity documents,
          passwords or codes here.
        </p>
        <div className="space-y-2">
          <label htmlFor={`${id}-kind`} className="text-sm font-medium">
            Recovery action and reason
          </label>
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(e) => setKind(e.target.value as 'password' | 'mfa')}
            disabled={busy}
            className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="password">
              Forgotten password — send password reset
            </option>
            <option value="mfa">
              Lost authenticator and no recovery code — approve replacement
            </option>
          </select>
        </div>
        <p className="text-sm text-muted-foreground">
          {kind === 'password'
            ? 'The owner chooses the new password privately. Existing MFA stays enabled.'
            : 'Try an unused recovery code first. This separate approval requires the owner to prove registered-email access and enter the current password. Completion invalidates old factors and requires replacement authenticator enrollment.'}
        </p>
        <div className="space-y-2">
          <label htmlFor={`${id}-reference`} className="text-sm font-medium">
            Support request reference
          </label>
          <Input
            id={`${id}-reference`}
            name="supportReference"
            required
            minLength={3}
            maxLength={80}
            pattern="[A-Za-z0-9][A-Za-z0-9 _./:\-]{2,79}"
            placeholder="SUP-123"
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-verification`} className="text-sm font-medium">
            Matching {targetRole === 'seller' ? 'onboarding' : 'staff'} record
            reference
          </label>
          <Input
            id={`${id}-verification`}
            name="verificationReference"
            required
            minLength={3}
            maxLength={80}
            pattern="[A-Za-z0-9][A-Za-z0-9 _./:\-]{2,79}"
            disabled={busy}
          />
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="ownershipVerified"
            required
            disabled={busy}
            className="mt-1 size-4"
          />
          <span>
            I compared the request with the referenced records and confirmed the
            account owner matches. This confirmation records the completed
            review.
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="confirmedTarget"
            required
            disabled={busy}
            className="mt-1 size-4"
          />
          <span>
            I confirm this request is for {displayName} at{' '}
            <span className="break-all">{email}</span>.
          </span>
        </label>
        <Button type="submit" disabled={busy}>
          {busy
            ? 'Sending invitation…'
            : kind === 'password'
              ? 'Send password reset'
              : 'Approve authenticator recovery'}
        </Button>
        {message ? (
          <p role={failed ? 'alert' : 'status'} className="text-sm leading-6">
            {message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
