import assert from 'node:assert/strict';
import { normalizeNepalMobile } from '../../lib/auth/nepal-phone';

/** Explicit fictional checkout proof; never marks unrelated fixture users verified. */
export async function seedVerifiedCheckoutContact(db: D1Database, userId: string, phone = '9811111111', now = 1) {
  const canonical = normalizeNepalMobile(phone);
  assert.ok(canonical, 'A fictional Nepal mobile is required.');
  const user = await db.prepare('SELECT email FROM users WHERE id=?').bind(userId).first<{ email: string }>();
  assert.ok(user, 'Create the intended fictional customer before verifying contact.');
  const mariaDb = (db as unknown as { dialect?: string }).dialect === 'mariadb';
  const emailUpdate = mariaDb
    ? 'ON DUPLICATE KEY UPDATE email=VALUES(email),verified_at=VALUES(verified_at)'
    : 'ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at';
  const phoneUpdate = mariaDb
    ? 'ON DUPLICATE KEY UPDATE phone=VALUES(phone),verified_at=VALUES(verified_at)'
    : 'ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,verified_at=excluded.verified_at';
  await db.batch([
    db.prepare('UPDATE users SET phone=? WHERE id=?').bind(canonical, userId),
    db.prepare(`INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES (?,?,?) ${emailUpdate}`).bind(userId, user.email.toLowerCase(), now),
    db.prepare(`INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES (?,?,?) ${phoneUpdate}`).bind(userId, canonical, now),
  ]);
}

export async function seedCheckoutBuyer(db: D1Database, userId = 'checkout-buyer', email = 'buyer@example.test', phone = '9811111111', now = 1) {
  await db.batch([
    db.prepare("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,'Fictional checkout buyer','en-NP','active',?,?)").bind(userId, userId, email, now, now),
    db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'customer',?)").bind(userId, now),
  ]);
  await seedVerifiedCheckoutContact(db, userId, phone, now);
}
