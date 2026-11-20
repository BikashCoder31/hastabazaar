import { createHash, randomUUID } from 'node:crypto';
import { FRESH_PASSWORD_MS, validSessionHash } from './model';
import { SecurityStateError } from './crypto';
import { SecurityStore } from './store';

const challengeKey = (sessionHash: string) =>
  `auth-private:challenge:password:${sessionHash}`;
const fingerprint = (hash: string) =>
  createHash('sha256').update(hash).digest('hex');
type PasswordChallenge = {
  schema: 1;
  kind: 'password-challenge';
  userId: string;
  sessionHash: string;
  credentialFingerprint: string;
  generation: number;
  verifiedAt: number;
};

/** Separate from an MFA session proof: this record can never grant Admin access. */
export async function passwordChallengeStatements(
  store: SecurityStore,
  userId: string,
  sessionHash: string,
  passwordHash: string,
  now: number,
): Promise<D1PreparedStatement[]> {
  const manifest = await store.readManifest();
  if (!manifest?.value.userIds.includes(userId)) return [];
  const account = await store.readAccount(userId);
  if (account?.value.status !== 'active') return [];
  return [
    ...store.accountCas(account, account.value, now),
    ...store.insertRecord(
      challengeKey(sessionHash),
      userId,
      {
        schema: 1,
        kind: 'password-challenge',
        userId,
        sessionHash,
        credentialFingerprint: fingerprint(passwordHash),
        generation: account.value.generation,
        verifiedAt: now,
      } satisfies PasswordChallenge,
      now,
    ),
  ];
}

export async function readPasswordChallenge(
  store: SecurityStore,
  userId: string,
  sessionHash: string | null,
  now: number,
) {
  if (!sessionHash || !validSessionHash(sessionHash)) return null;
  const account = await store.readAccount(userId);
  if (account?.value.status !== 'active') return null;
  const snapshot = await store.readRecord(
    challengeKey(sessionHash),
    userId,
    (value) => {
      const record = value as PasswordChallenge | null;
      if (
        !record ||
        record.schema !== 1 ||
        record.kind !== 'password-challenge' ||
        record.userId !== userId ||
        record.sessionHash !== sessionHash ||
        !Number.isSafeInteger(record.generation) ||
        record.generation < 1 ||
        !Number.isSafeInteger(record.verifiedAt) ||
        record.verifiedAt < 0 ||
        typeof record.credentialFingerprint !== 'string' ||
        !/^[a-f0-9]{64}$/.test(record.credentialFingerprint)
      )
        throw new SecurityStateError();
      return record;
    },
  );
  if (
    !snapshot ||
    snapshot.value.generation !== account.value.generation ||
    now < snapshot.value.verifiedAt ||
    now - snapshot.value.verifiedAt > FRESH_PASSWORD_MS
  )
    return null;
  const credential = await store.database
    .prepare(
      "SELECT c.password_hash AS hash FROM user_sessions s JOIN users u ON u.id=s.user_id JOIN user_credentials c ON c.user_id=u.id WHERE s.token_hash=? AND u.id=? AND u.status='active' AND s.expires_at>?",
    )
    .bind(sessionHash, userId, now)
    .first<{ hash: string }>();
  if (
    !credential ||
    fingerprint(credential.hash) !== snapshot.value.credentialFingerprint
  )
    return null;
  const guard = randomUUID();
  return {
    snapshot,
    credential,
    // Recheck the original live session inside the same transaction that consumes
    // the factor, rotates the session and deletes this single-use challenge.
    consume: [
      store.database
        .prepare(
          'INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM user_sessions WHERE token_hash=? AND user_id=? AND expires_at>?) THEN 1 ELSE 0 END',
        )
        .bind(guard, sessionHash, userId, now),
      store.database
        .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
        .bind(guard),
      ...store.deleteRecord(snapshot),
    ],
  };
}
