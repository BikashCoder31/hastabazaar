import type { ChatGPTUser } from '@/app/chatgpt-auth';

export const localTestRoles = [
  'customer',
  'seller',
  'admin',
  'super_admin',
] as const;

export type LocalTestRole = (typeof localTestRoles)[number];

export const localTestCookieName = 'hathkriti_local_test_role';

const identities: Record<LocalTestRole, ChatGPTUser> = {
  customer: {
    userId: 'local-test-customer',
    displayName: 'Maya Customer',
    email: 'customer@local.hathkriti.test',
    fullName: 'Maya Customer',
  },
  seller: {
    userId: 'local-test-seller',
    displayName: 'Sita Artisan',
    email: 'seller@local.hathkriti.test',
    fullName: 'Sita Artisan',
  },
  admin: {
    userId: 'local-test-admin',
    displayName: 'Aarav Admin',
    email: 'admin@local.hathkriti.test',
    fullName: 'Aarav Admin',
  },
  super_admin: {
    userId: 'local-test-super-admin',
    displayName: 'Nisha Super Admin',
    email: 'superadmin@local.hathkriti.test',
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

export function getLocalTestIdentity(requestHeaders: Headers): ChatGPTUser | null {
  const role = readLocalTestRole(requestHeaders);
  return role ? identities[role] : null;
}

export function localTestIdentity(role: LocalTestRole): ChatGPTUser {
  return identities[role];
}

