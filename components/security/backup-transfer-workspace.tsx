'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';

type Inventory = { tables: number; rows: number; files: number; bytes: number };
type Readiness = {
  ready: boolean;
  nativeRecoveryRequired?: boolean;
  verificationExpiresAt?: number;
  release?: string;
  snapshotAt?: string | number;
  inventory?: Inventory;
  warnings?: string[];
  supportedDestinations?: string[];
};
type Inspection = {
  valid: boolean;
  inventory: Inventory;
  warnings?: string[];
  snapshotAt?: string | number;
  release?: string;
};
const card = 'min-w-0 rounded-2xl border bg-card p-5 sm:p-7';
const button =
  'min-h-11 max-w-full whitespace-normal rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50';
const input =
  'min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2';
const securityHref = '/security?return_to=%2Fadmin%2Fbackup-transfer';

class BackupRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
function VerifyAction({ id, label }: { id: string; label: string }) {
  return (
    <p
      id={id}
      className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950"
    >
      Recent Super Admin verification is required.{' '}
      <Link
        href={securityHref}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold underline"
      >
        {label}
      </Link>{' '}
      in a new tab, then return here and choose Refresh readiness. Your selected
      file and unsent entries stay on this page.
    </p>
  );
}

function FileInventory({ value }: { value: Inventory }) {
  return (
    <dl className="mt-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ['Tables', value.tables],
        ['Records', value.rows],
        ['Files', value.files],
        ['Bytes', value.bytes],
      ].map(([label, count]) => (
        <div key={label} className="min-w-0 rounded-xl border p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words font-semibold">
            {typeof count === 'number'
              ? count.toLocaleString('en-US')
              : 'Unavailable'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function SnapshotTime({ value }: { value?: string | number }) {
  if (value === undefined) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return (
    <p className="mt-2 text-sm">
      Snapshot:{' '}
      {date.toLocaleString('en-GB', {
        timeZone: 'Asia/Kathmandu',
        dateStyle: 'medium',
        timeStyle: 'short',
      })}{' '}
      Nepal time
    </p>
  );
}
async function responseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => null);
  const record =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (!response.ok)
    throw new BackupRequestError(
      typeof record?.error === 'string'
        ? record.error
        : 'The backup action could not be completed. Please try again.',
      response.status,
    );
  if (!record)
    throw new Error(
      'The server returned an incomplete response. Please refresh before continuing.',
    );
  return record;
}
function inventory(value: unknown): Inventory {
  const record = value as Partial<Inventory> | undefined;
  if (
    !record ||
    ![record.tables, record.rows, record.files, record.bytes].every(
      (value) =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    )
  )
    throw new Error(
      'The backup inventory was incomplete. Do not rely on this package.',
    );
  return record as Inventory;
}
function readinessData(value: Record<string, unknown>): Readiness {
  if (typeof value.ready !== 'boolean')
    throw new Error(
      'Backup readiness was incomplete. Please refresh before exporting.',
    );
  if(value.nativeRecoveryRequired!==undefined&&typeof value.nativeRecoveryRequired!=='boolean')throw new Error('Recovery capability was incomplete. Refresh readiness.');
  if (
    value.verificationExpiresAt !== undefined &&
    (!Number.isSafeInteger(value.verificationExpiresAt) ||
      (value.verificationExpiresAt as number) < 1)
  )
    throw new Error(
      'The verification expiry was incomplete. Please refresh readiness.',
    );
  if (value.inventory !== undefined) inventory(value.inventory);
  if (
    value.warnings !== undefined &&
    (!Array.isArray(value.warnings) ||
      !value.warnings.every((item) => typeof item === 'string'))
  )
    throw new Error('Backup warnings were incomplete. Please refresh.');
  if (
    value.supportedDestinations !== undefined &&
    (!Array.isArray(value.supportedDestinations) ||
      !value.supportedDestinations.every((item) => typeof item === 'string'))
  )
    throw new Error(
      'Destination compatibility was incomplete. Please refresh.',
    );
  return value as unknown as Readiness;
}
function inspectionData(value: Record<string, unknown>): Inspection {
  if (typeof value.valid !== 'boolean')
    throw new Error(
      'Backup inspection was incomplete. Do not rely on this package.',
    );
  inventory(value.inventory);
  if (
    value.warnings !== undefined &&
    (!Array.isArray(value.warnings) ||
      !value.warnings.every((item) => typeof item === 'string'))
  )
    throw new Error('Backup inspection warnings were incomplete.');
  return value as unknown as Inspection;
}

export function BackupTransferWorkspace() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saved, setSaved] = useState(false);
  const [keyPassphrase, setKeyPassphrase] = useState('');
  const [keyConfirmation, setKeyConfirmation] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [inspectionPassphrase, setInspectionPassphrase] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [observedAt, setObservedAt] = useState(() => Date.now());
  const inFlightInspection = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/backup-transfer', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(responseJson)
      .then(readinessData)
      .then(setReadiness)
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Backup readiness is unavailable.',
          );
      });
    return () => {
      controller.abort();
      inFlightInspection.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!readiness?.ready || readiness.verificationExpiresAt === undefined)
      return;
    const remaining = readiness.verificationExpiresAt - Date.now();
    const timer = setTimeout(
      () => setObservedAt(Date.now()),
      Math.min(Math.max(0, remaining + 1), 2147483647),
    );
    return () => clearTimeout(timer);
  }, [readiness]);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      if (
        error instanceof BackupRequestError &&
        (error.status === 401 || error.status === 403)
      )
        setReadiness((previous) =>
          previous
            ? { ...previous, ready: false, warnings: [error.message] }
            : null,
        );
      setError(
        error instanceof Error
          ? error.message
          : 'This action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: SubmitEvent, action: () => Promise<void>) {
    event.preventDefault();
    void act(action);
  }
  async function download(
    action: 'export' | 'key-recovery',
    secret: string,
    repeated: string,
    acknowledged: boolean,
  ) {
    if (
      !readiness?.ready ||
      (readiness.verificationExpiresAt !== undefined &&
        Date.now() >= readiness.verificationExpiresAt)
    )
      throw new Error(
        'Protected export is not ready. Check readiness and verify your Admin security.',
      );
    if (secret.length < 16 || secret !== repeated || !acknowledged)
      throw new Error(
        'Use matching passphrases of at least 16 characters and confirm safe storage.',
      );
    const response = await fetch('/api/admin/backup-transfer', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'prepare-download',
        kind: action,
        passphrase: secret,
        confirmation: true,
      }),
    });
    const data = await responseJson(response);
    if (
      typeof data.ticket !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(data.ticket)
    ) {
      throw new Error(
        'A private download grant was not returned. Verify Admin security before trying again.',
      );
    }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/admin/backup-transfer/download';
    form.enctype = 'application/x-www-form-urlencoded';
    form.target = '_self';
    form.hidden = true;
    const ticketField = document.createElement('input');
    ticketField.type = 'hidden';
    ticketField.name = 'ticket';
    ticketField.value = data.ticket;
    form.appendChild(ticketField);
    document.body.appendChild(form);
    try {
      form.submit();
    } finally {
      ticketField.value = '';
      ticketField.remove();
      form.remove();
    }
    if (action === 'export') {
      setPassphrase('');
      setConfirmation('');
      setSaved(false);
      setNotice(
        'Encrypted backup download requested. Check your browser downloads, then inspect the saved file to verify success. Keep its passphrase separately.',
      );
    } else {
      setKeyPassphrase('');
      setKeyConfirmation('');
      setKeySaved(false);
      setNotice(
        'Encrypted key recovery download requested. Check your browser downloads, then inspect the saved file to verify success. Keep it separately from the main backup and protect its passphrase.',
      );
    }
  }
  const expired =
    readiness?.verificationExpiresAt !== undefined &&
    observedAt >= readiness.verificationExpiresAt;
  const ready = readiness?.ready === true && !expired;
  const showVerification = !ready && (readiness !== null || !!error);
  return (
    <div className="grid min-w-0 gap-6">
      <header>
        <p className="eyebrow">Super Admin · Data protection</p>
        <h1 className="section-title">Backup &amp; Transfer</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Prepare an encrypted copy of your records and uploads, protect the
          matching security keys separately, and check a saved package before a
          future hosting move.
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
              href={securityHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              Verify Admin security
            </Link>
          </p>
        </div>
      ) : null}
      {notice ? (
        <output className="block rounded-xl border p-4 text-sm leading-6">
          {notice}
        </output>
      ) : null}
      <section className={card} aria-label="Backup readiness">
        <h2 className="text-xl font-semibold">
          {ready
            ? 'MFA verified for export'
            : readiness || error
              ? 'Export needs attention'
              : 'Checking backup readiness…'}
        </h2>
        {ready && readiness?.verificationExpiresAt ? (
          <p className="mt-3 rounded-xl border p-3 text-sm leading-6">
            Export verification ends at{' '}
            {new Date(readiness.verificationExpiresAt).toLocaleTimeString(
              'en-GB',
              {
                timeZone: 'Asia/Kathmandu',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              },
            )}{' '}
            Nepal time. Complete the protected actions before then, or verify
            again.
          </p>
        ) : null}
        {expired ? (
          <p className="mt-3 text-sm font-semibold">
            Your export verification has expired. Verify again before
            downloading or inspecting a package.
          </p>
        ) : null}
        <p className="mt-2 text-sm leading-6">
          Complete exports and security-key recovery require Super Admin access
          plus recent password and MFA verification. Your storage, schema and
          files are checked when an export starts.
        </p>
        <p className="mt-2 text-sm leading-6">
          If a download opens an error page, use your browser’s Back button,
          verify Admin security and try again. Check the saved file before
          relying on the backup.
        </p>
        {readiness?.release ? (
          <p className="mt-2 break-words text-sm">
            Application release: {readiness.release}
          </p>
        ) : null}
        {!readiness?.release || /local|candidate/i.test(readiness.release) ? (
          <p className="mt-3 rounded-xl border p-3 text-sm leading-6">
            Local candidate: keep the matching application source and
            dependencies separately. A data package alone is not the application
            needed on your future host.
          </p>
        ) : null}
        <SnapshotTime value={readiness?.snapshotAt} />
        {readiness?.inventory ? (
          <FileInventory value={readiness.inventory} />
        ) : null}
        {readiness?.supportedDestinations?.length ? (
          <p className="mt-3 text-sm leading-6">
            Supported destination adapters:{' '}
            {readiness.supportedDestinations.join(', ')}. Each destination still
            needs a compatible application release, database, storage and
            configuration check.
          </p>
        ) : null}
        {!expired && readiness?.warnings?.length ? (
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6">
            {readiness.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
          <Link
            href={securityHref}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 py-2 text-primary underline underline-offset-4"
          >
            Verify Admin security
          </Link>
          <button
            type="button"
            className="min-h-11 py-2 text-primary underline underline-offset-4 disabled:opacity-50"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                setReadiness(null);
                setReadiness(
                  readinessData(
                    await responseJson(
                      await fetch('/api/admin/backup-transfer', {
                        credentials: 'same-origin',
                        cache: 'no-store',
                      }),
                    ),
                  ),
                );
              })
            }
          >
            Refresh readiness
          </button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-xl font-semibold">
          {readiness?.nativeRecoveryRequired?'1. Arrange native hosting recovery':'1. Download your encrypted backup'}
        </h2>
        {readiness?.nativeRecoveryRequired?<p className="mt-3 rounded-xl border p-4 text-sm leading-6">Ask the hosting operator to use the Native recovery procedure in the matching application source. It preserves the exact application archive, a paused database snapshot and all public/private uploads with metadata. Keep the separately encrypted key recovery below. Browser data downloads are unavailable on this host; an isolated restore rehearsal and owner approval are required before switching hosting.</p>:null}
        <p className="mt-2 text-sm leading-6">
          The package contains application records, saved terms, agreement
          history, uploads and encrypted MFA records. It does not change your
          existing records. Keep the package private.
        </p>
        <form
          data-form-id="system.backup-export"
          className="mt-5 grid max-w-xl gap-4"
          onSubmit={(event) =>
            submit(event, () =>
              download('export', passphrase, confirmation, saved),
            )
          }
        >
          <div className="space-y-2">
            <label
              htmlFor="backup-passphrase"
              className="block text-sm font-semibold"
            >
              Backup passphrase
            </label>
            <input
              id="backup-passphrase"
              type="password"
              className={input}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="new-password"
              minLength={16}
              maxLength={512}
              required
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="backup-confirmation"
              className="block text-sm font-semibold"
            >
              Confirm backup passphrase
            </label>
            <input
              id="backup-confirmation"
              type="password"
              className={input}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={16}
              maxLength={512}
              required
              disabled={busy}
            />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose at least 16 characters. Losing the passphrase can make this
            package unusable. Do not use your account password.
          </p>
          <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
              className="mt-1 size-4 shrink-0"
              required
              disabled={busy}
            />
            I will keep this passphrase separately from the downloaded backup.
          </label>
          <button
            type="submit"
            className={`${button} justify-self-start`}
            disabled={
              busy ||
              !ready || readiness?.nativeRecoveryRequired === true ||
              !saved ||
              passphrase.length < 16 ||
              passphrase !== confirmation
            }
          >
            {busy ? 'Working…' : 'Download encrypted backup'}
          </button>
          {showVerification ? (
            <VerifyAction
              id="data-download-verification"
              label="Verify for data download"
            />
          ) : null}
        </form>
      </section>

      <section className={card}>
        <h2 className="text-xl font-semibold">
          2. Protect your security keys separately
        </h2>
        <p className="mt-2 text-sm leading-6">
          Moving the database alone is not enough to retain MFA. The destination
          also needs the matching encrypted key recovery bundle. The raw server
          key is never shown here.
        </p>
        <form
          data-form-id="system.backup-key-recovery"
          className="mt-5 grid max-w-xl gap-4"
          onSubmit={(event) =>
            submit(event, () =>
              download(
                'key-recovery',
                keyPassphrase,
                keyConfirmation,
                keySaved,
              ),
            )
          }
        >
          <div className="space-y-2">
            <label
              htmlFor="backup-key-passphrase"
              className="block text-sm font-semibold"
            >
              Key recovery passphrase
            </label>
            <input
              id="backup-key-passphrase"
              type="password"
              className={input}
              value={keyPassphrase}
              onChange={(event) => setKeyPassphrase(event.target.value)}
              autoComplete="new-password"
              minLength={16}
              maxLength={512}
              required
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="backup-key-confirmation"
              className="block text-sm font-semibold"
            >
              Confirm key recovery passphrase
            </label>
            <input
              id="backup-key-confirmation"
              type="password"
              className={input}
              value={keyConfirmation}
              onChange={(event) => setKeyConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={16}
              maxLength={512}
              required
              disabled={busy}
            />
          </div>
          <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={keySaved}
              onChange={(event) => setKeySaved(event.target.checked)}
              className="mt-1 size-4 shrink-0"
              required
              disabled={busy}
            />
            I will keep the key recovery bundle separately from the main backup
            and protect its passphrase.
          </label>
          <button
            type="submit"
            className={`${button} justify-self-start`}
            disabled={
              busy ||
              !ready ||
              !keySaved ||
              keyPassphrase.length < 16 ||
              keyPassphrase !== keyConfirmation
            }
          >
            {busy ? 'Working…' : 'Download encrypted key recovery'}
          </button>
          {showVerification ? (
            <VerifyAction
              id="key-download-verification"
              label="Verify for key recovery"
            />
          ) : null}
        </form>
      </section>

      <section className={card}>
        <h2 className="text-xl font-semibold">3. Check a saved backup</h2>
        <p className="mt-2 text-sm leading-6">
          Check an encrypted backup or key recovery package, record counts and
          file integrity. Inspection does not restore records, send emails,
          replay payments or activate another installation.
        </p>
        <form
          data-form-id="system.backup-inspect"
          className="mt-5 grid max-w-xl gap-4"
          onSubmit={(event) =>
            submit(event, async () => {
              if (!file)
                throw new Error('Choose an encrypted backup file first.');
              setInspection(null);
              const inspectionController = new AbortController();
              inFlightInspection.current = inspectionController;
              try {
                const prepared = await responseJson(
                  await fetch('/api/admin/backup-transfer/inspect', {
                    method: 'POST',
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'prepare',
                      passphrase: inspectionPassphrase,
                    }),
                    signal: inspectionController.signal,
                  }),
                );
                if (
                  typeof prepared.ticket !== 'string' ||
                  !/^[A-Za-z0-9_-]{24,256}$/.test(prepared.ticket)
                )
                  throw new Error(
                    'A private inspection ticket was not returned. Please verify Admin security and try again.',
                  );
                setInspectionPassphrase('');
                setInspection(
                  inspectionData(
                    await responseJson(
                      await fetch('/api/admin/backup-transfer/inspect', {
                        method: 'POST',
                        credentials: 'same-origin',
                        cache: 'no-store',
                        headers: {
                          'Content-Type': 'application/octet-stream',
                          'X-Hastabazaar-Inspection': prepared.ticket,
                        },
                        body: file,
                        signal: inspectionController.signal,
                      }),
                    ),
                  ),
                );
              } finally {
                if (inFlightInspection.current === inspectionController)
                  inFlightInspection.current = null;
                setInspectionPassphrase('');
              }
            })
          }
        >
          <div className="space-y-2">
            <label
              htmlFor="backup-inspect-file"
              className="block text-sm font-semibold"
            >
              Encrypted backup file
            </label>
            <input
              ref={fileInput}
              id="backup-inspect-file"
              type="file"
              className={`${input} text-sm`}
              accept=".hzb,.hzk,.json,application/octet-stream,application/json"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setInspection(null);
              }}
              required
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="backup-inspect-passphrase"
              className="block text-sm font-semibold"
            >
              Inspection passphrase
            </label>
            <input
              id="backup-inspect-passphrase"
              type="password"
              className={input}
              value={inspectionPassphrase}
              onChange={(event) => setInspectionPassphrase(event.target.value)}
              autoComplete="off"
              maxLength={512}
              required
              disabled={busy}
            />
            <p className="text-sm leading-6 text-muted-foreground">
              Enter the passphrase used for the selected file: the backup
              passphrase for .hzb, or the key recovery passphrase for .hzk.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className={button}
              disabled={busy || !ready || !file || !inspectionPassphrase}
            >
              {busy ? 'Checking…' : 'Inspect backup'}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl border px-4 py-3 text-sm font-semibold"
              disabled={busy}
              onClick={() => {
                setFile(null);
                setInspection(null);
                setInspectionPassphrase('');
                if (fileInput.current) fileInput.current.value = '';
              }}
            >
              Clear selected backup
            </button>
          </div>
          {showVerification ? (
            <VerifyAction
              id="backup-inspection-verification"
              label="Verify for backup inspection"
            />
          ) : null}
        </form>
        {inspection ? (
          <output className="mt-5 block min-w-0 rounded-xl border p-4">
            <h3 className="font-semibold">
              {inspection.valid
                ? 'Backup integrity verified'
                : 'Backup validation failed'}
            </h3>
            <p className="mt-2 text-sm leading-6">
              {inspection.valid
                ? 'The package passed its integrity checks. Destination compatibility and a recovery rehearsal still need separate verification.'
                : 'Do not rely on this package for a hosting move. Review the reported problems.'}
            </p>
            <FileInventory value={inspection.inventory} />
            <SnapshotTime value={inspection.snapshotAt} />
            {inspection.release ? (
              <p className="mt-2 break-words text-sm">
                Application release: {inspection.release}
              </p>
            ) : null}
            {inspection.warnings?.length ? (
              <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6">
                {inspection.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </output>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="text-xl font-semibold">Before a future hosting move</h2>
        <ol className="mt-3 list-inside list-decimal space-y-3 text-sm leading-6">
          <li>
            Keep the encrypted backup, its passphrase and the separate
            security-key recovery material safe.
          </li>
          <li>
            Prepare an empty, compatible destination with the matching
            application, database adapter, storage and private server
            configuration.
          </li>
          <li>
            Validate every required table, record, upload and security key.
            Rehearse restoration on a separate installation before switching
            traffic.
          </li>
          <li>
            Confirm Admin MFA works, used recovery codes still fail, historical
            rates remain unchanged and background email/payment work stays
            paused.
          </li>
          <li>
            Configure domains, email, payments and OAuth with the new hosting.
            Switch traffic only after a separate approved review.
          </li>
        </ol>
        <p className="mt-4 text-sm font-semibold leading-6">
          Restoring into this current installation is disabled. This workspace
          does not deploy, change hosting or switch your domain.
        </p>
      </section>
    </div>
  );
}
