import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';

export class NotificationRecipientError extends Error {
  constructor(message: string, readonly status: 401|403) { super(message); }
}
/** Notification reads must never provision an account or add a customer role. */
export async function requireNotificationRecipientApi() {
  const identity = await getAuthenticatedUser({readOnly:true});
  if (!identity) throw new NotificationRecipientError('Sign in to view notifications.', 401);
  const viewer = await requireDatabase(env as unknown as { DB?: D1Database }).prepare(`SELECT u.id AS userId,u.auth_subject AS authSubject
    FROM users u WHERE u.auth_subject=? AND u.status='active'
      AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller')) LIMIT 1`)
    .bind(identity.userId).first<{ userId: string; authSubject: string }>();
  if (!viewer) throw new NotificationRecipientError('Notification access is unavailable.', 403);
  return viewer;
}
