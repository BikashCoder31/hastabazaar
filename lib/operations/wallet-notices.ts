import { CURRENT_CUSTOMER_ROLE_SQL } from '../auth/customer-scope';
import { pairedMessageChannels, referralWalletMessage } from './message-event-catalog';

const template = referralWalletMessage.key;
const subject = referralWalletMessage.subject;
const body = 'Your referral reward is available as shopping credit. Open your wallet to see the recorded credit and your current balance.';

function requestSql(db: D1Database) {
  return (db as D1Database & { dialect?: string }).dialect === 'mariadb'
    ? "CONCAT('wallet-notice:', entry.id, ':', ?)" : "('wallet-notice:' || entry.id || ':' || ?)";
}

/** The wallet entry and both copies are inserted in one transaction. */
export function referralRewardNoticeStatements(db: D1Database, userId: string, now: number) {
  return pairedMessageChannels.map(channel => db.prepare(`INSERT OR IGNORE INTO notification_messages(
      id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,
      related_type,related_id,status,request_id,created_at,business_event_key)
    SELECT lower(hex(randomblob(16))),users.id,'customer',?,?,?,?,?,?,'wallet',users.id,'queued',${requestSql(db)},?,?
    FROM wallet_entries entry JOIN users ON users.id=entry.user_id
    WHERE entry.user_id=? AND entry.kind='referral_reward' AND entry.created_at=?
      AND users.status='active' AND ${CURRENT_CUSTOMER_ROLE_SQL}`)
    .bind(channel, template, subject, subject, body, body, channel, now, template, userId, now));
}

export async function isCurrentWalletNotice(db: D1Database, notice: {
  relatedId: string | null; relatedType?: string | null; userId: string | null;
  audience: string; channel: string; requestId: string;
}) {
  if (notice.audience !== 'customer' || notice.relatedType !== 'wallet' || !notice.userId ||
      notice.userId !== notice.relatedId || !pairedMessageChannels.some(channel => channel === notice.channel)) return false;
  return Boolean(await db.prepare(`SELECT 1 FROM wallet_entries entry JOIN users ON users.id=entry.user_id
    WHERE entry.user_id=? AND entry.kind='referral_reward' AND ${requestSql(db)}=?
      AND users.status='active' AND ${CURRENT_CUSTOMER_ROLE_SQL}`)
    .bind(notice.userId, notice.channel, notice.requestId).first());
}
