'use client';

import { useRef, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  COMMISSION_NOTICE_MS,
  commissionFeeScheduleText,
  nepalDateTimeInput,
  parseNepalDateTime,
  percentToBasisPoints,
  type CommissionRateState,
} from '@/lib/commission/rates';
import { calculateSellerCommissionPaisa } from '@/lib/marketplace/policy';
import { commissionMoney, commissionDate } from '@/lib/commission/reporting';

const inputClass =
  'mt-2 block min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm';
interface Draft {
  percent: string;
  effectiveAt: string;
  reason: string;
}

function formText(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

export function CommissionSettings({
  state,
  now,
  hasScheduledRate,
}: {
  state: Pick<CommissionRateState, 'revision' | 'current'>;
  now: number;
  hasScheduledRate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [percent, setPercent] = useState(
    String(state.current.basisPoints / 100),
  );
  const [saleValue, setSaleValue] = useState('1000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestId = useRef<string | null>(null);
  const minimumDate = nepalDateTimeInput(
    Math.ceil((now + COMMISSION_NOTICE_MS) / 60_000) * 60_000 + 60_000,
  );
  let proposedBps: number | null = null;
  try {
    proposedBps = percentToBasisPoints(percent);
  } catch {
    /* Validate when reviewing. */
  }
  const samplePaisa = Math.round(Number(saleValue) * 100);
  const validSample =
    Number.isSafeInteger(samplePaisa) &&
    samplePaisa >= 0 &&
    samplePaisa <= 100_000_000_000;

  function review(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const value = {
        percent,
        effectiveAt: formText(data, 'effectiveAt'),
        reason: formText(data, 'reason').trim(),
      };
      const bps = percentToBasisPoints(value.percent);
      if (bps === state.current.basisPoints)
        throw new Error(
          'Choose a rate different from the current published rate.',
        );
      if (
        parseNepalDateTime(value.effectiveAt) <
        Date.now() + COMMISSION_NOTICE_MS
      )
        throw new Error('Allow at least 15 days of advance notice.');
      if (value.reason.length < 10 || value.reason.length > 1000)
        throw new Error('Add a reason of 10–1,000 characters.');
      requestId.current = crypto.randomUUID();
      setDraft(value);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Review the change details.',
      );
    }
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule',
          ...draft,
          expectedRevision: state.revision,
          requestId: requestId.current,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? 'The rate could not be scheduled.');
      setMessage(
        'Rate scheduled. The fee schedule is now available for seller review and acceptance.',
      );
      setOpen(false);
      setDraft(null);
      requestId.current = null;
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The rate could not be scheduled.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="rate-management"
      className="scroll-mt-28 space-y-5 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 font-heading text-2xl">
            <Percent className="size-5 text-primary" /> Commission rate
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Create and review future rates here. Sellers accept the fee schedule
            before it applies to their new orders.
          </p>
        </div>
        <Button
          className="min-h-11"
          disabled={busy || hasScheduledRate}
          onClick={() => {
            setOpen(!open);
            setDraft(null);
            setError('');
            setMessage('');
          }}
        >
          <CalendarClock className="size-4" />
          {open ? 'Close rate form' : 'Schedule rate change'}
        </Button>
      </div>
      {hasScheduledRate ? (
        <p className="text-sm text-muted-foreground">
          A future rate is already scheduled. Review or cancel it in the history
          below before scheduling another.
        </p>
      ) : null}
      {message ? (
        <output className="rounded-xl bg-secondary p-3 text-sm font-medium">
          {message}
        </output>
      ) : null}
      {open ? (
        <form data-form-id="staff.commission-schedule" onSubmit={review} className="space-y-5 border-t pt-5">
          <fieldset disabled={busy || draft !== null} className="space-y-5">
            <legend className="font-semibold">New fee schedule</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label
                htmlFor="commission-percent"
                className="text-sm font-medium"
              >
                New commission rate (%) *
                <input
                  id="commission-percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label
                htmlFor="commission-effective"
                className="text-sm font-medium"
              >
                Effective date and time · Nepal time *
                <input
                  id="commission-effective"
                  name="effectiveAt"
                  type="datetime-local"
                  min={minimumDate}
                  defaultValue={minimumDate}
                  required
                  className={inputClass}
                />
              </label>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              At least 15 days of advance notice. Dates use Asia/Kathmandu
              (UTC+05:45).
            </p>
            <div className="rounded-xl bg-secondary/50 p-4">
              <label
                htmlFor="commission-sample"
                className="text-sm font-medium"
              >
                Preview an eligible sale value (NPR)
                <input
                  id="commission-sample"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  value={saleValue}
                  onChange={(e) => setSaleValue(e.target.value)}
                  className={inputClass}
                />
              </label>
              {validSample && proposedBps !== null ? (
                <p className="mt-3 text-sm leading-6">
                  Current commission:{' '}
                  <strong>
                    {commissionMoney(
                      calculateSellerCommissionPaisa(
                        samplePaisa,
                        state.current.basisPoints,
                      ),
                    )}
                  </strong>{' '}
                  → Proposed:{' '}
                  <strong>
                    {commissionMoney(
                      calculateSellerCommissionPaisa(samplePaisa, proposedBps),
                    )}
                  </strong>
                  . Seller product proceeds before other deductions:{' '}
                  <strong>
                    {commissionMoney(
                      samplePaisa -
                        calculateSellerCommissionPaisa(
                          samplePaisa,
                          proposedBps,
                        ),
                    )}
                  </strong>
                  .
                </p>
              ) : (
                <p className="mt-3 text-sm">
                  Enter a valid rate and sale value to preview.
                </p>
              )}
            </div>
            <label
              htmlFor="commission-reason"
              className="block text-sm font-medium"
            >
              Reason for change *
              <textarea
                id="commission-reason"
                name="reason"
                minLength={10}
                maxLength={1000}
                required
                className={inputClass}
                rows={3}
              />
            </label>
            <Button type="submit" className="min-h-11">
              Review fee schedule
            </Button>
          </fieldset>
          {draft ? (
            <div className="space-y-4 rounded-xl border border-primary/30 bg-secondary/30 p-4">
              <h3 className="font-semibold">Review scheduled change</h3>
              <p className="text-sm">
                <strong>{draft.percent}%</strong> from{' '}
                <strong>
                  {commissionDate(parseNepalDateTime(draft.effectiveAt))}
                </strong>{' '}
                · Nepal time
              </p>
              <p className="text-sm">Reason: {draft.reason}</p>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-primary">
                  Read the fee schedule sellers will accept
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm leading-6">
                  {commissionFeeScheduleText(
                    percentToBasisPoints(draft.percent),
                    parseNepalDateTime(draft.effectiveAt),
                  )}
                </p>
              </details>
              <p className="text-sm leading-6">
                The rate applies to new orders after the effective date and
                seller acceptance. Historical orders retain their recorded rate.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={busy}
                  className="min-h-11"
                  onClick={() => void save()}
                >
                  {busy ? 'Scheduling…' : 'Confirm and schedule rate'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  className="min-h-11"
                  onClick={() => {
                    setDraft(null);
                    requestId.current = null;
                  }}
                >
                  Edit details
                </Button>
              </div>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

export function CancelCommissionRate({
  id,
  revision,
}: {
  id: string;
  revision: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef<string | null>(null);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = formText(new FormData(event.currentTarget), 'reason').trim();
    requestId.current ??= crypto.randomUUID();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          rateId: id,
          reason,
          requestId: requestId.current,
          expectedRevision: revision,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          result.error ?? 'The scheduled rate could not be cancelled.',
        );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The scheduled rate could not be cancelled.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <Button
        variant="outline"
        className="min-h-11"
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Keep scheduled rate' : 'Cancel scheduled rate'}
      </Button>
      {open ? (
        <form data-form-id="staff.commission-cancel" onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <label htmlFor={`cancel-${id}`} className="block text-sm font-medium">
            Cancellation reason *
            <textarea
              id={`cancel-${id}`}
              name="reason"
              required
              minLength={10}
              maxLength={1000}
              rows={2}
              className={inputClass}
              disabled={busy}
            />
          </label>
          <Button
            variant="destructive"
            type="submit"
            disabled={busy}
            className="min-h-11"
          >
            {busy ? 'Cancelling…' : 'Confirm cancellation'}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
