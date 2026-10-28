import { safeRelativeReturnPath } from '../http/safe-return';

// Legacy Account sign-in links mean "open my workspace". Specific shopping
// pages remain available to sellers and staff through explicit return paths.
export function safeSignInReturnPath(value?: string): string {
  if (!value) return '/auth/continue';
  const safe = safeRelativeReturnPath(value);
  const path = new URL(safe, 'https://app.local').pathname.replace(/\/+$/, '');
  if (
    (safe === '/' && value !== '/') ||
    path === '/account' ||
    path === '/login' ||
    path === '/register' ||
    path === '/login/code' ||
    path.startsWith('/api/auth/') ||
    path === '/forgot-password' ||
    path === '/forgot-password/reset'
  ) {
    return '/auth/continue';
  }
  return safe;
}

export async function defaultSignInDestination(
  hasStaffAccess: () => Promise<boolean>,
  hasApprovedSellerAccess: () => Promise<boolean>,
): Promise<string> {
  if (await hasStaffAccess()) return '/admin';
  if (await hasApprovedSellerAccess()) return '/seller';
  return '/account';
}
/** A completed mailbox sign-in still needs the account's enrolled second factor. */
export async function securitySignInDestination(
  database: D1Database,
  userId: string,
  destination: string,
): Promise<string> {
  const returnTo = safeSignInReturnPath(destination);
  if (returnTo === '/auth/continue') return returnTo;
  const protectedAccount = await database
    .prepare(
      "SELECT 1 FROM user_roles WHERE user_id=? AND role IN ('seller','admin','super_admin') LIMIT 1",
    )
    .bind(userId)
    .first();
  return protectedAccount
    ? `/auth/continue?return_to=${encodeURIComponent(returnTo)}`
    : returnTo;
}
