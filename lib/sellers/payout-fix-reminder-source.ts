import { getSellerFinanceSummary, standardLedgerEligibility } from '../db/repositories/payouts';
import { accountedDeliveryAttemptsSql, eligibleDeliverySql } from '../email/delivery-attempts';
import { digestFormRequest } from '../forms/submission';
import { formatPaisaExact } from '../marketplace/money-display';
import { operationalNotificationChannels, operationalNotificationRequestId } from '../operations/event-catalog';
import { payoutFixDocumentNames, readSellerPayoutFixes, sellerPayoutFixOpenSql, type SellerPayoutFix } from './payout-fixes';

const template = 'business.seller.payout_fix_ready';
const relatedType = 'seller_payout_fix';
const subject = 'Your earnings are ready · Fix before your first payout';
const subjectNe = 'तपाईंको आम्दानी तयार छ · पहिलो भुक्तानीअघि विवरण सच्याउनुहोस्';

function reminderProof(fix: SellerPayoutFix, amountPaisa: number) {
  return digestFormRequest([fix.sellerId, fix.id, fix.documentId, amountPaisa]);
}

function readyBalanceSql(sellerExpression: string) {
  return `(SELECT COALESCE(SUM(e.amount_paisa),0) FROM seller_ledger_entries e
    WHERE e.seller_id=${sellerExpression} AND e.available_at<=?
    AND ${standardLedgerEligibility('e')}
    AND NOT EXISTS(SELECT 1 FROM payout_entries pe WHERE pe.ledger_entry_id=e.id AND pe.released_at IS NULL))`;
}

function refreshableReminderSql(alias: string) {
  return `${alias}.read_at IS NULL AND ${alias}.sent_at IS NULL
    AND ${alias}.delivery_claim_token IS NULL AND ${alias}.delivery_lease_until=0
    AND (${alias}.status='queued' OR ${alias}.status='cancelled' AND ${alias}.failure_reason='obsolete_or_access_changed')
    AND ${eligibleDeliverySql('business', `${alias}.id`)}
    AND ${accountedDeliveryAttemptsSql('business', `${alias}.id`, `${alias}.delivery_attempts`)}`;
}

export function payoutFixReminderSelectionSql() {
  return `SELECT s.id FROM seller_profiles s JOIN users u ON u.id=s.user_id
    WHERE s.id>? AND u.status='active' AND ${sellerPayoutFixOpenSql('s.id')}
    AND (NOT EXISTS(SELECT 1 FROM notification_messages notice WHERE notice.recipient_user_id=s.user_id
      AND notice.template_key='${template}' AND notice.channel='in_app')
    OR EXISTS(SELECT 1 FROM notification_messages notice WHERE notice.recipient_user_id=s.user_id
      AND notice.template_key='${template}' AND ${refreshableReminderSql('notice')}))
    AND ${readyBalanceSql('s.id')}>0 ORDER BY s.id LIMIT 1`;
}

export async function enqueuePayoutFixReadyReminder(db: D1Database, sellerId: string, now: number) {
  const [fixes, earnings] = await Promise.all([
    readSellerPayoutFixes(db, sellerId),
    getSellerFinanceSummary(db, sellerId, now),
  ]);
  const fix = fixes.find(item => item.waitingFor === 'seller');
  if (!fix || earnings.availablePaisa <= 0) return 0;
  const amount = formatPaisaExact(earnings.availablePaisa);
  const wording = payoutFixDocumentNames[fix.kind];
  const proof = await reminderProof(fix, earnings.availablePaisa);
  const body = `${amount} is ready for you. Fix your ${wording.en} to receive it.`;
  const bodyNe = `रु ${amount.slice(4)} तपाईंका लागि तयार छ। रकम पाउन आफ्नो ${wording.ne} सच्याउनुहोस्।`;
  const source = `FROM seller_profiles s JOIN users u ON u.id=s.user_id
    WHERE s.id=? AND u.status='active' AND ${sellerPayoutFixOpenSql('s.id', '?')}
    AND EXISTS(SELECT 1 FROM seller_documents d WHERE d.id=? AND d.seller_id=s.id
      AND NOT EXISTS(SELECT 1 FROM seller_documents latest WHERE latest.seller_id=s.id AND latest.kind=d.kind
        AND (latest.uploaded_at>d.uploaded_at OR latest.uploaded_at=d.uploaded_at AND latest.id>d.id)))
    AND ${readyBalanceSql('s.id')}=?`;
  const sourceValues = [sellerId, fix.id, fix.documentId, now, earnings.availablePaisa];
  const notices = await Promise.all(operationalNotificationChannels.map(async channel => {
    const requestId = await operationalNotificationRequestId(template, sellerId, 'owner', channel);
    return [
      db.prepare(`INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,
        subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key)
        SELECT ?,u.id,'seller',?,?,?,?,?,?,?,?,'queued',?,?,? ${source}`)
        .bind(crypto.randomUUID(), channel, template, subject, subjectNe, body, bodyNe, relatedType, proof,
          requestId, now, template, ...sourceValues),
      // The same reminder may still be waiting to go out when the source changes.
      // Keep its identity and attempt history, and never rewrite delivered or read notices.
      db.prepare(`UPDATE notification_messages SET body_en=?,body_ne=?,related_id=?,status='queued',failure_reason=NULL
        WHERE request_id=? AND template_key=? AND channel=? AND related_id<>? AND ${refreshableReminderSql('notification_messages')}
          AND EXISTS(SELECT 1 ${source} AND u.id=notification_messages.recipient_user_id)`)
        .bind(body, bodyNe, proof, requestId, template, channel, proof, ...sourceValues),
    ];
  }));
  const results = await db.batch(notices.flat());
  return results.some(result => Number(result.meta.changes) === 1) ? 1 : 0;
}

export async function isCurrentPayoutFixReminderNotice(db: D1Database, notice: {
  relatedId: string | null; relatedType?: string | null; userId: string | null; audience: string; channel: string; requestId: string;
}, now: number) {
  if (notice.relatedType !== relatedType || notice.audience !== 'seller' || !notice.relatedId || !notice.userId) return false;
  const owner = await db.prepare(`SELECT s.id AS sellerId,${readyBalanceSql('s.id')} AS availablePaisa
    FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE u.id=? AND u.status='active'`)
    .bind(now, notice.userId).first<{ sellerId: string; availablePaisa: number }>();
  if (!owner || Number(owner.availablePaisa) <= 0 ||
    notice.requestId !== await operationalNotificationRequestId(template, owner.sellerId, 'owner', notice.channel)) return false;
  for (const fix of await readSellerPayoutFixes(db, owner.sellerId)) {
    if (fix.waitingFor === 'seller' && notice.relatedId === await reminderProof(fix, Number(owner.availablePaisa))) return true;
  }
  return false;
}
