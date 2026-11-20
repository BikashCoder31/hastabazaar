'use client';
import Link from 'next/link';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import {useIncidentCommand} from './use-incident-command';
import {StaffReviewAccessBoundary,useDenyStaffReview} from './staff-review-access-boundary';
import type {
  listIncidents,
  readIncident,
  listLegacyIncidentMappings,
} from '@/lib/operations/incident-review';
type Row = Awaited<ReturnType<typeof listIncidents>>[number];
type Detail = Awaited<ReturnType<typeof readIncident>>;
type Legacy = Awaited<ReturnType<typeof listLegacyIncidentMappings>>[number];
const timestamp = (value: number | null) =>
  value === null
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-NP', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'Asia/Kathmandu',
      }).format(value) + ' Nepal time';
const control = 'mt-1 min-h-11 w-full min-w-0 rounded-md border bg-background px-3 py-2';
const recordLink = 'inline-flex min-h-11 max-w-full items-center font-semibold underline underline-offset-4';
type IncidentProps = {
  actorId:string;
  rows: Row[];
  detail: Detail | null;
  legacy: Legacy[];
  responders: { id: string; name: string }[];
  manage: boolean;
  canAct: boolean;
  superAdmin: boolean;
  initialLegacyId?: string;
  initialReport?: boolean;
  returnTo?:string;
};
export function IncidentWorkspace(props:IncidentProps){
 const identity=JSON.stringify([props.actorId,props.detail?.id??"new",props.initialLegacyId??""]);
 return <StaffReviewAccessBoundary key={identity} actorId={props.actorId} sourceId={identity}><OwnedIncidentWorkspace {...props}/></StaffReviewAccessBoundary>;
}
function OwnedIncidentWorkspace({
  actorId,
  rows,
  detail,
  legacy,
  responders,
  manage,
  canAct,
  superAdmin,
  initialLegacyId,
  initialReport,
  returnTo,
}: IncidentProps) {
  const returnHref=safeAdminReturnTo(returnTo,'/admin/system-health'),incidentHref=(id:string)=>withAdminReturnTo('/admin/system-health/incidents?incident='+encodeURIComponent(id),returnHref),currentHref=detail?incidentHref(detail.id):withAdminReturnTo('/admin/system-health/incidents',returnHref);
  const denyParent=useDenyStaffReview(),router=useRouter(),form=usePublishedFormConfig('staff.incident-review',{enabled:manage,actorId,onAccessDenied:denyParent});
  const command=useIncidentCommand(actorId,JSON.stringify([detail?.id??'new',initialLegacyId??'']),(id,recovered)=>{if(!recovered)router.push(incidentHref(id));},response=>{form.handleSubmissionResponse(response,'stale_version');});
  const [message,setMessage]=useState(''),[requestedAction,setAction]=useState('assign'),[createAction,setCreateAction]=useState(initialLegacyId?'legacy_map':'create');
  const [reviewedVersion,setReviewedVersion]=useState(detail?.version??null),changed=(detail?.version??null)!==reviewedVersion;
  const busy = command.busy;
  const reportSummary = useRef<HTMLElement>(null);
  useEffect(() => {
    if (initialReport) reportSummary.current?.focus();
  }, [initialReport]);
  const action =
    !superAdmin && (requestedAction === 'assign' || detail?.ownerId === null)
      ? 'acknowledge'
      : requestedAction;
  async function save(event: SyntheticEvent<HTMLFormElement>, creating:boolean, submittedAt:number) {
    event.preventDefault();
    if (busy || command.blocked || changed || !form.canSubmit || !form.config) return;
    const element = event.currentTarget,
      values = new FormData(element),
      operation = creating ? createAction : action;
    const payload: Record<string, unknown> = {
      action: operation,
      expectedRevision: creating ? null : detail!.version,
      formVersion: form.config.version,
      customAnswers: [],
    };
    const fields = creating
      ? [
          'title',
          'impactSummary',
          'impactClass',
          'severity',
          'serviceKey',
          'failureSignature',
          'releaseReference',
          'configurationReference',
        ]
      : operation === 'assign'
        ? ['ownerId', 'backupId', 'reason']
        : operation === 'plan'
          ? ['plan', 'nextAction', 'nextUpdateAt', 'reason']
          : operation === 'update'
            ? ['nextAction', 'nextUpdateAt', 'reason']
            : operation === 'severity'
              ? ['severity', 'reason']
              : operation === 'impact'
                ? ['impactClass', 'impactSummary', 'reason']
                : operation === 'resolve'
                  ? ['resolutionCause', 'reason']
                  : operation === 'link'
                    ? ['sourceType', 'sourceId', 'reason']
                    : operation === 'merge'
                      ? ['targetIncidentId', 'reason']
                      : ['reason'];
    if (!creating) payload.incidentId = detail!.id;
    for (const field of fields) {
      const raw=values.get(field),value=typeof raw==='string'?raw.trim():'';
      if (field === 'ownerId' || field === 'backupId')
        payload[field] = value || null;
      else if (field === 'nextUpdateAt')
        payload[field] = submittedAt + Number(value) * 60_000;
      else if (value) payload[field] = value;
    }
    if (operation === 'legacy_map') {
      const old = legacy.find((value) => value.id === values.get('legacyId'));
      if (!old) {
        setMessage('Select the retained legacy incident to map.');
        return;
      }
      payload.legacyId = old.id;
      payload.expectedLegacyUpdatedAt = old.updatedAt;
    }
    setMessage('');
    await command.submit(payload);
  }
  return (
    <div className="min-w-0 space-y-6 wrap-anywhere [&_button]:min-h-11 [&_label]:min-w-0">
      {command.recovery}
      {(changed||command.confirmed)&&!command.pending?<div className="space-y-2"><output className="block">{changed?'The incident evidence changed. Your draft is retained.':'Review the displayed current evidence before starting another incident action.'}</output><Button type="button" variant="outline" disabled={busy} onClick={()=>{setReviewedVersion(detail?.version??null);command.resetConfirmation();}}>Review current incident evidence</Button></div>:null}
      <section className="min-w-0 rounded-[15px] border bg-card" aria-labelledby="current-incidents">
        <h2 id="current-incidents" className="px-[18px] py-3.5 font-bold">Current incidents and retained episodes</h2>
        {rows.length ? (
          <ul>
            {rows.map(row => (
              <li key={row.id} className="border-t px-[18px] py-4 text-sm">
                <dl className="grid min-w-0 gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-[1.1fr_0.8fr_1.2fr_0.9fr]">
                  <div className="min-w-0">
                    <dt className="sr-only">Incident</dt>
                    <dd>
                      <Link className={recordLink} href={incidentHref(row.id)}>{row.title}</Link>
                      <p className="text-xs text-muted-foreground">
                        Episode {row.episode}{row.mergedInto ? ' · Linked duplicate' : ''}
                      </p>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-semibold">State and impact</dt>
                    <dd>{row.state} · {row.severity}<br />{row.impactClass.replaceAll('_', ' ')}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-semibold">Owner and next action</dt>
                    <dd>
                      {responders.find(person => person.id === row.ownerId)?.name ??
                        (row.ownerId ? 'Assigned technical responder' : 'Coverage needed')}
                      <p>{row.nextAction ?? 'Review actual impact and the next safe action'}</p>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-semibold">Original acknowledgment target</dt>
                    <dd>{timestamp(row.acknowledgeDueAt)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        ) : <p className="border-t px-[18px] py-4 text-sm">No incident episodes are recorded in this environment.</p>}
      </section>
      {detail && (
        <section className="space-y-4 rounded-[15px] border bg-card p-4">
          <h2 className="font-heading text-xl font-semibold">{detail.title}</h2>
          <p>{detail.impactSummary}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">First detected</dt>
              <dd>{timestamp(detail.firstSeenAt)}</dd>
            </div>
            <div>
              <dt className="font-medium">Acknowledged</dt>
              <dd>{timestamp(detail.acknowledgedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium">Containment plan due</dt>
              <dd>{timestamp(detail.planDueAt)}</dd>
            </div>
            <div>
              <dt className="font-medium">Promised next update</dt>
              <dd>{timestamp(detail.nextUpdateAt)}</dd>
            </div>
          </dl>
          <p>{detail.plan ?? 'A containment plan has not been recorded.'}</p>
          <p className="text-sm">
            {detail.recoveryReady
              ? 'Two matching current functional observations support recovery review.'
              : 'Current recovery evidence is incomplete or stale.'}{' '}
            Acknowledgment and reading a notice do not close an incident.
          </p>
          {detail.mergedInto && (
            <Link
              className={recordLink}
              href={
                incidentHref(detail.mergedInto)
              }
            >
              Open the canonical incident
            </Link>
          )}
          {manage && !canAct && (
            <p className="text-sm">
              Actions belong to the current available owner, eligible backup or
              Super Admin.
            </p>
          )}
          {canAct && detail.state !== 'resolved' && !detail.mergedInto && (
            <form data-form-id="staff.incident-review"
              key={detail.id}
              onSubmit={(event) => save(event,false,Date.now())}
            >
              <fieldset disabled={busy||command.blocked||changed} className="grid min-w-0 gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                Action
                <select
                  className={control}
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                >
                  {superAdmin && (
                    <option value="assign">Assign or hand over</option>
                  )}
                  <option value="acknowledge">
                    {detail.ownerId === null
                      ? 'Claim and acknowledge this incident'
                      : 'Acknowledge duty'}
                  </option>
                  {(superAdmin || detail.ownerId !== null) && (
                    <>
                      <option value="plan">Record containment plan</option>
                      <option value="update">
                        Record progress and next update
                      </option>
                      <option value="impact">Review actual impact</option>
                      <option value="severity">Review severity</option>
                      <option value="link">
                        Link an authorized source case
                      </option>
                      <option value="merge">Map a verified duplicate</option>
                      <option value="monitor">Review recovery evidence</option>
                      {(detail.impactClass === 'ordinary' || superAdmin) && (
                        <option value="resolve">
                          Confirm evidenced closure
                        </option>
                      )}
                    </>
                  )}
                </select>
              </label>
              {action === 'assign' &&
                ['ownerId', 'backupId'].map((field) => (
                  <label key={field}>
                    {field === 'ownerId' ? 'Active owner' : 'Eligible backup'}
                    <select
                      name={field}
                      className={control}
                      defaultValue={
                        (field === 'ownerId'
                          ? detail.ownerId
                          : detail.backupId) ?? ''
                      }
                    >
                      <option value="">Unassigned / coverage gap</option>
                      {responders.map((person) => (
                        <option value={person.id} key={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              {action === 'plan' && (
                <label className="sm:col-span-2">
                  Containment plan
                  <textarea
                    className={control}
                    name="plan"
                    required
                    minLength={8}
                    defaultValue={detail.plan ?? ''}
                  />
                </label>
              )}
              {['plan', 'update'].includes(action) && (
                <>
                  <label>
                    Next safe action
                    <input
                      className={control}
                      name="nextAction"
                      required
                      minLength={8}
                      defaultValue={detail.nextAction ?? ''}
                    />
                  </label>
                  <label>
                    Next update in elapsed minutes
                    <input
                      className={control}
                      name="nextUpdateAt"
                      type="number"
                      min="1"
                      max={
                        detail.severity === 'critical'
                          ? 60
                          : detail.severity === 'high'
                            ? 240
                            : 1440
                      }
                      required
                      defaultValue={detail.severity === 'critical' ? 60 : 240}
                    />
                  </label>
                </>
              )}
              {action === 'severity' && (
                <label>
                  Actual severity
                  <select
                    className={control}
                    name="severity"
                    defaultValue={detail.severity}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="routine">Routine</option>
                  </select>
                </label>
              )}
              {action === 'impact' && (
                <>
                  <ImpactSelect value={detail.impactClass} />
                  <label>
                    Actual affected workflow and impact
                    <textarea
                      name="impactSummary"
                      className={control}
                      required
                      minLength={8}
                      defaultValue={detail.impactSummary}
                    />
                  </label>
                </>
              )}
              {action === 'resolve' && (
                <label className="sm:col-span-2">
                  Cause, or explicitly unknown cause
                  <textarea
                    className={control}
                    name="resolutionCause"
                    required
                    minLength={3}
                  />
                </label>
              )}
              {action === 'link' && (
                <>
                  <label>
                    Authoritative source
                    <select className={control} name="sourceType">
                      <option value="order">Order</option>
                      <option value="seller">Seller</option>
                      <option value="payment">Payment claim</option>
                      <option value="refund">Refund</option>
                      <option value="return_request">Return</option>
                      <option value="complaint">Complaint</option>
                      <option value="incident">Incident</option>
                    </select>
                  </label>
                  <label>
                    Exact source reference
                    <input className={control} name="sourceId" required />
                  </label>
                </>
              )}
              {action === 'merge' && (
                <label>
                  Canonical incident reference
                  <input className={control} name="targetIncidentId" required />
                </label>
              )}
              <label className="sm:col-span-2">
                Reason or substantive update
                <textarea
                  className={control}
                  name="reason"
                  required
                  minLength={8}
                  maxLength={2000}
                />
                <span className="text-xs text-muted-foreground">
                  Use a technical summary without personal details, credentials
                  or bank/document evidence.
                </span>
              </label>
              <Button
                type="submit"
                className="w-fit"
                disabled={
                  busy ||
                  !form.canSubmit ||
                  (['resolve', 'monitor'].includes(action) &&
                    !detail.recoveryReady)
                }
              >
                {busy ? 'Saving…' : 'Save incident action'}
              </Button>
              </fieldset>
            </form>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                router.refresh();
              }}
            >
              Refresh current evidence and version
            </Button>
            {detail.legacyIncidentId && (
              <span>
                Mapped retained legacy reference: {detail.legacyIncidentId}
              </span>
            )}
          </div>
          <h3 className="font-medium">Retained incident history</h3>
          <ol className="space-y-2 text-sm">
            {detail.history.map((item) => (
              <li key={item.id}>
                {timestamp(item.occurredAt)} ·{' '}
                {item.action.replaceAll('_', ' ')} · version {item.toRevision}
              </li>
            ))}
          </ol>
          {detail.links.length > 0 && (
            <div className="text-sm">
              <h3 className="font-medium">Authorized linked sources</h3>
              {detail.links.map((link) => (
                <p key={link.sourceType + link.sourceId}>
                  <Link className={recordLink} href={withAdminReturnTo(link.href,currentHref)}>
                    {link.sourceType}: {link.sourceId}
                  </Link>
                </p>
              ))}
            </div>
          )}
        </section>
      )}
      {superAdmin ? <details className="rounded-[15px] border bg-card px-4 py-2">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">Legacy incident history</summary>
        <div className="flex flex-wrap gap-x-4 pb-2 text-sm">
          <Link className={recordLink} href="/admin/governance">Open Governance archive</Link>
          <Link className={recordLink} href="/admin/staff-form-history?kind=governance-incident-create">Original incident reports</Link>
          <Link className={recordLink} href="/admin/staff-form-history?kind=governance-incident-update">Original incident updates</Link>
        </div>
      </details> : null}
      {manage && (
        <details
          id="report-incident"
          className="scroll-mt-4 rounded-[15px] border bg-card px-4 py-2"
          open={Boolean(initialLegacyId || initialReport)}
        >
          <summary ref={reportSummary} className="min-h-11 cursor-pointer content-center font-semibold">
            Record a new failure or map a retained legacy incident
          </summary>
          <form data-form-id="staff.incident-review"
            className="my-4"
            onSubmit={(event) => save(event,true,Date.now())}
          >
            <fieldset disabled={busy||command.blocked||changed} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label>
              Record type
              <select
                className={control}
                value={createAction}
                onChange={(event) => setCreateAction(event.target.value)}
              >
                <option value="create">New actual failure episode</option>
                <option value="legacy_map">
                  Map legacy history for recovery review
                </option>
              </select>
            </label>
            {createAction === 'legacy_map' && (
              <label>
                Unmapped legacy record
                <select
                  className={control}
                  name="legacyId"
                  required
                  defaultValue={initialLegacyId ?? ''}
                >
                  <option value="">Select original reference</option>
                  {legacy
                    .filter((row) => !row.incidentId)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.reference} · {row.status}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Incident title
              <input className={control} name="title" required minLength={4} />
            </label>
            <label>
              Monitored service or workflow key
              <input
                className={control}
                name="serviceKey"
                required
                placeholder="application.availability"
              />
            </label>
            <label>
              Failure signature
              <input
                className={control}
                name="failureSignature"
                required
                placeholder="supported-workflow-failure"
              />
            </label>
            <ImpactSelect />
            <label>
              Impact-based severity
              <select className={control} name="severity" defaultValue="high">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="routine">Routine</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              Actual affected actions and impact
              <textarea
                name="impactSummary"
                className={control}
                required
                minLength={8}
                maxLength={2000}
              />
            </label>
            <label>
              Related release reference
              <input className={control} name="releaseReference" />
            </label>
            <label>
              Related configuration reference
              <input className={control} name="configurationReference" />
            </label>
            <Button
              type="submit"
              className="w-fit"
              disabled={busy || !form.canSubmit}
            >
              {busy
                ? 'Saving…'
                : superAdmin
                  ? 'Record incident'
                  : 'Record and claim incident'}
            </Button>
            </fieldset>
          </form>
        </details>
      )}
      {manage&&<Button type="button" variant="outline" disabled={busy||command.pending||form.status==='loading'} onClick={form.refresh}>Refresh incident form controls</Button>}
      {manage && !form.canSubmit && (
        <output className="block text-sm">
          {form.message ||
            'Incident controls are waiting for their current compatible form.'}
        </output>
      )}
      <output aria-live="polite" className="block text-sm">
        {message||command.message}
      </output>
      <p className="text-xs text-muted-foreground">
        All displayed times use Asia/Kathmandu. Business holds, payments and
        access grants remain in their own authorized workflows.
      </p>
    </div>
  );
}
function ImpactSelect({ value = 'ordinary' }: { value?: string }) {
  return (
    <label>
      Actual impact classification
      <select className={control} name="impactClass" defaultValue={value}>
        <option value="ordinary">Ordinary service/workflow failure</option>
        <option value="privacy">Privacy exposure</option>
        <option value="security">Security incident</option>
        <option value="financial_integrity">Financial integrity</option>
      </select>
    </label>
  );
}
