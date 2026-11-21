import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';

import { requireDatabase } from '@/lib/db/d1';
import { ADMIN_RETURN_TO_HEADER, safeAdminReturnTo } from '@/lib/admin/return-context';
import {
  getHostedIdentity,
  hasExpiredHostedStaffSession,
  hostedSessionHash,
  readHostedSession,
} from '@/lib/auth/hosted-session';
import { sessionExpiredSignInPath } from '@/lib/auth/sign-in-destination';
import { getLocalTestIdentity } from '@/lib/auth/local-test-access';
import { skipsLocalTestStaffMfa } from '@/lib/security/local-simulation';
import {
  interactiveNavigation,
  legacyStaffSetupAllowed,
  sellerMfaRequired,
  staffSessionState,
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

/** Read-only callers must never repair identity bindings or renew session activity. */
export async function getAuthenticatedUser(
  options: { readOnly?: boolean } = {},
): Promise<AuthenticatedUser | null> {
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
      readOnly: options.readOnly,
    });
  } catch (error) {
    if (error instanceof SecurityStateError) return null;
    throw error;
  }
  const localTestIdentity = getLocalTestIdentity(requestHeaders);
  if (localTestIdentity) {
    const account = await database
      .prepare(
        "SELECT u.id,u.email,EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('admin','super_admin')) AS isStaff,EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='super_admin') AS isSuperAdmin,EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller') AS isSeller FROM users u WHERE u.auth_subject=? AND u.status='active'",
      )
      .bind(localTestIdentity.userId)
      .first<{ id: string; email: string; isStaff: number; isSuperAdmin: number; isSeller: number }>();
    if (!account) return null;
    if (account.isStaff) {
      try {
        if (
          !skipsLocalTestStaffMfa(bindings, requestHeaders.get('host') ?? '', {
            authSubject: localTestIdentity.userId,
            email: account.email,
            role: account.isSuperAdmin ? 'super_admin' : 'admin',
          }) &&
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
  options: { readOnly?: boolean } = {},
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(options);
  if (user) return user;
  const requestHeaders = await headers();
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  const destination = /^\/admin(?:[/?#]|$)/.test(safeReturnTo)
    ? safeAdminReturnTo(requestHeaders.get(ADMIN_RETURN_TO_HEADER), safeReturnTo)
    : safeReturnTo;
  const bindings = env as unknown as SecurityPolicyBindings & { DB?: D1Database };
  const database = requireDatabase(bindings);
  const now = Date.now();
  const raw = await readHostedSession(database, requestHeaders, now);
  if (!raw && await hasExpiredHostedStaffSession(database, requestHeaders, now))
    redirect(sessionExpiredSignInPath(destination));
  const hash = raw?.isStaff ? hostedSessionHash(requestHeaders) : null;
  if (raw && hash) {
    try {
      const initialized = await readSecurityInitialization(bindings);
      if (await staffSessionState(database, raw, hash, bindings.HASTABAZAAR_SECURITY_KEY, now, false, initialized) === 'expired')
        redirect(sessionExpiredSignInPath(destination));
    } catch (error) {
      // The security page handles missing or changed enrollment state.
      if (!(error instanceof SecurityStateError)) throw error;
    }
  }
  const fixture = getLocalTestIdentity(requestHeaders);
  if (
    raw?.isStaff ||
    raw?.isSeller ||
    fixture?.userId === 'local-test-admin' ||
    fixture?.userId === 'local-test-super-admin'
  )
    redirect(
      `/security?return_to=${encodeURIComponent(destination)}`,
    );
  redirect(signInPath(destination));
}

export function signInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function signOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}
