'use client';

import { useId, useRef, useState } from 'react';
import { useOwnedFormScope } from '@/components/forms/use-owned-form-scope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

export function RegistrationEmailVerification({ accountId, email, alreadyVerified }: {
  accountId: string;
  email: string | null;
  alreadyVerified: boolean;
}) {
  const { isCurrent } = useOwnedFormScope(`${accountId}:${email ?? ''}`);
  const codeId = useId();
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState<{ token: string; capturedCode?: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);

  async function verify(action: 'request' | 'verify') {
    if (!email || !isCurrent() || running.current || (action === 'verify' && !pending)) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/seller-registrations/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: accountId },
        body: JSON.stringify(action === 'request' ? { action, email } : { action, email, token: pending?.token, code }),
      });
      const result = await response.json() as { verified?: boolean; token?: string; capturedCode?: string; error?: string };
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(result.error ?? 'Email verification is unavailable. Try again.');
      if (result.verified === true) {
        setVerified(true);
        setPending(undefined);
        setCode('');
      } else if (action === 'request' && typeof result.token === 'string') {
        setPending({ token: result.token, capturedCode: result.capturedCode });
        setCode('');
      } else {
        throw new Error('Email verification could not be confirmed. Try again.');
      }
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.message : 'Email verification is unavailable. Try again.');
    } finally {
      if (isCurrent()) {
        running.current = false;
        setBusy(false);
      }
    }
  }

  if (verified || alreadyVerified) return <output className="block text-sm font-medium text-primary">Email verified for seller updates.</output>;
  return <div className="space-y-2">
    {pending ? <div className="space-y-2">
      <output className="block text-sm">We sent a code to {email}.</output>
      {pending.capturedCode ? <p className="text-sm">Local test code: <strong>{pending.capturedCode}</strong></p> : null}
      <label htmlFor={codeId} className="text-sm">Email verification code</label>
      <Input id={codeId} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
        onChange={event => { event.stopPropagation(); setCode(event.target.value.replace(/\D/g, '')); }}
        onKeyDown={event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (/^\d{6}$/.test(code)) void verify('verify');
        }} />
      <Button type="button" variant="outline" disabled={busy || !/^\d{6}$/.test(code)} onClick={() => void verify('verify')}>Confirm code</Button>
    </div> : null}
    <Button type="button" variant="outline" disabled={!email || busy} onClick={() => void verify('request')}>
      {pending ? 'Send a new code' : 'Verify email'}
    </Button>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>;
}
