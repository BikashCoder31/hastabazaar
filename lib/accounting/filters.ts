import { NEPAL_OFFSET_MS, parseNepalDateTime } from '../commission/rates';
import {
  accountingSections,
  accountingSourceKinds,
  type AccountingCursor,
  type AccountingQuery,
} from './types';

export class AccountingValidationError extends RangeError {}
const day = 86400000;
function date(value: string | null): number {
  if (!value) throw new AccountingValidationError('Choose both report dates.');
  try {
    return parseNepalDateTime(value + 'T00:00');
  } catch {
    throw new AccountingValidationError('Choose a valid report date.');
  }
}
function scope(q: AccountingQuery): string {
  return [q.section, q.period, q.fromAt, q.toExclusive, q.pageSize].join('|');
}
export function encodeAccountingCursor(
  query: AccountingQuery,
  row: Pick<AccountingCursor, 'recordedAt' | 'sourceKind' | 'sourceId'>,
): string {
  const text = JSON.stringify({
    ...row,
    scope: scope(query),
    toExclusive: query.toExclusive,
  });
  return btoa(
    Array.from(new TextEncoder().encode(text), (b) =>
      String.fromCharCode(b),
    ).join(''),
  );
}
export function parseAccountingQuery(
  params: URLSearchParams,
  observedAt: number,
): AccountingQuery {
  if (
    !Number.isSafeInteger(observedAt) ||
    observedAt <= 0 ||
    observedAt >= 253402214400000
  )
    throw new AccountingValidationError('Report time is unavailable.');
  const keys = ['section', 'period', 'from', 'to', 'pageSize', 'cursor'];
  for (const key of params.keys())
    if (!keys.includes(key) || params.getAll(key).length !== 1)
      throw new AccountingValidationError('Choose valid report filters.');
  const section = params.get('section') ?? 'overview',
    period = params.get('period') ?? '30d';
  if (
    !accountingSections.includes(section as AccountingQuery['section']) ||
    !['today', '7d', '30d', 'all', 'custom'].includes(period)
  )
    throw new AccountingValidationError(
      'Choose a valid report section and period.',
    );
  const size = params.get('pageSize') ?? '50';
  if (!/^\d{1,3}$/.test(size) || Number(size) < 1 || Number(size) > 100)
    throw new AccountingValidationError('Choose 1 to 100 rows.');
  if (period !== 'custom' && (params.has('from') || params.has('to')))
    throw new AccountingValidationError('Use custom dates for a date range.');
  const today = date(
    new Date(observedAt + NEPAL_OFFSET_MS).toISOString().slice(0, 10),
  );
  const fromAt =
    period === 'all'
      ? 0
      : period === 'custom'
        ? date(params.get('from'))
        : today - (period === '7d' ? 6 : period === '30d' ? 29 : 0) * day;
  const toExclusive =
    period === 'all'
      ? observedAt + 1
      : period === 'custom'
        ? date(params.get('to')) + day
        : today + day;
  if (fromAt >= toExclusive)
    throw new AccountingValidationError(
      'The end date must be on or after the start date.',
    );
  const query: AccountingQuery = {
    section: section as AccountingQuery['section'],
    period: period as AccountingQuery['period'],
    fromAt,
    toExclusive,
    pageSize: Number(size),
    cursor: null,
  };
  const token = params.get('cursor');
  if (token !== null) {
    try {
      if (!token || token.length > 1024) throw Error();
      const c = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          Uint8Array.from(atob(token), (x) => x.charCodeAt(0)),
        ),
      ) as AccountingCursor & { toExclusive: number };
      if (
        period === 'all' &&
        Number.isSafeInteger(c.toExclusive) &&
        c.toExclusive > 0 &&
        c.toExclusive <= toExclusive
      )
        query.toExclusive = c.toExclusive;
      if (
        c.scope !== scope(query) ||
        !Number.isSafeInteger(c.recordedAt) ||
        c.recordedAt < 0 ||
        !accountingSourceKinds.includes(c.sourceKind) ||
        typeof c.sourceId !== 'string' ||
        !c.sourceId ||
        c.sourceId.length > 191
      )
        throw Error();
      query.cursor = {
        scope: c.scope,
        recordedAt: c.recordedAt,
        sourceKind: c.sourceKind,
        sourceId: c.sourceId,
      };
    } catch {
      throw new AccountingValidationError(
        'This report page has expired or its filters changed. Start from the first page.',
      );
    }
  }
  return query;
}
