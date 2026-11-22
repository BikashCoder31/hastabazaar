import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { operationalNotificationChannels, operationalNotificationRequestId } from '../operations/event-catalog';
import { commandReceipt } from '../workflows/contracts';
import { readSellerPayoutFixes, sellerPayoutFixOpenSql } from './payout-fixes';
import { checklistReminderIntervalMs, getSellerChecklist } from './shop-checklist';
import {
  checklistDate, checklistDocumentLabels, checklistRequestAction, checklistRequestTemplate, documentExpiryTemplate,
  documentExpiryWindowMs, nearExpiryPredicate,
} from './shop-checklist-evidence';
import type { SellerDocumentKind } from './application';

export class ChecklistRequestError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

const activeOwner = `u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('customer','seller'))`;
const sourceType = 'seller_checklist_item';

type Message = {
  template: string; eventId: string; subject: string; body: string; relatedId: string; relatedType: string; now: number;
};
function pairedStatements(db: D1Database, message: Message, selection: string, sourceValues: unknown[]) {
  return Promise.all(operationalNotificationChannels.map(async channel => db.prepare(
    `INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,
      subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key)
      SELECT ?,u.id,'seller',?,?,?,?,?,?,?,?,'queued',?,?,? ${selection}`,
  ).bind(crypto.randomUUID(), channel, message.template, message.subject, message.subject, message.body, message.body,
    message.relatedType, message.relatedId, await operationalNotificationRequestId(message.template, message.eventId, 'owner', channel),
    message.now, message.template, ...sourceValues)));
}

export async function requestSellerChecklistItem(db: D1Database, input: {
  sellerId: string; actorId: string; authSubject: string; itemId: string; note: string; requestId: string; remind: boolean; now: number;
}) {
  const { sellerId, itemId, requestId, actorId, authSubject, remind, now } = input;
  const note = input.note.trim();
  if (!/^[a-z_]{2,40}$/.test(itemId) || note.length < 8 || note.length > 1000 || !requestId || requestId.length > 191)
    throw new ChecklistRequestError('Enter a note of 8–1000 characters.', 400);
  const authority = await staffMutationGuard(db, actorId, 'seller.application.review',
    class extends ChecklistRequestError { constructor(message: string) { super(message, 403); } }, 'super_admin');
  const owner = await db.prepare(`SELECT s.user_id AS userId,s.id AS sellerId FROM seller_profiles s
    JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id<>? AND ${activeOwner}`)
    .bind(sellerId, actorId).first<{ userId: string; sellerId: string }>();
  if (!owner || owner.sellerId !== sellerId) throw new ChecklistRequestError('Current independent seller review is required.', 403);
  const auth = await db.prepare('SELECT auth_subject AS subject FROM users WHERE id=?').bind(actorId).first<{ subject: string }>();
  if (auth?.subject !== authSubject) throw new ChecklistRequestError('The reviewer identity changed.', 403);

  const relatedId = sellerId + ':' + itemId;
  const receipt = () => commandReceipt(db, { actorId, requestId, expectedRevision: relatedId, now },
    { action: 'seller.checklist.request_command', subjectType: sourceType, subjectId: relatedId }, { sellerId, itemId, note, remind });
  const recorded = await receipt();
  if (recorded.replayed) return;
  const checklist = await getSellerChecklist(db, sellerId, { ownerId: owner.userId, actorId, audience: 'staff', now });
  const item = checklist.groups.flatMap(group => group.items).find(row => row.id === itemId);
  const allowed = item?.requestAction;
  if (!item || !allowed || allowed.remind !== remind)
    throw new ChecklistRequestError('This item changed. Refresh the seller checklist and review the current details.');
  if (allowed.availableAt > now) throw new ChecklistRequestError('A reminder can be sent once every 24 hours.');

  const openFix = item.openFix ? (await readSellerPayoutFixes(db, sellerId)).find(fix => fix.kind === item.id && fix.waitingFor === 'seller') : null;
  if (item.openFix && !openFix) throw new ChecklistRequestError('The seller has already updated this item. Refresh the checklist.');
  const eventId = crypto.randomUUID();
  const guardId = crypto.randomUUID();
  const source = `FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND s.user_id<>?
    AND ${activeOwner}`;
  const sourceValues = [sellerId, owner.userId, actorId];
  const expirySubject = 'Please renew your ' + item.label.toLowerCase();
  const subject = (remind ? 'Reminder: please update your ' + item.label.toLowerCase()
    : item.status === 'expiring' ? expirySubject : 'Please update your ' + item.label.toLowerCase());
  const notices = await pairedStatements(db, { template: checklistRequestTemplate, eventId, subject, body: note, relatedId, relatedType: sourceType, now },
    source, sourceValues);
  try {
    await db.batch([
      ...authority.statements,
      // InnoDB takes the seller row lock before the recent-request predicate reads committed history.
      db.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(sellerId),
      db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN
        EXISTS(SELECT 1 ${source} ${openFix ? `AND ${sellerPayoutFixOpenSql('s.id', '?')}` : ''})
        AND EXISTS(SELECT 1 FROM users reviewer WHERE HEX(reviewer.id)=HEX(?) AND HEX(reviewer.auth_subject)=HEX(?))
        AND NOT EXISTS(SELECT 1 FROM audit_logs prior WHERE prior.subject_type=? AND prior.subject_id=?
          AND prior.action=? AND prior.command_key IS NULL AND prior.created_at>?)
        THEN 1 ELSE 0 END`).bind(guardId, ...sourceValues, ...(openFix ? [openFix.id] : []), actorId, authSubject,
          sourceType, relatedId, checklistRequestAction, now - checklistReminderIntervalMs),
      db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at,request_id)
        VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(eventId, actorId, checklistRequestAction, sourceType, relatedId, note, JSON.stringify({ sellerId, itemId, remind }), now, requestId),
      ...notices,
      recorded.insert({ eventId }),
      db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),
    ]);
  } catch (error) {
    if ((await receipt()).replayed) return;
    const recent = await db.prepare(`SELECT 1 FROM audit_logs WHERE subject_type=? AND subject_id=? AND action=? AND command_key IS NULL AND created_at>?`)
      .bind(sourceType, relatedId, checklistRequestAction, now - checklistReminderIntervalMs).first();
    if (recent) throw new ChecklistRequestError('A reminder can be sent once every 24 hours.');
    throw error;
  }
}

const expiryRelatedType = (kind: SellerDocumentKind) => kind === 'bank_verification' ? 'seller_bank_document' : 'seller_document';
const expirySource = `FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id
  JOIN users u ON u.id=s.user_id WHERE ${activeOwner} AND s.status='approved' AND ${nearExpiryPredicate}`;
const expiryEvent = (id: string, validUntil: number) => id + ':' + validUntil;

export function checklistExpirySelectionSql() {
  return `SELECT d.id ${expirySource} AND d.id>?
    AND NOT EXISTS(SELECT 1 FROM notification_messages n WHERE n.template_key='${documentExpiryTemplate}'
      AND n.related_id=d.id AND n.related_type IN ('seller_document','seller_bank_document') AND n.channel='in_app')
    ORDER BY d.id LIMIT 1`;
}

export async function enqueueChecklistExpiry(db: D1Database, documentId: string, now: number) {
  const expiryValues = [now, now + documentExpiryWindowMs, documentId];
  const source = expirySource + ' AND d.id=?';
  const row = await db.prepare(`SELECT d.kind,d.valid_until AS validUntil ${source}`).bind(...expiryValues)
    .first<{ kind: SellerDocumentKind; validUntil: number }>();
  if (!row) return 0;
  const label = checklistDocumentLabels[row.kind].toLowerCase();
  const date = checklistDate(row.validUntil);
  const subject = `Your ${label} expires on ${date}`;
  const body = `Your ${label} expires on ${date}. Please upload the renewed one so your payouts can continue.`;
  const results = await db.batch(await pairedStatements(db, { template: documentExpiryTemplate, eventId: expiryEvent(documentId, row.validUntil),
    subject, body, relatedId: documentId, relatedType: expiryRelatedType(row.kind), now }, source + ' AND d.valid_until=?', [...expiryValues, row.validUntil]));
  return results.some(result => Number(result.meta.changes)) ? 1 : 0;
}

type Notice = {
  template: string; relatedId: string | null; relatedType?: string | null; userId: string | null;
  audience: string; channel: string; requestId: string;
};
export async function isCurrentSellerChecklistNotice(db: D1Database, notice: Notice, now: number) {
  const { relatedId, relatedType, userId, channel, requestId, template } = notice;
  if (!relatedId || !userId || notice.audience !== 'seller' || !operationalNotificationChannels.some(value => value === channel)) return false;
  if (template === documentExpiryTemplate) {
    const source = await db.prepare(`SELECT d.kind,d.valid_until AS validUntil ${expirySource} AND d.id=? AND u.id=?`)
      .bind(now, now + documentExpiryWindowMs, relatedId, userId).first<{ kind: SellerDocumentKind; validUntil: number }>();
    return Boolean(source && relatedType === expiryRelatedType(source.kind) && requestId === await operationalNotificationRequestId(template, expiryEvent(relatedId, source.validUntil), 'owner', channel));
  }
  if (relatedType !== sourceType) return false;
  const split = relatedId.lastIndexOf(':');
  const sellerId = relatedId.slice(0, split);
  const itemId = relatedId.slice(split + 1);
  if (split < 1) return false;
  const row = await db.prepare(`SELECT a.id FROM audit_logs a JOIN seller_profiles s ON s.id=?
    JOIN users u ON u.id=s.user_id WHERE a.subject_type=? AND a.subject_id=? AND a.action=? AND a.command_key IS NULL
      AND u.id=? AND ${activeOwner} ORDER BY a.created_at DESC,a.id DESC LIMIT 1`)
    .bind(sellerId, sourceType, relatedId, checklistRequestAction, userId).first<{ id: string }>();
  if (!row || requestId !== await operationalNotificationRequestId(template, row.id, 'owner', channel)) return false;
  const checklist = await getSellerChecklist(db, sellerId, { ownerId: userId, audience: 'seller', now });
  return checklist.groups.some(group => group.items.some(item => item.id === itemId && item.turn === 'seller'));
}
