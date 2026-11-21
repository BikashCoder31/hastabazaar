'use client';

import { ArrowRight, CircleAlert, ClipboardList, FileText, ListFilter, Package, Store, Undo2, UserRound, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AdminPageTitle } from './page-help';
import { RecordedDateRangeFields } from './recorded-date-range-fields';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import {
  emptyTodayFilters, oldestAvailableTodayTask, readTodayFilters, todayQueue, todayTaskOverdue, todayViews,
  type TaskAssignment, type TodayFilters, type TodayTask, type TodayView,
} from './overview-today-model';
import { postReviewTaskAssignment, type ReviewTaskAssignment } from './review-task-assignment';
import { FirstCodConfirmation } from './first-cod-confirmation';
import { AdminOrderFulfillmentActions } from './order-fulfillment-actions';

const todayDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kathmandu',
});
const icons = { Today: ClipboardList, Orders: Package, Care: Undo2, Sellers: Store, Catalog: FileText, Money: Wallet, Settings: CircleAlert };
const countFormat = new Intl.NumberFormat('en-NP');
const pageSize = 20;
const dateFields = { from: { label: 'Opened from' }, to: { label: 'Opened through' } };
const filterKeys = { section: 'todaySection', type: 'todayType', from: 'todayFrom', to: 'todayTo' } as const;

function readTodayLimit(params: URLSearchParams) {
  const value = Number(params.get('todayRows'));
  return Number.isSafeInteger(value) && value > pageSize ? value : pageSize;
}

function ownerInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('en-NP');
}

function todayReturnTo(original: string, view: TodayView, filters: TodayFilters, anchor: string, visibleRows = pageSize) {
  const url = new URL(original, 'https://hastabazaar.invalid');
  if (view === 'action') url.searchParams.delete('todayView');
  else url.searchParams.set('todayView', view);
  for (const key of Object.keys(filterKeys) as (keyof TodayFilters)[]) {
    if (filters[key]) url.searchParams.set(filterKeys[key], filters[key]);
    else url.searchParams.delete(filterKeys[key]);
  }
  if (visibleRows > pageSize) url.searchParams.set('todayRows', String(visibleRows));
  else url.searchParams.delete('todayRows');
  return url.pathname + url.search + (anchor ? '#' + anchor : '');
}

function TodayFilterPopover({ tasks, filters, onApply }: {
  tasks: readonly TodayTask[]; filters: TodayFilters; onApply: (filters: TodayFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const sections = [...new Set(tasks.map(task => task.section))].sort();
  const types = [...new Set(tasks.filter(task => !draft.section || task.section === draft.section).map(task => task.type))].sort();
  const reversed = Boolean(draft.from && draft.to && draft.from > draft.to);
  const applied = Object.values(filters).filter(Boolean).length;
  return (
    <Popover open={open} onOpenChange={next => { if (next) setDraft(filters); setOpen(next); }}>
      <PopoverTrigger className="today-button min-h-11!" type="button">
        <ListFilter size={16} aria-hidden="true" /> Filters{applied ? ' (' + applied + ')' : ''}
      </PopoverTrigger>
      <PopoverContent align="end" className="today-filter-popover">
        <PopoverTitle>Filter tasks</PopoverTitle>
        <div className="today-filter-fields">
          <div>
            <label htmlFor="today-department">Department</label>
            <select id="today-department" value={draft.section} onChange={event => setDraft({ ...draft, section: event.target.value, type: '' })}>
              <option value="">All departments</option>
              {sections.map(section => <option key={section}>{section}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="today-type">Task type</label>
            <select id="today-type" value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}>
              <option value="">All task types</option>
              {types.map(type => <option key={type}>{type}</option>)}
            </select>
          </div>
        </div>
        <RecordedDateRangeFields idPrefix="today" from={draft.from} to={draft.to}
          fromField={dateFields.from} toField={dateFields.to} emptyDateHelp="No date limit."
          onDateChange={(bound, value) => setDraft(previous => ({ ...previous, [bound]: value }))} />
        {reversed ? <p role="alert">Choose an end date on or after the start date.</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="today-button" onClick={() => { onApply(emptyTodayFilters); setOpen(false); }}>Clear filters</button>
          <button type="button" className="today-button today-button-primary" disabled={reversed}
            onClick={() => { onApply(draft); setOpen(false); }}>Apply filters</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type TodayOverviewProps = {
  tasks: readonly TodayTask[];
  partialSources: readonly string[];
  actorId: string;
  firstName: string;
  observedAt: number;
  returnTo: string;
  metrics: ReactNode;
  sidebar: ReactNode;
};

export function TodayOverview({ tasks, partialSources, actorId, firstName, observedAt, returnTo, metrics, sidebar }: TodayOverviewProps) {
  const router = useRouter();
  const [{ view, filters }, setView] = useState(() => readTodayFilters(new URL(returnTo, 'https://hastabazaar.invalid').searchParams));
  const [limit, setLimit] = useState(() => readTodayLimit(new URL(returnTo, 'https://hastabazaar.invalid').searchParams));
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [draft, setDraft] = useState<{ targets: readonly (TaskAssignment & { id: string; title: string })[]; oldest: boolean } | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<ReviewTaskAssignment[]>([]);
  const [confirmed, setConfirmed] = useState<ReadonlyMap<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    function restore() {
      const params = new URLSearchParams(window.location.search);
      setView(readTodayFilters(params));
      setSelected([]);
      setLimit(readTodayLimit(params));
    }
    window.addEventListener('popstate', restore);
    return () => { mounted.current = false; window.removeEventListener('popstate', restore); };
  }, []);

  const currentTasks = useMemo(() => tasks.map(task => task.assignment && confirmed.get(task.id) === task.assignment.revision
    ? { ...task, ownerId: actorId } : task), [tasks, confirmed, actorId]);
  const open = currentTasks.filter(task => task.state !== 'done');
  const noOwner = open.filter(task => !task.ownerId && task.ownerKnown !== false).length;
  const queue = useMemo(() => todayQueue(currentTasks, actorId, observedAt, filters), [currentTasks, actorId, observedAt, filters]);
  const shown = queue[view];
  const selectedRows = shown.filter(task => selected.includes(task.id) && task.assignment && !task.ownerId);
  const oldest = useMemo(() => oldestAvailableTodayTask(currentTasks), [currentTasks]);
  const viewLabel = todayViews.find(([key]) => key === view)!;

  function update(nextView: TodayView, nextFilters: TodayFilters) {
    const href = todayReturnTo(window.location.pathname + window.location.search, nextView, nextFilters, '');
    window.history.replaceState(null, '', href);
    setView({ view: nextView, filters: nextFilters });
    setSelected([]);
    setLimit(pageSize);
  }

  function startAssignment(ids: readonly string[], oldest = false) {
    if (!ids.length || busy || pending.length) return;
    const targets = currentTasks.flatMap(task => ids.includes(task.id) && task.assignment && !task.ownerId
      ? [{ id: task.id, title: task.title, ...task.assignment }] : []);
    if (!targets.length) return;
    setReason('');
    setMessage('');
    setDraft({ targets, oldest });
    setAssignmentOpen(true);
  }

  function closeAssignment() {
    if (busy) return;
    setAssignmentOpen(false);
    if (!pending.length) setDraft(null);
  }

  async function assign() {
    if (!draft || inFlight.current) return;
    const commands = pending.length ? pending : draft.targets.flatMap(target => {
      if (!currentTasks.some(task => task.id === target.id && task.assignment && !task.ownerId)) return [];
      return [{
        taskId: target.taskId, ownerId: actorId, expectedRevision: String(target.revision),
        requestId: crypto.randomUUID(), reason,
      }];
    });
    if (!commands.length) {
      setDraft(null);
      setAssignmentOpen(false);
      setMessage('The selected work changed. Refreshing the available tasks.');
      router.refresh();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    const saved: ReviewTaskAssignment[] = [];
    const retry: ReviewTaskAssignment[] = [];
    const failures = !pending.length && commands.length < draft.targets.length ? ['Some selected tasks changed.'] : [];
    try {
      for (const command of commands) {
        try {
          const response = await postReviewTaskAssignment(actorId, command);
          if (!mounted.current) return;
          if (response.status === 401 || response.status === 403) {
            setPending([]);
            setReason('');
            setDraft(null);
            setAssignmentOpen(false);
            setMessage('Current task access changed. Refreshing the permitted workspace.');
            router.refresh();
            return;
          }
          if (response.status === 200 && response.result?.ok === true) saved.push(command);
          else {
            const error = response.result?.error;
            if (response.status >= 500 || response.ok || pending.length) retry.push(command);
            if (typeof error === 'string') failures.push(error);
            else if (!response.ok && response.status < 500) failures.push('Refresh the task and try again.');
          }
        } catch {
          if (!mounted.current) return;
          retry.push(command);
        }
      }
      setConfirmed(previous => new Map([...previous, ...saved.map(command => [command.taskId, Number(command.expectedRevision)] as const)]));
      setSelected(previous => previous.filter(id => !saved.some(command => command.taskId === id)));
      setPending(retry);
      const savedText = saved.length ? `${saved.length} ${saved.length === 1 ? 'task' : 'tasks'} assigned to you.` : '';
      setMessage([savedText, ...new Set(failures), retry.length ? 'Some assignments could not be confirmed. Retry the same requests.' : ''].filter(Boolean).join(' '));
      if (!retry.length) {
        if (draft.oldest && saved.length) update('mine', emptyTodayFilters);
        setDraft(null);
        setAssignmentOpen(false);
        setReason('');
        router.refresh();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="today-overview">
      <header className="today-heading">
        <div>
          <AdminPageTitle><h1 className="max-lg:text-[2rem]! max-md:text-[1.65rem]!">{firstName ? 'Good morning, ' + firstName : 'Good morning'}</h1></AdminPageTitle>
          <p>{todayDate.format(observedAt)} <span aria-hidden="true">·</span>{' '}
            <strong>{countFormat.format(open.length)} {open.length === 1 ? 'task' : 'tasks'} open</strong>, {countFormat.format(noOwner)} with no owner yet
          </p>
        </div>
        <button type="button" className="today-button today-button-primary min-h-11!" disabled={!oldest || busy || pending.length > 0}
          onClick={() => { if (oldest) startAssignment([oldest.id], true); }}>
          Take the oldest task <ArrowRight size={16} aria-hidden="true" />
        </button>
      </header>
      {metrics}
      <div className="today-grid">
        <section id="seller-review-queue" className="today-panel today-queue" aria-labelledby="today-tasks-heading">
          <div className="today-queue-header">
            <h2 id="today-tasks-heading">Tasks</h2>
            <fieldset className="today-chips min-w-0" aria-label="Task views">
              {todayViews.filter(([key]) => key === 'action' || queue[key].length).map(([key, label]) => (
                <button type="button" key={key} aria-pressed={view === key} className="min-h-11!"
                  onClick={() => update(key, filters)}>{label} <span>{countFormat.format(queue[key].length)}</span></button>
              ))}
            </fieldset>
            <TodayFilterPopover tasks={currentTasks} filters={filters} onApply={next => update(view, next)} />
          </div>
          {selectedRows.length ? <div className="today-selection">
            <strong>{countFormat.format(selectedRows.length)} selected</strong>
            <button type="button" className="today-button" disabled={busy || pending.length > 0}
              onClick={() => startAssignment(selectedRows.map(task => task.id))}>Assign to me</button>
            <button type="button" className="today-button" onClick={() => setSelected([])}>Clear</button>
          </div> : null}
          {message && !assignmentOpen ? <div className="today-queue-notice">
            <output>{message}</output>
            {pending.length ? <button type="button" className="today-button ms-2" onClick={() => setAssignmentOpen(true)}>Resume assignment</button> : null}
          </div> : null}
          {partialSources.length ? <output className="today-queue-notice">Some work could not be counted. {partialSources.join(' · ')}.</output> : null}
          {shown.length ? (
            <ul className="today-list">
              {shown.slice(0, limit).map(task => {
                const late = todayTaskOverdue(task, observedAt);
                const canAssign = Boolean(task.assignment && !task.ownerId && !busy && !pending.length);
                const Icon = task.section === 'Sellers' && task.type === 'Documents' ? FileText : icons[task.section];
                const anchor = 'today-task-' + encodeURIComponent(task.id);
                const href = withAdminReturnTo(task.href, todayReturnTo(returnTo, view, filters, anchor, limit));
                const ownedByMe = task.ownerId === actorId;
                const owner = ownedByMe ? 'You' : task.ownerId ? task.ownerName ?? 'Assigned' : 'Unassigned';
                const initials = ownerInitials(task.ownerName ?? (ownedByMe ? firstName : ''));
                return <li key={task.id} id={'today-task-' + task.id} className="today-task">
                  <label className="-ms-2.5 grid size-11 place-items-center">
                    <input type="checkbox" aria-label={'Select ' + task.title} disabled={!canAssign}
                      className="size-[1.2rem] accent-[#14213D] disabled:opacity-40"
                      checked={selected.includes(task.id) && !task.ownerId}
                      onChange={event => setSelected(previous => event.target.checked ? [...previous, task.id] : previous.filter(id => id !== task.id))} />
                  </label>
                  <span className="today-task-icon" data-overdue={late}><Icon size={18} aria-hidden="true" /></span>
                  <div className="today-task-copy">
                    <p className="today-task-meta">{task.section} · {task.type}
                      {late ? <span className="today-overdue">Overdue</span> : null}
                    </p>
                    <h3>{task.title}</h3>
                    <p className="today-task-context">{task.context}</p>
                  </div>
                  <div className="today-owner">
                    <span className="today-owner-pill">
                      {task.ownerId ? <span aria-hidden="true" className="today-owner-avatar">{initials || <UserRound size={12} />}</span> : null}
                      {owner}
                    </span>
                    {task.assignment && !task.ownerId ? <button type="button" className="min-h-11" disabled={!canAssign} onClick={() => startAssignment([task.id])}>Assign to me</button> : null}
                  </div>
                  {task.codConfirmationOrderId ? (
                    <div className="today-task-action flex min-w-0 max-w-52 flex-col items-start gap-2">
                      <FirstCodConfirmation orderId={task.codConfirmationOrderId} actorId={actorId} compact />
                      <AdminOrderFulfillmentActions orderId={task.codConfirmationOrderId} status="confirmed" codNotConfirmedActorId={actorId} />
                    </div>
                  ) : (
                    <Link className="today-button today-task-action min-h-11!" href={href} data-review-open>{task.action}</Link>
                  )}
                </li>;
              })}
            </ul>
          ) : <div className="today-empty" aria-live="polite">
            <h3>{partialSources.length ? 'No matching tasks in the available records' : viewLabel[2]}</h3>
            {!partialSources.length && viewLabel[3] ? <p>{viewLabel[3]}</p> : null}
          </div>}
          {shown.length > limit ? <div className="today-more"><button type="button" className="today-button"
            onClick={() => setLimit(previous => previous + pageSize)}>Show more tasks</button></div> : null}
        </section>
        {sidebar}
      </div>
      <Dialog open={assignmentOpen} onOpenChange={next => { if (!next) closeAssignment(); }}>
        <DialogContent className="today-assignment-dialog" showCloseButton={!busy}>
          <DialogTitle>{draft?.oldest ? 'Take the oldest task' : 'Assign to me'}</DialogTitle>
          <DialogDescription>{draft?.targets.length === 1
            ? draft.targets[0].title
            : `Assign ${draft?.targets.length ?? 0} selected tasks to yourself.`}</DialogDescription>
          <label className="today-assignment-reason">Assignment reason
            <textarea value={reason} maxLength={1000} disabled={busy || pending.length > 0}
              onChange={event => setReason(event.target.value)} />
          </label>
          <p className="text-sm">Enter at least 10 characters. This reason is saved with the assignment.</p>
          {message ? <output className="block">{message}</output> : null}
          <DialogFooter>
            <button type="button" className="today-button" disabled={busy} onClick={closeAssignment}>{pending.length ? 'Return to tasks' : 'Cancel'}</button>
            <button type="button" className="today-button today-button-primary"
              disabled={busy || (!pending.length && reason.trim().length < 10)} onClick={() => void assign()}>
              {busy ? 'Assigning…' : pending.length ? 'Retry the same assignment' : 'Assign to me'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
