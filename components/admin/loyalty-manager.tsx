'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import {
  parsePublishedFormConfig,
  usePublishedFormConfig,
} from '@/components/forms/form-config-client';
import type { PublishedFormConfig, ConfiguredField } from '@/lib/forms/types';
import {
  configuredJsonPayload,
  digestFormRequest,
  readConfiguredSubmission,
} from '@/lib/forms/submission';
import {
  clearVersionedSessionAttempt,
  getOrCreateVersionedSessionAttempt,
  sessionAttemptKey,
} from '@/lib/forms/client-attempt';
import {
  loyaltyLiability,
  validateLoyaltyTerms,
} from '@/lib/incentives/loyalty-policy';
import type {
  LoyaltyState,
  LoyaltyTerms,
  LoyaltyDenomination,
} from '@/lib/incentives/types';

const formId = 'staff.loyalty-settings';
const attemptChanged = 'loyalty-attempt-changed';
function subscribeToAttempt(listener: () => void) {
  window.addEventListener(attemptChanged, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(attemptChanged, listener);
    window.removeEventListener('storage', listener);
  };
}
function attemptSnapshot(key: string) {
  try {
    return JSON.stringify([
      sessionStorage.getItem(key),
      sessionStorage.getItem(key + ':expected-version'),
      sessionStorage.getItem(key + ':intent'),
    ]);
  } catch {
    return 'unavailable';
  }
}
function notifyAttempt() {
  window.dispatchEvent(new Event(attemptChanged));
}
const baseKeys = [
  'enabled',
  'dailyPoints',
  'pointsPerBlock',
  'creditPaisaPerBlock',
  'startsAt',
  'endsAt',
  'dailyBudgetPoints',
  'lifetimeBudgetPoints',
  'reason',
];
type Action = 'draft' | 'publish' | 'pause';
interface Attempt {
  action: Action;
  expectedVersion: number;
  formVersion: number;
  draftRevision: number | null;
  terms: LoyaltyTerms | null;
  expectedTerms: LoyaltyTerms;
  expectedLockedDenomination: LoyaltyDenomination | null;
  originalConfig: PublishedFormConfig;
  sourceRevision: number;
  publishedRevision: number;
  paused: boolean;
  digest: string;
}
const money = (paisa: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    paisa / 100,
  );
const integer = (value: unknown, min = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
function validTerms(value: LoyaltyTerms): boolean {
  try {
    validateLoyaltyTerms(value);
    return true;
  } catch {
    return false;
  }
}
function sameTerms(a: LoyaltyTerms, b: LoyaltyTerms) {
  return [
    'enabled',
    'dailyPoints',
    'pointsPerBlock',
    'creditPaisaPerBlock',
    'startsAt',
    'endsAt',
    'dailyBudgetPoints',
    'lifetimeBudgetPoints',
  ].every(
    (key) => a[key as keyof LoyaltyTerms] === b[key as keyof LoyaltyTerms],
  );
}
function validDenomination(value: unknown): value is LoyaltyDenomination {
  if (!value || typeof value !== 'object') return false;
  const rate = value as LoyaltyDenomination;
  return (
    integer(rate.pointsPerBlock, 1) && integer(rate.creditPaisaPerBlock, 1)
  );
}
function sameDenomination(a: LoyaltyDenomination, b: LoyaltyDenomination) {
  return (
    a.pointsPerBlock === b.pointsPerBlock &&
    a.creditPaisaPerBlock === b.creditPaisaPerBlock
  );
}
function originalConfigSnapshot(
  config: PublishedFormConfig,
): PublishedFormConfig {
  const fieldKeys = [
    'id',
    'key',
    'type',
    'label',
    'required',
    'order',
    'status',
    'choices',
    'min',
    'max',
    'integerOnly',
  ];
  const snapshot = {
    formId: config.formId,
    version: config.version,
    publishedAt: config.publishedAt,
    fields: config.fields.map(
      (field) =>
        Object.fromEntries(
          fieldKeys
            .filter((key) => Object.hasOwn(field, key))
            .map((key) => [key, field[key as keyof ConfiguredField]]),
        ) as unknown as ConfiguredField,
    ),
  };
  const validated = parsePublishedFormConfig(formId, { config: snapshot });
  if (!validated)
    throw new Error(
      'Original form schema could not be retained safely. Refresh before submitting.',
    );
  return validated;
}
function validState(value: unknown): value is LoyaltyState {
  if (!value || typeof value !== 'object') return false;
  const s = value as LoyaltyState;
  const t = s.terms;
  if (
    !t ||
    typeof t.enabled !== 'boolean' ||
    !integer(t.dailyPoints, 1) ||
    !integer(t.pointsPerBlock, 1) ||
    !integer(t.creditPaisaPerBlock, 1)
  )
    return false;
  const unconfigured =
    !t.enabled &&
    [t.startsAt, t.endsAt, t.dailyBudgetPoints, t.lifetimeBudgetPoints].every(
      (v) => v === null,
    );
  if (!unconfigured && !validTerms(t)) return false;
  if (
    !integer(s.version, 1) ||
    ![s.revision, s.publishedRevision].every((v) => integer(v)) ||
    !(s.draftRevision === null || integer(s.draftRevision, 1)) ||
    s.revision !== (s.draftRevision ?? s.publishedRevision) ||
    typeof s.paused !== 'boolean' ||
    typeof s.rateLocked !== 'boolean' ||
    ![
      s.issuedPoints,
      s.redeemedPoints,
      s.outstandingPoints,
      s.issuedTodayPoints,
      s.creditedPaisa,
    ].every((v) => integer(v)) ||
    s.outstandingPoints !== s.issuedPoints - s.redeemedPoints ||
    s.issuedTodayPoints > s.issuedPoints ||
    s.rateLocked !== s.issuedPoints > 0
  )
    return false;
  if (
    s.rateLocked
      ? !validDenomination(s.lockedDenomination)
      : s.lockedDenomination !== null
  )
    return false;
  const denomination = s.lockedDenomination ?? t;
  try {
    const equal = (a: unknown, b: unknown) =>
      a === null || b === null
        ? a === b
        : !!a &&
          !!b &&
          ['wholeBlocks', 'creditPaisa', 'remainingPoints'].every(
            (key) =>
              (a as Record<string, unknown>)[key] ===
              (b as Record<string, unknown>)[key],
          );
    let maximum: LoyaltyState['maximumLiability'];
    try {
      maximum =
        t.lifetimeBudgetPoints === null
          ? null
          : loyaltyLiability(
              t.lifetimeBudgetPoints,
              denomination.pointsPerBlock,
              denomination.creditPaisaPerBlock,
            );
    } catch {
      if (
        !s.rateLocked ||
        s.draftRevision === null ||
        sameDenomination(t, denomination) ||
        !integer(t.lifetimeBudgetPoints, 1) ||
        (BigInt(t.lifetimeBudgetPoints) / BigInt(denomination.pointsPerBlock)) *
          BigInt(denomination.creditPaisaPerBlock) <=
          BigInt(Number.MAX_SAFE_INTEGER)
      )
        return false;
      maximum = null;
    }
    return (
      equal(
        s.liability,
        loyaltyLiability(
          s.outstandingPoints,
          denomination.pointsPerBlock,
          denomination.creditPaisaPerBlock,
        ),
      ) && equal(s.maximumLiability, maximum)
    );
  } catch {
    return false;
  }
}
function value(data: FormData, name: string) {
  const entry = data.get(name);
  if (typeof entry !== 'string') throw new Error('Enter ' + name + '.');
  return entry;
}
function positive(data: FormData, name: string) {
  const raw = value(data, name);
  if (!/^[1-9]\d*$/.test(raw) || !integer(Number(raw), 1))
    throw new Error('Enter a finite safe positive integer for ' + name + '.');
  return Number(raw);
}
function readTerms(data: FormData): LoyaltyTerms {
  const terms: LoyaltyTerms = {
    enabled: data.get('enabled') === 'on',
    dailyPoints: positive(data, 'dailyPoints'),
    pointsPerBlock: positive(data, 'pointsPerBlock'),
    creditPaisaPerBlock: positive(data, 'creditPaisaPerBlock'),
    startsAt: Date.parse(value(data, 'startsAt') + 'Z'),
    endsAt: Date.parse(value(data, 'endsAt') + 'Z'),
    dailyBudgetPoints: positive(data, 'dailyBudgetPoints'),
    lifetimeBudgetPoints: positive(data, 'lifetimeBudgetPoints'),
  };
  try {
    loyaltyLiability(
      terms.lifetimeBudgetPoints!,
      terms.pointsPerBlock,
      terms.creditPaisaPerBlock,
    );
  } catch {
    throw new Error(
      'Lifetime budget exposure exceeds the supported integer range. Reduce the lifetime point budget.',
    );
  }
  if (!validTerms(terms))
    throw new Error(
      'Review finite dates and budgets. The earning end must follow the start; each budget must cover a daily award.',
    );
  return terms;
}
function dateInput(value: number | null) {
  return value === null ? '' : new Date(value).toISOString().slice(0, -1);
}
function loadAttempt(key: string): Attempt | null {
  const raw = sessionStorage.getItem(key + ':intent');
  if (!raw) {
    if (sessionStorage.getItem(key))
      throw new Error(
        'The prior operation metadata is unavailable. Check its result, then explicitly start a new attempt.',
      );
    return null;
  }
  if (new TextEncoder().encode(raw).length > 69632)
    throw new Error(
      'The prior operation metadata is invalid. Check its result, then explicitly start a new attempt.',
    );
  let a: Attempt;
  try {
    a = JSON.parse(raw) as Attempt;
  } catch {
    throw new Error(
      'The prior operation metadata is invalid. Check its result, then explicitly start a new attempt.',
    );
  }
  if (
    !a ||
    Object.keys(a).some(
      (key) =>
        ![
          'action',
          'expectedVersion',
          'formVersion',
          'draftRevision',
          'terms',
          'expectedTerms',
          'expectedLockedDenomination',
          'originalConfig',
          'sourceRevision',
          'publishedRevision',
          'paused',
          'digest',
        ].includes(key),
    ) ||
    !a.originalConfig ||
    !parsePublishedFormConfig(formId, { config: a.originalConfig }) ||
    a.originalConfig.version !== a.formVersion ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      sessionStorage.getItem(key) ?? '',
    ) ||
    sessionStorage.getItem(key + ':expected-version') !==
      String(a.expectedVersion) ||
    !integer(a.sourceRevision) ||
    !integer(a.publishedRevision) ||
    typeof a.paused !== 'boolean' ||
    !(
      a.expectedLockedDenomination === null ||
      validDenomination(a.expectedLockedDenomination)
    ) ||
    !a.expectedTerms ||
    (!validTerms(a.expectedTerms) &&
      !(
        a.expectedTerms.enabled === false &&
        [
          a.expectedTerms.startsAt,
          a.expectedTerms.endsAt,
          a.expectedTerms.dailyBudgetPoints,
          a.expectedTerms.lifetimeBudgetPoints,
        ].every((v) => v === null)
      )) ||
    !['draft', 'publish', 'pause'].includes(a.action) ||
    !integer(a.expectedVersion, 1) ||
    !integer(a.formVersion, 1) ||
    !(a.draftRevision === null || integer(a.draftRevision, 1)) ||
    !/^[a-f0-9]{64}$/.test(a.digest) ||
    (a.action === 'draft' ? !a.terms || !validTerms(a.terms) : a.terms !== null)
  )
    throw new Error(
      'The prior operation metadata is invalid. Check its result, then explicitly start a new attempt.',
    );
  return a;
}

/** Only the server supplies the owner scope. It is never sent as mutation authority. */
export function LoyaltyManager(props: {
  role: string;
  ownerId: string;
  initialState: LoyaltyState;
}) {
  return props.role === 'super_admin' ? (
    <AuthorizedLoyaltyManager
      key={props.ownerId}
      ownerId={props.ownerId}
      initialState={props.initialState}
    />
  ) : (
    <p role="alert">Super Admin access is required.</p>
  );
}
function AuthorizedLoyaltyManager({
  ownerId,
  initialState,
}: {
  ownerId: string;
  initialState: LoyaltyState;
}) {
  const published = usePublishedFormConfig(formId);
  const [state, setState] = useState(initialState);
  const [editor, setEditor] = useState(0);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pendingRef = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const key = sessionAttemptKey(formId, ownerId + ':settings');
  const snapshot = useSyncExternalStore<string | null>(
    subscribeToAttempt,
    () => attemptSnapshot(key),
    () => null,
  );
  let attempt: Attempt | null = null;
  let recoveryError = '';
  if (snapshot !== null) {
    try {
      attempt = loadAttempt(key);
    } catch (reason) {
      recoveryError =
        reason instanceof Error
          ? reason.message
          : 'Browser session storage is unavailable.';
    }
  }
  useEffect(() => {
    if (error || recoveryError) errorRef.current?.focus();
  }, [error, recoveryError]);
  useEffect(() => {
    const currentAlive = alive;
    const currentGeneration = generation;
    currentAlive.current = true;
    return () => {
      currentAlive.current = false;
      currentGeneration.current++;
    };
  }, []);
  const locked = state.lockedDenomination;
  const incompatibleDraft =
    state.draftRevision !== null &&
    locked !== null &&
    !sameDenomination(state.terms, locked);
  const terms = attempt?.terms ?? { ...state.terms, ...locked };
  const displayConfig = attempt?.originalConfig ?? published.config;
  const unsupportedExposure =
    state.maximumLiability === null &&
    state.terms.lifetimeBudgetPoints !== null;
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
    nativeEvent: Event;
  }) {
    event.preventDefault();
    if (pendingRef.current || !published.canSubmit || !published.config) return;
    const button = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const action = button?.value as Action;
    if (!['draft', 'publish', 'pause'].includes(action)) return;
    const form = event.currentTarget;
    setError('');
    setNotice('');
    // Claim the guard before asynchronous hashing so rapid Enter/click cannot race.
    pendingRef.current = true;
    setPending(true);
    generation.current++;
    setLoading(false);
    try {
      const prior = loadAttempt(key);
      if (prior && prior.action !== action)
        throw new Error(
          'This operation differs from the prior attempt. Check its result, then explicitly start a new attempt.',
        );
      if (!prior && action === 'publish' && state.draftRevision === null)
        throw new Error('Save a draft before publishing.');
      const data = new FormData(form);
      const reason = value(data, 'reason').trim();
      if (!reason || reason.length > 1000)
        throw new Error('Enter a reason of at most 1000 characters.');
      const configured = readConfiguredSubmission(
        form,
        prior?.originalConfig ?? published.config,
        baseKeys,
      );
      const financial = action === 'draft' ? readTerms(data) : null;
      if (financial && !prior && locked && !sameDenomination(financial, locked))
        throw new Error(
          'The exchange denomination is locked after first issuance.',
        );
      const metadata = {
        action,
        expectedVersion: prior?.expectedVersion ?? state.version,
        formVersion: prior?.formVersion ?? published.config.version,
        draftRevision: prior ? prior.draftRevision : state.draftRevision,
        terms: financial,
        originalConfig:
          prior?.originalConfig ?? originalConfigSnapshot(published.config),
        expectedTerms: prior?.expectedTerms ?? state.terms,
        expectedLockedDenomination: prior
          ? prior.expectedLockedDenomination
          : state.lockedDenomination,
        sourceRevision: prior?.sourceRevision ?? state.revision,
        publishedRevision: prior?.publishedRevision ?? state.publishedRevision,
        paused: prior ? prior.paused : state.paused,
      };
      const body = {
        action,
        ...(financial ? { terms: financial } : {}),
        expectedVersion: metadata.expectedVersion,
        reason,
        ...configuredJsonPayload(
          prior?.originalConfig ?? published.config,
          configured.answers,
          baseKeys,
        ),
        formVersion: metadata.formVersion,
      };
      const digest = await digestFormRequest(body);
      if (!alive.current) return;
      if (prior && prior.digest !== digest)
        throw new Error(
          'This operation differs from the prior attempt. Re-enter the original private reason and answers, or check its result and explicitly start a new attempt.',
        );
      if (
        action !== 'draft' &&
        !window.confirm(
          action === 'publish'
            ? 'Publish the saved immutable draft for new daily earning?'
            : 'Pause new daily earning? Existing points remain redeemable.',
        )
      )
        return;
      const reference = getOrCreateVersionedSessionAttempt(
        key,
        metadata.expectedVersion,
      );
      if (reference.expectedVersion !== metadata.expectedVersion)
        throw new Error(
          'The prior save version is unavailable. Check its result, then explicitly start a new attempt.',
        );
      const saved = { ...metadata, digest };
      const savedJson = JSON.stringify(saved);
      if (new TextEncoder().encode(savedJson).length > 69632)
        throw new Error(
          'Original form metadata exceeds the supported limit. Refresh and reduce the configured schema before submitting.',
        );
      // Store settings, validated question definitions and opaque digest; private text stays in the form.
      sessionStorage.setItem(key + ':intent', savedJson);
      notifyAttempt();
      const response = await fetch('/api/admin/loyalty', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, requestId: reference.requestId }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!alive.current) return;
      const decoded =
        result && typeof result === 'object'
          ? (result as Record<string, unknown>)
          : {};
      if (response.status === 409 && decoded.code === 'stale_version')
        published.handleSubmissionResponse(response, String(decoded.code));
      if (!response.ok)
        throw new Error(
          (typeof decoded.error === 'string'
            ? decoded.error
            : 'The loyalty operation could not be completed.') +
            (decoded.code === 'stale'
              ? ' Review the latest settings before explicitly starting a new attempt.'
              : ''),
        );
      if (
        !validState(result) ||
        (metadata.expectedLockedDenomination !== null &&
          (!result.lockedDenomination ||
            !sameDenomination(
              result.lockedDenomination,
              metadata.expectedLockedDenomination,
            ))) ||
        result.version !== metadata.expectedVersion + 1 ||
        (action === 'draft' &&
          (result.draftRevision === null ||
            !sameTerms(result.terms, financial!) ||
            result.publishedRevision !== metadata.publishedRevision ||
            result.paused !== metadata.paused)) ||
        (action === 'publish' &&
          (result.draftRevision !== null ||
            result.paused ||
            result.publishedRevision !== metadata.draftRevision ||
            !sameTerms(result.terms, metadata.expectedTerms))) ||
        (action === 'pause' &&
          (!result.paused ||
            result.revision !== metadata.sourceRevision ||
            result.publishedRevision !== metadata.publishedRevision ||
            result.draftRevision !== metadata.draftRevision ||
            !sameTerms(result.terms, metadata.expectedTerms)))
      )
        throw new Error(
          'The loyalty result could not be verified. Retry the same attempt to check its result.',
        );
      clearVersionedSessionAttempt(key);
      sessionStorage.removeItem(key + ':intent');
      notifyAttempt();
      setState((current) =>
        current.version > result.version ? current : result,
      );
      setEditor((v) => v + 1);
      setNotice(
        action === 'draft'
          ? 'Draft saved. Review and publish separately.'
          : action === 'publish'
            ? 'Earning terms published.'
            : 'Earning paused. Existing points remain redeemable.',
      );
    } catch (reason) {
      if (alive.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'The loyalty operation could not be completed.',
        );
    } finally {
      pendingRef.current = false;
      if (alive.current) setPending(false);
    }
  }
  async function refresh() {
    if (pendingRef.current) return;
    const token = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/loyalty', { cache: 'no-store' });
      const result: unknown = await response.json();
      if (!alive.current || token !== generation.current) return;
      if (!response.ok || !validState(result))
        throw new Error('Latest loyalty settings could not be loaded.');
      setState(result);
      if (!attempt) setEditor((v) => v + 1);
    } catch (reason) {
      if (alive.current && token === generation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Latest loyalty settings could not be loaded.',
        );
    } finally {
      if (alive.current && token === generation.current) setLoading(false);
    }
  }
  function reset() {
    if (
      pendingRef.current ||
      !window.confirm(
        'The prior operation may already have succeeded. Check its result first. A new attempt can duplicate an operation. Start a new attempt?',
      )
    )
      return;
    try {
      sessionStorage.removeItem(key + ':intent');
      clearVersionedSessionAttempt(key);
      notifyAttempt();
      setEditor((v) => v + 1);
      setError('');
      setNotice(
        'New attempt started. Review current settings and re-enter private details.',
      );
      published.refresh();
    } catch {
      setError(
        'Browser session storage is unavailable. The prior attempt was retained.',
      );
    }
  }
  return (
    <div className="grid min-w-0 gap-6">
      <section
        aria-label="Loyalty state"
        className="grid min-w-0 gap-2 rounded-xl border p-4 text-sm"
      >
        <p>Administrative version: {state.version}</p>
        <p>Live financial revision: {state.publishedRevision}</p>
        <p>Draft financial revision: {state.draftRevision ?? 'None'}</p>
        <p>
          Status: {state.paused ? 'Earning paused' : 'Earning unpaused'}.
          Displayed terms: revision {state.revision} (
          {state.draftRevision === null ? 'live' : 'draft'}).
        </p>
        <p>
          Saving a draft does not change live earning. Publishing activates the
          saved draft and unpauses earning.
        </p>
        <p>
          Issued: {state.issuedPoints} points. Redeemed: {state.redeemedPoints}{' '}
          points. Outstanding: {state.outstandingPoints} points.
        </p>
        <p>
          Issued today (Asia/Kathmandu): {state.issuedTodayPoints} points.
          Credited: {money(state.creditedPaisa)}.
        </p>
        <p>
          Outstanding liability: {state.liability.wholeBlocks} whole blocks,{' '}
          {money(state.liability.creditPaisa)},{' '}
          {state.liability.remainingPoints} remaining points.
        </p>
        <p>
          Maximum budget exposure:{' '}
          {state.maximumLiability
            ? `${state.maximumLiability.wholeBlocks} whole blocks, ${money(state.maximumLiability.creditPaisa)}, ${state.maximumLiability.remainingPoints} remaining points.`
            : unsupportedExposure
              ? 'Unsupported at the locked denomination. Reduce the draft lifetime budget and save corrected terms before publishing.'
              : 'No finite earning budget configured.'}
        </p>
        <p>
          Exposure uses the displayed{' '}
          {state.draftRevision === null ? 'live' : 'draft'} lifetime point
          budget and {locked ? 'locked' : 'displayed'} exchange denomination.
        </p>
        {locked ? (
          <p>
            Locked exchange denomination: {locked.pointsPerBlock} points for{' '}
            {money(locked.creditPaisaPerBlock)}.
          </p>
        ) : null}
        {state.draftRevision !== null ? (
          <p>
            Saved draft denomination: {state.terms.pointsPerBlock} points for{' '}
            {money(state.terms.creditPaisaPerBlock)}.
          </p>
        ) : null}
        {incompatibleDraft ? (
          <output aria-live="polite" className="block text-sm">
            The saved draft differs from the locked denomination. Save a
            corrected draft before publishing. New draft rate controls use the
            locked denomination; saving creates a new revision.
          </output>
        ) : null}
        {attempt?.terms &&
        locked &&
        !sameDenomination(attempt.terms, locked) ? (
          <output aria-live="polite" className="block text-sm">
            This retained attempt keeps its original denomination to recover its
            saved result. A new draft must use the locked denomination.
          </output>
        ) : null}
        <p>
          {state.rateLocked
            ? 'Exchange denomination locked after first issuance.'
            : 'Exchange denomination locks on first issuance.'}{' '}
          Points and redeemed credit do not expire. Pausing earning preserves
          redemption.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void refresh()}
        >
          {loading ? 'Loading latest settings…' : 'Review latest settings'}
        </Button>
      </section>
      <form
        data-form-id="staff.loyalty-settings"
        onSubmit={submit}
        noValidate
        className="min-w-0 space-y-5 rounded-xl border p-4 sm:p-6"
      >
        <fieldset
          disabled={pending}
          key={editor + String(snapshot)}
          className="grid min-w-0 gap-4 sm:grid-cols-2"
        >
          <legend className="mb-3 font-semibold">Draft earning terms</legend>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={terms.enabled}
            />
            Enable daily earning when published
          </label>
          <Control
            name="dailyPoints"
            label="Daily points"
            value={terms.dailyPoints}
          />
          <Control
            name="pointsPerBlock"
            label="Points per block"
            value={terms.pointsPerBlock}
            readOnly={state.rateLocked}
          />
          <Control
            name="creditPaisaPerBlock"
            label="Credit per block (paisa)"
            value={terms.creditPaisaPerBlock}
            readOnly={state.rateLocked}
          />
          <Control
            name="startsAt"
            label="Earning start (UTC)"
            value={dateInput(terms.startsAt)}
            date
          />
          <Control
            name="endsAt"
            label="Earning end (UTC)"
            value={dateInput(terms.endsAt)}
            date
          />
          <Control
            name="dailyBudgetPoints"
            label="Daily budget (points)"
            value={terms.dailyBudgetPoints ?? ''}
          />
          <Control
            name="lifetimeBudgetPoints"
            label="Lifetime budget (points)"
            value={terms.lifetimeBudgetPoints ?? ''}
          />
        </fieldset>
        <fieldset disabled={pending} className="space-y-4">
          <div>
            <Label htmlFor="loyalty-reason">Reason</Label>
            <Input
              id="loyalty-reason"
              name="reason"
              className="mt-2"
              required
              maxLength={1000}
            />
          </div>
          {displayConfig ? (
            <ConfiguredFields
              key={displayConfig.version}
              config={displayConfig}
              baseKeys={baseKeys}
            />
          ) : null}
          {published.message ? (
            <output aria-live="polite" className="block">{published.message}</output>
          ) : null}
        </fieldset>
        {attempt ? (
          <output aria-live="polite" className="block text-sm">
            Retained {attempt.action} attempt at administrative version{' '}
            {attempt.expectedVersion}, form version {attempt.formVersion}.
            Re-enter the original private reason and answers to retry. Review
            its result before starting a new attempt.
          </output>
        ) : null}
        {error || recoveryError ? (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="text-sm text-destructive"
          >
            {error || recoveryError}
          </p>
        ) : null}
        {notice ? <output aria-live="polite" className="block text-sm">{notice}</output> : null}
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            name="action"
            value="draft"
            disabled={pending || !published.canSubmit}
          >
            Save draft
          </Button>
          <Button
            type="submit"
            name="action"
            value="publish"
            variant="outline"
            disabled={
              pending ||
              !published.canSubmit ||
              ((state.draftRevision === null ||
                incompatibleDraft ||
                unsupportedExposure) &&
                attempt?.action !== 'publish')
            }
          >
            Publish draft
          </Button>
          <Button
            type="submit"
            name="action"
            value="pause"
            variant="outline"
            disabled={pending || !published.canSubmit}
          >
            Pause earning
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={reset}
          >
            Start a new attempt
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={published.refresh}
          >
            Refresh form
          </Button>
        </div>
      </form>
    </div>
  );
}
function Control({
  name,
  label,
  value,
  date = false,
  readOnly = false,
}: {
  name: string;
  label: string;
  value: string | number;
  date?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={'loyalty-' + name}>{label}</Label>
      <Input
        id={'loyalty-' + name}
        name={name}
        type={date ? 'datetime-local' : 'number'}
        step={date ? '0.001' : '1'}
        min={date ? undefined : 1}
        defaultValue={value}
        readOnly={readOnly}
        required
        className="mt-2 w-full"
      />
    </div>
  );
}
