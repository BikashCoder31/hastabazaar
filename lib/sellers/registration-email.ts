export function normalizeSellerRegistrationEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ? email : null;
}

export function savedSellerRegistrationEmail(answers: Record<string, string[]> | undefined): string | null {
  return normalizeSellerRegistrationEmail(answers?.registrationEmail?.[0]);
}

// SQL uses the current account aliased as u. A consumed code for another address
// verifies that mailbox for seller registration and gives no account authority.
export function registrationEmailCheck(accountEmail: string, email: string, savedEmail?: string | null) {
  if (email === accountEmail.toLowerCase()) {
    return {
      sql: 'EXISTS(SELECT 1 FROM account_email_verifications e WHERE e.user_id=u.id AND HEX(e.email)=HEX(lower(u.email)) AND e.verified_at>0)',
      bindings: [],
    };
  }
  if (email === savedEmail) return { sql: '1=1', bindings: [] };
  return {
    sql: `EXISTS(SELECT 1 FROM account_contact_challenges c WHERE c.user_id=u.id
      AND HEX(c.auth_subject)=HEX(u.auth_subject) AND c.channel='email'
      AND HEX(c.contact_value)=HEX(?) AND HEX(c.contact_snapshot)=HEX(lower(u.email))
      AND c.delivered_at IS NOT NULL AND c.consumed_at IS NOT NULL AND c.consumed_at<c.expires_at)`,
    bindings: [email],
  };
}

export async function hasVerifiedRegistrationEmail(db: D1Database,
  account: { userId: string; authSubject: string; email: string }, email: string, savedEmail?: string | null) {
  const proof = registrationEmailCheck(account.email, email, savedEmail);
  return Boolean(await db.prepare(`SELECT 1 FROM users u WHERE u.id=? AND u.status='active'
    AND HEX(u.auth_subject)=HEX(?) AND HEX(lower(u.email))=HEX(?) AND ${proof.sql}`)
    .bind(account.userId, account.authSubject, account.email.toLowerCase(), ...proof.bindings).first());
}

export function sellerNotificationEmail(accountEmail: string | null, registrationAnswers: string | null): string | null {
  if (!registrationAnswers) return accountEmail;
  try {
    const answers = JSON.parse(registrationAnswers) as Record<string, string[]> | null;
    if (!answers || typeof answers !== 'object') return null;
    return Object.hasOwn(answers, 'registrationEmail') ? savedSellerRegistrationEmail(answers) : accountEmail;
  } catch {
    return null;
  }
}
