'use client';

import Link from 'next/link';
import { sessionExpiredSignInPath } from '@/lib/auth/sign-in-destination';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type SubmitEvent,
  type InputHTMLAttributes,
} from 'react';

type SecurityStatus = {
  user: { id:string;displayName: string; email: string; role: string };
  status:
    | 'pending'
    | 'active'
    | 'setup'
    | 'verify'
    | 'optional'
    | 'disabled'
    | 'recovery';
  mfaRequired?: boolean;
  canDisable?: boolean;
  needsPassword: boolean;
  passwordVerified?: boolean;
  passwordCheckExpiresInMs?: number;
  canManage: boolean;
  localSimulation: boolean;
  session: { absoluteHours: number; idleMinutes: number };
  recoveryRemaining: number;
  sessionVerified?: boolean;
};
type Setup = { setupId: string; manualKey: string; otpAuthUrl: string };
type Recovery = { codes: string[]; setupId?: string };
const card = 'min-w-0 rounded-2xl border bg-card p-5 sm:p-7';
const button =
  'min-h-11 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50';
const secondary =
  'min-h-11 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50';

function SecretField({
  label,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <label className="block text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2"
        {...props}
        maxLength={props.pattern === '[0-9]{6}' ? 64 : props.maxLength}
        onChange={(event) => {
          // Authenticator apps may copy grouped digits. Normalize before length
          // validation; a six-character DOM limit cuts off the end of the code.
          if (props.pattern === '[0-9]{6}')
            event.target.value = event.target.value.replace(/[\s-]/g, '');
          props.onChange?.(event);
        }}
      />
    </div>
  );
}

async function rawSecurityRequest(
  path: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
  actorId?:string,
): Promise<Record<string, unknown>> {
  const response = await fetch('/api/security/' + path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers:{...(body?{'Content-Type':'application/json'}:{}),...(actorId===undefined?{}:{[ACTOR_INTENT_HEADER]:actorId})},
    ...(body
      ? {
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json().catch(() => null);
  const record =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (!response.ok)
    throw Object.assign(
      new Error(
        typeof record?.error === 'string'
          ? record.error
          : 'Security could not be checked. Please try again.',
      ),
      { code: record?.code,status:response.status },
    );
  if (!record)
    throw new Error(
      'The security response was incomplete. Please refresh the page.',
    );
  return record;
}

function readStatus(value: Record<string, unknown>): SecurityStatus {
  const user = value.user as SecurityStatus['user'] | undefined;
  const session = value.session as SecurityStatus['session'] | undefined;
  if (
    !user ||
    typeof user.id!=='string'||!user.id.trim()||user.id.length>191||
    typeof user.displayName !== 'string' ||
    typeof user.email !== 'string' ||
    typeof user.role !== 'string' ||
    ![
      'pending',
      'active',
      'setup',
      'verify',
      'optional',
      'disabled',
      'recovery',
    ].includes(String(value.status)) ||
    !session ||
    !Number.isFinite(session.absoluteHours) ||
    !Number.isFinite(session.idleMinutes) ||
    typeof value.needsPassword !== 'boolean' ||
    typeof value.canManage !== 'boolean' ||
    typeof value.localSimulation !== 'boolean' ||
    typeof value.recoveryRemaining !== 'number' ||
    (value.passwordVerified !== undefined && typeof value.passwordVerified !== 'boolean') ||
    (value.passwordCheckExpiresInMs !== undefined &&
      (typeof value.passwordCheckExpiresInMs !== 'number' ||
        !Number.isSafeInteger(value.passwordCheckExpiresInMs) || value.passwordCheckExpiresInMs < 1)) ||
    (value.sessionVerified !== undefined &&
      typeof value.sessionVerified !== 'boolean')
  )
    throw new Error(
      'Your security status was incomplete. Please refresh or sign in again.',
    );
  return value as unknown as SecurityStatus;
}

function AuthenticatorQr({ uri }: { uri: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let current = true;
    void import('qrcode')
      .then((qr) => {
        if (current && canvas.current)
          return qr.toCanvas(canvas.current, uri, {
            width: 216,
            margin: 2,
            errorCorrectionLevel: 'M',
          });
      })
      .catch(() => {
        if (current) setUnavailable(true);
      });
    return () => {
      current = false;
    };
  }, [uri]);
  return (
    <div className="min-w-0">
      <canvas
        ref={canvas}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Canvas keeps the private QR out of image URLs.
        role="img"
        aria-label="Authenticator setup QR code"
        className="max-w-full rounded-xl border bg-white"
      />
      {unavailable ? (
        <p className="mt-2 text-sm">
          The QR code could not be shown. Use the manual setup key below.
        </p>
      ) : null}
    </div>
  );
}

function safeReturnTo(value?: string, fallback = '/admin') {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return fallback;
  try {
    const url = new URL(value, 'https://hastabazaar.invalid');
    return url.origin === 'https://hastabazaar.invalid' &&
      !url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/security')
      ? url.pathname + url.search + url.hash
      : fallback;
  } catch {
    return fallback;
  }
}

export function SecurityWorkspace({ returnTo }: { returnTo?: string } = {}) {
  const actorId=useRef<string|undefined>(undefined),alive=useRef(true),generation=useRef(0),retired=useRef(false);
  const staffPasswordStep = useRef<string | null>(null);
  const[accessDenied,setAccessDenied]=useState(false);
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [saved, setSaved] = useState(false);
  const [bootstrapRequested, setBootstrapRequested] = useState(false);
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [capturedCode, setCapturedCode] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableRecovery, setDisableRecovery] = useState(false);
  const [disableAcknowledged, setDisableAcknowledged] = useState(false);
  const seller = status?.user.role === 'seller';
  const destination = safeReturnTo(returnTo, seller ? '/seller' : '/admin');

  function clearSecrets() {
    setPassword('');
    setCode('');
    setSetup(null);
    setRecovery(null);
    setSaved(false);
    setCapturedCode('');
    setBootstrapPassword('');
    setConfirmation('');
    setReplacing(false);
    setDisablePassword('');
    setDisableCode('');
    setDisableAcknowledged(false);
  }
  useLayoutEffect(()=>{alive.current=true;generation.current++;return()=>{alive.current=false;};},[]);
  function retire(){if(!alive.current||retired.current)return;retired.current=true;generation.current++;clearSecrets();setStatus(null);setBootstrapRequested(false);setRecoveryMode(false);setDisableRecovery(false);setNotice('');setError('');setBusy(false);setAccessDenied(true);}
  function closed(){return Object.assign(new Error('This original security view is closed.'),{code:'SECURITY_VIEW_CLOSED'});}
  function signInAfterExpiry(path: string) {
    retire();
    window.location.replace(sessionExpiredSignInPath(path));
  }
  async function securityRequest(path:string,body?:Record<string,unknown>,signal?:AbortSignal){
    if(!alive.current||retired.current)throw closed();const token=generation.current;
    try{const result=await rawSecurityRequest(path,body,signal,actorId.current);if(!alive.current||retired.current||token!==generation.current)throw closed();if(path==='status'){const next=readStatus(result);if(actorId.current!==undefined&&next.user.id!==actorId.current){retire();throw closed();}actorId.current=next.user.id;}return result;}
    catch(error) {
      if (alive.current && !retired.current && token === generation.current &&
        error && typeof error === 'object' && 'status' in error) {
        if (error.status === 401 && (staffPasswordStep.current || (status && !seller) ||
          ('code' in error && error.code === 'SESSION_EXPIRED'))) {
          signInAfterExpiry(staffPasswordStep.current ?? destination);
        } else if (actorId.current !== undefined && (error.status === 401 || error.status === 403)) {
          retire();
        }
      }
      throw error;
    }
  }

  function applyStatus(next: SecurityStatus) {
    if ((next.user.role === 'admin' || next.user.role === 'super_admin') && next.status === 'verify') {
      if (next.passwordVerified === true) staffPasswordStep.current = safeReturnTo(returnTo);
      else if (staffPasswordStep.current) {
        signInAfterExpiry(staffPasswordStep.current);
        return;
      }
    } else staffPasswordStep.current = null;
    setStatus(next);
  }

  async function refresh(signal?: AbortSignal) {
    const next = readStatus(await securityRequest('status', undefined, signal));
    if (!signal?.aborted && alive.current && !retired.current && next.user.id === actorId.current)
      applyStatus(next);
  }
  const checkStatus = useEffectEvent((signal?: AbortSignal) => {
    if (!alive.current || retired.current) return;
    void refresh(signal).catch(error => {
      if (!signal?.aborted && alive.current && !retired.current)
        setError(error instanceof Error ? error.message : 'Security is unavailable.');
    });
  });
  useEffect(() => {
    const controller = new AbortController();
    checkStatus(controller.signal);
    const check = () => { if (actorId.current !== undefined) checkStatus(controller.signal); };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    const denied = (event: Event) => {
      if (actorId.current !== undefined &&
        (event as CustomEvent<{actorId?:string}>).detail?.actorId === actorId.current) retire();
    };
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('hb:account-access-denied', denied);
    return () => {
      controller.abort();
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('hb:account-access-denied', denied);
    };
  }, []);
  useEffect(() => {
    if (!staffPasswordStep.current || !status?.passwordCheckExpiresInMs) return;
    const timeout = window.setTimeout(() => checkStatus(), status.passwordCheckExpiresInMs);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function act(action: () => Promise<void>) {
    if (busy||!alive.current||retired.current) return;
    const token=generation.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      if(!alive.current||retired.current||token!==generation.current)return;
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'PASSWORD_REQUIRED'
      ) {
        if (staffPasswordStep.current) {
          signInAfterExpiry(staffPasswordStep.current);
          return;
        }
        setStatus((current) =>
          current ? { ...current, passwordVerified: false } : current,
        );
        return;
      }
      setError(
        error instanceof Error
          ? error.message
          : 'This action could not be completed. Please try again.',
      );
    } finally {
      if(alive.current&&!retired.current&&token===generation.current)setBusy(false);
    }
  }
  function submit(event: SubmitEvent, action: () => Promise<void>) {
    event.preventDefault();
    void act(action);
  }


  const privileged =
    status && ['admin', 'super_admin', 'seller'].includes(status.user.role);
  const freshSession =
    status?.status === 'active' && status.sessionVerified === true;
  const currentFactorLabel =
    (recoveryMode ? 'Recovery code' : 'Authenticator code') +
    (freshSession ? ' (optional)' : '');
  if(accessDenied)return <section className={card} role="alert"><h1 className="section-title">Account security</h1><p className="mt-3">Your account or its security access changed. Private security details have been cleared. Reload security for the current account before continuing.</p><button type="button" className={secondary+' mt-4'} onClick={()=>window.location.reload()}>Reload security for current account</button></section>;
  return (
    <div className="grid min-w-0 gap-6">
      <header>
        <p className="eyebrow">Account security</p>
        <h1 className="section-title">
          {seller ? 'Protect your seller account' : 'Protect your Admin access'}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Use your password and an authenticator app. Keep recovery codes
          somewhere private so you can still sign in if your phone is
          unavailable.
        </p>
      </header>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive p-4 text-sm leading-6"
        >
          {error}
          {!seller && status?.status === 'verify' && status.passwordVerified === true ? null : (
            <p className="mt-2">
              <Link
                href={`/login?return_to=${encodeURIComponent(returnTo ? destination : '/security')}`}
                className="font-semibold underline"
              >
                Sign in again
              </Link>
            </p>
          )}
        </div>
      ) : null}
      {notice ? (
        <output className="block rounded-xl border p-4 text-sm leading-6">
          {notice}
        </output>
      ) : null}
      {!status && !error ? (
        <output className={card}>Loading your security status…</output>
      ) : null}
      {status ? (
        <section className={card} aria-label="Current security status">
          <h2 className="text-xl font-semibold">
            {privileged
              ? status.status === 'active'
                ? 'MFA active'
                : status.status === 'verify'
                  ? 'Verify your account access'
                  : status.status === 'recovery'
                    ? 'Set up your replacement authenticator'
                    : status.status === 'optional'
                      ? 'MFA is optional'
                      : status.status === 'disabled'
                        ? 'MFA is turned off'
                        : 'MFA setup pending'
              : 'MFA is not available for this account'}
          </h2>
          <p className="mt-2 break-words text-sm">
            {status.user.displayName} · {status.user.email}
          </p>
          {privileged ? (
            <>
              <p className="mt-3 text-sm leading-6">
                MFA-verified sessions end after {status.session.absoluteHours}{' '}
                hours or {status.session.idleMinutes} minutes without activity.
                Signing in again requires{' '}
                {status.mfaRequired === false
                  ? 'your password.'
                  : 'your password and authenticator or a single-use recovery code.'}
              </p>
              {status.status !== 'active' && status.status !== 'verify' ? (
                <p className="mt-3 text-sm leading-6">
                  {status.status === 'disabled'
                    ? 'You turned off MFA after verifying account ownership. Enable it again below to protect future sign-ins.'
                    : status.status === 'recovery'
                      ? 'Your approved recovery has cleared the old authenticator. Add a replacement and save your new recovery codes before returning to your account.'
                      : status.status === 'optional'
                        ? 'Two-step verification is optional. Enable it to add an authenticator code to your sign-in.'
                        : 'Your existing access remains available while setup is pending. Protection becomes active after you confirm your authenticator and save the recovery codes.'}
                </p>
              ) : null}
              {status.status === 'active' ? (
                <p className="mt-3 text-sm font-semibold">
                  {status.recoveryRemaining} recovery codes remaining
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm leading-6">
              This security setup is available for existing seller and staff
              accounts.
            </p>
          )}
          {status.localSimulation ? (
            <p className="mt-3 rounded-xl border bg-secondary/40 p-3 text-sm leading-6">
              Local testing environment. Captured email codes are only available
              for approved fictional local accounts. A local test session is not
              proof of completed MFA.
            </p>
          ) : null}
        </section>
      ) : null}

      {privileged && seller && status.needsPassword ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">Set your account password</h2>
          <p className="mt-2 text-sm leading-6">
            Use your registered email to set a password before enabling two-step
            verification.
          </p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline"
            href="/forgot-password?return_to=%2Fsecurity"
          >
            Set password through email
          </Link>
        </section>
      ) : null}
      {privileged && !seller && status.needsPassword ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">Set your first password</h2>
          <p className="mt-2 text-sm leading-6">
            This account has no saved password. Verify your existing email
            address, then choose a password privately. Your account and
            permissions stay the same.
          </p>
          {!bootstrapRequested ? (
            <button
              type="button"
              disabled={busy}
              className={`${button} mt-5`}
              onClick={() =>
                void act(async () => {
                  const result = await securityRequest('bootstrap', {
                    action: 'request',
                  });
                  setBootstrapRequested(true);
                  if (
                    status.localSimulation &&
                    result.localSimulation === true &&
                    typeof result.code === 'string'
                  )
                    setCapturedCode(result.code);
                  setNotice(
                    'Email verification requested. Use the code for your existing account.',
                  );
                })
              }
            >
              {busy ? 'Requesting…' : 'Request email verification'}
            </button>
          ) : (
            <form
              data-form-id="system.security-password-bootstrap"
              className="mt-5 grid max-w-xl gap-4"
              onSubmit={(event) =>
                submit(event, async () => {
                  if (bootstrapPassword !== confirmation)
                    throw new Error('The two passwords do not match.');
                  await securityRequest('bootstrap', {
                    action: 'complete',
                    password: bootstrapPassword,
                    confirmation,
                    code,
                  });
                  clearSecrets();
                  setBootstrapRequested(false);
                  await refresh();
                  setNotice(
                    'Your password was saved. You can now set up your authenticator.',
                  );
                })
              }
            >
              {capturedCode ? (
                <div className="rounded-xl border p-3 text-sm">
                  <p className="font-semibold">
                    Captured local test email code
                  </p>
                  <output className="mt-2 block break-all font-mono">
                    {capturedCode}
                  </output>
                  <p className="mt-2">
                    Fictional local account simulation only. Keep this code
                    private.
                  </p>
                </div>
              ) : null}
              <SecretField
                id="security-email-code"
                label="Email verification code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={12}
                disabled={busy}
              />
              <SecretField
                id="security-first-password"
                label="New password"
                type="password"
                value={bootstrapPassword}
                onChange={(event) => setBootstrapPassword(event.target.value)}
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                disabled={busy}
              />
              <SecretField
                id="security-confirm-password"
                label="Confirm new password"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                disabled={busy}
              />
              <p className="text-sm leading-6 text-muted-foreground">
                Use at least 12 characters and a password you do not use
                elsewhere.
              </p>
              <button
                className={`${button} justify-self-start`}
                disabled={busy}
                type="submit"
              >
                {busy ? 'Saving…' : 'Save first password'}
              </button>
            </form>
          )}
        </section>
      ) : null}

      {privileged && !status.needsPassword &&
      status.status === 'verify' && status.passwordVerified !== true ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">Confirm your password</h2>
          <p className="my-4 text-sm leading-6 text-muted-foreground">
            Sign in with your password first. Then enter your authenticator or recovery code.
          </p>
          <Link
            className={button + ' inline-flex items-center'}
            href={`/login?return_to=${encodeURIComponent(destination)}&reauth=password`}
            prefetch={false}
          >
            Sign in with password
          </Link>
        </section>
      ) : null}

      {privileged &&
      !status.needsPassword &&
      ((status.status === 'verify' && status.passwordVerified === true) ||
        (!seller &&
          (['optional', 'disabled'].includes(status.status) ||
            (status.status === 'setup' && status.mfaRequired === false)))) ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">Complete your sign-in</h2>
          <form
            data-form-id={
              seller ? 'system.seller-mfa-verify' : 'system.security-mfa-verify'
            }
            className="mt-5 grid max-w-xl gap-4"
            onSubmit={(event) =>
              submit(event, async () => {
                try {
                  await securityRequest('verify', {
                    ...(status.status === 'verify' ? { code, recovery: recoveryMode } : { password }),
                    returnTo: destination,
                  });
                  staffPasswordStep.current = null;
                  generation.current++;
                  clearSecrets();
                  window.location.assign(destination);
                } finally {
                  setPassword('');
                  setCode('');
                }
              })
            }
          >
            {status.status === 'verify' ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Password confirmed. Enter your{' '}
                {recoveryMode ? 'recovery' : 'authenticator'} code to finish
                signing in.
              </p>
            ) : (
              <SecretField
                id="security-verify-password"
                label="Current password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={256}
                autoComplete="current-password"
                disabled={busy}
              />
            )}
            {status.status === 'verify' ? (
              <>
                <SecretField
                  id="security-verify-code"
                  label={recoveryMode ? 'Recovery code' : 'Authenticator code'}
                  value={code}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCode(recoveryMode || /^[0-9]*$/.test(value) ? value : '');
                  }}
                  required
                  maxLength={recoveryMode ? 80 : 6}
                  pattern={recoveryMode ? undefined : '[0-9]{6}'}
                  inputMode={recoveryMode ? 'text' : 'numeric'}
                  autoComplete={recoveryMode ? 'off' : 'one-time-code'}
                  spellCheck={false}
                  autoCapitalize="none"
                  disabled={busy}
                />
                <p className="text-sm leading-6">
                  {recoveryMode
                    ? 'A recovery code works once. Using it keeps MFA enabled.'
                    : 'Enter or paste the six-digit code from your authenticator app. Spaces are removed automatically.'}
                </p>
              </>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={busy} className={button}>
                {busy
                  ? 'Verifying…'
                  : status.status === 'verify'
                    ? 'Verify and continue'
                    : 'Continue with password'}
              </button>
              {status.status === 'verify' ? (
                <button
                  type="button"
                  disabled={busy}
                  className={secondary}
                  onClick={() => {
                    setRecoveryMode(!recoveryMode);
                    setCode('');
                    setError('');
                  }}
                >
                  {recoveryMode
                    ? 'Use authenticator instead'
                    : 'Use a recovery code'}
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {privileged &&
      !status.needsPassword &&
      status.canManage &&
      status.status !== 'verify' &&
      (status.status !== 'active' || replacing) &&
      !recovery ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">
            {setup
              ? 'Connect your authenticator'
              : replacing || status.status === 'recovery'
                ? 'Replace your authenticator'
                : 'Add an authenticator'}
          </h2>
          {replacing ? (
            <p className="mt-2 text-sm leading-6">
              Your existing authenticator stays active until you confirm the
              replacement and save its new recovery codes. Confirm your current
              password.{' '}
              {freshSession
                ? 'Your recently verified MFA session can confirm your existing protection.'
                : 'Also enter your current authenticator or a remaining recovery code.'}
            </p>
          ) : null}
          {setup ? (
            <>
              <p className="mt-2 text-sm leading-6">
                Scan this code with your own authenticator app, or enter the
                manual key. This setup expires after 10 minutes. Keep the key
                private.
              </p>
              <div className="mt-5 grid min-w-0 gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
                <AuthenticatorQr uri={setup.otpAuthUrl} />
                <div className="min-w-0">
                  <SecretField
                    id="security-manual-key"
                    label="Manual setup key"
                    value={setup.manualKey}
                    readOnly
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="mt-3 text-sm leading-6">
                    Choose a time-based code in your authenticator. Do not share
                    this key or the QR code.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm leading-6">
              Use an authenticator app on a device you control. Confirm your
              password to begin. Setup alone does not activate MFA.
            </p>
          )}
          <form
            data-form-id={
              seller ? 'system.seller-mfa-setup' : 'system.security-mfa-setup'
            }
            className="mt-5 grid max-w-xl gap-4"
            onSubmit={(event) =>
              submit(event, async () => {
                if (setup) {
                  const result = await securityRequest('confirm', {
                    setupId: setup.setupId,
                    code,
                    password,
                  });
                  if (
                    !Array.isArray(result.recoveryCodes) ||
                    result.recoveryCodes.length !== 10 ||
                    !result.recoveryCodes.every(
                      (value: unknown) => typeof value === 'string',
                    )
                  )
                    throw new Error(
                      'Recovery codes were not returned. Restart setup before activating MFA.',
                    );
                  setRecovery({
                    codes: result.recoveryCodes,
                    setupId:
                      typeof result.setupId === 'string'
                        ? result.setupId
                        : setup.setupId,
                  });
                  setSetup(null);
                  setCode('');
                  setSaved(false);
                } else {
                  const result = await securityRequest('setup', {
                    password,
                    ...(replacing && (!freshSession || code.trim())
                      ? { code, recovery: recoveryMode }
                      : {}),
                  });
                  if (
                    typeof result.setupId !== 'string' ||
                    typeof result.manualKey !== 'string' ||
                    typeof result.otpAuthUrl !== 'string'
                  )
                    throw new Error(
                      'Authenticator setup was incomplete. Please try again.',
                    );
                  setSetup({
                    setupId: result.setupId,
                    manualKey: result.manualKey,
                    otpAuthUrl: result.otpAuthUrl,
                  });
                  setCode('');
                }
              })
            }
          >
            {!setup ? (
              <SecretField
                id="security-setup-password"
                label="Current password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={256}
                autoComplete="current-password"
                disabled={busy}
              />
            ) : (
              <SecretField
                id="security-setup-code"
                label="Authenticator code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                pattern="[0-9]{6}"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={busy}
              />
            )}
            {replacing && !setup ? (
              <>
                <SecretField
                  id="security-replacement-code"
                  label={currentFactorLabel}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required={!freshSession}
                  maxLength={recoveryMode ? 80 : 6}
                  pattern={recoveryMode ? undefined : '[0-9]{6}'}
                  inputMode={recoveryMode ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  disabled={busy}
                />
                {freshSession ? (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Your MFA was recently verified. Re-enter your password;
                    another current code is optional for up to five minutes
                    after verification. If it has expired, refresh security
                    status and verify again.
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  className={`${secondary} justify-self-start`}
                  onClick={() => {
                    setRecoveryMode(!recoveryMode);
                    setCode('');
                  }}
                >
                  {recoveryMode
                    ? 'Use authenticator instead'
                    : 'Use a recovery code'}
                </button>
              </>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={busy} className={button}>
                {busy
                  ? 'Checking…'
                  : setup
                    ? 'Confirm authenticator'
                    : replacing
                      ? 'Start authenticator replacement'
                      : 'Set up authenticator'}
              </button>
              {setup || replacing ? (
                <button
                  type="button"
                  disabled={busy}
                  className={secondary}
                  onClick={() => {
                    clearSecrets();
                    setNotice(
                      status.status === 'active'
                        ? 'Replacement was closed. Your existing authenticator remains active.'
                        : 'Setup was closed. MFA is not active until both confirmation steps are complete.',
                    );
                  }}
                >
                  Close setup
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {recovery ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">
            Save your recovery codes now
          </h2>
          <p className="mt-2 text-sm leading-6">
            These codes are shown once. Store them in a private password manager
            or another safe place away from your phone. Each code can be used
            once.
          </p>
          <ul
            className="mt-5 grid min-w-0 gap-2 sm:grid-cols-2"
            aria-label="Single-use recovery codes"
          >
            {recovery.codes.map((value) => (
              <li
                key={value}
                className="min-w-0 break-all rounded-lg border p-3 font-mono text-sm select-all"
              >
                {value}
              </li>
            ))}
          </ul>
          <form
            data-form-id={
              seller
                ? 'system.seller-mfa-activation'
                : 'system.security-mfa-activation'
            }
            className="mt-5 grid gap-4"
            onSubmit={(event) =>
              submit(event, async () => {
                if (!saved)
                  throw new Error(
                    'Save your recovery codes and confirm before continuing.',
                  );
                if (recovery.setupId)
                  await securityRequest('confirm', {
                    setupId: recovery.setupId,
                    acknowledge: true,
                    password,
                  });
                clearSecrets();
                await refresh();
                setNotice(
                  recovery.setupId
                    ? 'MFA is active. Your previous privileged sessions have been revoked.'
                    : 'New recovery codes saved. The previous set no longer works.',
                );
              })
            }
          >
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                checked={saved}
                disabled={busy}
                onChange={(event) => setSaved(event.target.checked)}
                className="mt-1 size-4 shrink-0"
                required
              />
              I saved these recovery codes privately and understand that each
              code works once.
            </label>
            <button
              className={`${button} justify-self-start`}
              disabled={busy || !saved}
              type="submit"
            >
              {busy
                ? 'Confirming…'
                : recovery.setupId
                  ? 'Activate MFA'
                  : 'I saved my new codes'}
            </button>
          </form>
        </section>
      ) : null}

      {privileged &&
      status.status === 'active' &&
      status.canManage &&
      !recovery &&
      !replacing ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">Replace recovery codes</h2>
          <p className="mt-2 text-sm leading-6">
            Generate a new set if you used a code or need to replace your saved
            copy. This immediately invalidates the old set. Confirm your
            password.
            {freshSession
              ? ' Your recently verified MFA session can confirm your existing protection, even if no recovery codes remain.'
              : ' Also enter your authenticator or one remaining recovery code.'}
          </p>
          <form
            data-form-id={
              seller
                ? 'system.seller-recovery-codes'
                : 'system.security-recovery-codes'
            }
            className="mt-5 grid max-w-xl gap-4"
            onSubmit={(event) =>
              submit(event, async () => {
                try {
                  const result = await securityRequest('recovery', {
                    password,
                    ...(!freshSession || code.trim()
                      ? { code, recovery: recoveryMode }
                      : {}),
                  });
                  if (
                    !Array.isArray(result.recoveryCodes) ||
                    result.recoveryCodes.length !== 10 ||
                    !result.recoveryCodes.every(
                      (value: unknown) => typeof value === 'string',
                    )
                  )
                    throw new Error(
                      'The new code response was incomplete. Check your security status before retrying.',
                    );
                  setRecovery({ codes: result.recoveryCodes });
                  setSaved(false);
                } finally {
                  setPassword('');
                  setCode('');
                }
              })
            }
          >
            <SecretField
              id="security-recovery-password"
              label="Current password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={256}
              autoComplete="current-password"
              disabled={busy}
            />
            <SecretField
              id="security-recovery-code"
              label={currentFactorLabel}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required={!freshSession}
              maxLength={recoveryMode ? 80 : 6}
              pattern={recoveryMode ? undefined : '[0-9]{6}'}
              inputMode={recoveryMode ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              disabled={busy}
            />
            {freshSession ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Your MFA was recently verified. Re-enter your password; another
                current code is optional for up to five minutes after
                verification. If it has expired, refresh security status and
                verify again.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button className={button} type="submit" disabled={busy}>
                {busy ? 'Generating…' : 'Generate replacement recovery codes'}
              </button>
              <button
                type="button"
                className={secondary}
                disabled={busy}
                onClick={() => {
                  setRecoveryMode(!recoveryMode);
                  setCode('');
                }}
              >
                {recoveryMode
                  ? 'Use authenticator instead'
                  : 'Use a recovery code'}
              </button>
            </div>
          </form>
        </section>
      ) : null}
      {privileged &&
      status.status === 'active' &&
      status.canManage &&
      !recovery &&
      !replacing ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">
            Use a different authenticator
          </h2>
          <p className="mt-2 text-sm leading-6">
            Move to your own new device after verifying your current password
            and MFA. A recently verified MFA session can be used; otherwise
            enter your authenticator or a remaining recovery code. Your existing
            protection stays in place until replacement is complete.
          </p>
          <button
            type="button"
            disabled={busy}
            className={`${secondary} mt-4`}
            onClick={() => {
              clearSecrets();
              setReplacing(true);
              setRecoveryMode(false);
              setError('');
              setNotice('');
            }}
          >
            Replace authenticator
          </button>
        </section>
      ) : null}
      {privileged &&
      status.status === 'active' &&
      status.canManage &&
      status.canDisable &&
      !recovery &&
      !replacing &&
      !setup ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">Turn off MFA</h2>
          <p className="mt-2 text-sm leading-6">
            Verify your password and a fresh authenticator or unused recovery
            code. This signs out all your sessions and invalidates your recovery
            codes. Future sign-ins will use your password until you enable MFA
            again. {seller ? '' : 'Security-key exports still require MFA.'}
          </p>
          <form
            aria-label="Disable MFA"
            data-form-id={
              seller
                ? 'system.seller-mfa-disable'
                : 'system.security-mfa-disable'
            }
            className="mt-5 grid max-w-xl gap-4"
            onSubmit={(event) =>
              submit(event, async () => {
                try {
                  await securityRequest('disable', {
                    password: disablePassword,
                    code: disableCode,
                    recovery: disableRecovery,
                    acknowledge: disableAcknowledged,
                  });
                  clearSecrets();
                  window.location.assign('/login');
                } finally {
                  setDisablePassword('');
                  setDisableCode('');
                  setDisableAcknowledged(false);
                }
              })
            }
          >
            <SecretField
              id="security-disable-password"
              label="Current password"
              type="password"
              value={disablePassword}
              onChange={(event) => setDisablePassword(event.target.value)}
              required
              maxLength={256}
              autoComplete="current-password"
              disabled={busy}
            />
            <SecretField
              id="security-disable-code"
              label={disableRecovery ? 'Recovery code' : 'Authenticator code'}
              value={disableCode}
              onChange={(event) => setDisableCode(event.target.value)}
              required
              maxLength={disableRecovery ? 80 : 6}
              pattern={disableRecovery ? undefined : '[0-9]{6}'}
              inputMode={disableRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              disabled={busy}
            />
            <button
              type="button"
              className={secondary}
              disabled={busy}
              onClick={() => {
                setDisableRecovery(!disableRecovery);
                setDisableCode('');
              }}
            >
              {disableRecovery
                ? 'Use authenticator instead'
                : 'Use a recovery code'}
            </button>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={disableAcknowledged}
                onChange={(event) =>
                  setDisableAcknowledged(event.target.checked)
                }
                disabled={busy}
              />
              I understand future sign-ins will use only my password until I
              enable MFA again.
            </label>
            <button
              type="submit"
              className={secondary}
              disabled={busy || !disableAcknowledged}
            >
              {busy ? 'Verifying…' : 'Disable MFA'}
            </button>
          </form>
        </section>
      ) : null}
      {privileged ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Lost your authenticator and every recovery code? Contact Hastabazaar
          support for Super Admin-reviewed recovery. Email sign-in alone cannot
          remove MFA.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link
          href={destination}
          className="min-h-11 py-2 text-primary underline underline-offset-4"
        >
          {seller ? 'Return to seller dashboard' : 'Return to Admin'}
        </Link>
        <button
          className="min-h-11 py-2 text-primary underline underline-offset-4"
          type="button"
          disabled={busy}
          onClick={() => void act(refresh)}
        >
          Refresh security status
        </button>
      </div>
    </div>
  );
}
