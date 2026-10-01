import { staffMutationGuard } from './staff-mutation-guard';
export class GiftCardConflictError extends Error {}
export const MAX_GIFT_PAISA = Number.MAX_SAFE_INTEGER;
export function parseGiftAmount(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d{1,14}(?:\.\d{1,2})?$/.test(value.trim())
  )
    throw new GiftCardConflictError(
      'Enter a positive rupee amount with at most two decimal places.',
    );
  const [whole, fraction = ''] = value.trim().split('.');
  const paisa = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (paisa < BigInt(1) || paisa > BigInt(MAX_GIFT_PAISA))
    throw new GiftCardConflictError('Amount exceeds the safe money range.');
  return Number(paisa);
}
const validRequest = (id: string) => {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id))
    throw new GiftCardConflictError('Invalid request reference.');
};
async function hashCode(code: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
function guard(db: D1Database, predicate: string, values: unknown[]) {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        'INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN ' +
          predicate +
          ' THEN 1 ELSE 0 END',
      )
      .bind(id, ...values),
    db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(id),
  ];
}
function audit(
  db: D1Database,
  actor: string,
  action: string,
  id: string,
  amount: number,
  request: string,
  now: number,
) {
  return db
    .prepare(
      "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,?,'gift_card',?,'Shopping credit gift card operation',NULL,?,?,NULL,?)",
    )
    .bind(
      crypto.randomUUID(),
      actor,
      action,
      id,
      JSON.stringify({ amountPaisa: amount }),
      request,
      now,
    );
}
function notification(
  db: D1Database,
  user: string,
  id: string,
  now: number,
  issued: boolean,
) {
  const title = issued ? 'Gift card issued' : 'Gift card shopping credit added';
  const body = issued
    ? 'Your gift card was issued. Its secret code is shown only in the issuance response. Open gift cards to review the safe issuance record.'
    : 'Shopping credit is available in your wallet. Use it for products at checkout; deposits and withdrawals are unavailable.';
  return db
    .prepare(
      "INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,required_permission) VALUES (?,?,?,'in_app',?,?,?,?,?,? ,?,'queued',?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      user,
      issued ? 'staff' : 'customer',
      issued ? 'gift_card.issued' : 'gift_card.redeemed',
      title,
      title,
      body,
      body,
      issued ? 'gift_card_issued' : 'gift_card',
      id,
      'gift:' + id + ':' + (issued ? 'issued' : 'redeemed'),
      now,
      issued ? 'admin.invite' : null,
    );
}
export async function issueGiftCard(
  db: D1Database,
  o: { actorId: string; amountPaisa: number; requestId: string; now: number },
) {
  validRequest(o.requestId);
  if (!Number.isSafeInteger(o.amountPaisa) || o.amountPaisa < 1)
    throw new GiftCardConflictError(
      'Enter a positive amount within the safe money range.',
    );
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'admin.invite',
    GiftCardConflictError,
    'super_admin',
  );
  const prior = await db
    .prepare(
      'SELECT id,amount_paisa AS amountPaisa FROM gift_cards WHERE issuance_request_id=? AND issued_by=?',
    )
    .bind(o.requestId, o.actorId)
    .first<{ id: string; amountPaisa: number }>();
  if (prior) {
    if (prior.amountPaisa !== o.amountPaisa)
      throw new GiftCardConflictError(
        'This request was already used for another amount.',
      );
    return { ...prior, code: null, duplicate: true };
  }
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const code =
    'HG-' +
    Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  const hash = await hashCode(code),
    id = crypto.randomUUID();
  try {
    await db.batch([
      ...authority.statements,
      db
        .prepare(
          'INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(id, hash, o.amountPaisa, o.actorId, o.requestId, o.now),
      audit(
        db,
        o.actorId,
        'gift_card.issued',
        id,
        o.amountPaisa,
        o.requestId,
        o.now,
      ),
      notification(db, o.actorId, id, o.now, true),
    ]);
  } catch {
    throw new GiftCardConflictError(
      'Gift card could not be issued. Retry the same request to check its result.',
    );
  }
  return { id, amountPaisa: o.amountPaisa, code, duplicate: false };
}
export async function redeemGiftCard(
  db: D1Database,
  o: { userId: string; code: string; requestId: string; now: number },
) {
  validRequest(o.requestId);
  const code = o.code.trim().toUpperCase();
  if (!/^HG-[A-F0-9]{48}$/.test(code))
    throw new GiftCardConflictError('This gift card cannot be redeemed.');
  const hash = await hashCode(code);
  const card = await db
    .prepare(
      'SELECT id,amount_paisa AS amountPaisa,redeemed_by AS redeemedBy,redemption_request_id AS requestId FROM gift_cards WHERE code_hash=?',
    )
    .bind(hash)
    .first<{
      id: string;
      amountPaisa: number;
      redeemedBy: string | null;
      requestId: string | null;
    }>();
  if (!card)
    throw new GiftCardConflictError('This gift card cannot be redeemed.');
  const active =
    "EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='customer')";
  if (
    !(await db
      .prepare('SELECT 1 WHERE ' + active)
      .bind(o.userId)
      .first())
  )
    throw new GiftCardConflictError(
      'An active signed-in customer is required.',
    );
  if (card.redeemedBy) {
    if (card.redeemedBy === o.userId && card.requestId === o.requestId)
      return { id: card.id, amountPaisa: card.amountPaisa, duplicate: true };
    throw new GiftCardConflictError('This gift card cannot be redeemed.');
  }
  try {
    await db.batch([
      ...guard(db, active, [o.userId]),
      db
        .prepare(
          'INSERT OR IGNORE INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES (?,?,0,?)',
        )
        .bind(
          o.userId,
          crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
          o.now,
        ),
      // Lock the balance before the upper-bound check: concurrent gift cards cannot overflow JS money precision.
      db
        .prepare(
          'UPDATE wallet_accounts SET balance_paisa=balance_paisa WHERE user_id=?',
        )
        .bind(o.userId),
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM wallet_accounts WHERE user_id=? AND balance_paisa<=?)',
        [o.userId, MAX_GIFT_PAISA - card.amountPaisa],
      ),
      db
        .prepare(
          'UPDATE gift_cards SET redeemed_by=?,redeemed_at=?,redemption_request_id=? WHERE id=? AND redeemed_by IS NULL',
        )
        .bind(o.userId, o.now, o.requestId, card.id),
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM gift_cards WHERE id=? AND redeemed_by=? AND redemption_request_id=?)',
        [card.id, o.userId, o.requestId],
      ),
      db
        .prepare(
          "INSERT INTO wallet_entries(id,user_id,order_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES (?,?,NULL,?,?,?,'gift_card',?)",
        )
        .bind(
          'gift:' + card.id,
          o.userId,
          card.id,
          card.amountPaisa,
          -card.amountPaisa,
          o.now,
        ),
      audit(
        db,
        o.userId,
        'gift_card.redeemed',
        card.id,
        card.amountPaisa,
        o.requestId,
        o.now,
      ),
      notification(db, o.userId, card.id, o.now, false),
    ]);
  } catch {
    throw new GiftCardConflictError(
      'This gift card cannot be redeemed or the wallet has reached its safe money limit. Refresh before retrying.',
    );
  }
  return { id: card.id, amountPaisa: card.amountPaisa, duplicate: false };
}
export async function listGiftCards(db: D1Database) {
  return (
    await db
      .prepare(
        'SELECT id,amount_paisa AS amountPaisa,issued_by AS issuedBy,issued_at AS issuedAt,redeemed_at AS redeemedAt FROM gift_cards ORDER BY issued_at DESC,id DESC LIMIT 100',
      )
      .all<{
        id: string;
        amountPaisa: number;
        issuedBy: string;
        issuedAt: number;
        redeemedAt: number | null;
      }>()
  ).results;
}
