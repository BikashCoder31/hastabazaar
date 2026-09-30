import {
  createEmailOtpChallenge,
  checkEmailOtpChallenge,
  emailOtpTokenHash,
  type EmailOtpChallengeRecord,
} from './email-otp';
import { createHostedSessionForUser } from './hosted-session';
import { normalizeNepalMobile } from './nepal-phone';

export type ContactChannel = 'email' | 'phone';
export type CheckoutContactPolicy = 'email_and_phone' | 'email_only';
export function resolveCheckoutContactPolicy(value: string | undefined): CheckoutContactPolicy {
  return value === 'email_only' ? 'email_only' : 'email_and_phone';
}
export type ContactActor = { userId: string; authSubject: string; sessionHash?: string | null; localFixture?: boolean };
export class ContactVerificationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 409 | 429 | 503 = 409,
  ) {
    super(message);
  }
}
export type ContactDelivery = {
  userId: string;
  channel: ContactChannel;
  contact: string;
  email: string;
  tokenHash: string;
  code: string;
  expiresAt: number;
};
export type ContactVerificationStatus = {
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
};
type Account = ContactVerificationStatus & {
  rawPhone: string | null;
  authSubject: string;
  userId: string;
};
type Challenge = EmailOtpChallengeRecord & {
  authSubject: string;
  channel: ContactChannel;
  contact: string;
  snapshot: string;
  deliveredAt: number | null;
};

async function account(db: D1Database, actor: ContactActor): Promise<Account> {
  const row = await db
    .prepare(`SELECT u.id AS userId,u.auth_subject AS authSubject,lower(u.email) AS email,u.phone AS rawPhone,
    EXISTS(SELECT 1 FROM account_email_verifications v WHERE v.user_id=u.id AND v.email=lower(u.email)) AS emailVerified,
    (SELECT phone FROM account_phone_verifications p WHERE p.user_id=u.id) AS verifiedPhone
    FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='customer'
    WHERE u.id=? AND u.auth_subject=? AND u.status='active'`)
    .bind(actor.userId, actor.authSubject)
    .first<{
      userId: string;
      authSubject: string;
      email: string;
      rawPhone: string | null;
      emailVerified: number;
      verifiedPhone: string | null;
    }>();
  if (!row)
    throw new ContactVerificationError(
      'Sign in to an active customer account.',
      401,
    );
  const phone = normalizeNepalMobile(row.rawPhone);
  return {
    ...row,
    phone,
    emailVerified: Boolean(row.emailVerified),
    phoneVerified: phone !== null && row.verifiedPhone === phone,
  };
}

export async function getContactVerificationStatus(
  db: D1Database,
  actor: ContactActor,
): Promise<ContactVerificationStatus> {
  const current = await account(db, actor);
  return {
    email: current.email,
    phone: current.phone,
    emailVerified: current.emailVerified,
    phoneVerified: current.phoneVerified,
  };
}

function guard(
  db: D1Database,
  predicate: string,
  values: (string | number | null)[],
) {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`,
      )
      .bind(id, ...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),
  ];
}
function ownerPredicate(channel: ContactChannel) {
  return `EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='customer' WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND ${channel === 'email' ? 'lower(u.email)=?' : 'u.phone=?'})`;
}
function contactSnapshot(current: Account, channel: ContactChannel) {
  return channel === 'email' ? current.email : current.rawPhone!;
}

function sessionGuards(db: D1Database, actor: ContactActor, current: Account, now: number) {
  // Only the HTTP route may identify a guarded local role fixture. Production
  // and every hosted caller must prove an unexpired originating session.
  if (actor.localFixture && process.env.NODE_ENV !== 'production' &&
      /^local-test-(customer|buyer)$/.test(actor.authSubject) &&
      current.email.endsWith('@local.hastabazaar.test')) return [];
  if (!actor.sessionHash || !/^[a-f0-9]{64}$/.test(actor.sessionHash))
    throw new ContactVerificationError('Your sign-in changed. Sign in again before verifying contact.', 401);
  return guard(db, 'EXISTS(SELECT 1 FROM user_sessions WHERE token_hash=? AND user_id=? AND expires_at>?)',
    [actor.sessionHash, actor.userId, now]);
}

export async function requestContactVerification(
  db: D1Database,
  actor: ContactActor,
  channel: ContactChannel,
  deliver: (message: ContactDelivery) => Promise<void>,
  now = Date.now(),
): Promise<{ verified: boolean; token?: string; expiresAt?: number }> {
  const current = await account(db, actor);
  const boundary = sessionGuards(db, actor, current, now);
  if (channel === 'email' ? current.emailVerified : current.phoneVerified)
    return { verified: true };
  const contact = channel === 'email' ? current.email : current.phone;
  if (!contact)
    throw new ContactVerificationError(
      'Save a valid Nepal mobile number in your profile first.',
      400,
    );
  const last = await db
    .prepare(
      'SELECT created_at AS at FROM account_contact_challenges WHERE user_id=? AND channel=?',
    )
    .bind(actor.userId, channel)
    .first<{ at: number }>();
  if (last && last.at > now - 60_000)
    throw new ContactVerificationError(
      'Please wait one minute before requesting another code.',
      429,
    );
  const challenge = createEmailOtpChallenge({ userId: actor.userId, now });
  const snapshot = contactSnapshot(current, channel);
  try {
    await db.batch([
      db
        .prepare('UPDATE users SET updated_at=updated_at WHERE id=?')
        .bind(actor.userId),
      ...boundary,
      ...guard(db, ownerPredicate(channel), [
        actor.userId,
        actor.authSubject,
        snapshot,
      ]),
      ...guard(
        db,
        'NOT EXISTS(SELECT 1 FROM account_contact_challenges WHERE user_id=? AND channel=? AND created_at>?)',
        [actor.userId, channel, now - 60_000],
      ),
      db
        .prepare(
          'DELETE FROM account_contact_challenges WHERE user_id=? AND channel=?',
        )
        .bind(actor.userId, channel),
      db
        .prepare(`INSERT INTO account_contact_challenges(token_hash,code_hash,user_id,auth_subject,channel,contact_value,contact_snapshot,attempts,expires_at,created_at)
        VALUES (?,?,?,?,?,?,?,0,?,?)`)
        .bind(
          challenge.record.tokenHash,
          challenge.record.codeHash,
          actor.userId,
          actor.authSubject,
          channel,
          contact,
          snapshot,
          challenge.record.expiresAt,
          now,
        ),
    ]);
  } catch {
    throw new ContactVerificationError(
      'Your contact changed or a code was just requested. Refresh and wait before retrying.',
      429,
    );
  }
  try {
    await deliver({
      userId: actor.userId,
      channel,
      contact,
      email: current.email,
      tokenHash: challenge.record.tokenHash,
      code: challenge.code,
      expiresAt: challenge.record.expiresAt,
    });
    const result = await db
      .prepare(
        `UPDATE account_contact_challenges SET delivered_at=? WHERE token_hash=? AND consumed_at IS NULL AND ${ownerPredicate(channel)}`,
      )
      .bind(
        now,
        challenge.record.tokenHash,
        actor.userId,
        actor.authSubject,
        snapshot,
      )
      .run();
    if (Number(result.meta.changes) !== 1)
      throw new ContactVerificationError(
        'Your contact changed. Request a new code.',
      );
  } catch (error) {
    await db
      .prepare('DELETE FROM account_contact_challenges WHERE token_hash=?')
      .bind(challenge.record.tokenHash)
      .run();
    if (error instanceof ContactVerificationError) throw error;
    throw new ContactVerificationError(
      'Code delivery is unavailable. Please try again later.',
      503,
    );
  }
  return {
    verified: false,
    token: challenge.token,
    expiresAt: challenge.record.expiresAt,
  };
}

export async function verifyContactVerification(
  db: D1Database,
  actor: ContactActor,
  channel: ContactChannel,
  token: string,
  code: string,
  now = Date.now(),
): Promise<{ sessionToken?: string }> {
  const current = await account(db, actor);
  const boundary = sessionGuards(db, actor, current, now);
  const tokenHash = emailOtpTokenHash(token);
  const record = await db
    .prepare(`SELECT token_hash AS tokenHash,code_hash AS codeHash,user_id AS userId,auth_subject AS authSubject,
    channel,contact_value AS contact,contact_snapshot AS snapshot,attempts,expires_at AS expiresAt,created_at AS createdAt,
    consumed_at AS consumedAt,delivered_at AS deliveredAt FROM account_contact_challenges WHERE token_hash=? AND user_id=? AND auth_subject=? AND channel=?`)
    .bind(tokenHash, actor.userId, actor.authSubject, channel)
    .first<Challenge>();
  if (
    !record ||
    record.deliveredAt === null ||
    record.snapshot !== contactSnapshot(current, channel) ||
    record.contact !== (channel === 'email' ? current.email : current.phone)
  )
    throw new ContactVerificationError(
      'The code or contact is no longer valid. Request a new code.',
    );
  const status = checkEmailOtpChallenge(record, token, code, now);
  if (status === 'invalid')
    await db
      .prepare(
        'UPDATE account_contact_challenges SET attempts=attempts+1 WHERE token_hash=? AND consumed_at IS NULL AND attempts<5',
      )
      .bind(tokenHash)
      .run();
  if (status !== 'valid')
    throw new ContactVerificationError(
      'The code is invalid, expired, already used, or has too many attempts. Request a new code.',
    );
  const claim = db
    .prepare(`UPDATE account_contact_challenges SET consumed_at=? WHERE token_hash=? AND code_hash=? AND user_id=? AND auth_subject=?
    AND channel=? AND consumed_at IS NULL AND delivered_at IS NOT NULL AND expires_at>? AND attempts<5 AND ${ownerPredicate(channel)}`)
    .bind(
      now,
      tokenHash,
      record.codeHash,
      actor.userId,
      actor.authSubject,
      channel,
      now,
      actor.userId,
      actor.authSubject,
      record.snapshot,
    );
  const checked = db.prepare(
    `SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('invalid','$') END`,
  );
  try {
    if (channel === 'email') {
      const sessionToken = await createHostedSessionForUser(
        db,
        actor.userId,
        now,
        { mailbox: true },
        db
          .prepare('DELETE FROM local_contact_captures WHERE token_hash=?')
          .bind(tokenHash),
        claim,
        [...boundary, db
          .prepare(
            `SELECT CASE WHEN ${ownerPredicate(channel)} THEN 1 ELSE json_extract('invalid','$') END`,
          )
          .bind(actor.userId, actor.authSubject, record.snapshot)],
      );
      return { sessionToken };
    }
    await db.batch([
      db
        .prepare('UPDATE users SET updated_at=updated_at WHERE id=?')
        .bind(actor.userId),
      ...boundary,
      claim,
      checked,
      db
        .prepare('DELETE FROM account_phone_verifications WHERE user_id=?')
        .bind(actor.userId),
      db
        .prepare(
          'INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES (?,?,?)',
        )
        .bind(actor.userId, record.contact, now),
      db
        .prepare('DELETE FROM local_contact_captures WHERE token_hash=?')
        .bind(tokenHash),
    ]);
    return {};
  } catch {
    throw new ContactVerificationError(
      'Your contact or code changed. Refresh and request a new code.',
    );
  }
}

export type CheckoutContactProof = {
  actor: ContactActor;
  email: string;
  phone: string;
  rawPhone: string;
  policy: CheckoutContactPolicy;
};
export async function requireCheckoutContactProof(
  db: D1Database,
  actor: ContactActor | null,
  email: string,
  phone: string,
  policy: CheckoutContactPolicy = 'email_and_phone',
): Promise<CheckoutContactProof> {
  if (policy !== 'email_and_phone' && policy !== 'email_only')
    throw new Error('Unknown checkout contact policy.');
  if (!actor)
    throw new ContactVerificationError(
      policy === 'email_only'
        ? 'Sign in and verify your email before placing an order.'
        : 'Sign in and verify your email and phone before placing an order.',
      401,
    );
  const current = await account(db, actor);
  if (
    current.email !== email.trim().toLowerCase() ||
    current.phone !== normalizeNepalMobile(phone)
  )
    throw new ContactVerificationError(
      'Your order email and contact phone must match your current account contacts.',
    );
  if (
    !current.emailVerified ||
    (policy === 'email_and_phone' && !current.phoneVerified) ||
    !current.phone ||
    !current.rawPhone
  )
    throw new ContactVerificationError(
      policy === 'email_only'
        ? 'Verify your current email before placing an order.'
        : 'Verify your current email and contact phone before placing an order.',
    );
  return {
    actor,
    email: current.email,
    phone: current.phone,
    rawPhone: current.rawPhone,
    policy,
  };
}
export function checkoutContactGuards(
  db: D1Database,
  proof: CheckoutContactProof,
): D1PreparedStatement[] {
  if (proof.policy !== 'email_and_phone' && proof.policy !== 'email_only')
    throw new Error('Unknown checkout contact policy.');
  const requirePhoneProof = proof.policy === 'email_and_phone';
  return [
    db
      .prepare('UPDATE users SET updated_at=updated_at WHERE id=?')
      .bind(proof.actor.userId),
    ...guard(
      db,
      `EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='customer'
      JOIN account_email_verifications e ON e.user_id=u.id AND e.email=lower(u.email)
      ${requirePhoneProof ? 'JOIN account_phone_verifications p ON p.user_id=u.id AND p.phone=?' : ''}
      WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND lower(u.email)=? AND u.phone=?)`,
      [
        ...(requirePhoneProof ? [proof.phone] : []),
        proof.actor.userId,
        proof.actor.authSubject,
        proof.email,
        proof.rawPhone,
      ],
    ),
  ];
}
