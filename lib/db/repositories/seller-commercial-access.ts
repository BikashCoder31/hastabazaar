import { getStaffPermissionProfile } from './staff-permissions';
import { can } from '../../marketplace/permissions';

export class SellerCommercialAccessError extends Error {}
export async function getSellerCommercialAccess(database: D1Database, authSubject: string) {
  const user = await database.prepare("SELECT id FROM users WHERE auth_subject=? AND status='active' LIMIT 1")
    .bind(authSubject).first<{ id: string }>();
  if (!user) return null;
  const roles = await database.prepare('SELECT role FROM user_roles WHERE user_id=?').bind(user.id).all<{ role: string }>();
  const hasRole = (role: string) => roles.results.some(row => row.role === role);
  if (hasRole('super_admin') || hasRole('admin') && can({ role: 'admin', permissions: (await getStaffPermissionProfile(database,user.id)).permissions },'commercial_policy.manage'))
    return { userId: user.id, audience: 'staff' as const };
  const profile = await database.prepare('SELECT id,status FROM seller_profiles WHERE user_id=? LIMIT 1')
    .bind(user.id).first<{ id: string; status: string }>();
  if (hasRole('seller') && profile?.status === 'approved') return { userId: user.id, audience: 'seller' as const };
  if (!hasRole('customer')) return null;
  const started = profile || await database.prepare(`SELECT 1 AS started FROM audit_logs
    WHERE actor_id=? AND subject_type='user' AND subject_id=? AND action='seller.registration.started' LIMIT 1`)
    .bind(user.id,user.id).first();
  return started ? { userId: user.id, audience: 'applicant' as const } : null;
}

export async function startSellerRegistration(database: D1Database, options: { userId: string; requestId: string; now: number }) {
  const { userId,requestId,now }=options;
  const user = await database.prepare(`SELECT id FROM users WHERE id=? AND status='active'
    AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=users.id AND role='customer')`).bind(userId).first();
  if (!user) throw new SellerCommercialAccessError('An active signed-in customer account is required to start seller registration.');
  const prior = await database.prepare(`SELECT 1 FROM audit_logs WHERE actor_id=? AND subject_type='user'
    AND subject_id=? AND action='seller.registration.started' LIMIT 1`).bind(userId,userId).first();
  if (prior) return;
  const guardId=crypto.randomUUID();
  await database.batch([
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM users WHERE id=? AND status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=users.id AND role='customer')) THEN 1 ELSE 0 END`).bind(guardId,userId),
    database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
      SELECT ?,?,'seller.registration.started','user',?,'Account holder explicitly started seller registration',NULL,'{"sellerRegistrationStarted":true}',?,NULL,?
      WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE actor_id=? AND subject_type='user' AND subject_id=? AND action='seller.registration.started')`)
      .bind(crypto.randomUUID(),userId,userId,requestId,now,userId,userId),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),
  ]);
}
