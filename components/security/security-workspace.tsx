'use client';

import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
  type InputHTMLAttributes,
} from 'react';

type SecurityStatus = {
  user: { displayName: string; email: string; role: string };
  status: 'pending' | 'active' | 'setup' | 'verify';
  needsPassword: boolean;
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
        className="min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2"
        {...props}
      />
    </div>
  );
}

async function securityRequest(
  path: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch('/api/security/' + path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    ...(body
      ? {
          headers: { 'Content-Type': 'application/json' },
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
    throw new Error(
      typeof record?.error === 'string'
        ? record.error
        : 'Security could not be checked. Please try again.',
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
    typeof user.displayName !== 'string' ||
    typeof user.email !== 'string' ||
    typeof user.role !== 'string' ||
    !['pending', 'active', 'setup', 'verify'].includes(String(value.status)) ||
    !session ||
    !Number.isFinite(session.absoluteHours) ||
    !Number.isFinite(session.idleMinutes) ||
    typeof value.needsPassword !== 'boolean' ||
    typeof value.canManage !== 'boolean' ||
    typeof value.localSimulation !== 'boolean' ||
    typeof value.recoveryRemaining !== 'number' ||
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

function safeReturnTo(value?: string) {
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
    return '/admin';
  try {
    const url = new URL(value, 'https://hastabazaar.invalid');
    return url.origin === 'https://hastabazaar.invalid' &&
      !url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/security')
      ? url.pathname + url.search + url.hash
      : '/admin';
  } catch {
    return '/admin';
  }
}

export function SecurityWorkspace({ returnTo }: { returnTo?: string } = {}) {
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
  const destination = safeReturnTo(returnTo);

  useEffect(() => {
    const controller = new AbortController();
    void securityRequest('status', undefined, controller.signal)
      .then(readStatus)
      .then(setStatus)
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : 'Security is unavailable.',
          );
      });
    return () => controller.abort();
  }, []);

  async function refresh() {
    setStatus(readStatus(await securityRequest('status')));
  }
  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'This action could not be completed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: SubmitEvent, action: () => Promise<void>) {
    event.preventDefault();
    void act(action);
  }
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
  }

  const privileged =
    status && ['admin', 'super_admin'].includes(status.user.role);
  const freshSession =
    status?.status === 'active' && status.sessionVerified === true;
  const currentFactorLabel =
    (recoveryMode ? 'Recovery code' : 'Authenticator code') +
    (freshSession ? ' (optional)' : '');
  return (
    <div className="grid min-w-0 gap-6">
      <header>
        <p className="eyebrow">Account security</p>
        <h1 className="section-title">Protect your Admin access</h1>
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
          <p className="mt-2">
            <Link
              href="/login?return_to=%2Fsecurity"
              className="font-semibold underline"
            >
              Sign in again
            </Link>
          </p>
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
                  ? 'Verify your Admin access'
                  : 'MFA setup pending'
              : 'Admin MFA is not required for this account'}
          </h2>
          <p className="mt-2 break-words text-sm">
            {status.user.displayName} · {status.user.email}
          </p>
          {privileged ? (
            <>
              <p className="mt-3 text-sm leading-6">
                Protected Admin sessions end after{' '}
                {status.session.absoluteHours} hours or{' '}
                {status.session.idleMinutes} minutes without activity. Signing
                in again requires your password and authenticator or a
                single-use recovery code.
              </p>
              {status.status !== 'active' && status.status !== 'verify' ? (
                <p className="mt-3 text-sm leading-6">
                  Your existing access remains available while setup is pending.
                  Protection becomes active after you confirm your authenticator
                  and save the recovery codes.
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
              This security setup is available for existing Admin and Super
              Admin accounts.
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

      {privileged && status.needsPassword ? (
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

      {privileged && !status.needsPassword && status.status === 'verify' ? (
        <section className={card}>
          <h2 className="text-xl font-semibold">Complete your sign-in</h2>
          <form
            data-form-id="system.security-mfa-verify"
            className="mt-5 grid max-w-xl gap-4"
            onSubmit={(event) =>
              submit(event, async () => {
                try {
                  await securityRequest('verify', {
                    password,
                    code,
                    recovery: recoveryMode,
                    returnTo: destination,
                  });
                  clearSecrets();
                  window.location.assign(destination);
                } finally {
                  setPassword('');
                  setCode('');
                }
              })
            }
          >
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
            <SecretField
              id="security-verify-code"
              label={recoveryMode ? 'Recovery code' : 'Authenticator code'}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              maxLength={recoveryMode ? 80 : 6}
              pattern={recoveryMode ? undefined : '[0-9]{6}'}
              inputMode={recoveryMode ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              disabled={busy}
            />
            <p className="text-sm leading-6">
              {recoveryMode
                ? 'A recovery code works once. Using it keeps MFA enabled.'
                : 'Enter the six-digit code shown in your authenticator app.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={busy} className={button}>
                {busy ? 'Verifying…' : 'Verify and continue'}
              </button>
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
              : replacing
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
            data-form-id="system.security-mfa-setup"
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
            data-form-id="system.security-mfa-activation"
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
            data-form-id="system.security-recovery-codes"
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
      {privileged ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Lost your authenticator and every recovery code? Contact the account
          owner for a reviewed recovery process. Email sign-in alone cannot
          remove MFA.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link
          href={destination}
          className="min-h-11 py-2 text-primary underline underline-offset-4"
        >
          Return to Admin
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
