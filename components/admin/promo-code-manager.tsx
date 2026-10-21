'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  incentiveMoney as money,
  incentiveDate as date,
  moneyInput,
  nepalDateTimeInput,
  nprToPaisa,
  parseNepalDateTime,
  percentageToBps,
} from '@/lib/incentives/presentation';
import { PromoCodeCostPreview } from '@/components/admin/promo-code-cost-preview';
import type { FeeWaiverCampaign } from '@/lib/marketplace/fee-waivers';
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
function readTerms(
  data: FormData,
  preview = false,
  original?: PromoTerms,
): PromoTerms {
  function timestamp(key: 'startsAt' | 'endsAt') {
    const value = textValue(data, key);
    return original && value === nepalDateTimeInput(original[key])
      ? original[key]
      : parseNepalDateTime(value);
  }
  const common = {
    code: preview ? 'PREVIEW' : normalizePromoCode(textValue(data, 'code')),
    label: preview ? 'Cost preview' : textValue(data, 'label').trim(),
    minimumSubtotalPaisa: nprToPaisa(
      textValue(data, 'minimumSubtotalPaisa'),
      'the minimum products subtotal',
    ),
    startsAt: preview ? 0 : timestamp('startsAt'),
    endsAt: preview ? 1 : timestamp('endsAt'),
    totalUseLimit: preview ? 1 : integer(data, 'totalUseLimit', 1),
    perCustomerUseLimit: preview ? 1 : integer(data, 'perCustomerUseLimit', 1),
    budgetPaisa: preview
      ? Number.MAX_SAFE_INTEGER
      : nprToPaisa(textValue(data, 'budgetPaisa'), 'the lifetime budget'),
  };
  const terms: PromoTerms =
    data.get('kind') === 'percentage'
      ? {
          ...common,
          kind: 'percentage',
          percentBps: percentageToBps(textValue(data, 'percentBps')),
          maxDiscountPaisa: nprToPaisa(
            textValue(data, 'maxDiscountPaisa'),
            'the maximum discount',
          ),
        }
      : {
          ...common,
          kind: 'fixed',
          fixedPaisa: nprToPaisa(
            textValue(data, 'fixedPaisa'),
            'the fixed discount',
          ),
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
function campaignStatus(state: PromoState) {
  return state.paused
    ? 'Paused'
    : state.publishedRevision
      ? 'Published'
      : 'Draft only';
}
function discountSummary(terms: PromoTerms) {
  return terms.kind === 'fixed'
    ? money(terms.fixedPaisa) + ' off'
    : moneyInput(terms.percentBps) +
        '% off, up to ' +
        money(terms.maxDiscountPaisa);
}

/** Keep the authorized child unmounted so its configuration hook cannot fetch for ordinary admins. */
export function PromoCodeManager(props: {
  role: string;
  initialPage: PromoCampaignPage;
  defaultCommissionBps?: number;
  feeWaiver?: FeeWaiverCampaign | null;
}) {
  return props.role === 'super_admin' ? (
    <AuthorizedPromoCodeManager
      initialPage={props.initialPage}
      defaultCommissionBps={props.defaultCommissionBps}
      feeWaiver={props.feeWaiver}
    />
  ) : (
    <p role="alert">Super Admin access is required.</p>
  );
}
function AuthorizedPromoCodeManager({
  initialPage,
  defaultCommissionBps,
  feeWaiver,
}: {
  initialPage: PromoCampaignPage;
  defaultCommissionBps?: number;
  feeWaiver?: FeeWaiverCampaign | null;
}) {
  const router = useRouter();
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
  const [campaignSearch, setCampaignSearch] = useState('');
  const [previewTerms, setPreviewTerms] = useState<PromoTerms | null>(
    selected?.terms ?? null,
  );
  const [previewError, setPreviewError] = useState('');
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
    setPreviewTerms(next?.terms ?? null);
    setPreviewError('');
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
        ...(action === 'draft'
          ? { terms: readTerms(data, false, selected?.terms) }
          : {}),
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
        setPreviewTerms(result.terms);
        setPreviewError('');
        setEditorGeneration((v) => v + 1);
        setHistory(null);
        setNotice(
          action === 'draft'
            ? 'Draft saved. Review and publish separately.'
            : action === 'publish'
              ? 'Campaign published.'
              : 'Campaign paused.',
        );
        router.refresh();
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
        setCampaigns((current) =>
          current.map((campaign) =>
            campaign.campaignId === result.campaignId ? result : campaign,
          ),
        );
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
  const query = campaignSearch.trim().toLowerCase();
  const visibleCampaigns = campaigns.filter(
    (campaign) =>
      !query ||
      [
        campaign.terms.code,
        campaign.terms.label,
        campaignStatus(campaign),
      ].some((value) => value.toLowerCase().includes(query)),
  );
  return (
    <div className="grid min-w-0 gap-6">
      <section
        aria-label="Campaign management"
        className="min-w-0 space-y-4 rounded-xl border p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="font-semibold">Campaigns</h2>
            <Label htmlFor="promo-campaign-search">
              Search loaded campaigns
            </Label>
            <Input
              id="promo-campaign-search"
              type="search"
              value={campaignSearch}
              placeholder="Search code, label or status"
              onChange={(event) => setCampaignSearch(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => choose(null)}
          >
            New campaign
          </Button>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table
            aria-label="Loaded campaigns"
            className="w-full text-left text-sm"
          >
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3">
                  Campaign
                </th>
                <th scope="col" className="p-3">
                  Status
                </th>
                <th scope="col" className="p-3">
                  Displayed rules
                </th>
                <th scope="col" className="p-3">
                  Lifetime use
                </th>
                <th scope="col" className="p-3">
                  Lifetime spend
                </th>
                <th scope="col" className="p-3">
                  Manage
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleCampaigns.map((campaign) => (
                <tr
                  key={campaign.campaignId}
                  className={
                    'border-b align-top ' +
                    (selected?.campaignId === campaign.campaignId
                      ? 'bg-muted/40'
                      : '')
                  }
                >
                  <th scope="row" className="p-3 font-normal">
                    <span className="block font-semibold">
                      {campaign.terms.code}
                    </span>
                    <span className="text-muted-foreground">
                      {campaign.terms.label}
                    </span>
                  </th>
                  <td className="p-3">
                    <span className="inline-flex rounded-full border px-2 py-1 text-xs">
                      {campaignStatus(campaign)}
                    </span>
                    {campaign.draftRevision && campaign.publishedRevision ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Draft available
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <p>{discountSummary(campaign.terms)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {campaign.draftRevision
                        ? 'Draft rules'
                        : 'Published rules'}{' '}
                      · revision {campaign.revision}
                    </p>
                  </td>
                  <td className="p-3 tabular-nums">{campaign.usedCount}</td>
                  <td className="whitespace-nowrap p-3 tabular-nums">
                    {money(campaign.spentPaisa)}
                  </td>
                  <td className="p-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      aria-label={'Manage ' + campaign.terms.code}
                      aria-pressed={
                        selected?.campaignId === campaign.campaignId
                      }
                      onClick={() => choose(campaign)}
                    >
                      {selected?.campaignId === campaign.campaignId
                        ? 'Selected'
                        : 'Open'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visibleCampaigns.length ? (
          <p className="text-sm text-muted-foreground">
            {campaigns.length
              ? 'No loaded campaigns match this search.'
              : 'No campaigns yet. Create a draft to get started.'}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {visibleCampaigns.length} shown · {campaigns.length} loaded. Search
            applies to loaded campaigns.
          </p>
          {nextCursor ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void moreCampaigns()}
            >
              More campaigns
            </Button>
          ) : null}
        </div>
      </section>
      {selected ? (
        <section
          className="grid gap-2 rounded-xl border p-4 text-sm"
          aria-label="Campaign state"
        >
          <h2 className="font-semibold">
            {terms?.code} · {terms?.label}
          </h2>
          <p>Administrative version: {selected.version}</p>
          <p>Live financial revision: {selected.publishedRevision ?? 'None'}</p>
          <p>Draft financial revision: {selected.draftRevision ?? 'None'}</p>
          <p>Status: {campaignStatus(selected)}</p>
          <p>
            Lifetime use: {selected.usedCount}; lifetime spend:{' '}
            {money(selected.spentPaisa)}.
          </p>
          <p className="rounded-lg bg-muted/40 p-3">
            {selected.draftRevision ? 'Draft rules' : 'Published rules'}{' '}
            displayed: {terms ? discountSummary(terms) : null}; total use limit{' '}
            {terms?.totalUseLimit}; lifetime budget{' '}
            {money(terms?.budgetPaisa ?? 0)}.
            {selected.draftRevision && selected.publishedRevision
              ? ' New orders continue to use the published revision until you publish this draft.'
              : null}
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
        onChange={(event) => {
          try {
            setPreviewTerms(readTerms(new FormData(event.currentTarget), true));
            setPreviewError('');
          } catch {
            setPreviewTerms(null);
            setPreviewError(
              'Enter a valid discount, maximum discount if needed, and minimum products subtotal to see the illustration.',
            );
          }
        }}
        className="min-w-0 space-y-5 rounded-xl border p-4 sm:p-6"
      >
      <FormGuide formId="staff.promo-code" />

        <fieldset
          disabled={pending}
          className="grid min-w-0 gap-4 sm:grid-cols-2"
          key={subject + ':' + editorGeneration}
        >
          <legend className="mb-3 font-semibold">
            {selected ? 'Edit campaign draft' : 'Create campaign draft'}
          </legend>
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
              <option value="fixed">Fixed NPR amount</option>
              <option value="percentage">Percentage discount</option>
            </select>
          </div>
          {kind === 'fixed' ? (
            <Control
              name="fixedPaisa"
              label="Fixed discount (NPR)"
              type="text"
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{1,2})?"
              defaultValue={
                terms?.kind === 'fixed'
                  ? moneyInput(terms.fixedPaisa)
                  : undefined
              }
              required
            />
          ) : (
            <>
              <Control
                name="percentBps"
                label="Discount percentage (%)"
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([.][0-9]{1,2})?"
                defaultValue={
                  terms?.kind === 'percentage'
                    ? moneyInput(terms.percentBps)
                    : undefined
                }
                required
              />
              <Control
                name="maxDiscountPaisa"
                label="Maximum discount (NPR)"
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([.][0-9]{1,2})?"
                defaultValue={
                  terms?.kind === 'percentage'
                    ? moneyInput(terms.maxDiscountPaisa)
                    : undefined
                }
                required
              />
            </>
          )}
          <Control
            name="minimumSubtotalPaisa"
            label="Minimum products subtotal (NPR)"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            defaultValue={moneyInput(terms?.minimumSubtotalPaisa ?? 0)}
            required
          />
          <Control
            name="startsAt"
            label="Starts at (Nepal time)"
            type="datetime-local"
            defaultValue={
              terms ? nepalDateTimeInput(terms.startsAt) : undefined
            }
            required
          />
          <Control
            name="endsAt"
            label="Ends at (Nepal time)"
            type="datetime-local"
            defaultValue={terms ? nepalDateTimeInput(terms.endsAt) : undefined}
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
            label="Lifetime budget (NPR)"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            defaultValue={terms ? moneyInput(terms.budgetPaisa) : undefined}
            required
          />
        </fieldset>
        <p className="text-xs text-muted-foreground">
          Enter NPR and percentages with up to two decimal places. Dates use
          Nepal time (Asia/Kathmandu). Every campaign must have an end, finite
          usage limits and a lifetime budget. Saving a draft preserves live
          financial terms until publication.
        </p>
        <PromoCodeCostPreview
          feeWaiver={feeWaiver}
          terms={previewTerms}
          error={previewError}
          defaultCommissionBps={defaultCommissionBps}
          disabled={pending}
        />
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
          <p className="mt-2 text-xs text-muted-foreground">
            {action === 'draft'
              ? 'Save your edits as a draft, then publish them separately.'
              : action === 'publish'
                ? 'Publish the saved draft revision for new orders. Unsaved edits above are not included.'
                : 'Pause the published campaign for new orders. Unsaved edits above are not included.'}
          </p>
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
          <p className="text-xs text-muted-foreground">
            All usage times are shown in Nepal time (Asia/Kathmandu).
          </p>
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
              ? 60
              : undefined
        }
        max={props.type === 'number' ? Number.MAX_SAFE_INTEGER : undefined}
        {...props}
      />
    </div>
  );
}
