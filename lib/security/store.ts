import { randomUUID } from 'node:crypto';
import { decryptSecurityValue, encryptSecurityValue, securityKeyId, SecurityStateError } from './crypto';
import { type AccountSecurity, type SecurityManifest, type SessionProof, validateAccount, validateManifest, validateProof, validAccountId, validSessionHash } from './model';

export const SECURITY_PREFIX = 'auth-private:';
export const SECURITY_MANIFEST_KEY = `${SECURITY_PREFIX}manifest:v1`;
export const accountSecurityKey = (userId: string) => `${SECURITY_PREFIX}account:${encodeURIComponent(userId)}`;
export const sessionProofKey = (sessionHash: string) => `${SECURITY_PREFIX}session:${sessionHash}`;
export interface SecuritySnapshot<T> { key: string; userId: string; raw: string; value: T; }

export async function hasPrivateSecurityState(database: D1Database): Promise<boolean> {
  return Boolean(await database.prepare("SELECT 1 AS present FROM marketplace_settings WHERE `key` LIKE 'auth-private:%' LIMIT 1").first());
}

/** Authentication-only repository. Never expose its values through ordinary settings exports. */
export class SecurityStore {
  readonly keyId: string;
  constructor(readonly database: D1Database, private readonly encryptionKey: string, private readonly requireInitialized = false) { this.keyId = securityKeyId(encryptionKey); }

  async readRecord<T>(key: string, userId: string, validate: (value: unknown) => T): Promise<SecuritySnapshot<T> | null> {
    this.assertKey(key);
    const row = await this.database.prepare('SELECT value FROM marketplace_settings WHERE `key`=?').bind(key).first<{ value: string }>();
    return row ? { key, userId, raw: row.value, value: validate(decryptSecurityValue(this.encryptionKey, key, userId, row.value)) } : null;
  }

  async readManifest(): Promise<SecuritySnapshot<SecurityManifest> | null> {
    const record = await this.readRecord(SECURITY_MANIFEST_KEY, 'manifest', validateManifest);
    if (!record) { if (this.requireInitialized || await hasPrivateSecurityState(this.database)) throw new SecurityStateError(); return null; }
    if (record.value.keyId !== this.keyId) throw new SecurityStateError();
    return record;
  }

  async readAccount(userId: string): Promise<SecuritySnapshot<AccountSecurity> | null> {
    if (!validAccountId(userId)) throw new SecurityStateError();
    const manifest = await this.readManifest(); if (!manifest) return null;
    if (!manifest.value.userIds.includes(userId)) throw new SecurityStateError('This staff account needs controlled security registration. Existing protection has not been removed.');
    const account = await this.readRecord(accountSecurityKey(userId), userId, value => validateAccount(value, userId));
    if (!account) throw new SecurityStateError(); return account;
  }

  async readProof(sessionHash: string, userId: string): Promise<SecuritySnapshot<SessionProof> | null> {
    if (!validSessionHash(sessionHash)) throw new SecurityStateError();
    if (!await this.readAccount(userId)) return null;
    return this.readRecord(sessionProofKey(sessionHash), userId, value => validateProof(value, sessionHash, userId));
  }

  /** Only an explicit trusted rollout/setup action calls initialization. No account is enrolled. */
  async initialize(userIds: string[], now = Date.now()): Promise<void> {
    if (!Number.isSafeInteger(now) || now < 0 || userIds.length < 1 || userIds.length > 10_000 || !userIds.every(validAccountId) || new Set(userIds).size !== userIds.length) throw new SecurityStateError();
    const existing = await this.readManifest();
    if (existing) {
      if (userIds.some(id => !existing.value.userIds.includes(id))) throw new SecurityStateError('New staff need controlled security registration.');
      for (const id of userIds) await this.readAccount(id);
      return;
    }
    const guard = randomUUID();
    const statements = [this.database.prepare("INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM marketplace_settings WHERE `key` LIKE 'auth-private:%') THEN 1 ELSE 0 END").bind(guard), this.database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard)];
    for (const userId of userIds) {
      const account: AccountSecurity = { schema: 1, kind: 'account', userId, generation: 1, status: 'pending', createdAt: now, updatedAt: now, factor: null, recovery: null, setup: null };
      statements.push(...this.insertRecord(accountSecurityKey(userId), userId, account, now));
    }
    statements.push(...this.insertRecord(SECURITY_MANIFEST_KEY, 'manifest', { schema: 1, kind: 'manifest', keyId: this.keyId, userIds: [...userIds].sort(), legacyUserIds: [...userIds].sort(), createdAt: now } satisfies SecurityManifest, now));
    await this.checkedBatch(statements);
  }

  /** Called only after the application's normal staff promotion/identity checks. */
  async registerStaff(userId: string, now = Date.now(), linkedStatements: D1PreparedStatement[] = []): Promise<void> {
    if (!validAccountId(userId)) throw new SecurityStateError();
    const manifest = await this.readManifest(); if (!manifest) throw new SecurityStateError();
    if (manifest.value.userIds.includes(userId)) {
      await this.readAccount(userId);
      if (linkedStatements.length) await this.checkedBatch(linkedStatements);
      return;
    }
    const next = validateManifest({ ...manifest.value, userIds: [...manifest.value.userIds, userId].sort() });
    const account = validateAccount({ schema: 1, kind: 'account', userId, generation: 1, status: 'pending', createdAt: now, updatedAt: now, factor: null, recovery: null, setup: null }, userId);
    await this.checkedBatch([...this.replaceRecord(manifest, next, now), ...this.insertRecord(accountSecurityKey(userId), userId, account, now), ...linkedStatements]);
  }

  insertRecord<T>(key: string, userId: string, value: T, now: number): D1PreparedStatement[] {
    this.assertKey(key); const raw = encryptSecurityValue(this.encryptionKey, key, userId, value);
    return this.guardMutation(this.database.prepare('INSERT INTO marketplace_settings (`key`,value,updated_by,updated_at) VALUES (?,?,NULL,?)').bind(key, raw, now));
  }

  replaceRecord<T>(snapshot: SecuritySnapshot<T>, next: T, now: number): D1PreparedStatement[] {
    this.assertKey(snapshot.key); const raw = encryptSecurityValue(this.encryptionKey, snapshot.key, snapshot.userId, next);
    return this.guardMutation(this.database.prepare('UPDATE marketplace_settings SET value=?,updated_at=? WHERE `key`=? AND HEX(value)=HEX(?)').bind(raw, now, snapshot.key, snapshot.raw));
  }

  deleteRecord<T>(snapshot: SecuritySnapshot<T>): D1PreparedStatement[] {
    this.assertKey(snapshot.key);
    return this.guardMutation(this.database.prepare('DELETE FROM marketplace_settings WHERE `key`=? AND HEX(value)=HEX(?)').bind(snapshot.key, snapshot.raw));
  }

  accountCas(snapshot: SecuritySnapshot<AccountSecurity>, next: AccountSecurity, now: number): D1PreparedStatement[] {
    if (snapshot.key !== accountSecurityKey(snapshot.value.userId) || snapshot.userId !== snapshot.value.userId) throw new SecurityStateError();
    return this.replaceRecord(snapshot, validateAccount(next, snapshot.value.userId), now);
  }

  proofUpsert(snapshot: SecuritySnapshot<SessionProof> | null, proof: SessionProof, now: number): D1PreparedStatement[] {
    validateProof(proof, proof.sessionHash, proof.userId);
    if (snapshot) {
      if (snapshot.key !== sessionProofKey(proof.sessionHash) || snapshot.userId !== proof.userId) throw new SecurityStateError();
      return this.replaceRecord(snapshot, proof, now);
    }
    return this.insertRecord(sessionProofKey(proof.sessionHash), proof.userId, proof, now);
  }

  async checkedBatch(statements: D1PreparedStatement[]): Promise<void> {
    if (!statements.length) throw new SecurityStateError();
    // D1 batch and the supported SQL adapter run these in one transaction. The
    // CHECK guard aborts the transaction rather than trusting returned metadata.
    await this.database.batch(statements);
  }

  private guardMutation(statement: D1PreparedStatement): D1PreparedStatement[] {
    const id = randomUUID();
    return [statement, this.database.prepare('INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN changes()=1 THEN 1 ELSE 0 END').bind(id), this.database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
  }
  private assertKey(key: string) { if (!key.startsWith(SECURITY_PREFIX) || key.length > 512) throw new SecurityStateError(); }
}
