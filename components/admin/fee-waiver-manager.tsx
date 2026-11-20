'use client';

import { useEffect, useState } from 'react';
import {useCommercialScope,CommercialRecovery,checkCommercialOutcome} from '@/components/admin/commercial-recovery';
import type { CommercialOutcome } from '@/lib/admin/commercial-outcome';
import {FinanceAccessNotice} from '@/components/admin/finance-access-notice';
import {getOrCreateSessionAttempt,clearSessionAttempt,sessionAttemptKey} from '@/lib/forms/client-attempt';
import {notifySessionReference,useSessionReference} from '@/hooks/use-session-reference';
import { Button } from '@/components/ui/button';
import { nepalDateTimeInput, parseNepalDateTime } from '@/lib/commission/rates';
import { commissionDate } from '@/lib/commission/reporting';
import {
  selectFeeWaiver,
  validateFeeWaiverInstant,
  validateFeeWaiverTerms,
  type FeeWaiverCampaign,
  type FeeWaiverCommand,
} from '@/lib/marketplace/fee-waivers';
import { feeWaiverDisplayState } from '@/lib/marketplace/fee-waiver-presentation';

type State = {
  feeTarget: 'customer_service_fee';
  revision: number;
  campaigns: FeeWaiverCampaign[];
  evaluatedAt: number;
};
function verifyCampaignSnapshot(state: State | null): asserts state is State {
  const invalid = 'The current campaigns could not be verified. Your draft is retained.';
  if (
    state?.feeTarget !== 'customer_service_fee' ||
    !Array.isArray(state.campaigns) ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0
  ) throw new Error(invalid);

  const ids = new Set<string>();
  try {
    validateFeeWaiverInstant(state.evaluatedAt);
    if (state.evaluatedAt > 8_640_000_000_000_000) throw new Error(invalid);
    for (const campaign of state.campaigns) {
      validateFeeWaiverTerms(campaign);
      if (
        typeof campaign.id !== 'string' || !campaign.id.trim() || campaign.id.length > 191 ||
        ids.has(campaign.id) ||
        !Number.isSafeInteger(campaign.revision) || campaign.revision < 1 || campaign.revision > state.revision ||
        !['draft', 'published', 'paused', 'ended'].includes(campaign.state) ||
        campaign.endsAt > 253402280099999
      ) throw new Error(invalid);
      ids.add(campaign.id);
    }
  } catch {
    throw new Error(invalid);
  }
}
const field =
  'mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 py-2';
type FeeWaiverManagerProps={actorId:string;initialState:State;legacyHistory?:{revision:number;campaigns:FeeWaiverCampaign[]}};
export function FeeWaiverManager(props:FeeWaiverManagerProps){return <FeeWaiverManagerScope key={props.actorId} {...props}/>;}
function FeeWaiverManagerScope({actorId, initialState, legacyHistory}:FeeWaiverManagerProps) {
  const scope=useCommercialScope(actorId),attemptKey=sessionAttemptKey('staff.fee-waivers',actorId+':campaigns'),[retained,setRetained]=useState<{feeTarget:string;command:FeeWaiverCommand;expectedRevision:number;requestId:string;reason:string}|null>(null);
  const originalReference = useSessionReference(attemptKey);
  const pendingOriginal = originalReference !== null;
  const [checkedAttempt, setCheckedAttempt] = useState<string | null>(null);
  const [checkingOutcome, setCheckingOutcome] = useState(false);
  const canStartReview = retained !== null &&
    retained.feeTarget === 'customer_service_fee' &&
    retained.requestId === originalReference &&
    retained.requestId === checkedAttempt &&
    Number.isSafeInteger(retained.expectedRevision) &&
    retained.expectedRevision >= 0;
  const [state, setState] = useState(initialState);
  const [now, setNow] = useState(initialState.evaluatedAt);
  const [editing, setEditing] = useState<FeeWaiverCampaign | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const[reason,setReason]=useState(''),[review,setReview]=useState<{command:FeeWaiverCommand;revision:number;at:number;reason:string;winner:string|null;target:FeeWaiverCampaign}|null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Windows can change without an operator mutation. Keep the active list current.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const active = state.campaigns.filter(
    (c) => feeWaiverDisplayState(c, now) === 'active',
  );
  const selected = selectFeeWaiver(state.campaigns, now);
  function edit(c: FeeWaiverCampaign | null) {
    setEditing(c);
    setName(c?.name ?? '');
    setDescription(c?.description ?? '');
    setReason('');setReview(null);
    setStartsAt(c ? nepalDateTimeInput(c.startsAt) : '');
    setEndsAt(c ? nepalDateTimeInput(c.endsAt) : '');
    setError('');
    setNotice('');
  }
  async function refresh() {
    const response = await fetch('/api/admin/customer-fee-waivers', {
      cache: 'no-store',
      headers:scope.headers,
    });
    const result = (await response.json().catch(() => null)) as (State & { error?: string }) | null;
    if(!scope.current())throw new Error('Original actor view closed.');scope.observe(response);
    if (response.status === 401 || response.status === 403) setCheckedAttempt(null);
    if (!response.ok) throw new Error(result?.error ?? 'Refresh failed.');
    verifyCampaignSnapshot(result);
    setState(result);
    setNow(result.evaluatedAt);
    return result;
  }
  async function mutate(command: FeeWaiverCommand,reviewed?:{revision:number;reason:string}) {
    if (busy || checkingOutcome) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const originalReason=retained?.reason??reviewed?.reason??reason.trim();if(originalReason.length<10||originalReason.length>1000)throw new Error('Explain this exact decision in 10–1,000 characters.');
      if(!retained&&(pendingOriginal||sessionStorage.getItem(attemptKey)!==null))throw new Error('Check the original saved outcome before creating a different action.');
      if(retained&&JSON.stringify(retained.command)!==JSON.stringify(command))throw new Error('The original action is pending. Keep this draft and check its saved outcome before different work.');
      if (retained && sessionStorage.getItem(attemptKey) !== retained.requestId)
        throw new Error('The original action reference changed. Check its saved outcome again.');
      const body=retained??{feeTarget:'customer_service_fee',command,expectedRevision:reviewed?.revision??state.revision,requestId:getOrCreateSessionAttempt(attemptKey),reason:originalReason};
      setRetained(body);notifySessionReference(attemptKey);setCheckedAttempt(null);
      const response = await fetch('/api/admin/customer-fee-waivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',...scope.headers },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as { error?: string };
      if(!scope.current())return;scope.observe(response);
      if (response.status === 409) {
        await refresh();
        setError(
          'Campaigns changed. Your draft is retained. Check the original saved outcome, then review the current source before different work.',
        );
        return;
      }
      if (!response.ok)
        throw new Error(result?.error ?? 'Campaign change failed.');
      const saved=(result as {campaign?:Partial<FeeWaiverCampaign>}|null)?.campaign;
      if(!saved||typeof saved.id!=='string'||!saved.id||!Number.isSafeInteger(saved.revision)||!saved.state||!['draft','published','paused','ended'].includes(saved.state)||(command.type!=='create'&&saved.id!==command.campaignId))throw new Error('The campaign result could not be verified. Keep its original reference and check the saved outcome.');
      clearSessionAttempt(attemptKey);setRetained(null);notifySessionReference(attemptKey);
      await refresh();
      if(!scope.current())return;
      edit(null);
    } catch (caught) {
      if(scope.current())setError(
        caught instanceof Error ? caught.message : 'Campaign change failed.',
      );
    } finally {
      if(scope.current())setBusy(false);
    }
  }
  async function reviewAction(command:FeeWaiverCommand){
   if(busy||pendingOriginal)return;setBusy(true);setError('');try{
    if(reason.trim().length<10||reason.trim().length>1000)throw new Error('Explain the exact decision in 10–1,000 characters before reviewing it.');
    const fresh=await refresh();if(!scope.current())return;if(command.type==='create'||command.type==='revise')throw new Error('Save and review this draft before publication.');
    const target=fresh.campaigns.find(c=>c.id===command.campaignId);if(!target)throw new Error('The original campaign is unavailable.');const nextState=command.type==='pause'?'paused':command.type==='end'?'ended':'published';
    const projected=fresh.campaigns.map(c=>c.id===target.id?{...c,state:nextState as FeeWaiverCampaign['state']}:c),winner=selectFeeWaiver(projected,fresh.evaluatedAt);
    setReview({command,revision:fresh.revision,at:fresh.evaluatedAt,reason:reason.trim(),winner:winner?.name??null,target});
   }catch(error){if(scope.current())setError((error as Error).message);}finally{if(scope.current())setBusy(false);}
  }
  function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const terms = {
        name,
        description,
        startsAt:
          editing && startsAt === nepalDateTimeInput(editing.startsAt)
            ? editing.startsAt
            : parseNepalDateTime(startsAt),
        endsAt:
          editing && endsAt === nepalDateTimeInput(editing.endsAt)
            ? editing.endsAt
            : parseNepalDateTime(endsAt),
      };
      if (terms.endsAt <= terms.startsAt)
        throw new Error('The end must be after the start.');
      void mutate(
        editing
          ? { type: 'revise', campaignId: editing.id, terms }
          : { type: 'create', terms },
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Review the campaign dates.',
      );
    }
  }
  function requireOriginal(reference: string) {
    if (sessionStorage.getItem(attemptKey) !== reference) {
      setCheckedAttempt(null);
      throw new Error('The original action reference changed. Check its saved outcome again.');
    }
  }

  function clearOriginal(reference: string) {
    requireOriginal(reference);
    clearSessionAttempt(attemptKey);
    if (sessionStorage.getItem(attemptKey) !== null)
      throw new Error('The original action reference could not be cleared.');
    setRetained(null);
    setCheckedAttempt(null);
    notifySessionReference(attemptKey);
  }

  function recoverCommitted(outcome: CommercialOutcome, reference: string, fresh: State) {
    if (!fresh.campaigns.some(campaign => campaign.id === outcome.sourceId))
      throw new Error('The original campaign is missing from the current source. Keep its reference and refresh.');
    clearOriginal(reference);
    edit(null);
    setNotice('Original committed campaign action confirmed. Review its current source before another action.');
  }

  async function startReviewedAttempt() {
    if (busy || checkingOutcome || !canStartReview || !retained) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { requestId, expectedRevision } = retained;
      requireOriginal(requestId);
      const fresh = await refresh();
      if (!scope.current()) return;
      requireOriginal(requestId);
      // Every commit increments the shared revision and writes its receipt in the same
      // CAS batch. Once the shared revision passes this request's CAS, it cannot commit.
      if (fresh.revision <= expectedRevision)
        throw new Error('The original action is still able to commit. Keep its reference or retry it unchanged.');

      const outcome = await checkCommercialOutcome(actorId, 'waiver', requestId, scope, () => {
        setCheckedAttempt(null);
        scope.deny();
      });
      if (!scope.current()) return;
      requireOriginal(requestId);
      if (outcome) {
        recoverCommitted(outcome, requestId, fresh);
        return;
      }

      clearOriginal(requestId);
      if (editing && !fresh.campaigns.some(c => c.id === editing.id && c.revision === editing.revision)) {
        edit(null);
        setNotice('Current campaigns reloaded. Reopen the changed campaign and review its current terms.');
      } else {
        setReview(null);
        setReason('');
        setNotice('Current campaigns reloaded. Review the current source and enter a fresh decision reason.');
      }
    } catch (caught) {
      if (scope.current()) setError((caught as Error).message);
    } finally {
      if (scope.current()) setBusy(false);
    }
  }

  async function reviewCommitted(outcome: CommercialOutcome, reference: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const fresh = await refresh();
      if (scope.current()) recoverCommitted(outcome, reference, fresh);
    } catch (caught) {
      if (scope.current()) setError((caught as Error).message);
    } finally {
      if (scope.current()) setBusy(false);
    }
  }

  const recovery = <CommercialRecovery
    actorId={actorId}
    kind="waiver"
    attemptKey={attemptKey}
    disabled={busy}
    onCheckingChange={checking => {
      setCheckingOutcome(checking);
      if (checking) setCheckedAttempt(null);
    }}
    onNoOutcome={setCheckedAttempt}
    onDenied={scope.deny}
    onReauthorized={scope.reauthorize}
    onRecovered={(outcome, reference) => void reviewCommitted(outcome, reference)}
  />;
  if(scope.accessDenied)return <div className="space-y-3"><FinanceAccessNotice message={error}/>{recovery}</div>;
  return (
    <div className="grid min-w-0 gap-6">
      {pendingOriginal ? <div className="space-y-2">
        {recovery}
        {retained ? <button type="button" disabled={busy || checkingOutcome} className="rounded border px-3 py-2" onClick={() => void mutate(retained.command)}>Retry unchanged original action</button> : null}
        {canStartReview ? <button type="button" disabled={busy || checkingOutcome} className="rounded border px-3 py-2" onClick={() => void startReviewedAttempt()}>Start a new reviewed attempt</button> : null}
      </div> : null}
      {review?<section aria-label="Review exact customer-fee-waiver action" className="space-y-3 rounded-xl border p-4"><h2 className="text-xl">Review {review.command.type} · {review.target.name}</h2><p>Customer marketplace-fee target only. Funding is fee revenue foregone; seller commission, product prices and delivery remain unchanged. No positive fee or saving is assumed when its source is disabled, zero or unavailable.</p><p>Original campaign revision {review.target.revision} · shared source revision {review.revision}. Window {commissionDate(review.target.startsAt)} to {commissionDate(review.target.endsAt)} Nepal time.</p><p>At the server-observed time {commissionDate(review.at)}, the winning campaign after this action would be: {review.winner??'none currently active'}. Overlapping campaigns do not stack; pausing one does not necessarily stop another. Scheduled windows retain their original dates.</p><p className="whitespace-pre-wrap break-words">Decision reason: {review.reason}</p><Button type="button" disabled={busy||pendingOriginal} onClick={()=>void mutate(review.command,{revision:review.revision,reason:review.reason})}>Confirm reviewed {review.command.type}</Button><Button type="button" variant="outline" disabled={busy||pendingOriginal} onClick={()=>setReview(null)}>Keep editing</Button></section>:null}
      <section
        className="rounded-2xl border p-5"
        aria-labelledby="active-waivers"
      >
        <h2 id="active-waivers" className="font-heading text-2xl">
          Active campaigns
        </h2>
        <p className="mt-2 text-sm">
          {active.length} active.{' '}
          {selected
            ? `Applying: ${selected.name}.`
            : 'No campaign is applying.'}{' '}
          Only one full customer service fee waiver applies; overlapping waivers do not stack.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {active.map((c) => (
            <li key={c.id} className="break-words">
              {c.name}
              {c.id === selected?.id
                ? ' · Applies to new eligible orders'
                : ' · Overlaps; remains active'}
            </li>
          ))}
        </ul>
      </section>
      <label className="block">Decision and audit reason<textarea className={field} value={reason} onChange={event=>setReason(event.target.value)} minLength={10} maxLength={1000} disabled={busy||pendingOriginal||review!==null}/></label>
      <form
        data-form-id="staff.fee-waivers"
        onSubmit={save}
        className="grid min-w-0 gap-4 rounded-2xl border p-5"
        aria-label="Customer service fee waiver campaign"
      >
        <h2 className="font-heading text-2xl">
          {editing ? 'Edit campaign' : 'New campaign'}
        </h2>
        <label>
          Campaign name
          <input
            className={field}
            required
            maxLength={100}
            disabled={busy||pendingOriginal||review!==null}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            className={field}
            maxLength={1000}
            disabled={busy||pendingOriginal||review!==null}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0">
            Starts at (Nepal time)
            <input
              className={field + ' min-w-0'}
              type="datetime-local"
              required
              disabled={busy||pendingOriginal||review!==null}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="min-w-0">
            Ends at (Nepal time)
            <input
              className={field + ' min-w-0'}
              type="datetime-local"
              required
              disabled={busy||pendingOriginal||review!==null}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          All times use Nepal time (UTC+05:45). The end time is exclusive. Save
          a draft, then publish to start or schedule the waiver.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button className="min-h-11" disabled={busy||pendingOriginal||review!==null} type="submit">
            {editing ? 'Save changes' : 'Save draft'}
          </Button>
          {editing ? (
            <Button
              className="min-h-11"
              type="button"
              variant="outline"
              disabled={busy||pendingOriginal||review!==null}
              onClick={() => edit(null)}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>
      {notice ? <output className="block break-words text-sm text-muted-foreground">{notice}</output> : null}
      {error ? (
        <p role="alert" className="break-words text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div aria-live="polite" className="text-sm">
        {busy ? 'Saving campaign change…' : ''}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">All campaigns</h2>
        <Button
          className="min-h-11"
          type="button"
          variant="outline"
          disabled={busy||pendingOriginal||review!==null}
          onClick={() => {
            setBusy(true);
            setError('');
            setNotice('');
            void refresh()
              .then(() => {
                if (editing) {
                  edit(null);
                  setNotice('Campaigns refreshed. Your unsaved edit was cleared. Reopen the campaign to review its current details before editing again.');
                }
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Refresh campaigns
        </Button>
      </div>
      <ul className="grid min-w-0 gap-4">
        {state.campaigns.map((c) => {
          const status = feeWaiverDisplayState(c, now);
          return (
            <li key={c.id} id={'fee-waiver-'+c.id} className="min-w-0 scroll-mt-6 space-y-3 rounded-2xl border p-5">
              <h3 className="break-words font-semibold">
                {c.name} · {status}
              </h3>
              <p className="whitespace-pre-wrap break-words text-sm">
                {c.description}
              </p>
              <p className="text-sm">
                {commissionDate(c.startsAt)} – {commissionDate(c.endsAt)} (Nepal
                time)
              </p>
              {status === 'active' && active.length > 1 ? (
                <p className="text-sm">
                  Pausing this campaign will not stop other active campaigns.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {status !== 'ended' ? (
                  <>
                    <Button
                      className="min-h-11"
                      type="button"
                      variant="outline"
                      disabled={busy||pendingOriginal||review!==null}
                      aria-label={`Edit ${c.name}`}
                      onClick={() => edit(c)}
                    >
                      Edit
                    </Button>
                    {c.state === 'draft' ? (
                      <Button
                        className="min-h-11"
                        type="button"
                        disabled={busy||pendingOriginal||review!==null}
                        aria-label={`Publish ${c.name}`}
                        onClick={() =>
                          void reviewAction({ type: 'publish', campaignId: c.id })
                        }
                      >
                        Publish / schedule
                      </Button>
                    ) : null}
                    {c.state === 'published' ? (
                      <Button
                        className="min-h-11"
                        type="button"
                        variant="outline"
                        disabled={busy||pendingOriginal||review!==null}
                        aria-label={`Pause ${c.name}`}
                        onClick={() =>
                          void reviewAction({ type: 'pause', campaignId: c.id })
                        }
                      >
                        Pause
                      </Button>
                    ) : null}
                    {c.state === 'paused' ? (
                      <Button
                        className="min-h-11"
                        type="button"
                        disabled={busy||pendingOriginal||review!==null}
                        aria-label={`Resume ${c.name}`}
                        onClick={() =>
                          void reviewAction({ type: 'resume', campaignId: c.id })
                        }
                      >
                        Resume
                      </Button>
                    ) : null}
                    <Button
                      className="min-h-11"
                      type="button"
                      variant="outline"
                      disabled={busy||pendingOriginal||review!==null}
                      aria-label={`End ${c.name}`}
                      onClick={() =>
                        void reviewAction({ type: 'end', campaignId: c.id })
                      }
                    >
                      End
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {legacyHistory ? <section className="space-y-3 rounded-2xl border p-5" aria-labelledby="legacy-fee-history">
        <h2 id="legacy-fee-history" className="font-heading text-2xl">Historical seller commission campaigns</h2>
        <p className="text-sm text-muted-foreground">Read-only history. These campaigns cannot affect new orders. Original order fee evidence and accepted commission terms stay recorded.</p>
        <ul className="space-y-3">{legacyHistory.campaigns.map(c=><li key={c.id} className="space-y-1 text-sm">
          <h3 className="break-words font-semibold">{c.name} · {c.state}</h3>
          <p className="whitespace-pre-wrap break-words">{c.description}</p>
          <p>{commissionDate(c.startsAt)} – {commissionDate(c.endsAt)} (Nepal time)</p>
        </li>)}</ul>
        {legacyHistory.campaigns.length === 0 ? <p className="text-sm">No historical seller commission campaigns.</p> : null}
      </section> : null}
    </div>
  );
}
