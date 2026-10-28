import { createHash } from 'node:crypto';
import { requireDatabase } from '../db/d1';
import { readBoundedBody } from '../http/bounded-body';
import { consumeAuthenticationRateLimit } from '../http/rate-limit';
import { isTrustedMutationRequest } from '../http/request-security';
import {
  sendAccountSecurityInvitation,
  sendAccountSecurityNotice,
} from '../email/account-security';
import { AssistedRecoveryService } from './assisted-recovery';
import { readSecurityInitialization } from './runtime-policy';
import {
  requiredStore,
  securityBindings,
  securityFailure,
  securityMutation,
  securityResponse,
  SecurityRequestError,
  text,
} from './request';

function service(
  db: D1Database,
  key: string | undefined,
  initialized: boolean,
) {
  const bindings = securityBindings();
  return new AssistedRecoveryService(requiredStore(db, key, initialized), {
    invite: (message) => sendAccountSecurityInvitation(bindings, message),
    notice: (message) => sendAccountSecurityNotice(bindings, message),
  });
}
export async function issueAssistedRecovery(request: Request) {
  try {
    const { db, key, initialized, actor, data } = await securityMutation(
      request,
      'assisted-recovery',
    );
    if (actor.role !== 'super_admin' || !actor.sessionHash)
      throw new SecurityRequestError(
        'A current Super Admin session with recent password and authenticator verification is required.',
      );
    const targetId = text(data, 'targetId', 200),
      kind = text(data, 'kind'),
      email = text(data, 'confirmedEmail', 320);
    const target = await db
      .prepare('SELECT email FROM users WHERE id=?')
      .bind(targetId)
      .first<{ email: string }>();
    if (!target || target.email !== email || data.confirmedTarget !== true)
      throw new SecurityRequestError(
        'Confirm the intended account and its current registered email.',
        422,
      );
    if (kind !== 'password' && kind !== 'mfa')
      throw new SecurityRequestError('Choose the recovery action.', 422);
    const result = await service(db, key, initialized).issue({
      actorId: actor.id,
      sessionHash: actor.sessionHash,
      targetId,
      kind,
      confirmedEmail: email,
      supportReference: text(data, 'supportReference', 80),
      reason: kind === 'mfa' ? 'lost_authenticator' : 'lost_password',
      verificationMethod: text(data, 'verificationMethod') as
        | 'seller_onboarding'
        | 'staff_records',
      verificationReference: text(data, 'verificationReference', 80),
      ownershipVerified: data.ownershipVerified === true,
    });
    return securityResponse({
      ok: true,
      ...result,
      message:
        'A private recovery invitation was emailed to the registered address. No credentials have changed.',
    });
  } catch (error) {
    return securityFailure(error);
  }
}
export async function completeAssistedRecovery(request: Request) {
  try {
    const bindings = securityBindings();
    if (
      !request.headers.get('origin') ||
      !isTrustedMutationRequest(request, bindings.APP_ORIGIN)
    )
      throw new SecurityRequestError(
        'Cross-site requests are not allowed.',
        403,
      );
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new SecurityRequestError(
        'Use the recovery form to submit this request.',
        415,
      );
    let data: unknown;
    try {
      data = JSON.parse(
        new TextDecoder().decode(await readBoundedBody(request, 8192)),
      );
    } catch {
      throw new SecurityRequestError(
        'The recovery request is invalid or too large.',
        413,
      );
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new SecurityRequestError('Invalid recovery form.', 422);
    const input = data as Record<string, unknown>,
      token = text(input, 'token', 500),
      db = requireDatabase(bindings);
    const rate = await consumeAuthenticationRateLimit(db, request, {
      scope: `assisted-recovery-complete:${createHash('sha256').update(token).digest('hex')}`,
      limit: 5,
      windowMs: 15 * 60_000,
    });
    if (!rate.allowed)
      throw new SecurityRequestError(
        'Too many attempts. Ask for a new recovery invitation.',
        429,
        'RATE_LIMIT',
      );
    const result = await service(
      db,
      bindings.HASTABAZAAR_SECURITY_KEY,
      await readSecurityInitialization(bindings),
    ).complete({
      token,
      password: text(input, 'password', 256),
      confirmation: text(input, 'confirmation', 256),
    });
    return securityResponse({ ok: true, ...result });
  } catch (error) {
    return securityFailure(error);
  }
}
