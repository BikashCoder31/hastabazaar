'use client';

import { useEffect,useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  incentiveMoney,
  loyaltyCostPreview,
  nprToPaisa,
} from '@/lib/incentives/presentation';
import type { LoyaltyDenomination, LoyaltyTerms } from '@/lib/incentives/types';

import { loyaltyEditorValues,readTerms,assessLoyaltySetup,loyaltyPositiveInput as positive,loyaltyWeeklyInput as readWeeklyPoints,type LoyaltySetupFields,type LoyaltySetupAssessment } from '@/lib/incentives/loyalty-setup';
export {loyaltyEditorValues,readTerms};
type LoyaltyEditorValues=LoyaltySetupFields;
type ControlName=Exclude<keyof LoyaltyEditorValues,'enabled'|'rewardMode'|'weeklyPoints'|'graceEnabled'>;
const points=(value:number)=>new Intl.NumberFormat('en-NP').format(value);

/** This projection reads unsaved controls; it cannot issue or redeem points. */
export function loyaltyDraftPreview(
  values: LoyaltyEditorValues,
  locked: LoyaltyDenomination | null,
  participants: string,
  days: string,
  issuedPoints: number,
) {
  const denomination = locked ?? {
    pointsPerBlock: positive(values.pointsPerBlock, 'points per block'),
    creditPaisaPerBlock: nprToPaisa(
      values.creditPaisaPerBlock,
      'credit per block in NPR',
    ),
  };
  const weeklyPoints =
    values.rewardMode === 'weekly'
      ? readWeeklyPoints(values.weeklyPoints)
      : undefined;
  const dailyPoints =
    weeklyPoints?.[0] ?? positive(values.dailyPoints, 'daily points');
  const people = positive(participants, 'expected daily participants');
  const duration = positive(days, 'forecast days');
  const forecastTerms = {
    dailyPoints,
    ...(weeklyPoints
      ? { weeklyPoints, graceEnabled: values.graceEnabled }
      : {}),
    ...denomination,
  };
  const forecast = loyaltyCostPreview(forecastTerms, people, duration);
  const dailyForecastPoints = loyaltyCostPreview(
    { dailyPoints: weeklyPoints?.[6] ?? dailyPoints, ...denomination },
    people,
    1,
  ).projectedPoints;
  const cycle = weeklyPoints ? loyaltyCostPreview(forecastTerms, 1, 7) : null;
  const dailyBudgetPoints =
    values.dailyBudgetPoints === ''
      ? null
      : positive(values.dailyBudgetPoints, 'daily point budget');
  const lifetimeBudgetPoints =
    values.lifetimeBudgetPoints === ''
      ? null
      : positive(values.lifetimeBudgetPoints, 'lifetime point budget');
  const remainingLifetimePoints =
    lifetimeBudgetPoints === null
      ? null
      : Math.max(0, lifetimeBudgetPoints - issuedPoints);
  return {
    denomination,
    forecast,
    cyclePoints: cycle?.projectedPoints ?? null,
    cycleValuePaisa: cycle?.estimatedValuePaisa ?? null,
    dailyForecastPoints,
    dailyBudgetPoints,
    remainingLifetimePoints,
    dailyBudgetExceeded:
      dailyBudgetPoints !== null && dailyForecastPoints > dailyBudgetPoints,
    lifetimeBudgetExceeded:
      remainingLifetimePoints !== null &&
      forecast.projectedPoints > remainingLifetimePoints,
  };
}

export function LoyaltyTermsEditor({
  terms,
  locked,
  rateLocked,
  issuedPoints,
  disabled,
  preferWeekly=false,
  onReadinessChange,
}: {
  terms: LoyaltyTerms;
  locked: LoyaltyDenomination | null;
  rateLocked: boolean;
  issuedPoints: number;
  disabled: boolean;
  preferWeekly?:boolean;
  onReadinessChange?:(assessment:LoyaltySetupAssessment)=>void;
}) {
  const [values, setValues] = useState(() => loyaltyEditorValues(terms,preferWeekly));
  let readiness=assessLoyaltySetup(values,terms);
  if(readiness.terms&&readiness.terms.lifetimeBudgetPoints!<issuedPoints)readiness={ready:false,terms:null,issues:{lifetimeBudgetPoints:`The total points limit cannot be below ${issuedPoints} points already issued.`}};
  const readinessJson=JSON.stringify(readiness);
  useEffect(()=>{onReadinessChange?.(JSON.parse(readinessJson) as LoyaltySetupAssessment);},[onReadinessChange,readinessJson]);
  const [participants, setParticipants] = useState('100');
  const [days, setDays] = useState('30');
  let preview: ReturnType<typeof loyaltyDraftPreview> | null = null;
  let previewError = '';
  try {
    preview = loyaltyDraftPreview(
      values,
      locked,
      participants,
      days,
      issuedPoints,
    );
  } catch (reason) {
    previewError =
      reason instanceof Error
        ? reason.message
        : 'Review the earning rate and forecast inputs.';
  }
  function change(name: ControlName, next: string) {
    setValues((current) => ({ ...current, [name]: next }));
  }
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
      <fieldset disabled={disabled} className="min-w-0 space-y-5">
        <legend className="text-lg font-semibold">Draft earning terms</legend>
        <p className="text-sm text-muted-foreground">
          Set the earning schedule, exchange value, earning window and point
          budgets. Saving creates a draft for a separate publication.
        </p>
        {preferWeekly?<p className="rounded-lg border bg-muted/30 p-3 text-sm">Approved starting weekly points: 5, 7, 9, 10, 11, 13 and 15. These starting values are not saved yet. The setup starts with grace off. Editing these fields does not start earning.</p>:null}
        <label
          aria-label="Enable daily earning when published"
          className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm"
        >
          <input
            type="checkbox"
            id="loyalty-enabled"
            name="enabled"
            checked={values.enabled}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="block font-medium">
              Enable daily earning when published
            </span>
            <span className="mt-1 block text-muted-foreground">
              Eligible customers can claim once per Nepal calendar day.
            </span>
          </span>
        </label>
        <div>
          <Label htmlFor="loyalty-rewardMode">Earning schedule</Label>
          <NativeSelect
            id="loyalty-rewardMode"
            name="rewardMode"
            value={values.rewardMode}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                rewardMode: event.target.value as 'fixed' | 'weekly',
              }))
            }
            aria-describedby="loyalty-rewardMode-hint"
            className="mt-2 w-full min-w-0"
          >
            <NativeSelectOption value="weekly">
              Repeating 7-day schedule
            </NativeSelectOption>
            <NativeSelectOption value="fixed">
              Fixed daily points (legacy)
            </NativeSelectOption>
          </NativeSelect>
          <p
            id="loyalty-rewardMode-hint"
            className="mt-1.5 text-xs leading-relaxed text-muted-foreground"
          >
            Older fixed revisions keep their daily award. Switch to a repeating
            schedule to set seven increasing rewards.
          </p>
        </div>
        {values.rewardMode === 'weekly' ? (
          <div id="loyalty-weeklyPoints" className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">
              Each successful daily claim advances one day. After Day 7, the
              next claim starts again at Day 1.
            </p>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {values.weeklyPoints.map((award, index) => (
                <div key={index} className="min-w-0">
                  <Label htmlFor={`loyalty-weeklyPoints-${index + 1}`}>
                    Day {index + 1} points
                  </Label>
                  <Input
                    id={`loyalty-weeklyPoints-${index + 1}`}
                    name="weeklyPoints"
                    type="number"
                    min="1"
                    step="1"
                    required
                    aria-invalid={Boolean(readiness.issues[`weeklyPoints.${index}`]||readiness.issues.weeklyPoints)}
                    aria-describedby={readiness.issues[`weeklyPoints.${index}`]?`loyalty-weeklyPoints-${index+1}-error`:readiness.issues.weeklyPoints?'loyalty-weeklyPoints-error':undefined}
                    value={award}
                    onChange={(event) => {
                      const next = event.target.value;
                      setValues((current) => ({
                        ...current,
                        weeklyPoints: current.weeklyPoints.map((value, day) =>
                          day === index ? next : value,
                        ),
                      }));
                    }}
                    className="mt-2 h-10 w-full"
                  />
                  {readiness.issues[`weeklyPoints.${index}`]?<p id={`loyalty-weeklyPoints-${index+1}-error`} className="mt-1 text-xs text-destructive">{readiness.issues[`weeklyPoints.${index}`]}</p>:null}
                </div>
              ))}
            </div>
            {readiness.issues.weeklyPoints?<p id="loyalty-weeklyPoints-error" className="text-sm text-destructive">{readiness.issues.weeklyPoints}</p>:null}
            <p className="text-xs text-muted-foreground">
              Use positive whole points that strictly increase from Day 1
              through Day 7.
            </p>
            <label className="flex items-start gap-3 border-t pt-4 text-sm">
              <input
                aria-label="Grace period"
                name="graceEnabled"
                type="checkbox"
                checked={values.graceEnabled}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    graceEnabled: event.target.checked,
                  }))
                }
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">Grace period</span>
                <span className="mt-1 block text-muted-foreground">
                  Off by default. When on, one missed Nepal calendar day per
                  cycle keeps progress. A second missed day or two consecutive
                  missed days restart at Day 1. Missed days earn no points.
                </span>
                <span className="mt-1 block text-muted-foreground">
                  When off, any missed Nepal calendar day restarts the next
                  claim at Day 1. Points already earned are retained.
                </span>
              </span>
            </label>
          </div>
        ) : (
          <Control
            name="dailyPoints"
            label="Daily points"
            value={values.dailyPoints}
            onChange={change}
            hint="Points earned by one customer per daily claim."
            error={readiness.issues.dailyPoints}
          />
        )}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Control
            name="pointsPerBlock"
            label="Points per block"
            value={values.pointsPerBlock}
            onChange={change}
            readOnly={rateLocked}
            error={readiness.issues.pointsPerBlock}
            hint={
              rateLocked
                ? 'Locked after the first points were issued.'
                : 'A customer redeems complete blocks of points.'
            }
          />
          <Control
            name="creditPaisaPerBlock"
            label="Credit per block (NPR)"
            value={values.creditPaisaPerBlock}
            onChange={change}
            readOnly={rateLocked}
            money
            error={readiness.issues.creditPaisaPerBlock}
            hint={
              rateLocked
                ? 'The original exchange value is locked.'
                : 'Wallet credit for one complete point block.'
            }
          />
        </div>
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold">Earning window</p>
          <p className="text-sm text-muted-foreground">
            All dates use Nepal time (Asia/Kathmandu, UTC+05:45).
          </p>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Control
              name="startsAt"
              label="Earning start (Nepal time)"
              value={values.startsAt}
              onChange={change}
              date
              error={readiness.issues.startsAt}
            />
            <Control
              name="endsAt"
              label="Earning end (Nepal time)"
              value={values.endsAt}
              onChange={change}
              date
              error={readiness.issues.endsAt}
            />
          </div>
        </div>
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold">Shared points limits</p>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Control
              name="dailyBudgetPoints"
              label="Daily points limit"
              value={values.dailyBudgetPoints}
              onChange={change}
              hint="Shared across all customers in one Nepal calendar day. It must cover the largest daily award."
              error={readiness.issues.dailyBudgetPoints}
            />
            <Control
              name="lifetimeBudgetPoints"
              label="Total points limit"
              value={values.lifetimeBudgetPoints}
              onChange={change}
              hint="Shared across all customers for the whole program, including points already issued. It must cover the largest daily award."
              error={readiness.issues.lifetimeBudgetPoints}
            />
          </div>
        </div>
      </fieldset>
      <section
        id="cost-preview"
        aria-labelledby="loyalty-estimate-heading"
        className="min-w-0 self-start rounded-xl border bg-muted/25 p-4 sm:p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Planning estimate
        </p>
        <h3
          id="loyalty-estimate-heading"
          className="mt-1 text-lg font-semibold"
        >
          Future earning cost
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Updates from your unsaved earning schedule and{' '}
          {locked ? 'locked' : 'draft'} exchange rate.
        </p>
        <fieldset
          disabled={disabled}
          className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1"
        >
          <div className="min-w-0">
            <Label htmlFor="loyalty-forecast-participants">
              Expected daily participants
            </Label>
            <Input
              id="loyalty-forecast-participants"
              type="number"
              min="1"
              step="1"
              value={participants}
              onChange={(event) => setParticipants(event.target.value)}
              className="mt-2 h-10"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="loyalty-forecast-days">Forecast days</Label>
            <Input
              id="loyalty-forecast-days"
              type="number"
              min="1"
              step="1"
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="mt-2 h-10"
            />
          </div>
        </fieldset>
        {preview ? (
          <div aria-live="polite" className="mt-5 space-y-4 text-sm">
            <p className="rounded-lg border bg-background p-3 font-semibold">
              {points(preview.denomination.pointsPerBlock)} points ={' '}
              {incentiveMoney(preview.denomination.creditPaisaPerBlock)}
            </p>
            <dl className="grid gap-4">
              {preview.cyclePoints !== null &&
              preview.cycleValuePaisa !== null ? (
                <>
                  <EstimateMetric
                    label="Points per 7-day cycle"
                    value={points(preview.cyclePoints)}
                  />
                  <EstimateMetric
                    label="Estimated cycle point value"
                    value={incentiveMoney(preview.cycleValuePaisa)}
                  />
                </>
              ) : null}
              <EstimateMetric
                label="Projected points"
                value={points(preview.forecast.projectedPoints)}
              />
              <EstimateMetric
                label="Estimated point value"
                value={incentiveMoney(preview.forecast.estimatedValuePaisa)}
              />
              <EstimateMetric
                label="First whole-block redemption"
                value={`${points(preview.forecast.daysToRedemption)} ${preview.forecast.daysToRedemption === 1 ? 'day' : 'days'} per customer`}
              />
            </dl>
            <div className="space-y-2 border-t pt-4">
              <p className="font-medium">Budget comparison</p>
              <p>
                {values.rewardMode === 'weekly'
                  ? 'Highest scheduled daily projection'
                  : 'Daily projection'}
                : {points(preview.dailyForecastPoints)} points
                {preview.dailyBudgetPoints === null
                  ? '. No finite daily budget entered.'
                  : ` / ${points(preview.dailyBudgetPoints)} points budget.`}
              </p>
              <p>
                {preview.remainingLifetimePoints === null
                  ? 'No finite lifetime budget entered.'
                  : `Remaining lifetime budget: ${points(preview.remainingLifetimePoints)} points after existing issuance.`}
              </p>
              {preview.dailyBudgetExceeded || preview.lifetimeBudgetExceeded ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
                  {preview.dailyBudgetExceeded
                    ? 'The daily projection exceeds the daily budget. '
                    : ''}
                  {preview.lifetimeBudgetExceeded
                    ? 'The full forecast exceeds the remaining lifetime budget. '
                    : ''}
                  Actual earning stops at the applicable budget.
                </p>
              ) : preview.dailyBudgetPoints !== null &&
                preview.remainingLifetimePoints !== null ? (
                <p className="text-muted-foreground">
                  This projection fits within both entered point budgets.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <output
            aria-live="polite"
            className="mt-4 block text-sm text-muted-foreground"
          >
            {previewError}
          </output>
        )}
        <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          Assumes every participant starts at Day 1 and claims each day
          throughout the forecast, with earning enabled and published.
          Projection is before budgets, eligibility, the earning window and
          missed claims. It estimates future point value; it does not issue
          points or create automatic cash. Customers must redeem their own whole
          point blocks.
        </p>
      </section>
    </div>
  );
}

function EstimateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-xl font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function Control({
  name,
  label,
  value,
  onChange,
  date = false,
  money = false,
  readOnly = false,
  hint,
  error,
}: {
  name: ControlName;
  label: string;
  value: string;
  onChange: (name: ControlName, value: string) => void;
  date?: boolean;
  money?: boolean;
  readOnly?: boolean;
  hint?: string;
  error?:string;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={'loyalty-' + name}>{label}</Label>
      <Input
        id={'loyalty-' + name}
        name={name}
        type={date ? 'datetime-local' : money ? 'text' : 'number'}
        step={date ? '60' : money ? undefined : '1'}
        min={date || money ? undefined : 1}
        inputMode={money ? 'decimal' : undefined}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        readOnly={readOnly}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={[hint?'loyalty-'+name+'-hint':'',error?'loyalty-'+name+'-error':''].filter(Boolean).join(' ')||undefined}
        className="mt-2 h-10 w-full read-only:bg-muted/60"
      />
      {error?<p id={'loyalty-'+name+'-error'} className="mt-1 text-xs text-destructive">{error}</p>:null}
      {hint ? (
        <p
          id={'loyalty-' + name + '-hint'}
          className="mt-1.5 text-xs leading-relaxed text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
