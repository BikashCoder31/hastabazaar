// Only call after a provider-verified email or a consumed mailbox challenge.
// Existing staff credentials are retained for access continuity; new invitations
// still require mailbox proof. Other unverified credentials cannot survive claim.
export function mailboxClaimStatements(db: D1Database, userId: string, now: number) {
 const unverified = `NOT EXISTS (SELECT 1 FROM account_email_verifications v JOIN users u ON u.id=v.user_id WHERE v.user_id=? AND v.email=lower(u.email)) AND EXISTS(SELECT 1 FROM users active_user WHERE active_user.id=? AND active_user.status='active')`;
 return [
  db.prepare('UPDATE users SET updated_at=updated_at WHERE id=?').bind(userId),
  db.prepare(`DELETE FROM user_sessions WHERE user_id=? AND ${unverified}`).bind(userId,userId,userId),
  db.prepare(`DELETE FROM user_credentials WHERE user_id=? AND ${unverified} AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=? AND role IN ('admin','super_admin'))`).bind(userId,userId,userId,userId),
  db.prepare(`INSERT OR IGNORE INTO account_email_verifications(user_id,email,verified_at) SELECT id,lower(email),? FROM users WHERE id=? AND status='active'`).bind(now,userId),
  db.prepare(`UPDATE account_email_verifications SET email=(SELECT lower(email) FROM users WHERE id=?), verified_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')`).bind(userId,now,userId,userId),
 ];
}
export function hasMailboxProof(identity: {mailboxVerified?: boolean}): boolean {
 return identity.mailboxVerified === true;
}
