'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  ExistingObligationMode,
  SellerRestrictionMode,
} from '@/lib/db/repositories/seller-governance';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const FORM_ID = 'staff.seller-governance';
const BASE_KEYS = ['action', 'mode', 'suspendedUntil', 'obligationMode', 'reasonCode', 'reason',
  'expectedVersion', 'requestId', 'formVersion'];
// Hydrate the absent server snapshot; own attempt mutations rerender the client.
const subscribeToAttempt = () => () => undefined;

const reasonLabels = {
  performance_review: 'Performance review',
  policy_breach: 'Policy breach',
  unsafe_goods: 'Unsafe goods',
  suspected_fraud: 'Suspected fraud',
  owner_request: 'Owner request',
  other: 'Other recorded reason',
} as const;

function kathmanduLocalTime(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const timestamp =
    Date.UTC(+year, +month - 1, +day, +hour, +minute) - 345 * 60_000;
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

export function SellerGovernanceActions({
  sellerId,
  current,
}: {
  sellerId: string;
  current: {
    mode: SellerRestrictionMode;
    suspendedUntil: number | null;
    obligationMode: ExistingObligationMode;
    reasonCode: string;
    version: number;
  } | null;
}) {
  const router = useRouter();
  const catalog = usePublishedFormConfig(FORM_ID);
  const formRef = useRef<HTMLFormElement>(null);
  const fingerprint = useRef<string | null>(null);
  const attemptKey = sessionAttemptKey(FORM_ID, sellerId);
  const [, setAttemptRevision] = useState(0);
  const attemptPresent = useSyncExternalStore(subscribeToAttempt,
    () => hasSessionAttempt(attemptKey), () => false);
  const [mode, setMode] = useState<SellerRestrictionMode>(
    current?.mode ?? 'active',
  );
  const [obligationMode, setObligationMode] =
    useState<ExistingObligationMode>(
      current?.obligationMode ?? 'admin_review',
    );
  const [reasonCode, setReasonCode] = useState(
    current?.reasonCode ?? 'performance_review',
  );
  const [reason, setReason] = useState('');
  const [suspendedUntil, setSuspendedUntil] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function send(body: Record<string, unknown>) {
    setPending(true);
    setMessage('');
    try {
      let requestId = crypto.randomUUID();
      if (body.action === 'set_restriction') {
        if (!catalog.canSubmit || !catalog.config || !formRef.current)
          throw new Error(catalog.message || 'Form configuration is unavailable.');
        const configured = readConfiguredSubmission(formRef.current, catalog.config, BASE_KEYS);
        body = { ...body, ...configuredJsonPayload(catalog.config, configured.answers, BASE_KEYS) };
        const currentFingerprint = JSON.stringify(body);
        if (fingerprint.current && fingerprint.current !== currentFingerprint)
          throw new Error('This differs from the prior attempt. Check its outcome, then explicitly start a new attempt.');
        requestId = getOrCreateSessionAttempt(attemptKey);
        setAttemptRevision((revision) => revision + 1);
        fingerprint.current = currentFingerprint;
      }
      const response = await fetch(
        `/api/admin/sellers/${encodeURIComponent(sellerId)}/governance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, requestId }),
        },
      );
      const result = (await response.json().catch(() => null)) as {
        error?: string; code?: string;
        status?: string;
        restriction?: { mode?: unknown; obligationMode?: unknown; version?: unknown };
      } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) {
        throw new Error(result?.error ?? 'The governance action failed.');
      }
      if (body.action === 'set_restriction') {
        const restriction = result?.restriction;
        if (!restriction || restriction.mode !== body.mode || restriction.obligationMode !== body.obligationMode ||
            !Number.isSafeInteger(restriction.version) || restriction.version !== Number(body.expectedVersion) + 1)
          throw new Error('The response could not confirm this governance decision. Retry the same attempt.');
        clearSessionAttempt(attemptKey);
        setAttemptRevision((revision) => revision + 1);
        fingerprint.current = null;
      }
      setReason('');
      setMessage(
        body.action === 'deletion_preflight'
          ? `Deletion preflight: ${result?.status?.replaceAll('_', ' ') ?? 'recorded'}. No records were deleted.`
          : 'Seller-role restriction saved. Public availability and existing-obligation controls now use this recorded decision.',
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'The governance action failed.',
      );
    } finally {
      setPending(false);
    }
  }

  const until = kathmanduLocalTime(suspendedUntil);

  return (
    <form ref={formRef} data-form-id={FORM_ID} className="space-y-5" onSubmit={(event) => event.preventDefault()}>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 dark:bg-amber-950/20">
        This controls only the seller role and sale availability. It does not
        disable the person&apos;s ordinary buyer account. Customers see only
        “Currently unavailable,” never the private disciplinary reason.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="seller-restriction-mode" className="space-y-1 text-sm font-semibold">
          Seller state
          <NativeSelect
            id="seller-restriction-mode"
            className="w-full"
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as SellerRestrictionMode)
            }
          >
            <option value="active">Active</option>
            <option value="suspended">Suspended until a set time</option>
            <option value="disabled">Disabled indefinitely</option>
          </NativeSelect>
        </label>
        <label htmlFor="seller-obligation-mode" className="space-y-1 text-sm font-semibold">
          Existing obligations
          <NativeSelect
            id="seller-obligation-mode"
            className="w-full"
            value={obligationMode}
            onChange={(event) =>
              setObligationMode(event.target.value as ExistingObligationMode)
            }
          >
            <option value="allow_existing">
              Allow safe existing fulfillment
            </option>
            <option value="admin_review">Require an admin decision</option>
            <option value="stop_fulfillment">Stop seller fulfillment</option>
          </NativeSelect>
        </label>
      </div>

      {mode === 'suspended' ? (
        <label htmlFor="seller-suspension-end" className="block space-y-1 text-sm font-semibold">
          Suspension ends (Asia/Kathmandu)
          <Input
            id="seller-suspension-end"
            type="datetime-local"
            value={suspendedUntil}
            onChange={(event) => setSuspendedUntil(event.target.value)}
          />
        </label>
      ) : null}

      <label htmlFor="seller-restriction-reason-code" className="block space-y-1 text-sm font-semibold">
        Recorded reason category
        <NativeSelect
          id="seller-restriction-reason-code"
          className="w-full"
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value)}
        >
          {Object.entries(reasonLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </label>

      <label htmlFor="seller-restriction-note" className="block space-y-1 text-sm font-semibold">
        Private decision note
        <Textarea
          id="seller-restriction-note"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={8}
          maxLength={1000}
          rows={4}
          placeholder="Record the evidence, scope, and review or reactivation conditions."
        />
      </label>

      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /> : null}
      {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
      {attemptPresent ? <p className="text-xs text-muted-foreground">
        A prior restriction attempt may have succeeded. Retry only the same decision and answers, or check its outcome before starting a new attempt.
      </p> : null}
      {attemptPresent ? <Button type="button" variant="outline" disabled={pending}
        onClick={() => { if (window.confirm('A prior restriction may have succeeded. Check its outcome first. Start a new request reference?')) {
          clearSessionAttempt(attemptKey); fingerprint.current = null; setAttemptRevision((revision) => revision + 1); setMessage('');
          if (catalog.status === 'stale') catalog.refresh();
        } }}>Start a new attempt</Button> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={
            pending ||
            !catalog.canSubmit ||
            reason.trim().length < 8 ||
            (mode === 'suspended' && !until)
          }
          variant={mode === 'active' ? 'default' : 'destructive'}
          onClick={() =>
            send({
              action: 'set_restriction',
              mode,
              suspendedUntil: mode === 'suspended' ? until : null,
              obligationMode,
              reasonCode,
              reason,
              expectedVersion: current?.version ?? 0,
            })
          }
        >
          {pending ? 'Saving…' : 'Record seller decision'}
        </Button>
        <Button
          type="button"
          disabled={pending}
          variant="outline"
          onClick={() => send({ action: 'deletion_preflight' })}
        >
          Run non-destructive deletion preflight
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Unsafe-goods or suspected-fraud cases cannot automatically continue
        fulfillment. A deletion preflight only inventories obligations and
        retention gates; it never deletes orders, invoices, refunds,
        settlements, evidence, or accounts.
      </p>
      {message ? (
        <output className="block text-sm font-medium" aria-live="polite">
          {message}
        </output>
      ) : null}
    </form>
  );
}
