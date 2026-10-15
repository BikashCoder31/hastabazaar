'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  LoyaltyTermsEditor,
  readTerms,
} from '@/components/admin/loyalty-terms-editor';
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
  validateWeeklyPoints,
} from '@/lib/incentives/loyalty-policy';
import { incentiveMoney as money } from '@/lib/incentives/presentation';
import {isLoyaltySettingsAction,type LoyaltySettingsAction} from '@/lib/forms/incentive-workspace-contracts';
import type {LoyaltySetupAssessment} from '@/lib/incentives/loyalty-setup';
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
  'rewardMode',
  'weeklyPoints',
  'graceEnabled',
  'pointsPerBlock',
  'creditPaisaPerBlock',
  'startsAt',
  'endsAt',
  'dailyBudgetPoints',
  'lifetimeBudgetPoints',
  'reason',
];
type Action = LoyaltySettingsAction;
type ScheduleMetadata=Pick<LoyaltyState,'scheduledRevision'|'scheduledFor'|'scheduledTerms'|'scheduledUnpause'|'scheduleBlockedReason'>;
interface Attempt extends ScheduleMetadata {
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
  publishedTerms:LoyaltyTerms;
  paused: boolean;
  digest: string;
}
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
function validTermsSnapshot(value: unknown): value is LoyaltyTerms {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const terms = value as LoyaltyTerms;
  if (validTerms(terms)) return true;
  if (
    terms.enabled !== false ||
    ![
      terms.startsAt,
      terms.endsAt,
      terms.dailyBudgetPoints,
      terms.lifetimeBudgetPoints,
    ].every((item) => item === null)
  )
    return false;
  // Disabled initial defaults have no earning window or budgets. Validate the
  // same award schema with a minimal finite window rather than bypassing it.
  try {
    const largestAward =
      terms.weeklyPoints === undefined
        ? terms.dailyPoints
        : validateWeeklyPoints(terms.weeklyPoints)[6];
    validateLoyaltyTerms({
      ...terms,
      startsAt: 0,
      endsAt: 1,
      dailyBudgetPoints: largestAward,
      lifetimeBudgetPoints: largestAward,
    });
    return true;
  } catch {
    return false;
  }
}
function sameTerms(a: LoyaltyTerms, b: LoyaltyTerms) {
  const sameSchedule =
    a.weeklyPoints === undefined
      ? b.weeklyPoints === undefined
      : Array.isArray(a.weeklyPoints) &&
        Array.isArray(b.weeklyPoints) &&
        a.weeklyPoints.length === b.weeklyPoints.length &&
        a.weeklyPoints.every(
          (award, index) => award === b.weeklyPoints![index],
        );
  return (
    sameSchedule &&
    [
      'enabled',
      'dailyPoints',
      'graceEnabled',
      'pointsPerBlock',
      'creditPaisaPerBlock',
      'startsAt',
      'endsAt',
      'dailyBudgetPoints',
      'lifetimeBudgetPoints',
    ].every(
      (key) => a[key as keyof LoyaltyTerms] === b[key as keyof LoyaltyTerms],
    )
  );
}
function validSchedule(value:ScheduleMetadata) {
  if(typeof value.scheduledUnpause!=='boolean'||!(value.scheduleBlockedReason===null||typeof value.scheduleBlockedReason==='string'&&value.scheduleBlockedReason.length>0&&value.scheduleBlockedReason.length<=1000))return false;
  return value.scheduledRevision===null ? value.scheduledFor===null&&value.scheduledTerms===null&&!value.scheduledUnpause&&value.scheduleBlockedReason===null :
    integer(value.scheduledRevision,1)&&integer(value.scheduledFor)&&value.scheduledTerms!==null&&validTerms(value.scheduledTerms)&&value.scheduledTerms.startsAt===value.scheduledFor;
}
function samePending(a:ScheduleMetadata,b:ScheduleMetadata,unpause=b.scheduledUnpause) {
  return a.scheduledRevision===b.scheduledRevision&&a.scheduledFor===b.scheduledFor&&a.scheduledUnpause===unpause&&a.scheduleBlockedReason===b.scheduleBlockedReason&&
    (a.scheduledTerms===null||b.scheduledTerms===null?a.scheduledTerms===b.scheduledTerms:sameTerms(a.scheduledTerms,b.scheduledTerms));
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
  if (!validTermsSnapshot(t)||!validTermsSnapshot(s.publishedTerms)||!validSchedule(s)||
    s.draftRevision===null&&!sameTerms(t,s.publishedTerms)||s.scheduledRevision!==null&&[s.draftRevision,s.publishedRevision].includes(s.scheduledRevision)) return false;
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
          'publishedTerms','scheduledRevision','scheduledFor','scheduledTerms','scheduledUnpause','scheduleBlockedReason',
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
    !validSchedule(a)||!validTermsSnapshot(a.publishedTerms)||
    typeof a.paused !== 'boolean' ||
    !(
      a.expectedLockedDenomination === null ||
      validDenomination(a.expectedLockedDenomination)
    ) ||
    !validTermsSnapshot(a.expectedTerms) ||
    !isLoyaltySettingsAction(a.action) ||
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
function LoyaltyRuleReview({terms}:{terms:LoyaltyTerms}) {
  const date=(value:number|null)=>value===null?'Not set':new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Kathmandu'});
  return <div className="space-y-2 text-sm">
    <p>{terms.weeklyPoints?`Day 1–7: ${terms.weeklyPoints.join(', ')} points`:`Fixed daily award: ${terms.dailyPoints} points`} · {terms.weeklyPoints?terms.graceEnabled?'Grace on':'Grace off':''}</p>
    <p>{terms.pointsPerBlock} points = {money(terms.creditPaisaPerBlock)}. {terms.enabled?'Earning is enabled in these saved rules.':'Earning is disabled in these saved rules.'}</p>
    <p>Start: {date(terms.startsAt)} · End: {date(terms.endsAt)} · Nepal time</p>
    <p>Shared daily points limit: {terms.dailyBudgetPoints??'Not set'} · Shared total points limit: {terms.lifetimeBudgetPoints??'Not set'}</p>
  </div>;
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
  const router = useRouter();
  const published = usePublishedFormConfig(formId);
  const [state, setState] = useState(initialState);
  const [editor, setEditor] = useState(0);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [setup,setSetup]=useState<LoyaltySetupAssessment|null>(null);
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
  const initialWeekly=!attempt&&state.publishedRevision===0&&state.draftRevision===null&&state.scheduledRevision===null&&state.issuedPoints===0;
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
    if (!isLoyaltySettingsAction(action)) return;
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
      for(const control of form.querySelectorAll('[name^="custom."]'))if((control instanceof HTMLInputElement||control instanceof HTMLSelectElement||control instanceof HTMLTextAreaElement)&&!control.reportValidity())
        throw new Error('Complete the required form answers before submitting this operation.');
      const configured = readConfiguredSubmission(
        form,
        prior?.originalConfig ?? published.config,
        baseKeys,
      );
      const financial =
        action === 'draft' ? readTerms(data, prior?.terms ?? terms) : null;
      if(financial&&!prior&&financial.lifetimeBudgetPoints!<state.issuedPoints)throw new Error(`The total points limit cannot be below ${state.issuedPoints} points already issued.`);
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
        publishedTerms:prior?.publishedTerms??state.publishedTerms,
        scheduledRevision:prior?prior.scheduledRevision:state.scheduledRevision,
        scheduledFor:prior?prior.scheduledFor:state.scheduledFor,
        scheduledTerms:prior?prior.scheduledTerms:state.scheduledTerms,
        scheduledUnpause:prior?prior.scheduledUnpause:state.scheduledUnpause,
        scheduleBlockedReason:prior?prior.scheduleBlockedReason:state.scheduleBlockedReason,
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
      const digest = await digestFormRequest({body,source:{...metadata,ownerId}});
      if (!alive.current) return;
      if (prior && prior.digest !== digest)
        throw new Error(
          'This operation differs from the prior attempt. Re-enter the original private reason and answers, or check its result and explicitly start a new attempt.',
        );
      if (
        action !== 'draft' &&
        !window.confirm(
          action === 'publish'
            ? 'Publish the saved immutable draft? A future start keeps current rules until its Nepal-time start. Publishing does not include unsaved edits.'
            :action==='cancel_schedule'?'Cancel the scheduled change? Current rules will keep their existing pause, dates and limits. Existing points remain redeemable.'
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
            !sameTerms(result.publishedTerms,metadata.publishedTerms)||!samePending(result,metadata)||
            result.publishedRevision !== metadata.publishedRevision ||
            result.paused !== metadata.paused)) ||
        (action === 'publish' &&
          (result.draftRevision !== null ||
            !(result.scheduledRevision===null ? !result.paused&&result.publishedRevision===metadata.draftRevision&&sameTerms(result.terms,metadata.expectedTerms)&&sameTerms(result.publishedTerms,metadata.expectedTerms) :
              result.scheduledRevision===metadata.draftRevision&&result.scheduledFor===metadata.expectedTerms.startsAt&&result.scheduledUnpause&&result.scheduleBlockedReason===null&&
              result.paused===metadata.paused&&result.publishedRevision===metadata.publishedRevision&&sameTerms(result.publishedTerms,metadata.publishedTerms)&&
              sameTerms(result.terms,metadata.publishedTerms)&&result.scheduledTerms!==null&&sameTerms(result.scheduledTerms,metadata.expectedTerms)))) ||
        (action === 'pause' &&
          (!result.paused ||
            result.revision !== metadata.sourceRevision ||
            result.publishedRevision !== metadata.publishedRevision ||
            result.draftRevision !== metadata.draftRevision ||
            !sameTerms(result.terms, metadata.expectedTerms)||!sameTerms(result.publishedTerms,metadata.publishedTerms)||!samePending(result,metadata,false)))||
        (action==='cancel_schedule'&&(result.scheduledRevision!==null||result.revision!==metadata.sourceRevision||result.publishedRevision!==metadata.publishedRevision||
          result.draftRevision!==metadata.draftRevision||result.paused!==metadata.paused||!sameTerms(result.terms,metadata.expectedTerms)||!sameTerms(result.publishedTerms,metadata.publishedTerms)))
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
            ? result.scheduledRevision===null?'Earning terms published.':'New earning rules are scheduled. Current rules keep their existing pause, dates and limits until the Nepal-time start.'
            :action==='cancel_schedule'?'Scheduled change cancelled. Current rules keep their existing pause, dates and limits.':'Earning paused. Existing points remain redeemable.',
      );
      router.refresh();
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
        className="grid min-w-0 gap-4 rounded-xl border bg-background p-4 text-sm sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Daily loyalty controls</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium">
                {state.paused
                  ? 'Earning paused'
                  : state.publishedRevision === 0
                    ? 'Not published'
                    : 'Earning unpaused'}
              </span>
              <span className="rounded-full border px-3 py-1 text-xs font-medium">
                {state.draftRevision === null
                  ? 'No saved draft'
                  : 'Saved draft awaiting publication'}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void refresh()}
          >
            {loading ? 'Loading latest settings…' : 'Review latest settings'}
          </Button>
        </div>
        <p className="text-muted-foreground">
          Saving a draft keeps current earning unchanged. Publishing a future
          start schedules the saved rules; current rules keep their existing pause,
          dates and limits until that Nepal-time start. Unsaved edits are included only in a new saved draft.
        </p>
        {state.scheduledRevision!==null&&state.scheduledTerms?<section aria-label="Scheduled loyalty change" className="space-y-2 rounded-lg border p-4">
          <h3 className="font-semibold">Scheduled earning rules · revision {state.scheduledRevision}</h3>
          <p>Starts {new Date(state.scheduledFor!).toLocaleString('en-GB',{timeZone:'Asia/Kathmandu'})} Nepal time.</p>
          <p>{state.scheduledTerms.weeklyPoints?`Day 1–7: ${state.scheduledTerms.weeklyPoints.join(', ')} points`:`${state.scheduledTerms.dailyPoints} points per daily claim`} · {state.scheduledTerms.enabled?'Earning enabled in these rules':'Earning disabled in these rules'}.</p>
          <p>{state.scheduledUnpause?'The scheduled rules may unpause earning at their start. Pause earning now to keep them paused.':'A later pause keeps the scheduled rules paused at their start.'}</p>
          {state.scheduleBlockedReason?<p role="alert">{state.scheduleBlockedReason}</p>:null}
        </section>:null}
        <details
          open={unsupportedExposure}
          className="rounded-lg border bg-muted/20 p-3"
        >
          <summary className="cursor-pointer font-medium">
            Administrative details and recorded exposure
          </summary>
          <div className="mt-3 grid gap-2 text-muted-foreground">
            <p>Administrative version: {state.version}</p>
            <p>Live financial revision: {state.publishedRevision}</p>
            <p>Draft financial revision: {state.draftRevision ?? 'None'}</p>
            <p>Scheduled financial revision: {state.scheduledRevision??'None'}</p>
            <p>
              Status: {state.paused ? 'Earning paused' : 'Earning unpaused'}.
              Displayed terms: revision {state.revision} (
              {state.draftRevision === null ? 'live' : 'draft'}).
            </p>
            <p>
              Issued: {state.issuedPoints} points. Redeemed:{' '}
              {state.redeemedPoints} points. Outstanding:{' '}
              {state.outstandingPoints} points.
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
              budget and {locked ? 'locked' : 'displayed'} exchange
              denomination.
            </p>
          </div>
        </details>
        {locked ? (
          <p className="font-medium">
            Locked exchange denomination: {locked.pointsPerBlock} points for{' '}
            {money(locked.creditPaisaPerBlock)}.
          </p>
        ) : null}
        {state.draftRevision!==null?<section aria-label="Saved loyalty draft" className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">Saved draft · revision {state.draftRevision}</h3><LoyaltyRuleReview terms={state.terms}/>
          <p className="text-sm text-muted-foreground">Publish draft uses these saved rules. Unsaved editor changes are not included.</p>
        </section>:null}
        {state.draftRevision !== null ? (
          <p>
            Saved draft denomination: {state.terms.pointsPerBlock} points for{' '}
            {money(state.terms.creditPaisaPerBlock)}.
          </p>
        ) : null}
        {incompatibleDraft ? (
          <output
            aria-live="polite"
            className="block rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          >
            The saved draft differs from the locked denomination. Save a
            corrected draft before publishing. New draft rate controls use the
            locked denomination; saving creates a new revision.
          </output>
        ) : null}
        {attempt?.terms &&
        locked &&
        !sameDenomination(attempt.terms, locked) ? (
          <output
            aria-live="polite"
            className="block rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          >
            This retained attempt keeps its original denomination to recover its
            saved result. A new draft must use the locked denomination.
          </output>
        ) : null}
        <p className="rounded-lg bg-muted/40 p-3 text-muted-foreground">
          {state.rateLocked
            ? 'Exchange denomination locked after first issuance.'
            : 'Exchange denomination locks on first issuance.'}{' '}
          Points and redeemed credit do not expire. Pausing earning preserves
          redemption.
        </p>
      </section>
      <form
        id="loyalty-form"
        data-form-id="staff.loyalty-settings"
        onSubmit={submit}
        noValidate
        className="min-w-0 space-y-5 rounded-xl border p-4 sm:p-6"
      >
        <FormGuide formId="staff.loyalty-settings" />
        <section aria-label="Loyalty setup steps" className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
          <h3 className="font-semibold">Prepare now, start when you are ready</h3>
          <ol className="list-decimal space-y-1 pl-5"><li>Fill the start, end and shared points limits below.</li><li>To allow earning after publication, select Enable daily earning when published.</li><li>Add a reason and any required form answers, then Save draft.</li><li>Review the saved draft, then Publish draft. A future start keeps current rules until that Nepal-time date.</li></ol>
          <p className="font-medium">{setup?.ready?'The earning details are ready for a draft. Saving still keeps current earning unchanged.':'Complete the highlighted details before saving a draft.'}</p>
          {setup&&!setup.ready?<ul className="list-disc space-y-1 pl-5">{Object.entries(setup.issues).map(([field,issue])=><li key={field}><a className="underline" href={`#loyalty-${field.startsWith('weeklyPoints.')?`weeklyPoints-${Number(field.split('.')[1])+1}`:field}`}>{issue}</a></li>)}</ul>:null}
          {setup?.terms&&!sameTerms(setup.terms,state.terms)?<p>Unsaved changes: use Save draft to record this setup.</p>:null}
        </section>
        <LoyaltyTermsEditor
          key={editor + String(snapshot)}
          terms={terms}
          locked={locked}
          rateLocked={state.rateLocked}
          issuedPoints={state.issuedPoints}
          disabled={pending}
          preferWeekly={initialWeekly}
          onReadinessChange={setSetup}
        />
        <fieldset disabled={pending} className="space-y-4 border-t pt-5">
          <legend className="sr-only">Change review</legend>
          <div>
            <Label htmlFor="loyalty-reason">Reason</Label>
            <p
              id="loyalty-reason-hint"
              className="mt-1 text-sm text-muted-foreground"
            >
              Explain this change for the administrative record.
            </p>
            <Input
              id="loyalty-reason"
              name="reason"
              className="mt-2 h-10"
              required
              maxLength={1000}
              aria-describedby="loyalty-reason-hint"
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
            <output aria-live="polite" className="block">
              {published.message}
            </output>
          ) : null}
        </fieldset>
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
        {notice ? (
          <output aria-live="polite" className="block text-sm">
            {notice}
          </output>
        ) : null}
        {attempt ? (
          <p className="rounded-lg border bg-muted/30 p-3 text-sm">
            A previous {attempt.action} attempt is retained. Re-enter the
            original private reason and answers to retry safely. Recovery
            details are below.
          </p>
        ) : null}
        {attempt?.action==='publish'?<details className="rounded-lg border p-4 text-sm"><summary className="cursor-pointer font-medium">Original saved rules for this retained publication</summary><div className="mt-3"><LoyaltyRuleReview terms={attempt.expectedTerms}/></div></details>:null}
        <div className="flex flex-wrap gap-3 border-t pt-5">
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
                state.scheduledRevision!==null ||
                incompatibleDraft ||
                unsupportedExposure) &&
                attempt?.action !== 'publish')
            }
          >
            Publish draft
          </Button>
          {state.scheduledRevision!==null||attempt?.action==='cancel_schedule'?<Button type="submit" name="action" value="cancel_schedule" variant="outline" disabled={pending||!published.canSubmit}>Cancel scheduled change</Button>:null}
          <Button
            type="submit"
            name="action"
            value="pause"
            variant="outline"
            disabled={pending || !published.canSubmit}
          >
            Pause earning
          </Button>
        </div>
        <details
          open={Boolean(attempt) || Boolean(recoveryError)}
          className="rounded-lg border p-4 text-sm"
        >
          <summary className="cursor-pointer font-medium">
            Form and attempt recovery
          </summary>
          <div className="mt-3 space-y-3 text-muted-foreground">
            {attempt ? (
              <output aria-live="polite" className="block">
                Retained {attempt.action} attempt at administrative version{' '}
                {attempt.expectedVersion}, form version {attempt.formVersion}.
                Re-enter the original private reason and answers to retry.
                Review its result before starting a new attempt.
              </output>
            ) : (
              <p>
                Refresh the form to load its latest published questions. After
                an uncertain response, review the result before explicitly
                starting a new attempt.
              </p>
            )}
            <p>
              Starting a new attempt clears the saved request reference. The
              prior operation may already have succeeded; a new request can
              duplicate an operation.
            </p>
            <div className="flex flex-wrap gap-3">
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
          </div>
        </details>
      </form>
    </div>
  );
}
