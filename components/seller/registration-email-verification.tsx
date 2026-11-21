'use client';

import { useId, useRef, useState } from 'react';
import { useOwnedFormScope } from '@/components/forms/use-owned-form-scope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

export function RegistrationEmailVerification({ accountId, email, alreadyVerified, applicationStyle = false, onVerified }: {
  accountId: string;
  email: string | null;
  alreadyVerified: boolean;
  applicationStyle?: boolean;
  onVerified?: (email: string) => void;
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
        onVerified?.(email);
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

  if (verified || alreadyVerified) return <output className="flex min-h-11 items-center text-sm font-medium text-[#236548]">Email verified for seller updates.</output>;
  const sendCode = <Button type="button" variant="outline" className="min-h-11 justify-self-start border-[#D7C7AD]"
    disabled={!email || busy} onClick={() => void verify('request')}>
    {applicationStyle ? pending ? 'Send again' : 'Send code' : pending ? 'Send a new code' : 'Verify email'}
  </Button>;
  const codeFields = pending ? <div className="space-y-2 sm:col-span-full">
      <output className="block text-sm">We sent a code to {email}.</output>
      {pending.capturedCode ? <p className="text-sm">Local test code: <strong>{pending.capturedCode}</strong></p> : null}
      <label htmlFor={codeId} className="block text-sm font-medium">Email verification code</label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id={codeId} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          className="h-11 max-w-[15rem] border-[#D7C7AD] bg-white font-mono text-lg tracking-[0.48em]"
          onChange={event => { event.stopPropagation(); setCode(event.target.value.replace(/\D/g, '')); }}
          onKeyDown={event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (/^\d{6}$/.test(code)) void verify('verify');
          }} />
        <Button type="button" className="min-h-11 bg-[#14213D] text-white" disabled={busy || !/^\d{6}$/.test(code)} onClick={() => void verify('verify')}>
          {applicationStyle ? 'Verify' : 'Confirm code'}
        </Button>
      </div>
    </div> : null;
  return applicationStyle
    ? <>{sendCode}{codeFields}{error ? <p role="alert" className="text-sm text-destructive sm:col-span-full">{error}</p> : null}</>
    : <div className="space-y-2 sm:col-span-full">{codeFields}{sendCode}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div>;
}
