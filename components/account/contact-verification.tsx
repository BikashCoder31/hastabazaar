'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  ContactChannel,
  ContactVerificationStatus,
  CheckoutContactPolicy,
} from '@/lib/auth/contact-verification';
import {
  parseContactStatus,
  parseContactRequest,
  parseContactCaptures,
} from '@/lib/auth/contact-presentation';

type Status = ContactVerificationStatus & { captureAvailable?: boolean };
type Capture = {
  channel: ContactChannel;
  contact: string;
  code: string;
  expiresAt: number;
  label: string;
};
type Pending = { token: string; expiresAt: number };
export function ContactVerificationPanel({
  initialStatus,
  captureAvailable = false,
  onStatusChange,
  ownerKey,
  contactPolicy = 'email_and_phone',
}: {
  initialStatus?: Status | null;
  captureAvailable?: boolean;
  onStatusChange?: (status: Status | null) => void;
  ownerKey?: string;
  contactPolicy?: CheckoutContactPolicy;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(initialStatus ?? null);
  const [loading, setLoading] = useState(!initialStatus);
  const [busy, setBusy] = useState<ContactChannel | null>(null);
  const [pending, setPending] = useState<
    Partial<Record<ContactChannel, Pending>>
  >({});
  const [codes, setCodes] = useState({ email: '', phone: '' });
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);
  const subscription = useRef<{ ownerKey?: string; initialStatus?: Status | null } | null>(null);
  const statusCallback = useRef(onStatusChange);
  useEffect(() => {
    statusCallback.current = onStatusChange;
  }, [onStatusChange]);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  function current(version: number) {
    return mounted.current && version === generation.current;
  }
  useEffect(() => {
    mounted.current = true;
    const version = ++generation.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    busyRef.current = false;
    // Synchronize all owner-bound state when this verification subscription changes owner.
    /* oxlint-disable react/react-compiler */
    const changedOwner = !subscription.current || subscription.current.ownerKey !== ownerKey || subscription.current.initialStatus !== initialStatus;
    subscription.current = { ownerKey, initialStatus };
    if (changedOwner) {
      setBusy(null);
      setPending({});
      setCodes({ email: '', phone: '' });
      setCaptures([]);
      setStatus(initialStatus ?? null);
    }
    setError('');
    setMessage('');
    setUnavailable(false);
    setLoading(true);
    /* oxlint-enable react/react-compiler */
    statusCallback.current?.(null);
    void fetch('/api/account/contact-verification', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!current(version)) return;
        if (response.status === 401) {
          setStatus(null);
          statusCallback.current?.(null);
          return;
        }
        const result = (await response.json()) as Status & { error?: string };
        if (!current(version)) return;
        if (!response.ok)
          throw Error(result.error ?? 'Contact status could not be checked.');
        const checked = parseContactStatus(result, initialStatus);
        setStatus(checked);
        statusCallback.current?.(checked);
      })
      .catch((reason) => {
        if (current(version) && !controller.signal.aborted) {
          setUnavailable(true);
          setError(
            reason instanceof Error
              ? reason.message
              : 'Contact status could not be checked.',
          );
          statusCallback.current?.(null);
        }
      })
      .finally(() => {
        if (current(version) && !controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      // Invalidate the latest action generation, including actions started after this GET.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      controller.abort();
      // Abort the latest action controller, which may have replaced the initial GET.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      activeController.current?.abort();
    };
  }, [ownerKey, initialStatus, statusRetry]);
  async function capturedCodes(version: number, signal: AbortSignal) {
    const response = await fetch('/api/account/contact-verification/capture', {
      cache: 'no-store',
      signal,
    });
    const result = (await response.json()) as {
      captures?: Capture[];
      error?: string;
    };
    if (!current(version)) return;
    if (!response.ok)
      throw Error(result.error ?? 'Local capture is unavailable.');
    setCaptures(parseContactCaptures(result));
  }
  async function act(channel: ContactChannel, action: 'request' | 'verify') {
    if (busyRef.current || !mounted.current) return;
    const version = ++generation.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    busyRef.current = true;
    setBusy(channel);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/account/contact-verification', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          channel,
          ...(action === 'verify'
            ? { token: pending[channel]?.token, code: codes[channel] }
            : {}),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        verified?: boolean;
        token?: string;
        expiresAt?: number;
        status?: Status;
      };
      if (!current(version)) return;
      if (!response.ok)
        throw Error(result.error ?? 'Verification could not be completed.');
      const requestResult =
        action === 'request' ? parseContactRequest(result) : null;
      if (requestResult?.token && requestResult.expiresAt) {
        setPending((previous) => ({
          ...previous,
          [channel]: {
            token: requestResult.token!,
            expiresAt: requestResult.expiresAt!,
          },
        }));
        setMessage(
          `A six-digit ${channel === 'email' ? 'email' : 'SMS'} code has been sent. It expires in 10 minutes.`,
        );
      } else {
        if (action === 'verify' && result.verified !== true)
          throw Error(
            'Verification could not be confirmed. Request a new code.',
          );
        const next =
          action === 'verify'
            ? parseContactStatus(result.status, status)
            : await fetch('/api/account/contact-verification', {
                cache: 'no-store',
                signal: controller.signal,
              }).then(async (response) => {
                if (!response.ok)
                  throw Error('Refresh to check your current contacts.');
                return response.json() as Promise<Status>;
              });
        if (!current(version)) return;
        const checked = parseContactStatus(next, status);
        const nextStatus = {
          ...checked,
          captureAvailable:
            checked.captureAvailable ??
            status?.captureAvailable ??
            captureAvailable,
        };
        setStatus(nextStatus);
        statusCallback.current?.(nextStatus);
        setPending((previous) => ({ ...previous, [channel]: undefined }));
        setCodes((previous) => ({ ...previous, [channel]: '' }));
        setCaptures([]);
        setMessage(`${channel === 'email' ? 'Email' : 'Phone'} verified.`);
        router.refresh();
      }
      if (current(version) && (status?.captureAvailable || captureAvailable))
        await capturedCodes(version, controller.signal);
    } catch (reason) {
      if (current(version) && !controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Verification could not be completed.',
        );
    } finally {
      if (current(version)) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }
  function refreshCaptures() {
    if (busyRef.current || !mounted.current) return;
    const version = ++generation.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    void capturedCodes(version, controller.signal).catch((reason) => {
      if (current(version) && !controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : 'Capture unavailable.',
        );
    });
  }
  if (loading && !status)
    return (
      <section className="rounded-2xl border bg-card p-5" aria-live="polite">
        Checking your contact verification…
      </section>
    );
  if (!status && unavailable)
    return (
      <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-label="Contact verification">
        <h2 className="font-heading text-2xl">Verify your contact details</h2>
        <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>
        <Button type="button" className="mt-4" onClick={() => setStatusRetry(value => value + 1)}>Retry contact status</Button>
      </section>
    );
  if (!status)
    return (
      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <h2 className="font-heading text-2xl">Verify your contact details</h2>
        <p className="mt-3 text-sm leading-6">
          Sign in to verify your {contactPolicy === 'email_only' ? 'email' : 'email and phone'} before placing your first
          order. We remember verification while your contacts stay the same.
        </p>
        <Link
          className="mt-4 inline-flex underline"
          href="/login?return_to=%2Fcheckout"
        >
          Sign in to continue
        </Link>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    );
  const local = status.captureAvailable || captureAvailable;
  const channels: readonly ContactChannel[] = contactPolicy === 'email_only'
    ? ['email']
    : ['email', 'phone'];
  return (
    <section
      className="rounded-2xl border bg-card p-5 sm:p-7"
      aria-label="Contact verification"
    >
      <h2 className="font-heading text-2xl">Verify your contact details</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {contactPolicy === 'email_only'
          ? 'Verify your email before checkout. Your Nepal mobile number is still needed for delivery; SMS verification is temporarily unavailable.'
          : 'Verify your email and phone once before checkout. Verification is remembered while each contact stays the same.'}
      </p>
      {!status.emailVerified ? (
        <p className="mt-3 rounded-xl bg-secondary/60 p-3 text-sm leading-6">
          Your first email verification signs out other existing sessions and
          removes any password created before email ownership was proved. You
          stay signed in here; use Forgot password to set a verified password
          afterward.
        </p>
      ) : null}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {channels.map((channel) => {
          const verified =
            channel === 'email' ? status.emailVerified : status.phoneVerified;
          return (
            <div
              key={channel}
              className="min-w-0 space-y-3 rounded-xl border p-4"
            >
              <h3 className="font-semibold">Verify {channel}</h3>
              <p className="break-all text-sm">
                {channel === 'email'
                  ? status.email
                  : (status.phone ??
                    'Add a Nepal mobile number to your profile.')}
              </p>
              {verified ? (
                <p className="text-sm font-semibold text-primary">Verified</p>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      unavailable || busy !== null || (channel === 'phone' && !status.phone)
                    }
                    onClick={() => void act(channel, 'request')}
                  >
                    {busy === channel ? 'Working…' : `Send ${channel} code`}
                  </Button>
                  {pending[channel] ? (
                    <div className="space-y-2">
                      <Label htmlFor={`contact-${channel}-code`}>
                        {channel === 'email' ? 'Email' : 'SMS'} verification
                        code
                      </Label>
                      <Input
                        id={`contact-${channel}-code`}
                        value={codes[channel]}
                        onChange={(event) =>
                          setCodes((previous) => ({
                            ...previous,
                            [channel]: event.target.value
                              .replace(/\D/g, '')
                              .slice(0, 6),
                          }))
                        }
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="Six-digit code"
                      />
                      <Button
                        type="button"
                        disabled={unavailable || busy !== null || codes[channel].length !== 6}
                        onClick={() => void act(channel, 'verify')}
                      >
                        Verify {channel} code
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Expires in 10 minutes. Wait one minute before requesting
                        another code.
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm">
        <Link className="underline" href="/account/profile">
          Update your contact phone in your profile
        </Link>
        . {contactPolicy === 'email_only'
          ? 'Changing your email requires verification again.'
          : 'Changing a contact requires verification again.'}
      </p>
      {message ? (
        <output className="mt-3 block text-sm text-primary">{message}</output>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {unavailable ? <Button type="button" className="mt-3" disabled={loading} onClick={() => setStatusRetry(value => value + 1)}>Retry contact status</Button> : null}
      {local ? (
        <details className="mt-4 rounded-xl border border-dashed p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            SIMULATED — local test messages
          </summary>
          <p className="mt-2 text-xs">
            Fictional codes only. No email or SMS is sent outside this local
            test.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={busy !== null}
            onClick={refreshCaptures}
          >
            Refresh local codes
          </Button>
          {captures.map((capture) => (
            <p key={capture.channel} className="mt-3 break-all text-sm">
              {capture.channel}: {capture.contact} ·{' '}
              <strong className="font-mono">{capture.code}</strong>
            </p>
          ))}
        </details>
      ) : null}
    </section>
  );
}
