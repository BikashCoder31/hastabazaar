import { decodeBase32, SecurityStateError } from './crypto';

export const ADMIN_ABSOLUTE_MS = 8 * 60 * 60_000;
export const ADMIN_IDLE_MS = 30 * 60_000;
export const FRESH_PASSWORD_MS = 5 * 60_000;
export const SETUP_LIFETIME_MS = 10 * 60_000;

export interface AccountSecurity {
  schema: 1;
  kind: 'account';
  userId: string;
  generation: number;
  status: 'pending' | 'active' | 'disabled' | 'recovery';
  createdAt: number;
  updatedAt: number;
  factor: { secret: string; activatedAt: number; lastCounter: number } | null;
  recovery: { setId: string; hashes: string[]; createdAt: number } | null;
  setup: {
    id: string;
    sessionHash: string;
    secret: string;
    expiresAt: number;
    confirmedAt: number | null;
    lastCounter: number | null;
    recoverySetId: string | null;
    recoveryHashes: string[] | null;
  } | null;
}
export interface SecurityManifest {
  schema: 1;
  kind: 'manifest';
  keyId: string;
  userIds: string[];
  legacyUserIds: string[];
  createdAt: number;
}
export interface SessionProof {
  schema: 1;
  kind: 'proof';
  userId: string;
  sessionHash: string;
  generation: number;
  passwordVerifiedAt: number;
  verifiedAt: number;
  absoluteExpiresAt: number;
  lastActivityAt: number;
}

export function validAccountId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200)
    return false;
  for (let index = 0; index < value.length; index++)
    if (value.charCodeAt(index) < 32 || value.charCodeAt(index) === 127)
      return false;
  return true;
}
export function validSessionHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function object(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== keys.sort().join(',')
  )
    throw new SecurityStateError();
}
function stamp(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new SecurityStateError();
}
function token(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(value))
    throw new SecurityStateError();
}
function hashes(value: unknown): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    !value.every((v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)) ||
    new Set(value).size !== value.length
  )
    throw new SecurityStateError();
}

export function validateManifest(value: unknown): SecurityManifest {
  object(value, [
    'schema',
    'kind',
    'keyId',
    'userIds',
    'legacyUserIds',
    'createdAt',
  ]);
  if (
    value.schema !== 1 ||
    value.kind !== 'manifest' ||
    typeof value.keyId !== 'string' ||
    !/^[a-f0-9]{32}$/.test(value.keyId) ||
    !Array.isArray(value.userIds) ||
    value.userIds.length < 1 ||
    value.userIds.length > 10_000 ||
    !value.userIds.every(validAccountId) ||
    new Set(value.userIds).size !== value.userIds.length
  )
    throw new SecurityStateError();
  if (
    !Array.isArray(value.legacyUserIds) ||
    !value.legacyUserIds.every(
      (id) => validAccountId(id) && (value.userIds as string[]).includes(id),
    ) ||
    new Set(value.legacyUserIds).size !== value.legacyUserIds.length
  )
    throw new SecurityStateError();
  stamp(value.createdAt);
  return value as unknown as SecurityManifest;
}

export function validateAccount(
  value: unknown,
  userId: string,
): AccountSecurity {
  object(value, [
    'schema',
    'kind',
    'userId',
    'generation',
    'status',
    'createdAt',
    'updatedAt',
    'factor',
    'recovery',
    'setup',
  ]);
  if (
    value.schema !== 1 ||
    value.kind !== 'account' ||
    !validAccountId(value.userId) ||
    value.userId !== userId ||
    !Number.isSafeInteger(value.generation) ||
    (value.generation as number) < 1 ||
    !['pending', 'active', 'disabled', 'recovery'].includes(
      value.status as string,
    )
  )
    throw new SecurityStateError();
  stamp(value.createdAt);
  stamp(value.updatedAt);
  if (value.updatedAt < value.createdAt) throw new SecurityStateError();
  if (value.factor !== null) {
    object(value.factor, ['secret', 'activatedAt', 'lastCounter']);
    if (typeof value.factor.secret !== 'string') throw new SecurityStateError();
    decodeBase32(value.factor.secret);
    stamp(value.factor.activatedAt);
    stamp(value.factor.lastCounter);
  }
  if (value.recovery !== null) {
    object(value.recovery, ['setId', 'hashes', 'createdAt']);
    token(value.recovery.setId);
    hashes(value.recovery.hashes);
    stamp(value.recovery.createdAt);
  }
  if (
    (value.status === 'active') !==
      (value.factor !== null && value.recovery !== null) ||
    (value.status !== 'active' &&
      (value.factor !== null || value.recovery !== null))
  )
    throw new SecurityStateError();
  if (value.setup !== null) {
    object(value.setup, [
      'id',
      'sessionHash',
      'secret',
      'expiresAt',
      'confirmedAt',
      'lastCounter',
      'recoverySetId',
      'recoveryHashes',
    ]);
    token(value.setup.id);
    if (
      !validSessionHash(value.setup.sessionHash) ||
      typeof value.setup.secret !== 'string'
    )
      throw new SecurityStateError();
    decodeBase32(value.setup.secret);
    stamp(value.setup.expiresAt);
    if (value.setup.confirmedAt === null) {
      if (
        value.setup.lastCounter !== null ||
        value.setup.recoverySetId !== null ||
        value.setup.recoveryHashes !== null
      )
        throw new SecurityStateError();
    } else {
      stamp(value.setup.confirmedAt);
      stamp(value.setup.lastCounter);
      token(value.setup.recoverySetId);
      hashes(value.setup.recoveryHashes);
      if (
        value.setup.recoveryHashes.length !== 10 ||
        value.setup.confirmedAt >= value.setup.expiresAt
      )
        throw new SecurityStateError();
    }
  }
  return value as unknown as AccountSecurity;
}

export function validateProof(
  value: unknown,
  sessionHash: string,
  userId: string,
): SessionProof {
  object(value, [
    'schema',
    'kind',
    'userId',
    'sessionHash',
    'generation',
    'passwordVerifiedAt',
    'verifiedAt',
    'absoluteExpiresAt',
    'lastActivityAt',
  ]);
  if (
    value.schema !== 1 ||
    value.kind !== 'proof' ||
    !validAccountId(value.userId) ||
    value.userId !== userId ||
    !validSessionHash(value.sessionHash) ||
    value.sessionHash !== sessionHash ||
    !Number.isSafeInteger(value.generation) ||
    (value.generation as number) < 1
  )
    throw new SecurityStateError();
  for (const name of [
    'passwordVerifiedAt',
    'verifiedAt',
    'absoluteExpiresAt',
    'lastActivityAt',
  ])
    stamp(value[name]);
  const typed = value as unknown as SessionProof;
  if (
    typed.passwordVerifiedAt > typed.verifiedAt ||
    typed.verifiedAt - typed.passwordVerifiedAt > FRESH_PASSWORD_MS ||
    typed.absoluteExpiresAt !== typed.verifiedAt + ADMIN_ABSOLUTE_MS ||
    typed.lastActivityAt < typed.verifiedAt ||
    typed.lastActivityAt > typed.absoluteExpiresAt
  )
    throw new SecurityStateError();
  return typed;
}

export function privilegedSessionExpired(
  createdAt: number,
  lastActivityAt: number,
  now: number,
): boolean {
  return (
    ![createdAt, lastActivityAt, now].every(
      (v) => Number.isSafeInteger(v) && v >= 0,
    ) ||
    now < createdAt ||
    now < lastActivityAt ||
    lastActivityAt < createdAt ||
    now - createdAt >= ADMIN_ABSOLUTE_MS ||
    now - lastActivityAt >= ADMIN_IDLE_MS
  );
}

export function proofIsCurrent(
  proof: SessionProof,
  account: AccountSecurity,
  now: number,
): boolean {
  return (
    account.status === 'active' &&
    proof.userId === account.userId &&
    proof.generation === account.generation &&
    !privilegedSessionExpired(proof.verifiedAt, proof.lastActivityAt, now)
  );
}
