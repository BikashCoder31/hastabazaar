import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';

import { requireDatabase } from '@/lib/db/d1';
import {
  getHostedIdentity,
  readHostedSession,
} from '@/lib/auth/hosted-session';
import { getLocalTestIdentity } from '@/lib/auth/local-test-access';
import {
  interactiveNavigation,
  legacyStaffSetupAllowed,
  sellerMfaRequired,
} from '@/lib/security/session';
import { SecurityStateError } from '@/lib/security/crypto';
import {
  readSecurityInitialization,
  type SecurityPolicyBindings,
} from '@/lib/security/runtime-policy';
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
  const bindings = env as unknown as SecurityPolicyBindings & {
    DB?: D1Database;
  };
  const database = requireDatabase(bindings);
  let hosted: AuthenticatedUser | null;
  let initialized = false;
  try {
    initialized = await readSecurityInitialization(bindings);
    hosted = await getHostedIdentity(database, requestHeaders, Date.now(), {
      securityKey: bindings.HASTABAZAAR_SECURITY_KEY,
      activity: interactiveNavigation(requestHeaders),
      initialized,
    });
  } catch (error) {
    if (error instanceof SecurityStateError) return null;
    throw error;
  }
  const localTestIdentity = getLocalTestIdentity(requestHeaders);
  if (localTestIdentity) {
    const account = await database
      .prepare(
        "SELECT u.id,EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('admin','super_admin')) AS isStaff,EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller') AS isSeller FROM users u WHERE u.auth_subject=? AND u.status='active'",
      )
      .bind(localTestIdentity.userId)
      .first<{ id: string; isStaff: number; isSeller: number }>();
    if (!account) return null;
    if (account.isStaff) {
      try {
        if (
          !(await legacyStaffSetupAllowed(
            database,
            account.id,
            bindings.HASTABAZAAR_SECURITY_KEY,
            initialized,
          ))
        )
          return hosted?.userId === localTestIdentity.userId ? hosted : null;
      } catch (error) {
        if (error instanceof SecurityStateError) return null;
        throw error;
      }
    }
    try {
      if (
        !account.isStaff &&
        account.isSeller &&
        (await sellerMfaRequired(
          database,
          account.id,
          bindings.HASTABAZAAR_SECURITY_KEY,
          initialized,
        ))
      )
        return hosted?.userId === localTestIdentity.userId ? hosted : null;
    } catch (error) {
      if (error instanceof SecurityStateError) return null;
      throw error;
    }
    return localTestIdentity;
  }
  return hosted;
}

export async function requireAuthenticatedUser(
  returnTo: string,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (user) return user;
  const requestHeaders = await headers();
  const raw = await readHostedSession(
    requireDatabase(env as unknown as { DB?: D1Database }),
    requestHeaders,
  );
  const fixture = getLocalTestIdentity(requestHeaders);
  if (
    raw?.isStaff ||
    raw?.isSeller ||
    fixture?.userId === 'local-test-admin' ||
    fixture?.userId === 'local-test-super-admin'
  )
    redirect(
      `/security?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`,
    );
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
