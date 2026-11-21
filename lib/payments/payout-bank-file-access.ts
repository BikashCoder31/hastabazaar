import { FRESH_PASSWORD_MS, privilegedSessionExpired, proofIsCurrent, type AccountSecurity, type SessionProof } from '../security/model';
import { securityActor, SecurityRequestError, type SecurityActor } from '../security/request';
import { securityStore } from '../security/session';
import type { SecuritySnapshot } from '../security/store';

export type PayoutBankFileActor = {
  actor: Pick<SecurityActor, 'id' | 'authSubject'>;
  session: {
    hash: string;
    verifiedAt: number;
    expiresAt: number;
    account: SecuritySnapshot<AccountSecurity>;
    proof: SecuritySnapshot<SessionProof>;
  } | null;
};

const verifyAgain = () => new SecurityRequestError('Sign in again to download the bank file.', 403, 'MFA_REQUIRED');

export async function requirePayoutBankFileActor(request: Request): Promise<PayoutBankFileActor & { db: D1Database }> {
  const { db, actor, key, initialized } = await securityActor(request);
  if (actor.role !== 'super_admin') throw new SecurityRequestError('Only Super Admin can download the bank file.');
  // Use the existing narrowly scoped local-test assurance. Hosted users must
  // always supply their current password or password-plus-authenticator proof.
  if (actor.localTestStaffMfaSkipped) return { db, actor, session: null };
  if (!actor.raw || !actor.sessionHash || actor.raw.accountId !== actor.id || actor.raw.userId !== actor.authSubject)
    throw verifyAgain();

  const store = await securityStore(db, key, initialized);
  const account = await store?.readAccount(actor.id);
  const proof = await store?.readProof(actor.sessionHash, actor.id);
  const now = Date.now();
  if (!account || !proof || now < proof.value.passwordVerifiedAt || now - proof.value.passwordVerifiedAt > FRESH_PASSWORD_MS)
    throw verifyAgain();
  const current = account.value.status === 'disabled'
    ? proof.value.generation === account.value.generation && !privilegedSessionExpired(proof.value.verifiedAt, actor.raw.lastSeenAt, now)
    : proofIsCurrent(proof.value, account.value, now);
  if (!current || now - proof.value.verifiedAt > FRESH_PASSWORD_MS) throw verifyAgain();
  return { db, actor, session: { hash: actor.sessionHash, verifiedAt: proof.value.verifiedAt,
    expiresAt: proof.value.passwordVerifiedAt + FRESH_PASSWORD_MS, account, proof } };
}
