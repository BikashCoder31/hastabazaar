import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { passwordRecord, verifyPassword } from '../auth/hosted-session';
import { SecurityStateError, equalHash } from './crypto';
import {
  ADMIN_IDLE_MS,
  FRESH_PASSWORD_MS,
  proofIsCurrent,
  validAccountId,
  validSessionHash,
} from './model';
import {
  SecurityStore,
  accountSecurityKey,
  type SecuritySnapshot,
} from './store';

type RecoveryKind = 'password' | 'mfa';
type Identity = {
  id: string;
  authSubject: string | null;
  email: string;
  hash: string | null;
  salt: string | null;
  version: number | null;
  roles: string[];
};
type Documentation = {
  supportReference: string;
  reason: 'lost_password' | 'lost_authenticator';
  verificationMethod: 'seller_onboarding' | 'staff_records';
  verificationReference: string;
  ownershipVerified: boolean;
};
type Grant = {
  schema: 1;
  kind: 'assisted-recovery';
  target: Identity;
  actor: Identity;
  sessionHash: string;
  actorGeneration: number;
  targetGeneration: number;
  verifiedAt: number;
  tokenHash: string;
  recoveryKind: RecoveryKind;
  issuedAt: number;
  expiresAt: number;
  delivered: boolean;
  documentation: Documentation;
};
export interface RecoveryDelivery {
  invite(message: {
    email: string;
    token: string;
    kind: RecoveryKind;
    expiresAt: number;
  }): Promise<void>;
  notice(message: {
    email: string;
    event: 'password_reset' | 'mfa_recovery';
  }): Promise<void>;
}
const fingerprint = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const grantKey = (id: string, kind: RecoveryKind) =>
  `auth-private:challenge:assisted:${encodeURIComponent(id)}:${kind}`;
const invalid = () =>
  new SecurityStateError(
    'This recovery invitation is unavailable or expired. Ask Super Admin to review the request and send a new invitation.',
  );
const reference = (value: string) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9 _./:-]{2,79}$/.test(value);

/** Invitations authorize only the named recovery. They never create an authenticated session. */
export class AssistedRecoveryService {
  constructor(
    readonly store: SecurityStore,
    private readonly delivery: RecoveryDelivery,
  ) {}

  async issue(
    options: Documentation & {
      actorId: string;
      sessionHash: string;
      targetId: string;
      kind: RecoveryKind;
      confirmedEmail: string;
      now?: number;
    },
  ) {
    const now = this.time(options.now),
      { actorId, targetId, sessionHash, kind } = options;
    if (
      !['password', 'mfa'].includes(kind) ||
      actorId === targetId ||
      !validSessionHash(sessionHash)
    )
      throw invalid();
    if (
      !reference(options.supportReference) ||
      !reference(options.verificationReference) ||
      options.ownershipVerified !== true ||
      !['seller_onboarding', 'staff_records'].includes(
        options.verificationMethod,
      ) ||
      options.reason !==
        (kind === 'mfa' ? 'lost_authenticator' : 'lost_password')
    )
      throw new SecurityStateError(
        'Record the support request and the matching onboarding or staff record before approving recovery. Do not enter passwords, codes or identity documents.',
      );
    const actor = await this.identity(actorId),
      target = await this.identity(targetId);
    this.roles(actor, target);
    if (target.email !== options.confirmedEmail)
      throw new SecurityStateError(
        'The registered email changed. Reopen the account and confirm the current address before sending.',
      );
    if (
      options.verificationMethod !==
      (target.roles.includes('admin') ? 'staff_records' : 'seller_onboarding')
    )
      throw invalid();
    const targetSecurity = await this.targetSecurity(targetId),
      account = targetSecurity.account,
      approval = await this.approval(actorId, sessionHash, now, true);
    if (kind === 'mfa' && account?.value.status !== 'active') throw invalid();
    const secret = Buffer.from(randomBytes(32)).toString('base64url');
    const token = `${Buffer.from(targetId).toString('base64url')}.${kind}.${secret}`;
    const documentation: Documentation = {
      supportReference: options.supportReference,
      reason: options.reason,
      verificationMethod: options.verificationMethod,
      verificationReference: options.verificationReference,
      ownershipVerified: true,
    };
    const grant: Grant = {
      schema: 1,
      kind: 'assisted-recovery',
      target,
      actor,
      sessionHash,
      actorGeneration: approval.account.value.generation,
      targetGeneration: account?.value.generation ?? 0,
      verifiedAt: approval.proof.value.verifiedAt,
      tokenHash: fingerprint(secret),
      recoveryKind: kind,
      issuedAt: now,
      expiresAt: now + 15 * 60_000,
      delivered: false,
      documentation,
    };
    const key = grantKey(targetId, kind),
      existing = await this.readGrant(key, targetId);
    await this.store.checkedBatch([
      ...this.locks(actor, target),
      ...this.identityGuards(actor, target),
      ...this.approvalGuards(approval, sessionHash, now),
      ...targetSecurity.guards,
      ...(existing
        ? this.store.replaceRecord(existing, grant, now)
        : this.store.insertRecord(key, targetId, grant, now)),
    ]);
    const pending = await this.readGrant(key, targetId);
    if (!pending || pending.value.tokenHash !== grant.tokenHash)
      throw invalid();
    try {
      await this.delivery.invite({
        email: target.email,
        token,
        kind,
        expiresAt: grant.expiresAt,
      });
      await this.store.checkedBatch([
        ...this.locks(actor, target),
        ...this.identityGuards(actor, target),
        ...this.approvalGuards(approval, sessionHash, now),
        ...targetSecurity.guards,
        ...this.store.replaceRecord(
          pending,
          { ...grant, delivered: true },
          now,
        ),
        this.audit(grant, 'issued', now),
      ]);
    } catch {
      // A failed delivery or concurrent replacement must never leave this token usable.
      try {
        await this.store.checkedBatch(this.store.deleteRecord(pending));
      } catch {
        /* A newer invitation must not be removed. */
      }
      throw new SecurityStateError(
        'The invitation could not be delivered and activated. No account credentials changed. Check email delivery and send a new invitation.',
      );
    }
    return { expiresAt: grant.expiresAt };
  }

  async complete(options: {
    token: string;
    password: string;
    confirmation?: string;
    now?: number;
  }) {
    const now = this.time(options.now),
      parsed = this.parseToken(options.token),
      snapshot = await this.readGrant(
        grantKey(parsed.userId, parsed.kind),
        parsed.userId,
      );
    if (!snapshot) throw invalid();
    const grant = snapshot.value;
    if (
      !grant.delivered ||
      grant.recoveryKind !== parsed.kind ||
      !equalHash(grant.tokenHash, fingerprint(parsed.secret)) ||
      now < grant.issuedAt ||
      now >= grant.expiresAt
    )
      throw invalid();
    const actor = await this.identity(grant.actor.id),
      target = await this.identity(grant.target.id);
    this.roles(actor, target);
    if (
      JSON.stringify(actor) !== JSON.stringify(grant.actor) ||
      JSON.stringify(target) !== JSON.stringify(grant.target)
    )
      throw invalid();
    const approval = await this.approval(
        actor.id,
        grant.sessionHash,
        now,
        false,
      ),
      targetSecurity = await this.targetSecurity(target.id),
      account = targetSecurity.account;
    if (
      (account?.value.generation ?? 0) !== grant.targetGeneration ||
      approval.account.value.generation !== grant.actorGeneration ||
      approval.proof.value.verifiedAt !== grant.verifiedAt
    )
      throw invalid();
    if (typeof options.password !== 'string' || options.password.length > 256)
      throw invalid();
    let credential: Awaited<ReturnType<typeof passwordRecord>> | undefined;
    if (grant.recoveryKind === 'mfa') {
      if (
        account?.value.status !== 'active' ||
        !target.hash ||
        !target.salt ||
        !(await verifyPassword(options.password, target.hash, target.salt))
      )
        throw new SecurityStateError(
          'The current password is incorrect. Complete password recovery first if needed, then request a new authenticator recovery invitation.',
        );
    } else {
      if (
        options.password.length < 10 ||
        options.password !== options.confirmation
      )
        throw new SecurityStateError(
          'Use a password of 10 to 256 characters and enter the same password twice.',
        );
      credential = await passwordRecord(options.password);
    }
    const next = account
      ? {
          ...account.value,
          generation: account.value.generation + 1,
          updatedAt: now,
          setup: null,
          ...(grant.recoveryKind === 'mfa'
            ? { status: 'recovery' as const, factor: null, recovery: null }
            : {}),
        }
      : null;
    const db = this.store.database;
    const statements = [
      ...this.locks(actor, target),
      ...this.identityGuards(actor, target),
      ...this.approvalGuards(approval, grant.sessionHash, now),
      ...this.store.deleteRecord(snapshot),
      ...(account && next
        ? this.store.accountCas(account, next, now)
        : targetSecurity.guards),
    ];
    if (credential)
      statements.push(
        target.hash
          ? db
              .prepare(
                'UPDATE user_credentials SET password_hash=?,password_salt=?,password_version=password_version+1,updated_at=? WHERE user_id=?',
              )
              .bind(credential.hash, credential.salt, now, target.id)
          : db
              .prepare(
                'INSERT INTO user_credentials(user_id,password_hash,password_salt,password_version,created_at,updated_at) VALUES (?,?,?,1,?,?)',
              )
              .bind(target.id, credential.hash, credential.salt, now, now),
      );
    // Remove session-bound private proofs before deleting their session ownership rows.
    statements.push(
      db
        .prepare(
          "DELETE FROM marketplace_settings WHERE (`key` LIKE 'auth-private:session:%' AND SUBSTR(`key`,?) IN (SELECT token_hash FROM user_sessions WHERE user_id=?)) OR (`key` LIKE 'auth-private:challenge:password:%' AND SUBSTR(`key`,?) IN (SELECT token_hash FROM user_sessions WHERE user_id=?))",
        )
        .bind(
          'auth-private:session:'.length + 1,
          target.id,
          'auth-private:challenge:password:'.length + 1,
          target.id,
        ),
    );
    for (const table of [
      'user_sessions',
      'email_login_challenges',
      'password_reset_challenges',
      'account_contact_challenges',
      'local_contact_captures',
    ])
      statements.push(
        db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(target.id),
      );
    statements.push(this.audit(grant, 'completed', now));
    await this.store.checkedBatch(statements);
    let notificationDelivered = true;
    try {
      await this.delivery.notice({
        email: target.email,
        event: grant.recoveryKind === 'mfa' ? 'mfa_recovery' : 'password_reset',
      });
    } catch {
      notificationDelivered = false;
    }
    return {
      kind: grant.recoveryKind,
      notificationDelivered,
      replacementRequired: next?.status === 'recovery',
    };
  }

  private time(value = Date.now()) {
    if (!Number.isSafeInteger(value) || value < 0) throw invalid();
    return value;
  }
  private parseToken(token: string) {
    if (typeof token !== 'string' || token.length > 500) throw invalid();
    const [encoded, kind, secret, ...extra] = token.split('.');
    if (
      extra.length ||
      !encoded ||
      !['password', 'mfa'].includes(kind) ||
      !/^[A-Za-z0-9_-]{43}$/.test(secret ?? '')
    )
      throw invalid();
    const userId = Buffer.from(encoded, 'base64url').toString('utf8');
    if (
      !validAccountId(userId) ||
      Buffer.from(userId).toString('base64url') !== encoded
    )
      throw invalid();
    return { userId, kind: kind as RecoveryKind, secret };
  }
  private async identity(id: string): Promise<Identity> {
    if (!validAccountId(id)) throw invalid();
    const row = await this.store.database
      .prepare(
        "SELECT u.id,u.auth_subject AS authSubject,u.email,c.password_hash AS hash,c.password_salt AS salt,c.password_version AS version FROM users u LEFT JOIN user_credentials c ON c.user_id=u.id WHERE u.id=? AND u.status='active'",
      )
      .bind(id)
      .first<Omit<Identity, 'roles'>>();
    if (!row) throw invalid();
    const roles = await this.store.database
      .prepare('SELECT role FROM user_roles WHERE user_id=? ORDER BY role')
      .bind(id)
      .all<{ role: string }>();
    return { ...row, roles: roles.results.map((r) => r.role) };
  }
  private roles(actor: Identity, target: Identity) {
    if (
      actor.id === target.id ||
      !actor.roles.includes('super_admin') ||
      target.roles.includes('super_admin') ||
      !target.roles.some((r) => r === 'admin' || r === 'seller')
    )
      throw invalid();
  }
  private async approval(
    id: string,
    sessionHash: string,
    now: number,
    fresh: boolean,
  ) {
    const account = await this.store.readAccount(id),
      proof = await this.store.readProof(sessionHash, id);
    if (
      !account ||
      !proof ||
      !proofIsCurrent(proof.value, account.value, now) ||
      (fresh &&
        (now - proof.value.verifiedAt > FRESH_PASSWORD_MS ||
          now - proof.value.passwordVerifiedAt > FRESH_PASSWORD_MS))
    )
      throw new SecurityStateError(
        'Super Admin must verify their password and authenticator again in Account security before approving recovery.',
      );
    return { account, proof };
  }
  private guard(sql: string, values: (string | number | null)[]) {
    const id = randomUUID(),
      db = this.store.database;
    return [
      db
        .prepare(
          `INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${sql} THEN 1 ELSE 0 END`,
        )
        .bind(id, ...values),
      db
        .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
        .bind(id),
    ];
  }
  private snapshotGuard<T>(snapshot: SecuritySnapshot<T>) {
    return this.guard(
      'EXISTS(SELECT 1 FROM marketplace_settings WHERE `key`=? AND HEX(value)=HEX(?))',
      [snapshot.key, snapshot.raw],
    );
  }
  private locks(actor: Identity, target: Identity) {
    return [actor.id, target.id]
      .sort()
      .map((id) =>
        this.store.database
          .prepare('UPDATE users SET updated_at=updated_at WHERE id=?')
          .bind(id),
      );
  }
  private identityGuards(actor: Identity, target: Identity) {
    return [actor, target].flatMap((person) => [
      ...this.guard(
        `EXISTS(SELECT 1 FROM users u WHERE u.id=? AND ((u.auth_subject IS NULL AND ? IS NULL) OR HEX(u.auth_subject)=HEX(?)) AND HEX(u.email)=HEX(?) AND u.status='active') AND (SELECT count(*) FROM user_roles WHERE user_id=?)=? AND NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role NOT IN (${person.roles.map(() => '?').join(',')}))`,
        [
          person.id,
          person.authSubject,
          person.authSubject,
          person.email,
          person.id,
          person.roles.length,
          person.id,
          ...person.roles,
        ],
      ),
      ...this.guard(
        person.hash
          ? 'EXISTS(SELECT 1 FROM user_credentials WHERE user_id=? AND HEX(password_hash)=HEX(?) AND HEX(password_salt)=HEX(?) AND password_version=?)'
          : 'NOT EXISTS(SELECT 1 FROM user_credentials WHERE user_id=?)',
        person.hash
          ? [person.id, person.hash, person.salt!, person.version!]
          : [person.id],
      ),
    ]);
  }
  private async targetSecurity(id: string) {
    const manifest = await this.store.readManifest();
    if (!manifest) throw invalid();
    if (manifest.value.userIds.includes(id)) {
      const account = await this.store.readAccount(id);
      if (!account) throw invalid();
      return { account, guards: this.snapshotGuard(account) };
    }
    return {
      account: null,
      guards: [
        ...this.snapshotGuard(manifest),
        ...this.guard(
          'NOT EXISTS(SELECT 1 FROM marketplace_settings WHERE `key`=?)',
          [accountSecurityKey(id)],
        ),
      ],
    };
  }
  private approvalGuards(
    approval: Awaited<ReturnType<AssistedRecoveryService['approval']>>,
    sessionHash: string,
    now: number,
  ) {
    return [
      ...this.snapshotGuard(approval.account),
      ...this.snapshotGuard(approval.proof),
      ...this.guard(
        'EXISTS(SELECT 1 FROM user_sessions WHERE token_hash=? AND user_id=? AND expires_at>? AND created_at<=? AND last_seen_at<=? AND last_seen_at>?)',
        [
          sessionHash,
          approval.account.userId,
          now,
          now,
          now,
          now - ADMIN_IDLE_MS,
        ],
      ),
    ];
  }
  private readGrant(key: string, userId: string) {
    return this.store.readRecord<Grant>(key, userId, (value) => {
      const record = value as Grant;
      if (
        !record ||
        record.schema !== 1 ||
        record.kind !== 'assisted-recovery' ||
        record.target?.id !== userId ||
        !Number.isSafeInteger(record.expiresAt) ||
        !Number.isSafeInteger(record.issuedAt) ||
        typeof record.delivered !== 'boolean' ||
        !validSessionHash(record.sessionHash) ||
        !validSessionHash(record.tokenHash) ||
        !['password', 'mfa'].includes(record.recoveryKind)
      )
        throw invalid();
      return record;
    });
  }
  private audit(grant: Grant, event: 'issued' | 'completed', now: number) {
    return this.store.database
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,?,'account_security',?,?,NULL,?,NULL,NULL,?)",
      )
      .bind(
        randomUUID(),
        grant.actor.id,
        `security.assisted.${grant.recoveryKind}.${event}`,
        grant.target.id,
        grant.documentation.reason,
        JSON.stringify({
          supportReference: grant.documentation.supportReference,
          verificationMethod: grant.documentation.verificationMethod,
          verificationReference: grant.documentation.verificationReference,
          ownershipVerified: true,
        }),
        now,
      );
  }
}
