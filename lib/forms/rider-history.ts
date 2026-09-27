import type { FormId } from './types';

export const riderHistoryKinds = {
  application: { title: 'Rider applications', formId: 'rider.application',
    subjectType: 'rider_application', table: 'rider_applications', ownerColumn: 'user_id', filter: '' },
  report: { title: 'Rider reports', formId: 'rider.report',
    subjectType: 'rider_report', table: 'rider_reports', ownerColumn: 'rider_user_id', filter: '' },
  remittance: { title: 'Rider remittances', formId: 'rider.remittance',
    subjectType: 'parcel_cash_record', table: 'parcel_cash_records', ownerColumn: 'rider_user_id',
    filter: "AND record.kind='remittance'" },
  code: { title: 'Code verifications', formId: 'rider.code-verify',
    subjectType: 'rider_event', table: 'rider_events', ownerColumn: 'user_id',
    filter: "AND record.action='otp_verified'" },
} as const satisfies Record<string, { title: string; formId: FormId; subjectType: string;
  table: string; ownerColumn: string; filter: string }>;

export type RiderHistoryKind = keyof typeof riderHistoryKinds;
export type HistoryCursor = { createdAt: number; id: string };

export function historyKind(value: string | undefined): RiderHistoryKind | null {
  return value && Object.hasOwn(riderHistoryKinds, value) ? value as RiderHistoryKind : null;
}

export function readHistoryCursor(at: string | undefined, id: string | undefined): HistoryCursor | undefined {
  if (!at && !id) return undefined;
  if (!at || !id || !/^\d+$/.test(at) || id.length > 191) throw new Error('Invalid history cursor.');
  const createdAt = Number(at);
  if (!Number.isSafeInteger(createdAt)) throw new Error('Invalid history cursor.');
  return { createdAt, id };
}

export async function riderHistoryOwner(db: D1Database, kind: RiderHistoryKind,
  id: string): Promise<string | null> {
  if (!id || id.length > 191) return null;
  const spec = riderHistoryKinds[kind];
  const row = await db.prepare(`SELECT record.${spec.ownerColumn} AS ownerId FROM ${spec.table} record
    WHERE record.id=? ${spec.filter} LIMIT 1`).bind(id).first<{ ownerId: string }>();
  return row?.ownerId ?? null;
}

export async function listRiderHistoryRecords(db: D1Database, kind: RiderHistoryKind,
  ownerId: string | null, before?: HistoryCursor): Promise<{
    records: { id: string; createdAt: number }[]; nextCursor: HistoryCursor | null;
  }> {
  const spec = riderHistoryKinds[kind];
  const rows = await db.prepare(`SELECT record.id,record.created_at AS createdAt
    FROM ${spec.table} record WHERE 1=1 ${spec.filter}
      ${ownerId ? `AND record.${spec.ownerColumn}=?` : ''}
      AND EXISTS(SELECT 1 FROM form_answer_sets answer WHERE answer.subject_type=?
        AND answer.subject_id=record.id AND answer.form_id=?)
      AND (? IS NULL OR record.created_at<? OR
        (record.created_at=? AND record.id<?))
    ORDER BY record.created_at DESC,record.id DESC LIMIT 51`)
    .bind(...(ownerId ? [ownerId] : []), spec.subjectType, spec.formId,
      before?.createdAt ?? null, before?.createdAt ?? 0,
      before?.createdAt ?? 0, before?.id ?? '')
    .all<{ id: string; createdAt: number }>();
  const records = rows.results.slice(0, 50);
  const last = records.at(-1);
  return { records, nextCursor: rows.results.length > 50 && last
    ? { createdAt: last.createdAt, id: last.id } : null };
}
