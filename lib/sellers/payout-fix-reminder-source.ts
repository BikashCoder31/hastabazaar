import { getSellerFinanceSummary, standardLedgerEligibility } from '../db/repositories/payouts';
import { formatPaisaExact } from '../marketplace/money-display';
import { operationalNotificationChannels, operationalNotificationRequestId } from '../operations/event-catalog';
import { payoutFixDocumentNames, readSellerPayoutFixes, sellerPayoutFixOpenSql } from './payout-fixes';

const template = 'business.seller.payout_fix_ready';
const relatedType = 'seller_payout_fix';
const subject = 'Your earnings are ready · Fix before your first payout';
const subjectNe = 'तपाईंको आम्दानी तयार छ · पहिलो भुक्तानीअघि विवरण सच्याउनुहोस्';

function readyBalanceSql(sellerExpression: string) {
  return `(SELECT COALESCE(SUM(e.amount_paisa),0) FROM seller_ledger_entries e
    WHERE e.seller_id=${sellerExpression} AND e.available_at<=?
    AND ${standardLedgerEligibility('e')}
    AND NOT EXISTS(SELECT 1 FROM payout_entries pe WHERE pe.ledger_entry_id=e.id AND pe.released_at IS NULL))`;
}

export function payoutFixReminderSelectionSql() {
  return `SELECT s.id FROM seller_profiles s JOIN users u ON u.id=s.user_id
    WHERE s.id>? AND u.status='active' AND ${sellerPayoutFixOpenSql('s.id')}
    AND NOT EXISTS(SELECT 1 FROM notification_messages notice WHERE notice.recipient_user_id=s.user_id
      AND notice.template_key='${template}' AND notice.related_id=s.id AND notice.channel='in_app')
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
  const notices = await Promise.all(operationalNotificationChannels.map(async channel =>
    db.prepare(`INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,
      subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key)
      SELECT ?,u.id,'seller',?,?,?,?,?,?,?,s.id,'queued',?,?,?
      FROM seller_profiles s JOIN users u ON u.id=s.user_id
      WHERE s.id=? AND u.status='active' AND ${sellerPayoutFixOpenSql('s.id', '?')}
      AND EXISTS(SELECT 1 FROM seller_documents d WHERE d.id=? AND d.seller_id=s.id
        AND NOT EXISTS(SELECT 1 FROM seller_documents latest WHERE latest.seller_id=s.id AND latest.kind=d.kind
          AND (latest.uploaded_at>d.uploaded_at OR latest.uploaded_at=d.uploaded_at AND latest.id>d.id)))
      AND ${readyBalanceSql('s.id')}=?`)
      .bind(crypto.randomUUID(), channel, template, subject, subjectNe,
        `${amount} is ready for you. Fix your ${wording.en} to receive it.`,
        `रु ${amount.slice(4)} तपाईंका लागि तयार छ। रकम पाउन आफ्नो ${wording.ne} सच्याउनुहोस्।`,
        relatedType, await operationalNotificationRequestId(template, sellerId, 'owner', channel), now, template,
        sellerId, fix.id, fix.documentId, now, earnings.availablePaisa),
  ));
  const results = await db.batch(notices);
  return results.some(result => Number(result.meta.changes) === 1) ? 1 : 0;
}

export async function isCurrentPayoutFixReminderNotice(db: D1Database, notice: {
  relatedId: string | null; relatedType?: string | null; userId: string | null; audience: string; channel: string; requestId: string;
}, now: number) {
  if (notice.relatedType !== relatedType || notice.audience !== 'seller' || !notice.relatedId || !notice.userId) return false;
  if (notice.requestId !== await operationalNotificationRequestId(template, notice.relatedId, 'owner', notice.channel)) return false;
  const owner = await db.prepare(`SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
    WHERE s.id=? AND u.id=? AND u.status='active' AND ${sellerPayoutFixOpenSql('s.id')} AND ${readyBalanceSql('s.id')}>0`)
    .bind(notice.relatedId, notice.userId, now).first();
  return Boolean(owner) && (await readSellerPayoutFixes(db, notice.relatedId)).some(fix => fix.waitingFor === 'seller');
}
