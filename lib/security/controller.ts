import { hostedSessionHash, hostedSessionCookie } from '../auth/hosted-session';
import { SESSION_EXPIRED_MESSAGE } from '../auth/sign-in-destination';
import { randomUUID } from 'node:crypto';
import { safeRelativeReturnPath } from '../http/safe-return';
import { MfaService } from './mfa';
import { FRESH_PASSWORD_MS, proofIsCurrent } from './model';
import { readPasswordChallenge } from './password-challenge';
import { sendAccountSecurityNotice } from '../email/account-security';
import {
  securityStore,
  staffSessionState,
  staffSessionIsVerified,
  sellerSessionIsVerified,
  passwordOnlyProofStatements,
} from './session';
import { handleBootstrap } from './bootstrap';
import { markSecurityInitialized } from './runtime-policy';
import {
  freshPassword,
  initializeForStaff,
  liveActorGuards,
  newSecuritySession,
  requiredStore,
  securityActor,
  securityBindings,
  securityFailure,
  securityMutation,
  SecurityRequestError,
  securityResponse,
  text,
} from './request';

export async function securityStatus(request: Request) {
  try {
    const { db, actor, key, initialized } = await securityActor(request),
      store = await securityStore(db, key, initialized),
      manifest = store ? await store.readManifest() : null;
    const registrationRequired = Boolean(
      manifest && !manifest.value.userIds.includes(actor.id),
    );
    const account =
      store && !registrationRequired ? await store.readAccount(actor.id) : null;
    const credential = await db
      .prepare('SELECT 1 FROM user_credentials WHERE user_id=?')
      .bind(actor.id)
      .first();
    const proof =
      store && actor.sessionHash && account?.value.status === 'active'
        ? await store.readProof(actor.sessionHash, actor.id)
        : null;
    const statusTime = Date.now();
    const verified = Boolean(
      proof &&
      account &&
      proofIsCurrent(proof.value, account.value, statusTime) &&
      statusTime - proof.value.verifiedAt <= FRESH_PASSWORD_MS &&
      statusTime >= proof.value.passwordVerifiedAt &&
      statusTime - proof.value.passwordVerifiedAt <= FRESH_PASSWORD_MS,
    );
    const mfaRequired = !actor.localTestStaffMfaSkipped && (
      account?.value.status === 'active' ||
      account?.value.status === 'recovery' ||
      (actor.role === 'super_admin' && account?.value.status !== 'disabled'));
    const passwordChallenge = store && !registrationRequired
      ? await readPasswordChallenge(store, actor.id, actor.sessionHash, statusTime)
      : null;
    if (!actor.localTestStaffMfaSkipped && !verified && !passwordChallenge && !registrationRequired && actor.raw?.isStaff && actor.sessionHash &&
      await staffSessionState(db, actor.raw, actor.sessionHash, key, statusTime, false, initialized) === 'expired')
      throw new SecurityRequestError(SESSION_EXPIRED_MESSAGE, 401, 'SESSION_EXPIRED');
    const current=(await securityActor(request)).actor;
    if(current.id!==actor.id||current.authSubject!==actor.authSubject||current.role!==actor.role||current.sessionHash!==actor.sessionHash)throw new SecurityRequestError('The signed-in account or its security access changed.',403,'ACTOR_CHANGED');
    return securityResponse({
      user: {
        id:actor.id,
        displayName: actor.displayName,
        email: actor.email,
        role: actor.role,
      },
      status:
        account?.value.status === 'active'
          ? verified
            ? 'active'
            : 'verify'
          : account?.value.status === 'recovery'
            ? 'recovery'
            : account?.value.setup
              ? 'setup'
              : account?.value.status === 'disabled'
                ? 'disabled'
                : actor.role !== 'super_admin'
                  ? 'optional'
                  : 'pending',
      mfaRequired,
      canDisable: actor.role !== 'admin' && account?.value.status === 'active',
      needsPassword: !credential,
      passwordVerified: Boolean(passwordChallenge),
      ...(passwordChallenge ? {
        passwordCheckExpiresInMs: Math.max(1,
          passwordChallenge.snapshot.value.verifiedAt + FRESH_PASSWORD_MS + 1 - Date.now()),
      } : {}),
      canManage: account?.value.status !== 'active' || verified,
      sessionVerified: verified,
      localSimulation: actor.localSimulation,
      session: { absoluteHours: 8, idleMinutes: 30 },
      recoveryRemaining: account?.value.recovery?.hashes.length ?? 0,
      keyConfigured: Boolean(key),
      registrationRequired,
    });
  } catch (error) {
    return securityFailure(error);
  }
}
export async function handleSecurityAction(
  request: Request,
  action: 'bootstrap' | 'setup' | 'confirm' | 'verify' | 'recovery' | 'disable',
) {
  try {
    const { db, actor, key, initialized, data } = await securityMutation(
        request,
        action,
      ),
      store = requiredStore(db, key, initialized);
    if (action === 'bootstrap' && actor.role === 'seller')
      throw new SecurityRequestError(
        'Use registered-email password recovery to set your password.',
        422,
      );
    if (action === 'bootstrap')
      return await handleBootstrap(request, db, actor, store, data);
    if (action === 'disable' && actor.role === 'admin')
      throw new SecurityRequestError(
        'Only Super Admin can disable their own MFA.',
      );
    const passwordChallenge =
      action === 'verify' && !text(data, 'password')
        ? await readPasswordChallenge(
            store,
            actor.id,
            actor.sessionHash,
            Date.now(),
          )
        : null;
    const passwordRequired = () => new SecurityRequestError(
      'Your password check has expired. Sign in again to continue.',
      422,
      'PASSWORD_REQUIRED',
    );
    if (action === 'verify' && !text(data, 'password') && !passwordChallenge)
      throw passwordRequired();
    const credential =
      passwordChallenge?.credential ??
      (await freshPassword(db, actor, text(data, 'password')));
    await initializeForStaff(store, actor);
    const service = new MfaService(store),
      now = Date.now();
    if (passwordChallenge && now - passwordChallenge.snapshot.value.verifiedAt > FRESH_PASSWORD_MS)
      throw passwordRequired();
    if (action === 'disable') {
      if (data.acknowledge !== true)
        throw new SecurityRequestError(
          'Confirm that future sign-ins will use only your password.',
          422,
        );
      if (!actor.sessionHash)
        throw new SecurityRequestError(
          'Sign in again before disabling MFA.',
          401,
        );
      const guard = randomUUID();
      await service.disable({
        userId: actor.id,
        sessionHash: actor.sessionHash,
        passwordVerifiedAt: now,
        code: text(data, 'code', 80),
        recovery: data.recovery === true,
        optionalAccount: actor.role === 'seller',
        now,
        linkedStatements: [
          ...liveActorGuards(db, actor, credential.hash),
          db
            .prepare(
              "INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role=?) AND (?='super_admin' OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role IN ('admin','super_admin'))) THEN 1 ELSE 0 END",
            )
            .bind(guard, actor.id, actor.role, actor.role, actor.id),
          db
            .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
            .bind(guard),
          db
            .prepare('DELETE FROM user_sessions WHERE user_id=?')
            .bind(actor.id),
          db
            .prepare(
              "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,'security.mfa.disabled','account_security',?,'Owner confirmed password and existing MFA factor',?,?,NULL,NULL,?)",
            )
            .bind(
              randomUUID(),
              actor.id,
              actor.id,
              JSON.stringify({ mfa: 'active' }),
              JSON.stringify({ mfa: 'disabled', sessionsRevoked: true }),
              now,
            ),
        ],
      });
      let notificationSent = false;
      try {
        await sendAccountSecurityNotice(securityBindings(), {
          email: actor.email,
          event: 'mfa_disabled',
        });
        notificationSent = true;
      } catch {
        // The security change has committed. Never report it as failed or repeat
        // the factor claim because its informational email could not be sent.
      }
      return securityResponse(
        { ok: true, status: 'disabled', returnTo: '/login', notificationSent },
        200,
        hostedSessionCookie('', 0),
      );
    }
    if (action === 'verify') {
      const account = await store.readAccount(actor.id);
      if (passwordChallenge && account?.value.status !== 'active')
        throw new SecurityRequestError(
          'Account security changed. Sign in again.',
          401,
        );
      if (
        account?.value.status === 'disabled' ||
        (actor.role === 'admin' && account?.value.status === 'pending')
      ) {
        const session = newSecuritySession(db, actor, credential.hash, now);
        const proof = await passwordOnlyProofStatements(
          db,
          actor.id,
          session.hash,
          credential.hash,
          key,
          initialized,
          now,
        );
        if (!proof.length)
          throw new SecurityRequestError(
            'Account security changed. Sign in again.',
          );
        await store.checkedBatch([...session.statements, ...proof]);
        return securityResponse(
          {
            ok: true,
            returnTo: safeRelativeReturnPath(
              text(data, 'returnTo', 2000) || '/admin',
            ),
          },
          200,
          session.cookie,
        );
      }
    }
    if (action === 'setup') {
      const account = await store.readAccount(actor.id);
      let setup: { setupId: string; secret: string; expiresAt: number };
      let cookie: string | undefined;
      if (
        account?.value.status !== 'active' &&
        account?.value.status !== 'recovery' &&
        (actor.role !== 'super_admin' ||
          account?.value.status === 'disabled') &&
        actor.raw &&
        actor.sessionHash &&
        (await (
          actor.role === 'seller'
            ? sellerSessionIsVerified
            : staffSessionIsVerified
        )(db, actor.raw, actor.sessionHash, key, now, false, initialized))
      ) {
        // Optional setup must not discard an existing password-proven session.
        // Activation still rotates its generation and revokes older sessions.
        setup = await service.beginSetup({
          userId: actor.id,
          sessionHash: actor.sessionHash,
          now,
          linkedStatements: liveActorGuards(db, actor, credential.hash),
        });
      } else if (
        account?.value.status === 'active' &&
        actor.sessionHash &&
        (await service.hasFreshProof({
          userId: actor.id,
          sessionHash: actor.sessionHash,
          now,
        }))
      ) {
        setup = await service.beginSetup({
          userId: actor.id,
          sessionHash: actor.sessionHash,
          now,
          linkedStatements: liveActorGuards(db, actor, credential.hash),
        });
      } else {
        const session = newSecuritySession(db, actor, credential.hash, now);
        setup =
          account?.value.status === 'active'
            ? await service.beginVerifiedReplacement({
                userId: actor.id,
                sessionHash: actor.sessionHash ?? session.hash,
                targetSessionHash: session.hash,
                passwordVerifiedAt: now,
                code: text(data, 'code', 80),
                recovery: data.recovery === true,
                now,
                linkedStatements: session.statements,
              })
            : await service.beginSetup({
                userId: actor.id,
                sessionHash: session.hash,
                now,
                linkedStatements: session.statements,
              });
        cookie = session.cookie;
      }
      const otpAuthUrl = `otpauth://totp/${encodeURIComponent('Hastabazaar:' + actor.email)}?secret=${setup.secret}&issuer=Hastabazaar&algorithm=SHA1&digits=6&period=30`;
      return securityResponse(
        { setupId: setup.setupId, manualKey: setup.secret, otpAuthUrl },
        200,
        cookie,
      );
    }
    if (!actor.sessionHash && action === 'confirm')
      throw new SecurityRequestError(
        'Sign in again before confirming this setup.',
        401,
      );
    if (action === 'confirm') {
      const setupId = text(data, 'setupId', 100);
      if (data.acknowledge === true) {
        const session = newSecuritySession(
          db,
          actor,
          credential.hash,
          now,
          true,
        );
        await markSecurityInitialized(securityBindings());
        await service.activateSetup({
          userId: actor.id,
          sessionHash: actor.sessionHash!,
          targetSessionHash: session.hash,
          setupId,
          recoverySaved: true,
          passwordVerifiedAt: now,
          now,
          linkedStatements: session.statements,
        });
        return securityResponse(
          { ok: true, status: 'active' },
          200,
          session.cookie,
        );
      }
      const result = await service.confirmSetup({
        userId: actor.id,
        sessionHash: actor.sessionHash!,
        setupId,
        code: text(data, 'code', 6),
        now,
        linkedStatements: liveActorGuards(db, actor, credential.hash),
      });
      return securityResponse({
        setupId: result.setupId,
        recoveryCodes: result.codes,
      });
    }
    if (
      action === 'recovery' &&
      actor.sessionHash &&
      (await service.hasFreshProof({
        userId: actor.id,
        sessionHash: actor.sessionHash,
        now,
      }))
    ) {
      const result = await service.rotateRecovery({
        userId: actor.id,
        sessionHash: actor.sessionHash,
        passwordVerifiedAt: now,
        now,
        linkedStatements: liveActorGuards(db, actor, credential.hash),
      });
      return securityResponse({
        recoveryCodes: result.codes,
        recoveryRemaining: result.codes.length,
      });
    }
    const session = newSecuritySession(db, actor, credential.hash, now);
    const options = {
      userId: actor.id,
      sessionHash: actor.sessionHash ?? session.hash,
      targetSessionHash: session.hash,
      passwordVerifiedAt: passwordChallenge?.snapshot.value.verifiedAt ?? now,
      expectedGeneration: passwordChallenge?.snapshot.value.generation,
      code: text(data, 'code', 80),
      now,
      linkedStatements: [
        ...(passwordChallenge?.consume ?? []),
        ...session.statements,
      ],
    };
    if (action === 'recovery') {
      const result = await service.replaceRecovery({
        ...options,
        recovery: data.recovery === true,
      });
      return securityResponse(
        { recoveryCodes: result.codes, recoveryRemaining: result.codes.length },
        200,
        session.cookie,
      );
    }
    if (data.recovery === true) await service.verifyRecovery(options);
    else await service.verifyTotp(options);
    const destination = safeRelativeReturnPath(
      text(data, 'returnTo', 2000) || '/admin',
    );
    return securityResponse(
      { ok: true, returnTo: destination },
      200,
      session.cookie,
    );
  } catch (error) {
    return securityFailure(error);
  }
}

export async function securityActivity(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      throw new SecurityRequestError('Cross-site requests are not allowed.');
    const { db, actor, key, initialized } = await securityActor(request);
    if (actor.localTestStaffMfaSkipped || !actor.raw || !actor.sessionHash)
      return securityResponse({ ok: true, setupPending: true });
    const now = Date.now();
    if (
      !(await (
        actor.role === 'seller'
          ? sellerSessionIsVerified
          : staffSessionIsVerified
      )(
        db,
        actor.raw,
        hostedSessionHash(request.headers)!,
        key,
        now,
        true,
        initialized,
      ))
    )
      throw new SecurityRequestError(
        SESSION_EXPIRED_MESSAGE,
        401,
        'SESSION_EXPIRED',
      );
    await db
      .prepare(
        'UPDATE user_sessions SET last_seen_at=? WHERE token_hash=? AND last_seen_at<? AND expires_at>?',
      )
      .bind(now, actor.sessionHash, now, now)
      .run();
    return securityResponse({ ok: true, expiresAt: actor.raw.expiresAt });
  } catch (error) {
    return securityFailure(error);
  }
}
