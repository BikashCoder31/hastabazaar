'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { sessionAttemptKey } from '@/lib/forms/client-attempt';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import type {
  ClaimResult,
  RedemptionResult,
  RewardHistoryEntry,
  RewardsView,
} from '@/lib/incentives/types';

type Attempt = {
  requestId: string;
  expectedVersion: number;
  formVersion: number;
  points?: number;
};
type Operation = 'claim' | 'exchange';
const forms = {
  claim: 'account.daily-reward',
  exchange: 'account.points-redemption',
} as const;
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 191;
const date = (value: number) =>
  new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(value);
function validClaim(value: unknown): value is ClaimResult {
  if (
    !object(value) ||
    !identifier(value.claimId) ||
    typeof value.localDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.localDate) ||
    !integer(value.awardedPoints, 1) ||
    !integer(value.balancePoints)
  )
    return false;
  const parsed = new Date(`${value.localDate}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value.localDate
  );
}
function validRedemption(value: unknown): value is RedemptionResult {
  return (
    object(value) &&
    identifier(value.redemptionId) &&
    integer(value.points, 1) &&
    integer(value.creditPaisa, 1) &&
    integer(value.balancePoints) &&
    integer(value.walletBalancePaisa)
  );
}
function validHistory(value: unknown): value is RewardHistoryEntry {
  return (
    object(value) &&
    integer(value.createdAt) &&
    value.createdAt <= 253402300799999 &&
    (value.kind === 'daily_claim'
      ? validClaim(value.result)
      : value.kind === 'redemption' && validRedemption(value.result))
  );
}
function validView(value: unknown): value is RewardsView {
  if (
    !object(value) ||
    !integer(value.balancePoints) ||
    !integer(value.walletBalancePaisa) ||
    typeof value.claimedToday !== 'boolean' ||
    !integer(value.nextClaimAt) ||
    value.nextClaimAt > 253402300799999 ||
    !object(value.state) ||
    !Array.isArray(value.history) ||
    value.history.length > 50 ||
    !value.history.every(validHistory) ||
    !(
      value.nextCursor === null ||
      (typeof value.nextCursor === 'string' &&
        value.nextCursor.length > 0 &&
        value.nextCursor.length <= 2000)
    )
  )
    return false;
  const s = value.state;
  return (
    integer(s.version, 1) &&
    integer(s.revision) &&
    typeof s.enabled === 'boolean' &&
    typeof s.paused === 'boolean' &&
    integer(s.dailyPoints) &&
    integer(s.pointsPerBlock, 1) &&
    integer(s.creditPaisaPerBlock, 1) &&
    [
      'active',
      'scheduled',
      'expired',
      'paused',
      'disabled',
      'exhausted',
    ].includes(String(s.status)) &&
    [s.startsAt, s.endsAt].every(
      (v) => v === null || (integer(v) && v <= 253402300799999),
    )
  );
}
function validAttempt(value: unknown, operation: Operation): value is Attempt {
  return (
    object(value) &&
    Object.keys(value).every((key) =>
      [
        'requestId',
        'expectedVersion',
        'formVersion',
        ...(operation === 'exchange' ? ['points'] : []),
      ].includes(key),
    ) &&
    typeof value.requestId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.requestId,
    ) &&
    integer(value.expectedVersion, 1) &&
    integer(value.formVersion, 1) &&
    (operation === 'claim' || integer(value.points, 1))
  );
}
function creditFor(points: number, view: RewardsView): number | null {
  const { pointsPerBlock, creditPaisaPerBlock } = view.state;
  if (
    !integer(points, 1) ||
    !integer(pointsPerBlock, 1) ||
    !integer(creditPaisaPerBlock, 1) ||
    points % pointsPerBlock !== 0
  )
    return null;
  const credit = BigInt(points / pointsPerBlock) * BigInt(creditPaisaPerBlock);
  return credit <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(credit) : null;
}
const earningMessages = {
  active: 'Claim your daily points. Each day follows Asia/Kathmandu time.',
  paused: 'Daily earning is paused. Your existing points remain redeemable.',
  disabled:
    'Daily earning is disabled. Your existing points remain redeemable.',
  exhausted:
    'Daily earning is currently unavailable. Your existing points remain redeemable.',
  scheduled:
    'Daily earning has not started yet. Your existing points remain redeemable.',
  expired: 'Daily earning has ended. Your existing points remain redeemable.',
};

export function RewardsPanel({
  initialRewards,
  subjectId,
}: {
  initialRewards: RewardsView;
  subjectId: string;
}) {
  const claimConfig = usePublishedFormConfig(forms.claim);
  const exchangeConfig = usePublishedFormConfig(forms.exchange);
  const [view, setView] = useState(initialRewards);
  const [claimStatusKnown, setClaimStatusKnown] = useState(true);
  const [points, setPoints] = useState(
    String(initialRewards.state.pointsPerBlock),
  );
  const [attempts, setAttempts] = useState<Partial<Record<Operation, Attempt>>>(
    {},
  );
  const [broken, setBroken] = useState<Partial<Record<Operation, boolean>>>({});
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<Operation | null>(null);
  const [reading, setReading] = useState(false);
  const [review, setReview] = useState<{
    points: number;
    creditPaisa: number;
    retained: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const readBusy = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const key = (operation: Operation) =>
    `${sessionAttemptKey(forms[operation], subjectId)}:intent-v1`;
  useEffect(() => {
    mounted.current = true;
    const current = ++generation.current;
    const restored: Partial<Record<Operation, Attempt>> = {};
    const invalid: Partial<Record<Operation, boolean>> = {};
    let warning = '';
    for (const operation of ['claim', 'exchange'] as const) {
      try {
        const saved = sessionStorage.getItem(
          `${sessionAttemptKey(forms[operation], subjectId)}:intent-v1`,
        );
        if (saved !== null) {
          const value: unknown = saved.length <= 500 ? JSON.parse(saved) : null;
          if (!validAttempt(value, operation))
            throw new Error('Invalid attempt');
          restored[operation] = value;
        }
      } catch {
        invalid[operation] = true;
        warning = `The prior ${operation} attempt is unavailable. Explicitly start a new attempt after checking your activity.`;
      }
    }
    queueMicrotask(() => {
      if (!mounted.current || current !== generation.current) return;
      busy.current = false;
      readBusy.current = false;
      setPending(null);
      setReading(false);
      setView(initialRewards);
      setClaimStatusKnown(true);
      setAttempts(restored);
      setBroken(invalid);
      setError(warning);
      setNotice('');
      setReview(null);
      setPoints(
        String(
          restored.exchange?.points ?? initialRewards.state.pointsPerBlock,
        ),
      );
      setReady(true);
    });
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [subjectId, initialRewards]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function invalidateRead() {
    generation.current += 1;
    readBusy.current = false;
    setReading(false);
  }
  async function readRewards(more = false): Promise<RewardsView> {
    const response = await fetch(
      `/api/account/rewards${more ? `?cursor=${encodeURIComponent(view.nextCursor!)}` : ''}`,
      { cache: 'no-store', credentials: 'same-origin' },
    );
    const data: unknown = await response.json();
    if (!response.ok || !validView(data))
      throw new Error('Rewards could not be loaded. Please try again.');
    return data;
  }
  function applyRewards(data: RewardsView, more = false) {
    setView((previous) => ({
      ...data,
      history: more
        ? [...previous.history, ...data.history].filter(
            (entry, index, all) =>
              all.findIndex(
                (other) =>
                  (other.kind === 'daily_claim'
                    ? other.result.claimId
                    : other.result.redemptionId) ===
                  (entry.kind === 'daily_claim'
                    ? entry.result.claimId
                    : entry.result.redemptionId),
              ) === index,
          )
        : data.history,
    }));
    setClaimStatusKnown(true);
  }
  async function loadRewards(more = false) {
    if (busy.current || readBusy.current || (more && !view.nextCursor)) return;
    readBusy.current = true;
    setReading(true);
    setError('');
    const current = ++generation.current;
    try {
      const data = await readRewards(more);
      if (!mounted.current || current !== generation.current) return;
      applyRewards(data, more);
    } catch (failure) {
      if (mounted.current && current === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Rewards could not be loaded.',
        );
    } finally {
      if (mounted.current && current === generation.current) {
        readBusy.current = false;
        setReading(false);
      }
    }
  }
  function saveIntent(operation: Operation): Attempt {
    const retained = attempts[operation];
    if (retained) return retained;
    if (broken[operation])
      throw new Error(
        `The prior ${operation} attempt is unavailable. Start a new attempt explicitly.`,
      );
    const config = operation === 'claim' ? claimConfig : exchangeConfig;
    if (!config.canSubmit || !config.config || config.config.fields.length)
      throw new Error(
        'Form configuration is unavailable. Please refresh the form.',
      );
    const intent: Attempt = {
      requestId: crypto.randomUUID(),
      expectedVersion: view.state.version,
      formVersion: config.config.version,
      ...(operation === 'exchange' ? { points: review!.points } : {}),
    };
    try {
      sessionStorage.setItem(key(operation), JSON.stringify(intent));
    } catch {
      throw new Error(
        'Browser session storage is unavailable. Please enable it before submitting.',
      );
    }
    setAttempts((previous) => ({ ...previous, [operation]: intent }));
    return intent;
  }
  async function mutate(operation: Operation) {
    if (
      busy.current ||
      !ready ||
      (operation === 'exchange' && !review) ||
      (operation === 'claim' && !attempts.claim && !claimStatusKnown)
    )
      return;
    busy.current = true;
    setPending(operation);
    setError('');
    setNotice('');
    invalidateRead();
    const current = generation.current;
    try {
      const intent = saveIntent(operation);
      const response = await fetch(
        `/api/account/rewards/${operation === 'claim' ? 'claim' : 'redeem'}`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...intent, customAnswers: [] }),
        },
      );
      const data: unknown = await response.json();
      if (!mounted.current || current !== generation.current) return;
      if (!response.ok) {
        const config = operation === 'claim' ? claimConfig : exchangeConfig;
        if (object(data) && data.code === 'stale_version')
          config.handleSubmissionResponse(response, 'stale_version');
        throw new Error(
          object(data) &&
            typeof data.error === 'string' &&
            data.error.length <= 500
            ? data.error
            : 'The request could not be completed. Retry the original attempt.',
        );
      }
      if (operation === 'claim') {
        if (!validClaim(data))
          throw new Error(
            'The claim response could not be verified. Retry the original attempt.',
          );
        window.dispatchEvent(new Event('hastabazaar:rewards-updated'));
        setView((previous) => ({
          ...previous,
          balancePoints: data.balancePoints,
        }));
        setNotice(
          `${data.awardedPoints} points claimed. Resulting points balance: ${data.balancePoints}.`,
        );
        setClaimStatusKnown(false);
        let refreshed: RewardsView;
        try {
          refreshed = await readRewards();
        } catch {
          throw new Error(
            'Your claim is confirmed, but the current daily status could not be refreshed. Retry the original claim or refresh rewards before starting a new claim.',
          );
        }
        if (!mounted.current || current !== generation.current) return;
        applyRewards(refreshed);
      } else {
        if (
          !validRedemption(data) ||
          data.points !== intent.points ||
          data.creditPaisa !== creditFor(intent.points!, view)
        )
          throw new Error(
            'The exchange response could not be verified. Retry the original attempt.',
          );
        setView((previous) => ({
          ...previous,
          balancePoints: data.balancePoints,
          walletBalancePaisa: data.walletBalancePaisa,
        }));
        setNotice(
          `${data.points} points exchanged for ${formatPaisaExact(data.creditPaisa)}. Resulting points balance: ${data.balancePoints}; shopping credit: ${formatPaisaExact(data.walletBalancePaisa)}.`,
        );
      }
      try {
        sessionStorage.removeItem(key(operation));
      } catch {
        throw new Error(
          'The result is confirmed, but browser storage could not be cleared. Retry the original attempt before starting another.',
        );
      }
      setAttempts((previous) => {
        const next = { ...previous };
        delete next[operation];
        return next;
      });
      setBroken((previous) => ({ ...previous, [operation]: false }));
    } catch (failure) {
      if (mounted.current && current === generation.current)
        setError(
          failure instanceof Error && failure.message !== 'Failed to fetch'
            ? failure.message
            : 'The response was lost. Retry the original attempt to recover its result.',
        );
    } finally {
      if (mounted.current && current === generation.current) {
        busy.current = false;
        setPending(null);
        setReview(null);
      }
    }
  }
  function reset(operation: Operation) {
    if (
      busy.current ||
      !window.confirm(
        'The earlier request may already have succeeded. Check activity first. Starting a new attempt can create another reward operation. Continue?',
      )
    )
      return;
    try {
      sessionStorage.removeItem(key(operation));
    } catch {
      setError(
        'Browser session storage is unavailable. The original attempt has been retained.',
      );
      return;
    }
    setAttempts((previous) => {
      const next = { ...previous };
      delete next[operation];
      return next;
    });
    setBroken((previous) => ({ ...previous, [operation]: false }));
    setError('');
    setNotice('');
    setReview(null);
    if (operation === 'claim') claimConfig.refresh();
    else {
      exchangeConfig.refresh();
      setPoints(String(view.state.pointsPerBlock));
    }
  }
  function openReview() {
    if (busy.current || !ready || broken.exchange) return;
    setError('');
    setNotice('');
    const retained = attempts.exchange;
    const amount =
      retained?.points ?? (/^[1-9]\d*$/.test(points) ? Number(points) : NaN);
    const credit = creditFor(amount!, view);
    if (
      credit === null ||
      (!retained &&
        (amount! > view.balancePoints ||
          !integer(view.walletBalancePaisa + credit)))
    ) {
      setError(
        `Enter whole blocks of ${view.state.pointsPerBlock} points within your available balance.`,
      );
      return;
    }
    setReview({
      points: amount!,
      creditPaisa: credit,
      retained: Boolean(retained),
    });
  }
  const claimReady =
    claimConfig.canSubmit && claimConfig.config?.fields.length === 0;
  const exchangeReady =
    exchangeConfig.canSubmit && exchangeConfig.config?.fields.length === 0;
  const eligible = view.balancePoints >= view.state.pointsPerBlock;
  return (
    <div
      className="space-y-6"
      data-config-ready={
        ready && claimConfig.canSubmit && exchangeConfig.canSubmit
      }
      data-reading={reading}
    >
      <section className="rounded-3xl bg-[#17345f] p-6 text-white sm:p-8">
        <h1 className="font-heading text-4xl">My Rewards</h1>
        <p className="mt-3 text-white/75">
          Collect daily points and exchange whole blocks for shopping credit.
        </p>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <dt>Available points</dt>
            <dd className="mt-2 text-3xl font-semibold">
              {view.balancePoints} points
            </dd>
          </div>
          <div>
            <dt>Shopping credit</dt>
            <dd className="mt-2 text-3xl font-semibold">
              {formatPaisaExact(view.walletBalancePaisa)}
            </dd>
          </div>
        </dl>
        <Link
          href="/account/wallet"
          className="mt-4 inline-flex min-h-11 items-center underline"
        >
          View wallet activity
        </Link>
      </section>
      {error ? (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="rounded-xl border border-destructive p-4 text-destructive"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <output className="block rounded-xl border p-4">{notice}</output>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <form
          data-form-id="account.daily-reward"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate('claim');
          }}
          className="space-y-4 rounded-2xl border bg-card p-5"
        >
          <h2 className="font-heading text-2xl">Daily points</h2>
      <FormGuide formId="account.daily-reward" />

          <p>{earningMessages[view.state.status]}</p>
          <p>{view.state.dailyPoints} points per daily claim.</p>
          {!claimStatusKnown ? (
            <p>
              Current daily claim status is unavailable. Refresh rewards to
              check the server status.
            </p>
          ) : view.claimedToday ? (
            <p>
              You have claimed today. Next claim: {date(view.nextClaimAt)}{' '}
              (Asia/Kathmandu).
            </p>
          ) : (
            <p>
              Next daily boundary: {date(view.nextClaimAt)} (Asia/Kathmandu).
            </p>
          )}
          {attempts.claim ? (
            <p>
              A prior claim is retained. Retry it to recover the original result
              before starting a new claim.
            </p>
          ) : null}
          {!claimReady && !attempts.claim ? (
            <p>
              {claimConfig.message ||
                'Daily claim form is loading or unavailable.'}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={
              !ready ||
              Boolean(pending) ||
              broken.claim ||
              (!attempts.claim &&
                (!claimReady ||
                  !claimStatusKnown ||
                  view.claimedToday ||
                  view.state.status !== 'active'))
            }
          >
            {pending === 'claim'
              ? 'Claiming…'
              : attempts.claim
                ? 'Retry original claim'
                : 'Claim daily points'}
          </Button>
          {attempts.claim || broken.claim ? (
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(pending)}
              onClick={() => reset('claim')}
            >
              Start a new claim attempt
            </Button>
          ) : null}
          {!claimReady ? (
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(pending)}
              onClick={claimConfig.refresh}
            >
              Refresh claim form
            </Button>
          ) : null}
        </form>
        <form
          data-form-id="account.points-redemption"
          onSubmit={(event) => {
            event.preventDefault();
            openReview();
          }}
          className="space-y-4 rounded-2xl border bg-card p-5"
        >
          <h2 className="font-heading text-2xl">Exchange points</h2>
      <FormGuide formId="account.points-redemption" />

          <p>
            {view.state.pointsPerBlock} points ={' '}
            {formatPaisaExact(view.state.creditPaisaPerBlock)} shopping credit.
          </p>
          <p>
            Points and shopping credit do not expire. Shopping credit pays for
            products at checkout.
          </p>
          <label htmlFor="rewards-points" className="block font-semibold">
            Points to exchange
          </label>
          <input
            id="rewards-points"
            name="points"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={points}
            readOnly={Boolean(attempts.exchange)}
            disabled={Boolean(pending)}
            onChange={(event) => setPoints(event.target.value)}
            className="min-h-11 w-full rounded-lg border bg-background px-3"
            aria-describedby="exchange-help"
          />
          <p id="exchange-help">
            {attempts.exchange
              ? 'Your original exchange amount is retained. Start a new attempt explicitly to change it.'
              : `Exchange whole blocks of ${view.state.pointsPerBlock} points.`}
          </p>
          {!eligible && !attempts.exchange ? (
            <p>
              You need at least {view.state.pointsPerBlock} points to exchange.
            </p>
          ) : null}
          {!exchangeReady && !attempts.exchange ? (
            <p>
              {exchangeConfig.message ||
                'Exchange form is loading or unavailable.'}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={
              !ready ||
              Boolean(pending) ||
              broken.exchange ||
              (!attempts.exchange && (!exchangeReady || !eligible))
            }
          >
            {attempts.exchange ? 'Review original exchange' : 'Review exchange'}
          </Button>
          {attempts.exchange || broken.exchange ? (
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(pending)}
              onClick={() => reset('exchange')}
            >
              Start a new exchange attempt
            </Button>
          ) : null}
          {!exchangeReady ? (
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(pending)}
              onClick={exchangeConfig.refresh}
            >
              Refresh exchange form
            </Button>
          ) : null}
        </form>
      </div>
      <AlertDialog
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !busy.current) setReview(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Confirm points exchange</AlertDialogTitle>
          <AlertDialogDescription>
            Exchange {review?.points} points for{' '}
            {review ? formatPaisaExact(review.creditPaisa) : ''}.
          </AlertDialogDescription>
          {review?.retained ? (
            <p>
              Recovering your original exchange. Its original result may differ
              from current balances.
            </p>
          ) : review ? (
            <div>
              <p>Points after exchange: {view.balancePoints - review.points}</p>
              <p>
                Shopping credit after exchange:{' '}
                {formatPaisaExact(view.walletBalancePaisa + review.creditPaisa)}
              </p>
            </div>
          ) : null}
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(pending)}
              onClick={() => setReview(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-exchange-confirm
              disabled={Boolean(pending)}
              onClick={() => void mutate('exchange')}
            >
              Confirm exchange
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section
        aria-label="Rewards activity"
        className="space-y-4 rounded-2xl border bg-card p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-2xl">Rewards activity</h2>
          <Button
            type="button"
            variant="outline"
            disabled={reading || Boolean(pending)}
            onClick={() => void loadRewards()}
          >
            Refresh rewards
          </Button>
        </div>
        {view.history.length ? (
          <ul className="divide-y">
            {view.history.map((entry) => (
              <li
                key={
                  entry.kind === 'daily_claim'
                    ? entry.result.claimId
                    : entry.result.redemptionId
                }
                className="py-3"
              >
                <p>
                  {entry.kind === 'daily_claim'
                    ? `Daily claim: +${entry.result.awardedPoints} points`
                    : `Exchange: −${entry.result.points} points · ${formatPaisaExact(entry.result.creditPaisa)}`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {date(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No rewards activity yet.</p>
        )}
        {view.nextCursor ? (
          <Button
            type="button"
            variant="outline"
            disabled={reading || Boolean(pending)}
            onClick={() => void loadRewards(true)}
          >
            {reading ? 'Loading activity…' : 'Load more activity'}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
