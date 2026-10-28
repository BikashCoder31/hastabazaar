import { randomBytes } from 'node:crypto';
import {
  equalHash,
  generateRecoveryCodes,
  newAuthenticatorSecret,
  recoveryCodeHash,
  SecurityStateError,
  verifyTotp,
} from './crypto';
import {
  ADMIN_ABSOLUTE_MS,
  FRESH_PASSWORD_MS,
  SETUP_LIFETIME_MS,
  proofIsCurrent,
  type AccountSecurity,
  type SessionProof,
  validSessionHash,
} from './model';
import { SecurityStore, type SecuritySnapshot } from './store';

interface SetupOptions {
  userId: string;
  sessionHash: string;
  now?: number;
  linkedStatements?: D1PreparedStatement[];
}
interface ClaimOptions extends SetupOptions {
  code: string;
  expectedGeneration?: number;
  passwordVerifiedAt: number;
  targetSessionHash?: string;
  linkedStatements?: D1PreparedStatement[];
}
interface ActivateOptions extends SetupOptions {
  setupId: string;
  recoverySaved: boolean;
  passwordVerifiedAt: number;
  targetSessionHash?: string;
  linkedStatements?: D1PreparedStatement[];
}
const id = () => Buffer.from(randomBytes(24)).toString('base64url');

/** Callers must verify live roles, first-factor ownership, trusted origin and rate budgets. */
export class MfaService {
  constructor(readonly store: SecurityStore) {}

  /** The controller supplies live ownership/password guards, session revocation and audit atomically. */
  async disable(
    options: ClaimOptions & { recovery: boolean; optionalAccount?: boolean },
  ): Promise<void> {
    const now = this.now(options.now);
    this.password(options.passwordVerifiedAt, now);
    this.session(options.sessionHash);
    const account = await this.activeAccount(options.userId);
    this.consumeFactor(account.value, options.code, options.recovery, now);
    const next: AccountSecurity = {
      ...account.value,
      status: options.optionalAccount ? 'pending' : 'disabled',
      generation: account.value.generation + 1,
      updatedAt: now,
      factor: null,
      recovery: null,
      setup: null,
    };
    await this.store.checkedBatch([
      ...this.store.accountCas(account, next, now),
      ...(options.linkedStatements ?? []),
    ]);
  }

  /** A recent verified ceremony may authorize repair without spending another code. */
  async hasFreshProof(options: SetupOptions): Promise<boolean> {
    const now = this.now(options.now);
    this.session(options.sessionHash);
    const account = await this.activeAccount(options.userId);
    const proof = await this.store.readProof(
      options.sessionHash,
      options.userId,
    );
    return this.isFreshProof(proof, account.value, now);
  }

  /** Verify, replace and rotate in one transaction, including the caller's session statements. */
  async replaceRecovery(
    options: ClaimOptions & { recovery: boolean },
  ): Promise<{ codes: string[]; proof: SessionProof }> {
    const now = this.now(options.now);
    this.password(options.passwordVerifiedAt, now);
    const account = await this.activeAccount(options.userId),
      next = this.consumeFactor(
        account.value,
        options.code,
        options.recovery,
        now,
      );
    const codes = generateRecoveryCodes(),
      setId = id();
    next.recovery = {
      setId,
      createdAt: now,
      hashes: codes.map((code) =>
        recoveryCodeHash(options.userId, setId, code),
      ),
    };
    const proof = await this.claim(account, next, options, now);
    return { codes, proof };
  }

  async beginVerifiedReplacement(
    options: ClaimOptions & { recovery: boolean },
  ): Promise<{ setupId: string; secret: string; expiresAt: number }> {
    const now = this.now(options.now);
    this.password(options.passwordVerifiedAt, now);
    const account = await this.activeAccount(options.userId),
      next = this.consumeFactor(
        account.value,
        options.code,
        options.recovery,
        now,
      );
    const sessionHash = options.targetSessionHash ?? options.sessionHash;
    this.session(sessionHash);
    const setup: NonNullable<AccountSecurity['setup']> = {
      id: id(),
      sessionHash,
      secret: newAuthenticatorSecret(),
      expiresAt: now + SETUP_LIFETIME_MS,
      confirmedAt: null,
      lastCounter: null,
      recoverySetId: null,
      recoveryHashes: null,
    };
    next.setup = setup;
    await this.claim(account, next, options, now);
    return {
      setupId: setup.id,
      secret: setup.secret,
      expiresAt: setup.expiresAt,
    };
  }

  private consumeFactor(
    account: AccountSecurity,
    code: string,
    recovery: boolean,
    now: number,
  ): AccountSecurity {
    if (recovery) {
      let hash: string;
      try {
        hash = recoveryCodeHash(account.userId, account.recovery!.setId, code);
      } catch {
        throw new SecurityStateError(
          'The recovery code is invalid or already used.',
        );
      }
      if (!account.recovery!.hashes.some((saved) => equalHash(saved, hash)))
        throw new SecurityStateError(
          'The recovery code is invalid or already used.',
        );
      return {
        ...account,
        updatedAt: now,
        recovery: {
          ...account.recovery!,
          hashes: account.recovery!.hashes.filter(
            (saved) => !equalHash(saved, hash),
          ),
        },
      };
    }
    const counter = verifyTotp(
      account.factor!.secret,
      code,
      now,
      account.factor!.lastCounter,
    );
    if (counter === null)
      throw new SecurityStateError(
        'The authenticator code is invalid, expired or already used. Wait for a new code.',
      );
    return {
      ...account,
      updatedAt: now,
      factor: { ...account.factor!, lastCounter: counter },
    };
  }

  async beginSetup(
    options: SetupOptions,
  ): Promise<{ setupId: string; secret: string; expiresAt: number }> {
    const now = this.now(options.now);
    this.session(options.sessionHash);
    const account = await this.account(options.userId);
    const currentProof =
      account.value.status === 'active'
        ? await this.freshProof(account.value, options.sessionHash, now)
        : null;
    // The existing factor is retained until the replacement is fully confirmed.
    const setup: NonNullable<AccountSecurity['setup']> = {
      id: id(),
      sessionHash: options.sessionHash,
      secret: newAuthenticatorSecret(),
      expiresAt: now + SETUP_LIFETIME_MS,
      confirmedAt: null,
      lastCounter: null,
      recoverySetId: null,
      recoveryHashes: null,
    };
    await this.store.checkedBatch([
      ...this.store.accountCas(
        account,
        { ...account.value, setup, updatedAt: now },
        now,
      ),
      ...(currentProof
        ? this.store.proofUpsert(currentProof, currentProof.value, now)
        : []),
      ...(options.linkedStatements ?? []),
    ]);
    return {
      setupId: setup.id,
      secret: setup.secret,
      expiresAt: setup.expiresAt,
    };
  }

  async confirmSetup(
    options: SetupOptions & { setupId: string; code: string },
  ): Promise<{ setupId: string; codes: string[] }> {
    const now = this.now(options.now);
    const account = await this.account(options.userId);
    const setup = this.pending(
      account.value,
      options.sessionHash,
      options.setupId,
      now,
    );
    if (setup.confirmedAt !== null)
      throw new SecurityStateError(
        'Recovery codes were already shown. Restart setup if you did not save them.',
      );
    const counter = verifyTotp(setup.secret, options.code, now, null);
    if (counter === null)
      throw new SecurityStateError(
        'The authenticator code is invalid or expired.',
      );
    const codes = generateRecoveryCodes();
    const recoverySetId = id();
    const next = {
      ...setup,
      confirmedAt: now,
      lastCounter: counter,
      recoverySetId,
      recoveryHashes: codes.map((code) =>
        recoveryCodeHash(options.userId, recoverySetId, code),
      ),
    };
    await this.store.checkedBatch([
      ...this.store.accountCas(
        account,
        { ...account.value, setup: next, updatedAt: now },
        now,
      ),
      ...(options.linkedStatements ?? []),
    ]);
    return { setupId: setup.id, codes };
  }

  async activateSetup(options: ActivateOptions): Promise<SessionProof> {
    const now = this.now(options.now);
    this.password(options.passwordVerifiedAt, now);
    if (options.recoverySaved !== true)
      throw new SecurityStateError(
        'Save your recovery codes before activating MFA.',
      );
    const account = await this.account(options.userId);
    const setup = this.pending(
      account.value,
      options.sessionHash,
      options.setupId,
      now,
    );
    // Replacing a factor was authorized when this session-bound setup began.
    // Keep that ten-minute ceremony completable after its five-minute fresh
    // proof window, while retaining generation and normal session expiry.
    const continuation =
      account.value.status === 'active'
        ? await this.continuationProof(account.value, options.sessionHash, now)
        : undefined;
    if (
      setup.confirmedAt === null ||
      setup.lastCounter === null ||
      !setup.recoveryHashes ||
      !setup.recoverySetId
    )
      throw new SecurityStateError(
        'Confirm your authenticator before activating MFA.',
      );
    const next: AccountSecurity = {
      ...account.value,
      status: 'active',
      generation: account.value.generation + 1,
      updatedAt: now,
      factor: {
        secret: setup.secret,
        activatedAt: now,
        lastCounter: setup.lastCounter,
      },
      recovery: {
        setId: setup.recoverySetId,
        hashes: setup.recoveryHashes,
        createdAt: now,
      },
      setup: null,
    };
    return this.claim(account, next, options, now, continuation);
  }

  async verifyTotp(options: ClaimOptions): Promise<SessionProof> {
    const now = this.now(options.now);
    this.password(options.passwordVerifiedAt, now);
    this.session(options.sessionHash);
    const account = await this.activeAccount(options.userId);
    const counter = verifyTotp(
      account.value.factor!.secret,
      options.code,
      now,
      account.value.factor!.lastCounter,
    );
    if (counter === null)
      throw new SecurityStateError(
        'The authenticator code is invalid, expired or already used. Wait for a new code.',
      );
    return this.claim(
      account,
      {
        ...account.value,
        updatedAt: now,
        factor: { ...account.value.factor!, lastCounter: counter },
      },
      options,
      now,
    );
  }

  async verifyRecovery(options: ClaimOptions): Promise<SessionProof> {
    const now = this.now(options.now);
    this.password(options.passwordVerifiedAt, now);
    this.session(options.sessionHash);
    const account = await this.activeAccount(options.userId);
    const recovery = account.value.recovery!;
    let hash: string;
    try {
      hash = recoveryCodeHash(options.userId, recovery.setId, options.code);
    } catch {
      throw new SecurityStateError(
        'The recovery code is invalid or already used.',
      );
    }
    if (!recovery.hashes.some((saved) => equalHash(saved, hash)))
      throw new SecurityStateError(
        'The recovery code is invalid or already used.',
      );
    return this.claim(
      account,
      {
        ...account.value,
        updatedAt: now,
        recovery: {
          ...recovery,
          hashes: recovery.hashes.filter((saved) => !equalHash(saved, hash)),
        },
      },
      options,
      now,
    );
  }

  /** Fresh password + current MFA verification is required by the calling route. */
  async rotateRecovery(
    options: SetupOptions & {
      passwordVerifiedAt: number;
      linkedStatements?: D1PreparedStatement[];
    },
  ): Promise<{ codes: string[]; remaining: number }> {
    const now = this.now(options.now);
    this.password(options.passwordVerifiedAt, now);
    this.session(options.sessionHash);
    const account = await this.activeAccount(options.userId);
    const proof = await this.freshProof(
      account.value,
      options.sessionHash,
      now,
    );
    const codes = generateRecoveryCodes();
    const setId = id();
    const next: AccountSecurity = {
      ...account.value,
      updatedAt: now,
      recovery: {
        setId,
        createdAt: now,
        hashes: codes.map((code) =>
          recoveryCodeHash(options.userId, setId, code),
        ),
      },
    };
    await this.store.checkedBatch([
      ...this.store.accountCas(account, next, now),
      ...this.store.proofUpsert(proof, proof.value, now),
      ...(options.linkedStatements ?? []),
    ]);
    return { codes, remaining: codes.length };
  }

  private async claim(
    account: SecuritySnapshot<AccountSecurity>,
    next: AccountSecurity,
    options: Pick<
      ClaimOptions,
      | 'userId'
      | 'sessionHash'
      | 'targetSessionHash'
      | 'passwordVerifiedAt'
      | 'linkedStatements'
      | 'expectedGeneration'
    >,
    now: number,
    continuation?: SecuritySnapshot<SessionProof>,
  ): Promise<SessionProof> {
    if (
      options.expectedGeneration !== undefined &&
      options.expectedGeneration !== account.value.generation
    )
      throw new SecurityStateError('Account security changed. Sign in again.');
    const sessionHash = options.targetSessionHash ?? options.sessionHash;
    this.session(sessionHash);
    const sameSession = continuation?.value.sessionHash === sessionHash;
    const oldProof = sameSession
      ? continuation!
      : await this.store.readProof(sessionHash, options.userId);
    const continuationGuard =
      continuation && !sameSession
        ? this.store.proofUpsert(continuation, continuation.value, now)
        : [];
    const proof: SessionProof = {
      schema: 1,
      kind: 'proof',
      userId: options.userId,
      sessionHash,
      generation: next.generation,
      passwordVerifiedAt: options.passwordVerifiedAt,
      verifiedAt: now,
      absoluteExpiresAt: now + ADMIN_ABSOLUTE_MS,
      lastActivityAt: now,
    };
    await this.store.checkedBatch([
      ...this.store.accountCas(account, next, now),
      ...continuationGuard,
      ...this.store.proofUpsert(oldProof, proof, now),
      ...(options.linkedStatements ?? []),
    ]);
    return proof;
  }

  private async account(userId: string) {
    const account = await this.store.readAccount(userId);
    if (!account)
      throw new SecurityStateError('Security setup has not been initialized.');
    return account;
  }
  private async activeAccount(userId: string) {
    const account = await this.account(userId);
    if (
      account.value.status !== 'active' ||
      !account.value.factor ||
      !account.value.recovery
    )
      throw new SecurityStateError('MFA setup is not active.');
    return account;
  }
  private async freshProof(
    account: AccountSecurity,
    sessionHash: string,
    now: number,
  ) {
    const proof = await this.store.readProof(sessionHash, account.userId);
    if (!this.isFreshProof(proof, account, now))
      throw new SecurityStateError(
        'Verify your password and current authenticator again before changing security settings.',
      );
    return proof!;
  }
  private isFreshProof(
    proof: SecuritySnapshot<SessionProof> | null,
    account: AccountSecurity,
    now: number,
  ): boolean {
    return Boolean(
      proof &&
      proofIsCurrent(proof.value, account, now) &&
      now - proof.value.verifiedAt <= FRESH_PASSWORD_MS &&
      now >= proof.value.passwordVerifiedAt &&
      now - proof.value.passwordVerifiedAt <= FRESH_PASSWORD_MS,
    );
  }
  private async continuationProof(
    account: AccountSecurity,
    sessionHash: string,
    now: number,
  ) {
    const proof = await this.store.readProof(sessionHash, account.userId);
    if (!proof || !proofIsCurrent(proof.value, account, now))
      throw new SecurityStateError(
        'Your authorized setup session ended. Sign in again before replacing the authenticator.',
      );
    return proof;
  }
  private pending(
    account: AccountSecurity,
    sessionHash: string,
    setupId: string,
    now: number,
  ) {
    this.session(sessionHash);
    const setup = account.setup;
    if (
      !setup ||
      setup.id !== setupId ||
      setup.sessionHash !== sessionHash ||
      now >= setup.expiresAt ||
      now < account.updatedAt
    )
      throw new SecurityStateError(
        'Authenticator setup expired or belongs to another sign-in. Restart setup.',
      );
    return setup;
  }
  private now(value = Date.now()) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new SecurityStateError();
    return value;
  }
  private session(value: string) {
    if (!validSessionHash(value)) throw new SecurityStateError();
  }
  private password(value: number, now: number) {
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > now ||
      now - value > FRESH_PASSWORD_MS
    )
      throw new SecurityStateError(
        'Verify your password again before continuing.',
      );
  }
}
