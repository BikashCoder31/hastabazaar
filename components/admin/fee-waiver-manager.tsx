'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { nepalDateTimeInput, parseNepalDateTime } from '@/lib/commission/rates';
import { commissionDate } from '@/lib/commission/reporting';
import {
  selectFeeWaiver,
  type FeeWaiverCampaign,
  type FeeWaiverCommand,
} from '@/lib/marketplace/fee-waivers';
import { feeWaiverDisplayState } from '@/lib/marketplace/fee-waiver-presentation';

type State = {
  revision: number;
  campaigns: FeeWaiverCampaign[];
  evaluatedAt: number;
};
const field =
  'mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 py-2';
export function FeeWaiverManager({ initialState }: { initialState: State }) {
  const [state, setState] = useState(initialState);
  const [now, setNow] = useState(initialState.evaluatedAt);
  const [editing, setEditing] = useState<FeeWaiverCampaign | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
    setStartsAt(c ? nepalDateTimeInput(c.startsAt) : '');
    setEndsAt(c ? nepalDateTimeInput(c.endsAt) : '');
    setError('');
    setNotice('');
  }
  async function refresh() {
    const response = await fetch('/api/admin/fee-waivers', {
      cache: 'no-store',
    });
    const result = (await response.json()) as State & { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'Refresh failed.');
    setState(result);
    setNow(result.evaluatedAt);
    return result as State;
  }
  async function mutate(command: FeeWaiverCommand) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/fee-waivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          expectedRevision: state.revision,
          requestId: crypto.randomUUID(),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (response.status === 409) {
        await refresh();
        edit(null);
        setError(
          'Campaigns changed. The list has been refreshed. Review the current campaigns and try again.',
        );
        return;
      }
      if (!response.ok)
        throw new Error(result.error ?? 'Campaign change failed.');
      await refresh();
      edit(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Campaign change failed.',
      );
    } finally {
      setBusy(false);
    }
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
  return (
    <div className="grid min-w-0 gap-6">
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
          Only one full waiver applies; overlapping waivers do not stack.
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
      <form
        data-form-id="staff.fee-waivers"
        onSubmit={save}
        className="grid min-w-0 gap-4 rounded-2xl border p-5"
        aria-label="Fee waiver campaign"
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
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            className={field}
            maxLength={1000}
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
          <Button className="min-h-11" disabled={busy} type="submit">
            {editing ? 'Save changes' : 'Save draft'}
          </Button>
          {editing ? (
            <Button
              className="min-h-11"
              type="button"
              variant="outline"
              disabled={busy}
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
          disabled={busy}
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
            <li key={c.id} className="min-w-0 space-y-3 rounded-2xl border p-5">
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
                      disabled={busy}
                      aria-label={`Edit ${c.name}`}
                      onClick={() => edit(c)}
                    >
                      Edit
                    </Button>
                    {c.state === 'draft' ? (
                      <Button
                        className="min-h-11"
                        type="button"
                        disabled={busy}
                        aria-label={`Publish ${c.name}`}
                        onClick={() =>
                          void mutate({ type: 'publish', campaignId: c.id })
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
                        disabled={busy}
                        aria-label={`Pause ${c.name}`}
                        onClick={() =>
                          void mutate({ type: 'pause', campaignId: c.id })
                        }
                      >
                        Pause
                      </Button>
                    ) : null}
                    {c.state === 'paused' ? (
                      <Button
                        className="min-h-11"
                        type="button"
                        disabled={busy}
                        aria-label={`Resume ${c.name}`}
                        onClick={() =>
                          void mutate({ type: 'resume', campaignId: c.id })
                        }
                      >
                        Resume
                      </Button>
                    ) : null}
                    <Button
                      className="min-h-11"
                      type="button"
                      variant="outline"
                      disabled={busy}
                      aria-label={`End ${c.name}`}
                      onClick={() =>
                        void mutate({ type: 'end', campaignId: c.id })
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
    </div>
  );
}
