import Link from 'next/link';
import type { PermissionSubject } from '@/lib/marketplace/permissions';
import {
  getRecordedProgress,
  auditDestination,
  type RecordedProgress,
} from '@/lib/db/repositories/business-activity';
import {
  loadQueryPresentationConfig,
  queryFieldPresentation,
} from '@/lib/catalog/shop-query';
import {
  dateCalendar,
  formatBsDate,
  reportingDayIso,
} from '@/lib/dates/nepal-calendar';
import { RecordedDateRangeFields } from '@/components/admin/recorded-date-range-fields';
import { RecordedTime } from '@/components/admin/recorded-time';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export async function RecordedProgressSection({
  db,
  staff,
  filters = {},
  form = false,
}: {
  db: D1Database;
  staff: PermissionSubject & { id: string };
  filters?: Record<string, string | undefined>;
  form?: boolean;
}) {
  const presentationPromise = form
    ? loadQueryPresentationConfig(db, 'staff.recorded-progress-filter')
    : Promise.resolve({ config: null, unavailable: false });
  let data: RecordedProgress;
  try {
    data = await getRecordedProgress(db, staff, filters);
  } catch (e) {
    return (
      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Recorded work by person</h2>
        <p role="alert" className="mt-2">
          {e instanceof Error && /date|366|own/.test(e.message)
            ? e.message
            : 'Recorded work is unavailable. Refresh and try again.'}
        </p>
        <Link className="section-link underline mt-3" href="/admin/progress">
          Reset recorded-work filters
        </Link>
      </section>
    );
  }
  const evidenceRoute =
    staff.role === 'super_admin' ? '/admin/activity' : '/admin/progress';
  const presentation = await presentationPromise;
  const from = reportingDayIso(data.from),
    to = reportingDayIso(data.to - 1),
    calendar = dateCalendar(filters.calendar);
  const fromBs = formatBsDate(from),
    toBs = formatBsDate(to);
  const field = (key: 'from' | 'to' | 'action') =>
    queryFieldPresentation(
      'staff.recorded-progress-filter',
      presentation.config,
      key,
      {
        label:
          key === 'from'
            ? 'From date'
            : key === 'to'
              ? 'Through date'
              : 'Exact action (optional)',
      },
    );
  const action = field('action');
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h2 className="font-heading text-2xl">
        {staff.role === 'super_admin'
          ? 'Recorded work by person'
          : 'Your recorded work'}
      </h2>
      <div className="rounded-lg bg-muted/40 p-3 text-sm">
        <p>
          <strong className="font-medium">Gregorian / English (AD): </strong>
          {from} AD through {to} AD
        </p>
        <p className="mt-1">
          <strong className="font-medium">Nepali Bikram Sambat (BS): </strong>
          {fromBs && toBs
            ? `${fromBs} through ${toBs}`
            : 'Conversion unavailable for part of this range'}
        </p>
        <p className="mt-2 text-muted-foreground">
          Reporting timezone: Nepal time (UTC+05:45). The through date includes
          the whole day.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Counts reflect explicitly recorded completed steps, grouped by actor and
        outcome. A record may have several steps; these are not distinct orders,
        current approved sellers, or a measure of financial settlement.
        Review-start events appear in history but are excluded from completion
        counts.
      </p>
      <p className="text-sm text-muted-foreground">
        Default: the latest 30 calendar days. Maximum range: 366 days. Missing
        historical events and unknown action types are excluded. Empty results
        mean no matching recorded evidence, not proof that no work occurred.
      </p>
      {form ? (
        <>
          <form
            key={JSON.stringify([
              filters.from,
              filters.to,
              filters.action,
              calendar,
            ])}
            data-form-id="staff.recorded-progress-filter"
            action="/admin/progress"
            method="get"
            className="space-y-4"
          >
            <RecordedDateRangeFields
              from={filters.from ?? from}
              to={filters.to ?? to}
              initialCalendar={calendar}
              fromField={field('from')}
              toField={field('to')}
            >
              <Field className="min-w-0">
                <FieldLabel htmlFor="progress-action">
                  {action.label}
                </FieldLabel>
                <Input
                  id="progress-action"
                  type="text"
                  name="action"
                  maxLength={160}
                  defaultValue={filters.action ?? ''}
                  placeholder={action.placeholder}
                  aria-describedby={
                    action.helpText ? 'progress-action-help' : undefined
                  }
                />
                {action.helpText ? (
                  <FieldDescription id="progress-action-help">
                    {action.helpText}
                  </FieldDescription>
                ) : null}
              </Field>
            </RecordedDateRangeFields>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="workspace-primary" size="workspace" type="submit">Filter recorded work</Button>
              <Link className="section-link underline" href="/admin/progress">
                Reset filters
              </Link>
            </div>
          </form>
          {presentation.unavailable ? (
            <output
              aria-live="polite"
              className="block text-sm text-muted-foreground"
            >
              Filter presentation is unavailable. Standard filters remain
              available.
            </output>
          ) : null}
        </>
      ) : (
        <p className="text-sm">
          The action, actor, record-type and date filters below also apply to
          this view.
        </p>
      )}
      {data.groupsTruncated ? (
        <output aria-live="polite">
          Showing 500 actor/outcome groups. Narrow the date or actor filters to
          inspect remaining groups.
        </output>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="py-2 text-left font-semibold">
            Completed steps recorded in this date range
          </caption>
          <thead>
            <tr>
              {['Person', 'Recorded outcome', 'Count', 'Evidence'].map((h) => (
                <th className="p-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.groups.map((group) => {
              const params = new URLSearchParams({
                action: group.action,
                actor: group.actorId,
                type: group.subjectType,
                from,
                to,
                calendar,
              });
              return (
                <tr
                  className="border-t"
                  key={group.actorId + ':' + group.action}
                >
                  <td className="p-3">
                    {group.actorName ?? 'Recorded actor'}
                    <span className="block text-xs">{group.actorId}</span>
                  </td>
                  <td className="p-3">{group.outcome}</td>
                  <td className="p-3 tabular-nums">{group.count}</td>
                  <td className="p-3">
                    <a
                      className="section-link underline"
                      href={evidenceRoute + '?' + params}
                    >
                      View matching records
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.groups.length ? (
          <p className="py-3 text-sm">
            No matching completed steps were recorded in this range.
          </p>
        ) : null}
      </div>
      <details open={staff.role === 'admin'}>
        <summary className="min-h-11 content-center cursor-pointer">Latest 100 recognized action records in this range</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  'Date (AD / BS) · Nepal time',
                  'Actor',
                  'Recorded step',
                  'Source',
                ].map((h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.events.map((event) => {
                const href = auditDestination(
                  event.subjectType,
                  event.subjectId,
                );
                return (
                  <tr key={event.id} className="border-t">
                    <td className="p-3">
                      <RecordedTime timestamp={event.createdAt} />
                    </td>
                    <td className="p-3">{event.actorName ?? event.actorId}</td>
                    <td className="p-3">
                      {event.outcome}
                      {!event.completed ? ' · In progress' : ''}
                    </td>
                    <td className="p-3">
                      {href ? (
                        <Link className="section-link underline" href={href} prefetch={false}>
                          {event.subjectType}: {event.subjectId}
                        </Link>
                      ) : (
                        event.subjectType
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
