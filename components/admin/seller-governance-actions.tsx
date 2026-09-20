'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  ExistingObligationMode,
  SellerRestrictionMode,
} from '@/lib/db/repositories/seller-governance';

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
      const response = await fetch(
        `/api/admin/sellers/${encodeURIComponent(sellerId)}/governance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, requestId: crypto.randomUUID() }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        status?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? 'The governance action failed.');
      }
      setReason('');
      setMessage(
        body.action === 'deletion_preflight'
          ? `Deletion preflight: ${result.status?.replaceAll('_', ' ') ?? 'recorded'}. No records were deleted.`
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
    <div className="space-y-5">
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

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            pending ||
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
    </div>
  );
}
