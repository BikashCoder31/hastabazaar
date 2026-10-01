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
    path.startsWith('/api/auth/') || path === '/forgot-password' || path === '/forgot-password/reset'
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
