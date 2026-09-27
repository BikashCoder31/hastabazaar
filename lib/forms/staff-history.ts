import { getFormAnswerById, type StoredFormAnswer } from '../db/repositories/form-answers';
import { authorizeFormAnswerRead, currentStaffGrant, type FormAnswerViewer } from './access';
import type { Permission } from '../marketplace/permissions';

export const STAFF_HISTORY_KINDS = [
  { kind: 'catalog-category', label: 'Catalog categories', formId: 'staff.catalog', subjectType: 'category', permission: 'catalog.manage' },
  { kind: 'catalog-occasion', label: 'Catalog occasions', formId: 'staff.catalog', subjectType: 'occasion', permission: 'catalog.manage' },
  { kind: 'product-classification', label: 'Product classifications', formId: 'staff.product-classification', subjectType: 'product', permission: 'catalog.manage' },
  { kind: 'exception-work', label: 'Exception follow-up', formId: 'staff.exception-work', subjectType: 'exception_work', permission: 'order.manage' },
  { kind: 'invoice-adjustment', label: 'Invoice adjustments', formId: 'staff.invoice-adjustment', subjectType: 'managed_invoice_adjustment', permission: 'tax_policy.manage' },
  { kind: 'managed-maker-activation', label: 'Managed maker activations', formId: 'staff.managed-maker-activation', subjectType: 'seller', permission: 'business_settings.approve', superAdminOnly: true },
  { kind: 'managed-supply-decision', label: 'Managed supply decisions', formId: 'staff.managed-supply-decision', subjectType: 'managed_supply', permission: 'seller.application.review', superAdminOnly: true },
  { kind: 'managed-adjustment', label: 'Managed supply adjustments', formId: 'staff.managed-adjustment', subjectType: 'managed_supply', permission: 'refund.approve.high_value', superAdminOnly: true },
  { kind: 'managed-payment-preparation', label: 'Managed payment preparations', formId: 'staff.managed-payment-preparation', subjectType: 'managed_supplier_payment', permission: 'payout.prepare', superAdminOnly: true },
  { kind: 'managed-payment-action', label: 'Managed payment actions', formId: 'staff.managed-payment-action', subjectType: 'managed_supplier_payment', permission: 'payout.approve', superAdminOnly: true },
  { kind: 'managed-transition-decision', label: 'Managed route transitions', formId: 'staff.managed-transition-decision', subjectType: 'seller_route_transition', permission: 'seller.application.review', superAdminOnly: true },
  { kind: 'parcel-control', label: 'Parcel controls', formId: 'staff.parcel-control', subjectType: 'shipping_job', permission: 'order.manage' },
  { kind: 'payout-request-action', label: 'Payout request actions', formId: 'staff.payout-request-action', subjectType: 'payout_request', permission: 'payout.prepare' },
  { kind: 'privacy-action', label: 'Privacy decisions', formId: 'staff.privacy-action', subjectType: 'data_rights_request', permission: 'support.manage' },
  { kind: 'rider-control', label: 'Rider profile controls', formId: 'staff.rider-control-1', subjectType: 'rider', permission: 'admin.invite', superAdminOnly: true },
  { kind: 'rider-report-control', label: 'Rider report controls', formId: 'staff.rider-control-1', subjectType: 'rider_report', permission: 'order.manage' },
  { kind: 'rider-policy', label: 'Rider policy', formId: 'staff.rider-control-2', subjectType: 'rider_policy', permission: 'admin.invite', superAdminOnly: true },
  { kind: 'governance-rule-create', label: 'Product rules', formId: 'staff.governance-rule-create', subjectType: 'prohibited_product_rule', permission: 'catalog.manage' },
  { kind: 'governance-promotion-create', label: 'Promotion proposals', formId: 'staff.governance-promotion-create', subjectType: 'promotion', permission: 'catalog.manage' },
  { kind: 'governance-incident-create', label: 'Incident reports', formId: 'staff.governance-incident-create', subjectType: 'operational_incident', permission: 'catalog.manage', superAdminOnly: true },
  { kind: 'governance-incident-update', label: 'Incident updates', formId: 'staff.governance-incident-update', subjectType: 'operational_incident', permission: 'catalog.manage', superAdminOnly: true },
  { kind: 'governance-backup-verify', label: 'Backup verifications', formId: 'staff.governance-backup-verify', subjectType: 'backup_verification', permission: 'catalog.manage', superAdminOnly: true },
] as const;

export type StaffHistoryKind = (typeof STAFF_HISTORY_KINDS)[number];
export type StaffHistoryItem = Pick<StoredFormAnswer, 'id' | 'formId' | 'subjectType' | 'subjectId' | 'actorId' | 'requestId' | 'createdAt'>;

function ruleFor(kind: string): StaffHistoryKind | null {
  return STAFF_HISTORY_KINDS.find((rule) => rule.kind === kind) ?? null;
}

async function mayList(db: D1Database, viewer: FormAnswerViewer, rule: StaffHistoryKind): Promise<boolean> {
  if (viewer.role !== 'admin' && viewer.role !== 'super_admin') return false;
  const active = await db.prepare(`SELECT 1 AS valid FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.id=? AND u.status='active' AND r.role=? LIMIT 1`)
    .bind(viewer.id, viewer.role).first();
  if (!active || ('superAdminOnly' in rule && rule.superAdminOnly && viewer.role !== 'super_admin')) return false;
  return currentStaffGrant(db, viewer, rule.permission as Permission);
}

export async function availableStaffHistoryKinds(db: D1Database,
  viewer: FormAnswerViewer): Promise<StaffHistoryKind[]> {
  const allowed: StaffHistoryKind[] = [];
  for (const rule of STAFF_HISTORY_KINDS) if (await mayList(db, viewer, rule)) allowed.push(rule);
  return allowed;
}

function decodeCursor(raw?: string | null): { createdAt: number; id: string } | null {
  if (!raw) return null;
  if (raw.length > 256 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('History cursor is invalid.');
  try {
    const decoded = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))) as unknown;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error();
    const value = decoded as Record<string, unknown>;
    if (!Number.isSafeInteger(value.createdAt) || Number(value.createdAt) < 0 ||
        typeof value.id !== 'string' || !value.id || value.id.length > 191) throw new Error();
    return { createdAt: Number(value.createdAt), id: value.id };
  } catch { throw new Error('History cursor is invalid.'); }
}

function encodeCursor(value: { createdAt: number; id: string }): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function safeSubjectId(value?: string): string | null {
  if (value === undefined) return null;
  if (!value || value.length > 191 || value.trim() !== value) throw new Error('Record reference is invalid.');
  return value;
}

/** One bounded 50-row candidate page; denied rows do not conceal the next cursor. */
export async function listStaffFormHistory(db: D1Database, viewer: FormAnswerViewer,
  kind: string, options: { subjectId?: string; cursor?: string | null } = {}):
  Promise<{ items: StaffHistoryItem[]; nextCursor: string | null }> {
  const rule = ruleFor(kind);
  if (!rule || !await mayList(db, viewer, rule)) return { items: [], nextCursor: null };
  const subjectId = safeSubjectId(options.subjectId);
  const cursor = decodeCursor(options.cursor);
  const rows = await db.prepare(`SELECT a.id,a.form_id AS formId,a.subject_type AS subjectType,
      a.subject_id AS subjectId,a.actor_id AS actorId,a.request_id AS requestId,
      a.created_at AS createdAt FROM form_answer_sets a
    WHERE a.form_id=? AND a.subject_type=?
      AND (? IS NULL OR a.subject_id=?)
      AND (? IS NULL OR a.created_at<? OR (a.created_at=? AND a.id<?))
    ORDER BY a.created_at DESC,a.id DESC LIMIT 51`)
    .bind(rule.formId, rule.subjectType, subjectId, subjectId,
      cursor?.createdAt ?? null, cursor?.createdAt ?? 0,
      cursor?.createdAt ?? 0, cursor?.id ?? '')
    .all<StaffHistoryItem>();
  const candidates = rows.results.slice(0, 50);
  const items: StaffHistoryItem[] = [];
  for (const candidate of candidates)
    if (await authorizeFormAnswerRead(db, viewer, candidate)) items.push(candidate);
  return { items, nextCursor: rows.results.length > 50 && candidates.length
    ? encodeCursor(candidates[candidates.length - 1]) : null };
}

export async function readStaffFormHistoryAnswer(db: D1Database, viewer: FormAnswerViewer,
  kind: string, subjectId: string, answerId: string): Promise<StoredFormAnswer | null> {
  const rule = ruleFor(kind);
  if (!rule || !await mayList(db, viewer, rule)) return null;
  if (!safeSubjectId(subjectId) || !answerId || answerId.length > 191) return null;
  const answer = await getFormAnswerById(db, answerId);
  if (!answer || answer.formId !== rule.formId || answer.subjectType !== rule.subjectType ||
      answer.subjectId !== subjectId) return null;
  return await authorizeFormAnswerRead(db, viewer, answer) ? answer : null;
}
