'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import {
  configuredJsonPayload,
  readConfiguredSubmission,
} from '@/lib/forms/submission';
import {
  clearVersionedSessionAttempt,
  getOrCreateVersionedSessionAttempt,
  hasSessionAttempt,
  sessionAttemptKey,
} from '@/lib/forms/client-attempt';
import {
  calculatePromoDiscount,
  normalizePromoCode,
} from '@/lib/incentives/promo-policy';
import type {
  PromoCampaignPage,
  PromoRedemptionPage,
  PromoState,
  PromoTerms,
} from '@/lib/incentives/types';

const subscribeToAttempt = () => () => undefined;
const baseKeys = [
  'code',
  'label',
  'kind',
  'fixedPaisa',
  'percentBps',
  'maxDiscountPaisa',
  'minimumSubtotalPaisa',
  'startsAt',
  'endsAt',
  'totalUseLimit',
  'perCustomerUseLimit',
  'budgetPaisa',
  'reason',
];
const money = (paisa: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    paisa / 100,
  );
const date = (value: number) =>
  new Date(value).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' });
function dateInput(value: number) {
  return new Date(value).toISOString().slice(0, -1);
}
function textValue(data: FormData, key: string) {
  const value = data.get(key);
  if (typeof value !== 'string') throw new Error('Enter ' + key + '.');
  return value;
}
function integer(data: FormData, key: string, minimum = 0) {
  const raw = textValue(data, key);
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) < minimum
  )
    throw new Error('Enter a finite safe integer for ' + key + '.');
  return Number(raw);
}
function readTerms(data: FormData): PromoTerms {
  const common = {
    code: normalizePromoCode(textValue(data, 'code')),
    label: textValue(data, 'label').trim(),
    minimumSubtotalPaisa: integer(data, 'minimumSubtotalPaisa'),
    startsAt: Date.parse(textValue(data, 'startsAt') + 'Z'),
    endsAt: Date.parse(textValue(data, 'endsAt') + 'Z'),
    totalUseLimit: integer(data, 'totalUseLimit', 1),
    perCustomerUseLimit: integer(data, 'perCustomerUseLimit', 1),
    budgetPaisa: integer(data, 'budgetPaisa', 1),
  };
  const terms: PromoTerms =
    data.get('kind') === 'percentage'
      ? {
          ...common,
          kind: 'percentage',
          percentBps: integer(data, 'percentBps', 1),
          maxDiscountPaisa: integer(data, 'maxDiscountPaisa', 1),
        }
      : {
          ...common,
          kind: 'fixed',
          fixedPaisa: integer(data, 'fixedPaisa', 1),
        };
  try {
    calculatePromoDiscount(terms, 0);
  } catch {
    throw new Error(
      'Review the code, dates and finite limits. End must follow start, and per customer use cannot exceed total use.',
    );
  }
  return terms;
}
function decodedRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function validRedemption(value: unknown): boolean {
  const r = decodedRecord(value);
  return (
    typeof r.redemptionId === 'string' &&
    typeof r.orderId === 'string' &&
    typeof r.revision === 'number' &&
    Number.isSafeInteger(r.revision) &&
    r.revision > 0 &&
    typeof r.discountPaisa === 'number' &&
    Number.isSafeInteger(r.discountPaisa) &&
    r.discountPaisa >= 0 &&
    typeof r.createdAt === 'number' &&
    Number.isSafeInteger(r.createdAt) &&
    r.createdAt >= 0
  );
}
function validState(value: unknown): value is PromoState {
  if (!value || typeof value !== 'object') return false;
  const s = value as PromoState;
  try {
    calculatePromoDiscount(s.terms, 0);
  } catch {
    return false;
  }
  return (
    typeof s.campaignId === 'string' &&
    s.campaignId.length > 0 &&
    Number.isSafeInteger(s.version) &&
    s.version >= 1 &&
    Number.isSafeInteger(s.revision) &&
    s.revision >= 1 &&
    typeof s.paused === 'boolean' &&
    !!s.terms &&
    Number.isSafeInteger(s.usedCount) &&
    s.usedCount >= 0 &&
    Number.isSafeInteger(s.spentPaisa) &&
    s.spentPaisa >= 0 &&
    (s.draftRevision === null || Number.isSafeInteger(s.draftRevision)) &&
    (s.publishedRevision === null || Number.isSafeInteger(s.publishedRevision))
  );
}

/** Keep the authorized child unmounted so its configuration hook cannot fetch for ordinary admins. */
export function PromoCodeManager(props: {
  role: string;
  initialPage: PromoCampaignPage;
}) {
  return props.role === 'super_admin' ? (
    <AuthorizedPromoCodeManager initialPage={props.initialPage} />
  ) : (
    <p role="alert">Super Admin access is required.</p>
  );
}
function AuthorizedPromoCodeManager({
  initialPage,
}: {
  initialPage: PromoCampaignPage;
}) {
  const published = usePublishedFormConfig('staff.promo-code');
  const [campaigns, setCampaigns] = useState(initialPage.campaigns);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [selected, setSelected] = useState<PromoState | null>(
    initialPage.campaigns[0] ?? null,
  );
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [kind, setKind] = useState<'fixed' | 'percentage'>(
    selected?.terms.kind ?? 'fixed',
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [, setAttemptRevision] = useState(0);
  const [history, setHistory] = useState<PromoRedemptionPage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [action, setAction] = useState<'draft' | 'publish' | 'pause'>('draft');
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pendingRef = useRef(false);
  const readGeneration = useRef(0);
  const intents = useRef(new Map<string, string>());
  const subject = selected?.campaignId ?? 'new';
  const attemptKey = sessionAttemptKey(
    'staff.promo-code',
    subject + ':' + action,
  );
  const retained = useSyncExternalStore(
    subscribeToAttempt,
    () => hasSessionAttempt(attemptKey),
    () => false,
  );
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(
    () => () => {
      readGeneration.current++;
    },
    [],
  );
  function choose(next: PromoState | null) {
    if (pendingRef.current) return;
    readGeneration.current++;
    setSelected(next);
    setKind(next?.terms.kind ?? 'fixed');
    setEditorGeneration((v) => v + 1);
    setHistory(null);
    setHistoryLoading(false);
    setError('');
    setNotice('');
  }
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (pendingRef.current || !published.canSubmit || !published.config) return;
    const form = event.currentTarget;
    setError('');
    setNotice('');
    try {
      const data = new FormData(form);
      const reason = textValue(data, 'reason').trim();
      if (!reason || reason.length > 1000)
        throw new Error('Enter a reason of at most 1000 characters.');
      if (action !== 'draft' && !selected)
        throw new Error('Select a campaign first.');
      const configured = readConfiguredSubmission(
        form,
        published.config,
        baseKeys,
      );
      // Store version + 1 so the shared helper can represent a new campaign expectedVersion of zero.
      const attempt = getOrCreateVersionedSessionAttempt(
        attemptKey,
        (selected?.version ?? 0) + 1,
      );
      const body = {
        action,
        ...(selected ? { campaignId: selected.campaignId } : {}),
        ...(action === 'draft' ? { terms: readTerms(data) } : {}),
        expectedVersion: attempt.expectedVersion - 1,
        requestId: attempt.requestId,
        reason,
        ...configuredJsonPayload(
          published.config,
          configured.answers,
          baseKeys,
        ),
      };
      const intent = JSON.stringify(body);
      const prior = intents.current.get(attemptKey);
      if (prior && prior !== intent)
        throw new Error(
          'This operation differs from the prior attempt. Check its result, then explicitly start a new attempt.',
        );
      intents.current.set(attemptKey, intent);
      if (
        action !== 'draft' &&
        !window.confirm(
          action === 'publish'
            ? 'Publish the selected immutable draft for new orders?'
            : 'Pause this campaign for new orders?',
        )
      )
        return;
      pendingRef.current = true;
      setPending(true);
      readGeneration.current++;
      setHistoryLoading(false);
      try {
        const response = await fetch('/api/admin/promo-codes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: intent,
        });
        const result = decodedRecord(await response.json().catch(() => null));
        if (response.status === 409 && result?.code === 'stale_version')
          published.handleSubmissionResponse(response, result.code);
        if (!response.ok)
          throw new Error(
            (typeof result?.error === 'string'
              ? result.error
              : 'Promo operation could not be completed.') +
              (result?.code === 'stale'
                ? ' Review the latest campaign and explicitly start a new attempt.'
                : ''),
          );
        if (
          !validState(result) ||
          result.version !== attempt.expectedVersion ||
          (selected && result.campaignId !== selected.campaignId)
        )
          throw new Error(
            'The promo result could not be verified. Retry the same attempt to check its result.',
          );
        clearVersionedSessionAttempt(attemptKey);
        intents.current.delete(attemptKey);
        setAttemptRevision((v) => v + 1);
        setCampaigns((current) => [
          result,
          ...current.filter((s) => s.campaignId !== result.campaignId),
        ]);
        setSelected(result);
        setKind(result.terms.kind);
        setEditorGeneration((v) => v + 1);
        setHistory(null);
        setNotice(
          action === 'draft'
            ? 'Draft saved. Review and publish separately.'
            : action === 'publish'
              ? 'Campaign published.'
              : 'Campaign paused.',
        );
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Promo operation could not be completed.',
      );
    }
  }
  async function refreshCampaign() {
    if (pendingRef.current) return;
    const token = ++readGeneration.current;
    setHistoryLoading(false);
    try {
      if (selected) {
        const response = await fetch(
          '/api/admin/promo-codes?campaignId=' +
            encodeURIComponent(selected.campaignId),
          { cache: 'no-store' },
        );
        const result = decodedRecord(await response.json());
        if (token !== readGeneration.current) return;
        if (!response.ok || !validState(result))
          throw new Error('Latest campaign could not be loaded.');
        choose(result);
      }
    } catch (reason) {
      if (token === readGeneration.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Latest campaign could not be loaded.',
        );
    }
  }
  async function loadHistory() {
    if (!selected || historyLoading || pendingRef.current) return;
    const token = ++readGeneration.current;
    setHistoryLoading(true);
    try {
      const query = new URLSearchParams({
        campaignId: selected.campaignId,
        view: 'history',
      });
      if (history?.nextCursor) query.set('cursor', history.nextCursor);
      const response = await fetch('/api/admin/promo-codes?' + query, {
        cache: 'no-store',
      });
      const result = decodedRecord(await response.json());
      if (token !== readGeneration.current) return;
      if (
        !response.ok ||
        !Array.isArray(result.redemptions) ||
        !result.redemptions.every(validRedemption) ||
        !(result.nextCursor === null || typeof result.nextCursor === 'string')
      )
        throw new Error('Usage history could not be loaded.');
      setHistory((current) => ({
        redemptions: [
          ...(current?.redemptions ?? []),
          ...(result.redemptions as PromoRedemptionPage['redemptions']),
        ],
        nextCursor: result.nextCursor as string | null,
      }));
    } catch (reason) {
      if (token === readGeneration.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Usage history could not be loaded.',
        );
    } finally {
      if (token === readGeneration.current) setHistoryLoading(false);
    }
  }
  async function moreCampaigns() {
    if (!nextCursor || pendingRef.current) return;
    const token = ++readGeneration.current;
    setHistoryLoading(false);
    try {
      const response = await fetch(
        '/api/admin/promo-codes?cursor=' + encodeURIComponent(nextCursor),
        { cache: 'no-store' },
      );
      const result = decodedRecord(await response.json());
      if (token !== readGeneration.current) return;
      if (
        !response.ok ||
        !Array.isArray(result?.campaigns) ||
        !result.campaigns.every(validState) ||
        !(result.nextCursor === null || typeof result.nextCursor === 'string')
      )
        throw new Error('Campaigns could not be loaded.');
      setCampaigns((current) => [
        ...current,
        ...(result.campaigns as PromoState[]).filter(
          (s: PromoState) =>
            !current.some((c) => c.campaignId === s.campaignId),
        ),
      ]);
      setNextCursor(result.nextCursor as string | null);
    } catch (reason) {
      if (token === readGeneration.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Campaigns could not be loaded.',
        );
    }
  }
  const terms = selected?.terms;
  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor="promo-campaign">Campaign</Label>
          <select
            id="promo-campaign"
            className="mt-2 w-full rounded-md border p-2"
            disabled={pending}
            value={selected?.campaignId ?? ''}
            onChange={(e) =>
              choose(
                campaigns.find((s) => s.campaignId === e.target.value) ?? null,
              )
            }
          >
            <option value="">New campaign</option>
            {campaigns.map((s) => (
              <option key={s.campaignId} value={s.campaignId}>
                {s.terms.code} · {s.terms.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => choose(null)}
        >
          New campaign
        </Button>
        {nextCursor ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => void moreCampaigns()}
          >
            More campaigns
          </Button>
        ) : null}
      </div>
      {selected ? (
        <section
          className="grid gap-2 rounded-xl border p-4 text-sm"
          aria-label="Campaign state"
        >
          <p>Administrative version: {selected.version}</p>
          <p>Live financial revision: {selected.publishedRevision ?? 'None'}</p>
          <p>Draft financial revision: {selected.draftRevision ?? 'None'}</p>
          <p>
            Status:{' '}
            {selected.paused
              ? 'Paused'
              : selected.publishedRevision
                ? 'Published'
                : 'Draft only'}
          </p>
          <p>
            Lifetime use: {selected.usedCount} / {terms?.totalUseLimit};
            lifetime spend: {money(selected.spentPaisa)} /{' '}
            {money(terms?.budgetPaisa ?? 0)}.
          </p>
          <p>
            Highest customer use: {selected.maximumCustomerUsedCount}. Displayed
            terms: revision {selected.revision}
            {selected.draftRevision ? ' (draft)' : ' (live)'}.
          </p>
          <p>
            Cancellation and refunds do not restore campaign uses or budget.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void refreshCampaign()}
          >
            Review latest campaign
          </Button>
        </section>
      ) : null}
      <form
        ref={formRef}
        data-form-id="staff.promo-code"
        onSubmit={submit}
        className="min-w-0 space-y-5 rounded-xl border p-4 sm:p-6"
      >
      <FormGuide formId="staff.promo-code" />

        <fieldset
          disabled={pending}
          className="grid min-w-0 gap-4 sm:grid-cols-2"
          key={subject + ':' + editorGeneration}
        >
          <legend className="mb-3 font-semibold">Draft financial terms</legend>
          <Control
            name="code"
            label="Code"
            defaultValue={terms?.code}
            maxLength={32}
            required
          />
          <Control
            name="label"
            label="Label"
            defaultValue={terms?.label}
            maxLength={200}
            required
          />
          <div>
            <Label htmlFor="promo-kind">Discount kind</Label>
            <select
              id="promo-kind"
              name="kind"
              value={kind}
              className="mt-2 w-full rounded-md border p-2"
              onChange={(e) =>
                setKind(e.target.value as 'fixed' | 'percentage')
              }
            >
              <option value="fixed">Fixed</option>
              <option value="percentage">Percentage</option>
            </select>
          </div>
          {kind === 'fixed' ? (
            <Control
              name="fixedPaisa"
              label="Fixed discount (paisa)"
              type="number"
              min={1}
              defaultValue={
                terms?.kind === 'fixed' ? terms.fixedPaisa : undefined
              }
              required
            />
          ) : (
            <>
              <Control
                name="percentBps"
                label="Percentage (basis points)"
                type="number"
                min={1}
                max={10000}
                defaultValue={
                  terms?.kind === 'percentage' ? terms.percentBps : undefined
                }
                required
              />
              <Control
                name="maxDiscountPaisa"
                label="Maximum discount (paisa)"
                type="number"
                min={1}
                defaultValue={
                  terms?.kind === 'percentage'
                    ? terms.maxDiscountPaisa
                    : undefined
                }
                required
              />
            </>
          )}
          <Control
            name="minimumSubtotalPaisa"
            label="Minimum products subtotal (paisa)"
            type="number"
            min={0}
            defaultValue={terms?.minimumSubtotalPaisa ?? 0}
            required
          />
          <Control
            name="startsAt"
            label="Starts at"
            type="datetime-local"
            defaultValue={terms ? dateInput(terms.startsAt) : undefined}
            required
          />
          <Control
            name="endsAt"
            label="Ends at"
            type="datetime-local"
            defaultValue={terms ? dateInput(terms.endsAt) : undefined}
            required
          />
          <Control
            name="totalUseLimit"
            label="Total use limit"
            type="number"
            min={1}
            defaultValue={terms?.totalUseLimit}
            required
          />
          <Control
            name="perCustomerUseLimit"
            label="Per customer use limit"
            type="number"
            min={1}
            defaultValue={terms?.perCustomerUseLimit}
            required
          />
          <Control
            name="budgetPaisa"
            label="Lifetime budget (paisa)"
            type="number"
            min={1}
            defaultValue={terms?.budgetPaisa}
            required
          />
        </fieldset>
        <p className="text-xs text-muted-foreground">
          Dates above are UTC. 100 paisa = NPR 1; 100 basis points = 1%. Every
          campaign must have an end, finite usage limits and a lifetime budget.
          Saving a draft preserves live financial terms until publication.
        </p>
        <Control
          name="reason"
          label="Reason"
          maxLength={1000}
          required
          disabled={pending}
        />
        {published.config ? (
          <ConfiguredFields config={published.config} baseKeys={baseKeys} />
        ) : null}
        <div>
          <Label htmlFor="promo-action">Operation</Label>
          <select
            id="promo-action"
            value={action}
            className="mt-2 rounded-md border p-2"
            disabled={pending}
            onChange={(e) => setAction(e.target.value as typeof action)}
          >
            <option value="draft">Save draft</option>
            <option value="publish" disabled={!selected?.draftRevision}>
              Publish draft
            </option>
            <option value="pause" disabled={!selected?.publishedRevision}>
              Pause campaign
            </option>
          </select>
        </div>
        {error ? (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        {notice ? <output aria-live="polite">{notice}</output> : null}
        {published.message ? <p role="alert">{published.message}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending || !published.canSubmit}>
            {pending
              ? 'Saving…'
              : action === 'draft'
                ? 'Save draft'
                : action === 'publish'
                  ? 'Publish draft'
                  : 'Pause campaign'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  'The prior operation may already have completed. Review its result before starting a new attempt to avoid duplicates.',
                )
              )
                return;
              clearVersionedSessionAttempt(attemptKey);
              intents.current.delete(attemptKey);
              setAttemptRevision((v) => v + 1);
              setError('');
              published.refresh();
              void refreshCampaign();
            }}
          >
            Start a new attempt
          </Button>
          {published.status !== 'ready' ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={published.refresh}
            >
              Refresh form
            </Button>
          ) : null}
        </div>
        {retained ? (
          <p className="text-sm">
            An attempt reference is retained. Retry the same intent to check its
            result. Changed input requires an explicit new attempt.
          </p>
        ) : null}
      </form>
      {selected ? (
        <section
          className="space-y-3 rounded-xl border p-4"
          aria-label="Lifetime usage history"
        >
          <h2 className="font-semibold">Lifetime usage history</h2>
          <p className="text-sm">
            Recorded discounts remain consumed after cancellation or refunds.
            Customer identities and private audit reasons are excluded.
          </p>
          <Button
            type="button"
            disabled={
              pending ||
              historyLoading ||
              (history !== null && !history.nextCursor)
            }
            onClick={() => void loadHistory()}
          >
            {historyLoading
              ? 'Loading history…'
              : history
                ? 'More usage history'
                : 'Load usage history'}
          </Button>
          {history ? (
            <ul className="space-y-2">
              {history.redemptions.map((r) => (
                <li key={r.redemptionId} className="break-words text-sm">
                  <span>{r.orderId}</span> · revision {r.revision} ·{' '}
                  {money(r.discountPaisa)} · {date(r.createdAt)}
                </li>
              ))}
            </ul>
          ) : null}
          {history && !history.redemptions.length ? (
            <p>No campaign usage recorded.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
function Control({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={'promo-' + name}>{label}</Label>
      <Input
        id={'promo-' + name}
        name={name}
        step={
          props.type === 'number'
            ? 1
            : props.type === 'datetime-local'
              ? 0.001
              : undefined
        }
        max={props.type === 'number' ? Number.MAX_SAFE_INTEGER : undefined}
        {...props}
      />
    </div>
  );
}
