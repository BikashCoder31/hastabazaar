'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Clock3, TriangleAlert } from 'lucide-react';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { AdminPageTitle } from '@/components/admin/page-help';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { FormGuide } from '@/components/forms/form-guide';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { payoutAmount, payoutDate } from '../workspace-data';
import type { PayoutRunData, PayoutRunRow } from './run-data';

const formId = 'staff.payout-2';
const baseFields = ['action', 'note', 'providerReference', 'idempotencyKey', 'formVersion', 'customAnswers'];
const panel = 'min-w-0 overflow-hidden rounded-[14px] border border-[#E4DACA] bg-white';
const buttonFocus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A8232E]';
const payoutCount = (count: number) => count + (count === 1 ? ' payout' : ' payouts');
const sumPaisa = (rows: readonly PayoutRunRow[]) => rows.reduce((sum, row) => sum + row.amountPaisa, 0);

function Metric({ label, value, detail, color = 'text-[#14213D]' }: { label: string; value: string | number; detail: string; color?: string }) {
  return <div className={panel + ' grid content-start gap-1 px-[14px] py-3.5 text-[13.5px] text-[#46536F] lg:px-[18px] lg:py-4'}>
    <dt>{label}</dt><dd className={color + ' break-words font-heading text-2xl font-medium leading-tight tracking-tight tabular-nums lg:text-[28px]'}>{value}</dd>
    <dd className="break-words">{detail}</dd>
  </div>;
}

type RunResult = { approved: number; uncertain: boolean; failed: { row: PayoutRunRow; error: string }[] };

export function PayoutRunWorkspace(data: PayoutRunData & { actorId: string; canApprove: boolean; canViewTransfers: boolean }) {
  const { actorId, rows, calendar, lastRun, canApprove, canViewTransfers } = data;
  const router = useRouter();
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set());
  const [reviewed, setReviewed] = useState<readonly PayoutRunRow[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef<string | null>(null);
  const noteId = useId();
  const bankHelpId = useId();
  const catalog = usePublishedFormConfig(formId, { enabled: canApprove && reviewed !== null, actorId });
  const passing = rows.filter(row => row.blocker === null && !completed.has(row.id));
  const blocked = rows.filter(row => row.blocker !== null);
  const selected = passing.filter(row => !excluded.has(row.id));
  const selectedTotal = payoutAmount(sumPaisa(selected));
  const allSelected = passing.length > 0 && selected.length === passing.length;
  const approveLabel = 'Approve ' + payoutCount(selected.length);
  const reviewLabel = 'Approve ' + payoutCount(reviewed?.length ?? 0);

  function toggleRow(id: string) {
    setExcluded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function approve(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canApprove || inFlight.current || !catalog.config || !catalog.canSubmit || !reviewed?.length) return;
    const submittedNote = new FormData(event.currentTarget).get('note');
    const note = typeof submittedNote === 'string' ? submittedNote.trim() : '';
    let configured: ReturnType<typeof configuredJsonPayload>;
    try {
      const answers = readConfiguredSubmission(event.currentTarget, catalog.config, baseFields).answers;
      configured = configuredJsonPayload(catalog.config, answers, baseFields);
      if (note.length < 8) throw new Error('Add an operational note of 8–1,000 characters.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Review the configured fields.');
      return;
    }

    attempt.current ??= crypto.randomUUID();
    const runId = attempt.current;
    inFlight.current = true;
    setError('');
    setPending(true);
    const approved: string[] = [];
    const failed: RunResult['failed'] = [];
    const uncertainRows: PayoutRunRow[] = [];
    try {
      for (const row of reviewed) {
        try {
          const response = await fetch('/admin/payouts/run/approve', {
            method: 'POST',
            headers: { 'content-type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
            body: JSON.stringify({ payoutId: row.id, review: row.review, runId, note, ...configured }),
          });
          const reply = await response.json().catch(() => null) as { ok?: boolean; error?: string; code?: string } | null;
          if (reply?.code === 'stale_version') catalog.handleSubmissionResponse(response, reply.code);
          if (!response.ok) {
            if (response.status >= 500) uncertainRows.push(row);
            failed.push({ row, error: reply?.error ?? 'Review this payout before retrying.' });
          } else if (reply?.ok === true) {
            approved.push(row.id);
          } else {
            uncertainRows.push(row);
            failed.push({ row, error: 'Approval was not confirmed. Check the payout history before retrying.' });
          }
        } catch {
          uncertainRows.push(row);
          failed.push({ row, error: 'Approval was not confirmed. Check the payout history before retrying.' });
        }
      }
      setCompleted(current => new Set([...current, ...approved]));
      setResult({ approved: approved.length, failed, uncertain: uncertainRows.length > 0 });
      setReviewed(uncertainRows.length ? uncertainRows : null);
      if (!uncertainRows.length) attempt.current = null;
      router.refresh();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <div className="grid min-w-0 gap-[18px]">
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1 basis-[26rem]">
        <AdminPageTitle><h1 className="break-words font-heading text-2xl leading-tight font-semibold tracking-tight lg:text-[28px]">Payout run · {calendar.runDay}</h1></AdminPageTitle>
        <p className="mt-1 text-[#46536F]">{canApprove ? 'Approve everything that passed its checks in one go.' : 'View payouts that are ready for the run.'} Cut-off {calendar.cutoffTime} Nepal time.</p>
      </div>
      <span className="inline-flex min-h-7 max-w-full items-center gap-2 rounded-full bg-[#F7E9C9] px-2.5 py-1 text-[13.5px] font-semibold text-[#754B08]">
        <Clock3 aria-hidden="true" className="size-4 shrink-0" /> Cut-off {calendar.cutoffDay}, {calendar.cutoffTime}
      </span>
    </div>

    <dl className={`grid min-w-0 gap-3.5 ${canApprove ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      <Metric label="Ready and passing checks" value={passing.length} detail={payoutAmount(sumPaisa(passing))} />
      {canApprove ? <Metric label="Selected to approve" value={selected.length} detail={selectedTotal} color="text-[#A8232E]" /> : null}
      <Metric label="Need a look first" value={blocked.length} detail="Won’t be included" color="text-[#815406]" />
      <Metric label="Last run" value={lastRun ? payoutDate(lastRun.at) : '—'}
        detail={lastRun ? payoutCount(lastRun.count) + ' · ' + payoutAmount(lastRun.amountPaisa) : 'No run approvals recorded'} />
    </dl>

    <section className={panel} aria-labelledby="ready-payout-run">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-2 sm:px-[18px]">
        <h2 id="ready-payout-run" className="font-bold">Ready and passing all checks</h2>
        {canApprove ? <button type="button" className={'min-h-11 rounded-full border border-[#D3C5AD] px-3 text-[13.5px] font-semibold text-[#46536F] hover:border-[#14213D] disabled:opacity-60 ' + buttonFocus}
          disabled={!passing.length || pending} onClick={() => setExcluded(new Set(allSelected ? passing.map(row => row.id) : []))}>
          {allSelected ? 'Clear all' : 'Select all'}
        </button> : null}
      </div>
      {passing.length ? <ul className="divide-y divide-[#E4DACA] border-t border-[#E4DACA]">
        {passing.map(row => {
          const Row = canApprove ? 'label' : 'div';
          return <li key={row.id}>
            <Row className={'grid min-h-[71px] min-w-0 grid-cols-[22px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 px-4 py-3 sm:px-[18px] md:grid-cols-[22px_minmax(0,1fr)_auto_minmax(7rem,auto)]' + (canApprove ? ' cursor-pointer has-[:disabled]:cursor-default' : '')}>
              {canApprove ? <>
                <input className="peer sr-only" type="checkbox" checked={!excluded.has(row.id)} onChange={() => toggleRow(row.id)} disabled={pending} aria-label={'Include ' + row.reference + ' for ' + row.seller} />
                <span aria-hidden="true" className="inline-grid size-[22px] place-items-center rounded-md border border-[#B9AC96] bg-white text-transparent peer-checked:border-[#14213D] peer-checked:bg-[#14213D] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#A8232E]"><Check className="size-4" /></span>
              </> : <span aria-hidden="true" />}
              <span className="col-span-2 min-w-0 break-words md:col-span-1">
                <strong className="block">{row.seller}</strong>
                <span className="block text-[13px] text-[#46536F]"><span className="font-mono text-[12px]">{row.reference}</span> · {row.orderCount} {row.orderCount === 1 ? 'order' : 'orders'} · {row.bankLabel}</span>
              </span>
              <span className="col-span-2 col-start-1 row-start-2 inline-flex min-h-6 w-fit items-center gap-1.5 rounded-full bg-[#E1EEE5] px-2.5 py-0.5 text-[13px] font-semibold text-[#236548] md:col-span-1 md:col-start-3 md:row-start-1"><Check aria-hidden="true" className="size-4 shrink-0" />4 checks passed</span>
              <strong className="col-start-3 row-start-2 ml-auto min-w-0 break-words text-right tabular-nums md:col-start-4 md:row-start-1">{payoutAmount(row.amountPaisa)}</strong>
            </Row>
          </li>;
        })}
      </ul> : <p className="border-t border-[#E4DACA] px-4 py-4 text-sm text-[#46536F] sm:px-[18px]">No prepared payouts are ready for this run.</p>}
    </section>

    <section className={panel} aria-labelledby="blocked-payout-run">
      <div className="px-4 py-3.5 sm:px-[18px]">
        <h2 id="blocked-payout-run" className="font-bold">Need a look first</h2>
        <p className="mt-1 text-[13.5px] text-[#46536F]">Open each one on its own. They won’t be paid in this run until fixed.</p>
      </div>
      {blocked.length ? <ul className="divide-y divide-[#E4DACA] border-t border-[#E4DACA]">
        {blocked.map(row => <li key={row.id}>
          <Link href={'/admin/payouts/' + encodeURIComponent(row.id)} className={'grid min-h-[71px] min-w-0 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-[#FFFCF7] sm:px-[18px] ' + buttonFocus} aria-label={'Open ' + row.reference + ' for ' + row.seller}>
            <TriangleAlert aria-hidden="true" className="size-[18px] text-[#A8232E]" />
            <span className="min-w-0 break-words"><strong className="block">{row.seller} · {payoutAmount(row.amountPaisa)}</strong>
              <span className="block text-[13px] text-[#46536F]">{row.blocker}</span></span>
            <span className="text-[13.5px] font-semibold text-[#A8232E] underline underline-offset-4">Open</span>
          </Link>
        </li>)}
      </ul> : <p className="border-t border-[#E4DACA] px-4 py-4 text-sm text-[#46536F] sm:px-[18px]">No payouts need a look first.</p>}
    </section>

    {result ? <section aria-label="Payout approval result" className={panel + ' space-y-2 p-4'} aria-live="polite">
      <p className="font-semibold">{payoutCount(result.approved)} approved.</p>
      {result.failed.length ? <ul className="space-y-1 break-words text-sm text-[#A8232E]">
        {result.failed.map(({ row, error: message }) => <li key={row.id}>
          <Link className="inline-flex min-h-11 items-center font-semibold underline" href={'/admin/payouts/' + encodeURIComponent(row.id)}>{row.reference} · {row.seller}</Link>{' '}{message}
        </li>)}
      </ul> : null}
    </section> : null}

    {canApprove ? <footer className="sticky bottom-[calc(var(--workspace-bottom-bar,0rem)+env(safe-area-inset-bottom))] z-10 -mx-3 mt-1 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 bg-[#14213D] px-3 py-3.5 text-white md:bottom-0 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="min-w-0 flex-1 basis-[15rem] break-words text-[14.5px]" aria-live="polite">
        <strong>{payoutCount(selected.length)} · {selectedTotal}</strong>{' '}
        <span className="text-[#C9D0DD]">Your approval is final. Each one is saved in its payout history.</span>
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2.5">
        <button type="button" disabled className="min-h-11 rounded-lg border border-white/30 px-3 text-sm font-semibold text-white/65" aria-describedby={bankHelpId}>Download bank file</button>
        <Dialog open={reviewed !== null} onOpenChange={next => {
          if (inFlight.current) return;
          setReviewed(next ? selected : null);
          setError('');
          if (!next) attempt.current = null;
        }}>
          <DialogTrigger type="button" disabled={!selected.length || pending}
            className="min-h-11 rounded-[10px] border border-transparent bg-[#A8232E] px-4 text-sm font-bold text-white hover:bg-[#8C1B25] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60">
            {approveLabel}
          </DialogTrigger>
          <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto border border-[#E4DACA] bg-white p-5 text-[#14213D] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl">{reviewLabel}?</DialogTitle>
              <DialogDescription className="text-[#46536F]">Review the {payoutAmount(sumPaisa(reviewed ?? []))} total and the bank details in the run. The review note and form answers are saved with each payout. Bank transfers take place separately.</DialogDescription>
            </DialogHeader>
            <form data-form-id={formId} onSubmit={event => { void approve(event); }} className="space-y-3">
              <FormGuide formId={formId} />
              <fieldset disabled={pending} className="min-w-0 space-y-3">
                <label htmlFor={noteId} className="font-semibold">Operational note</label>
                <textarea name="note" id={noteId} required minLength={8} maxLength={1000} rows={3} className="min-h-11 w-full rounded-lg border border-[#D3C5AD] px-3 py-2" />
                {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={baseFields} /> : null}
              </fieldset>
              {!catalog.canSubmit ? <output className="block text-sm text-[#A8232E]">{catalog.message || 'Loading form configuration…'}</output> : null}
              {catalog.status === 'stale' || catalog.status === 'unavailable' ? <button type="button" onClick={catalog.refresh} className="min-h-11 font-semibold underline" disabled={pending}>Refresh form</button> : null}
              {error ? <p role="alert" className="text-sm text-[#A8232E]">{error}</p> : null}
              {result?.uncertain && reviewed?.some(row => result.failed.some(failure => failure.row.id === row.id)) ? <output className="block text-sm text-[#A8232E]">Some approvals could not be confirmed. Keep the original answers to retry, or check their payout history.</output> : null}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={'min-h-11 rounded-lg bg-[#A8232E] px-3 font-semibold text-white disabled:opacity-60 ' + buttonFocus} disabled={pending || !reviewed?.length || !catalog.canSubmit}>
                  {pending ? 'Approving…' : reviewLabel}
                </button>
                <DialogClose type="button" className={'min-h-11 rounded-lg border border-[#D3C5AD] px-3 font-semibold ' + buttonFocus} disabled={pending}>Cancel</DialogClose>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <p id={bankHelpId} className="w-full text-[13px] leading-tight text-[#C9D0DD]">
        Bank file download is unavailable.{canViewTransfers ? <> <Link className="inline-flex min-h-11 items-center font-semibold text-white underline underline-offset-4" href="/admin/payments/payouts?returnTo=%2Fadmin%2Fpayouts%2Frun">Open verified payout transfers</Link></> : null}
      </p>
    </footer> : null}
  </div>;
}
