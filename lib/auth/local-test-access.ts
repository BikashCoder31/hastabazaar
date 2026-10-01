import type { AuthenticatedUser } from '@/app/auth';

export const localTestRoles = [
  'customer',
  'seller',
  'admin',
  'super_admin',
] as const;

export type LocalTestRole = (typeof localTestRoles)[number];

export const localTestCookieName = 'hastabazaar_local_test_role';

const identities: Record<LocalTestRole, AuthenticatedUser> = {
  customer: {
    userId: 'local-test-customer',
    displayName: 'Maya Customer',
    email: 'customer@local.hastabazaar.test',
    fullName: 'Maya Customer',
  },
  seller: {
    userId: 'local-test-seller',
    displayName: 'Sita Artisan',
    email: 'seller@local.hastabazaar.test',
    fullName: 'Sita Artisan',
  },
  admin: {
    userId: 'local-test-admin',
    displayName: 'Aarav Admin',
    email: 'admin@local.hastabazaar.test',
    fullName: 'Aarav Admin',
  },
  super_admin: {
    userId: 'local-test-super-admin',
    displayName: 'Nisha Super Admin',
    email: 'superadmin@local.hastabazaar.test',
    fullName: 'Nisha Super Admin',
  },
};

export function isLocalTestRequest(requestHeaders: Headers): boolean {
  if (process.env.NODE_ENV === 'production') return false;

  const hostname = (requestHeaders.get('host') ?? '')
    .split(':')[0]
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function readLocalTestRole(requestHeaders: Headers): LocalTestRole | null {
  if (!isLocalTestRequest(requestHeaders)) return null;

  const cookieHeader = requestHeaders.get('cookie') ?? '';
  const value = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${localTestCookieName}=`))
    ?.slice(localTestCookieName.length + 1);
  if (!value) return null;

  const decoded = decodeURIComponent(value);
  return localTestRoles.find((role) => role === decoded) ?? null;
}

export function getLocalTestIdentity(requestHeaders: Headers): AuthenticatedUser | null {
  const role = readLocalTestRole(requestHeaders);
  return role ? identities[role] : null;
}

export function localTestIdentity(role: LocalTestRole): AuthenticatedUser {
  return identities[role];
}
