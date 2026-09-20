import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';

import { requireDatabase } from '@/lib/db/d1';
import { getHostedIdentity } from '@/lib/auth/hosted-session';
import { getLocalTestIdentity } from '@/lib/auth/local-test-access';
import { safeRelativeReturnPath } from '@/lib/http/safe-return';

export { safeRelativeReturnPath } from '@/lib/http/safe-return';

export type AuthenticatedUser = {
  mailboxVerified?: boolean;
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const SIGN_IN_PATH = '/login';
const SIGN_OUT_PATH = '/api/auth/logout';

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const requestHeaders = await headers();
  const localTestIdentity = getLocalTestIdentity(requestHeaders);
  if (localTestIdentity) return localTestIdentity;

  return getHostedIdentity(
    requireDatabase(env as unknown as { DB?: D1Database }),
    requestHeaders,
  );
}

export async function requireAuthenticatedUser(
  returnTo: string,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (user) return user;

  redirect(signInPath(returnTo));
}

export function signInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function signOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}
