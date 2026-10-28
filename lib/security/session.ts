import type { HostedSessionIdentity } from '../auth/hosted-session';
import { SecurityStateError } from './crypto';
import {
  ADMIN_ABSOLUTE_MS,
  privilegedSessionExpired,
  proofIsCurrent,
  type AccountSecurity,
  type SessionProof,
} from './model';
import { randomUUID } from 'node:crypto';
import { hasPrivateSecurityState, SecurityStore } from './store';

/** Missing configuration is legacy only when no protected records exist. */
export async function securityStore(
  database: D1Database,
  key: string | undefined,
  initialized = false,
): Promise<SecurityStore | null> {
  if (key) return new SecurityStore(database, key, initialized);
  if (initialized) throw new SecurityStateError();
  if (await hasPrivateSecurityState(database))
    throw new SecurityStateError(
      'The existing security key is unavailable. Recover the matching key; MFA has not been disabled.',
    );
  return null;
}

export async function staffAccountSecurity(
  database: D1Database,
  userId: string,
  key?: string,
  initialized = false,
) {
  const store = await securityStore(database, key, initialized);
  return store ? store.readAccount(userId) : null;
}

export async function legacyStaffSetupAllowed(
  database: D1Database,
  userId: string,
  key?: string,
  initialized = false,
) {
  const store = await securityStore(database, key, initialized);
  if (!store) return true;
  const manifest = await store.readManifest();
  if (!manifest) return true;
  const account = await store.readAccount(userId);
  return (
    account?.value.status === 'pending' &&
    manifest.value.legacyUserIds.includes(userId)
  );
}

async function optionalPasswordAccount(
  database: D1Database,
  account: AccountSecurity,
) {
  if (account.status === 'disabled') return true;
  if (account.status !== 'pending') return false;
  const role = await database
    .prepare(
      "SELECT role FROM user_roles WHERE user_id=? AND role IN ('admin','super_admin') ORDER BY CASE role WHEN 'super_admin' THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(account.userId)
    .first<{ role: string }>();
  return role?.role === 'admin';
}

/** Used only with a freshly checked password and the same transaction that creates the session. */
export async function passwordOnlyProofStatements(
  database: D1Database,
  userId: string,
  sessionHash: string,
  passwordHash: string,
  key: string | undefined,
  initialized: boolean,
  now: number,
) {
  const store = await securityStore(database, key, initialized);
  if (!store) return [];
  const manifest = await store.readManifest();
  // A new staff identity still needs a raw session to enter the guarded
  // registration ceremony. Never manufacture a missing registered record.
  if (manifest && !manifest.value.userIds.includes(userId)) return [];
  const account = await store.readAccount(userId);
  if (!account || !(await optionalPasswordAccount(database, account.value)))
    return [];
  const guard = randomUUID(),
    pending = account.value.status === 'pending';
  const proof: SessionProof = {
    schema: 1,
    kind: 'proof',
    userId,
    sessionHash,
    generation: account.value.generation,
    passwordVerifiedAt: now,
    verifiedAt: now,
    absoluteExpiresAt: now + ADMIN_ABSOLUTE_MS,
    lastActivityAt: now,
  };
  return [
    database
      .prepare(
        "INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM user_sessions s JOIN users u ON u.id=s.user_id JOIN user_credentials c ON c.user_id=u.id WHERE s.token_hash=? AND u.id=? AND u.status='active' AND c.password_hash=?) AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role IN ('admin','super_admin')) AND (?=0 OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role='super_admin')) THEN 1 ELSE 0 END",
      )
      .bind(
        guard,
        sessionHash,
        userId,
        passwordHash,
        userId,
        pending ? 1 : 0,
        userId,
      ),
    database
      .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
      .bind(guard),
    ...store.accountCas(account, account.value, now),
    ...store.proofUpsert(null, proof, now),
  ];
}

export async function staffSessionIsVerified(
  database: D1Database,
  row: HostedSessionIdentity,
  sessionHash: string,
  key: string | undefined,
  now: number,
  activity = false,
  initialized = false,
): Promise<boolean> {
  const store = await securityStore(database, key, initialized);
  const account = store ? await store.readAccount(row.accountId) : null;
  if (account?.value.status === 'recovery') return false;
  if (
    store &&
    account &&
    (await optionalPasswordAccount(database, account.value))
  ) {
    const proof = await store.readProof(sessionHash, row.accountId);
    return Boolean(
      proof &&
      proof.value.generation === account.value.generation &&
      proof.value.userId === account.value.userId &&
      !privilegedSessionExpired(proof.value.verifiedAt, row.lastSeenAt, now),
    );
  }
  if (account?.value.status === 'pending' && initialized) return false;
  if (!account || account.value.status === 'pending')
    return (
      (await legacyStaffSetupAllowed(
        database,
        row.accountId,
        key,
        initialized,
      )) && !privilegedSessionExpired(row.createdAt, row.lastSeenAt, now)
    );
  const proof = await store!.readProof(sessionHash, row.accountId);
  if (!proof || !proofIsCurrent(proof.value, account.value, now)) return false;
  if (activity && now - proof.value.lastActivityAt >= 60_000) {
    try {
      await store!.checkedBatch(
        store!.proofUpsert(proof, { ...proof.value, lastActivityAt: now }, now),
      );
    } catch {
      // Parallel user requests may have advanced the same proof. Re-read rather
      // than accepting a stale value or turning a routine race into a bypass.
      const currentAccount = await store!.readAccount(row.accountId);
      const current = await store!.readProof(sessionHash, row.accountId);
      if (
        !currentAccount ||
        !current ||
        !proofIsCurrent(current.value, currentAccount.value, now)
      )
        return false;
    }
  }
  return true;
}

/** Sellers opt in. Once registered, missing state must never silently opt them out. */
export async function sellerMfaRequired(
  database: D1Database,
  userId: string,
  key?: string,
  initialized = false,
): Promise<boolean> {
  const store = await securityStore(database, key, initialized);
  const manifest = store ? await store.readManifest() : null;
  if (!store || !manifest?.value.userIds.includes(userId)) return false;
  const account = await store.readAccount(userId);
  return (
    account?.value.status === 'active' || account?.value.status === 'recovery'
  );
}

export async function sellerSessionIsVerified(
  database: D1Database,
  row: HostedSessionIdentity,
  sessionHash: string,
  key: string | undefined,
  now: number,
  activity = false,
  initialized = false,
): Promise<boolean> {
  if (!(await sellerMfaRequired(database, row.accountId, key, initialized)))
    return true;
  return staffSessionIsVerified(
    database,
    row,
    sessionHash,
    key,
    now,
    activity,
    initialized,
  );
}

export function interactiveNavigation(headers: Headers): boolean {
  return (
    headers.get('sec-fetch-user') === '?1' ||
    headers.get('sec-fetch-dest') === 'document'
  );
}
