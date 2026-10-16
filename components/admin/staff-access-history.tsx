'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import { STAFF_ACCESS_RIGHTS } from '@/lib/staff/access';
import type { StaffAccessHistoryEntry } from '@/lib/db/repositories/staff-access-history';
import type { StaffPermissionRequest } from '@/lib/db/repositories/staff-permissions';
import type { Permission } from '@/lib/marketplace/permissions';

const labels = new Map(
  STAFF_ACCESS_RIGHTS.map((right) => [right.permission, right.label]),
);
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kathmandu',
});
function rightsText(rights: readonly Permission[] | null) {
  return rights === null
    ? 'Unavailable'
    : rights.map((right) => labels.get(right) ?? right).join(', ') ||
        'No work access';
}
export function StaffAccessHistory({
  entries,
  requests,
  staffNames,
}: {
  entries: readonly StaffAccessHistoryEntry[];
  requests: readonly StaffPermissionRequest[];
  staffNames: Readonly<Record<string, string>>;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState('all');
  const knownRequests = new Set(
    entries.map((entry) => entry.requestId).filter(Boolean),
  );
  const rows = [
    ...entries.map((entry) => ({
      id: entry.id,
      entry,
      request: null,
      createdAt: entry.createdAt,
    })),
    ...requests
      .filter(
        (request) =>
          request.status !== 'pending' && !knownRequests.has(request.id),
      )
      .map((request) => ({
        id: `legacy:${request.id}`,
        entry: null,
        request,
        createdAt: request.proposedAt,
      })),
  ].sort((a, b) => b.createdAt - a.createdAt);
  const filtered = rows.filter(({ entry, request }) => {
    const result =
      entry?.outcome ??
      (request?.status === 'rejected' ? 'rejected' : 'incomplete');
    if (outcome !== 'all' && outcome !== result) return false;
    const text = entry
      ? [
          entry.staffName,
          entry.staffId,
          entry.actorName,
          entry.actorId,
          entry.reason,
          rightsText(entry.beforePermissions),
          rightsText(entry.afterPermissions),
          rightsText(entry.requestedPermissions),
        ]
      : [
          staffNames[request!.userId],
          request!.userId,
          staffNames[request!.proposedBy],
          request!.proposedBy,
          request!.reason,
          request!.decisionNote,
        ];
    return text.join(' ').toLowerCase().includes(search.trim().toLowerCase());
  });
  return (
    <section
      aria-label="Access change history"
      className="space-y-4 border-t pt-5"
    >
      <div>
        <h3 className="font-heading text-xl">Access change history</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved changes and rejected requests. Times are in Nepal time. Names
          show the current staff record.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div className="space-y-2">
          <Label htmlFor={`${id}-search`}>Search history</Label>
          <Input
            id={`${id}-search`}
            type="search"
            placeholder="Name, reason or work area"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-outcome`}>History outcome</Label>
          <select
            id={`${id}-outcome`}
            className="min-h-11 w-full rounded-md border bg-background p-2"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="all">All outcomes</option>
            <option value="applied">Saved changes</option>
            <option value="rejected">Rejected requests</option>
            <option value="incomplete">Older or incomplete records</option>
          </select>
        </div>
      </div>
      {!filtered.length ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          {rows.length
            ? 'No changes match these filters.'
            : 'No recorded access changes yet.'}
        </p>
      ) : null}
      {filtered.map(({ id: rowId, entry, request, createdAt }) => {
        const name =
          entry?.staffName ??
          staffNames[entry?.staffId ?? request?.userId ?? ''] ??
          'Former staff member';
        const actor =
          entry?.actorName ??
          staffNames[
            entry?.actorId ?? request?.decidedBy ?? request?.proposedBy ?? ''
          ] ??
          'Name unavailable';
        const rejected =
          entry?.outcome === 'rejected' || request?.status === 'rejected';
        const subjectId = entry?.requestId ?? request?.id;
        return (
          <article
            key={rowId}
            className="space-y-3 break-words rounded-xl border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="font-semibold">{name}</h4>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                {rejected
                  ? 'Request rejected'
                  : entry?.outcome === 'applied'
                    ? 'Access saved'
                    : 'Older or incomplete record'}
              </span>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {entry ? 'Recorded by' : 'Decision by'} {actor} ·{' '}
              <time dateTime={new Date(createdAt).toISOString()}>
                {dateFormatter.format(createdAt)}
              </time>
              {request ? ' · Request date' : ''}
            </p>
            <p className="text-sm">
              <span className="font-medium">Reason: </span>
              {entry?.reason ??
                request?.decisionNote ??
                request?.reason ??
                'No reason recorded.'}
            </p>
            {request?.decisionNote ? (
              <p className="text-sm text-muted-foreground">
                Request reason: {request.reason}
              </p>
            ) : null}
            {rejected ? (
              <p className="text-sm font-medium">
                No access was changed by this rejected request.
              </p>
            ) : null}
            {entry?.outcome === 'applied' && entry.changes ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium">
                    Added ({entry.changes.added.length})
                  </dt>
                  <dd className="mt-1 text-muted-foreground">
                    {entry.changes.added.length
                      ? rightsText(entry.changes.added)
                      : 'None'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">
                    Removed ({entry.changes.removed.length})
                  </dt>
                  <dd className="mt-1 text-muted-foreground">
                    {entry.changes.removed.length
                      ? rightsText(entry.changes.removed)
                      : 'None'}
                  </dd>
                </div>
              </dl>
            ) : !rejected ? (
              <p className="text-sm text-muted-foreground">
                Before and after access are unavailable for a full comparison.
                This record does not show which rights changed.
              </p>
            ) : null}
            {entry?.outcome === 'rejected' && entry.requestedPermissions ? (
              <p className="text-sm text-muted-foreground">
                Requested, not applied: {rightsText(entry.requestedPermissions)}
              </p>
            ) : null}
            {entry ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  View access before and after
                </summary>
                <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt>Before</dt>
                    <dd className="text-muted-foreground">
                      {rightsText(entry.beforePermissions)}
                    </dd>
                  </div>
                  <div>
                    <dt>After</dt>
                    <dd className="text-muted-foreground">
                      {rightsText(entry.afterPermissions)}
                    </dd>
                  </div>
                </dl>
              </details>
            ) : null}
            {subjectId ? (
              <StaffFormHistoryLinks
                entries={[
                  {
                    kind:
                      entry?.formHistoryKind ??
                      (request?.appliedDirectly
                        ? 'staff-permission-proposal'
                        : 'staff-permission-decision'),
                    subjectId,
                    label:
                      entry?.formHistoryKind === 'staff-permission-proposal' ||
                      request?.appliedDirectly
                        ? 'View permission change form history'
                        : 'View permission decision form history',
                  },
                ]}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No linked form record is available.
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
