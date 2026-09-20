import type { EmailOtpChallengeRecord } from '@/lib/auth/email-otp';
import type { EmailOtpStore } from '@/lib/auth/email-otp-service';

export class PasswordResetStore implements EmailOtpStore {
  constructor(private readonly database: D1Database) {}

  async findActiveUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string } | null> {
    return this.database
      .prepare(
        "SELECT id, email FROM users WHERE lower(email) = ? AND status = 'active' LIMIT 1",
      )
      .bind(email)
      .first<{ id: string; email: string }>();
  }

  async replaceChallenge(record: EmailOtpChallengeRecord): Promise<void> {
    await this.database.batch([
      this.database
        .prepare(
          'DELETE FROM password_reset_challenges WHERE user_id = ? AND consumed_at IS NULL',
        )
        .bind(record.userId),
      this.database
        .prepare(
          `INSERT INTO password_reset_challenges
            (token_hash, code_hash, user_id, attempts, expires_at, created_at, consumed_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        )
        .bind(
          record.tokenHash,
          record.codeHash,
          record.userId,
          record.attempts,
          record.expiresAt,
          record.createdAt,
        ),
    ]);
  }

  async findChallenge(
    tokenHash: string,
  ): Promise<EmailOtpChallengeRecord | null> {
    return this.database
      .prepare(
        `SELECT token_hash AS tokenHash, code_hash AS codeHash, user_id AS userId,
          attempts, expires_at AS expiresAt, created_at AS createdAt, consumed_at AS consumedAt
         FROM password_reset_challenges WHERE token_hash = ? LIMIT 1`,
      )
      .bind(tokenHash)
      .first<EmailOtpChallengeRecord>();
  }

  async recordFailedAttempt(tokenHash: string): Promise<void> {
    await this.database
      .prepare(
        'UPDATE password_reset_challenges SET attempts = attempts + 1 WHERE token_hash = ? AND consumed_at IS NULL',
      )
      .bind(tokenHash)
      .run();
  }

  async consumeChallenge(
    tokenHash: string,
    consumedAt: number,
  ): Promise<boolean> {
    const result = await this.database
      .prepare(
        'UPDATE password_reset_challenges SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL',
      )
      .bind(consumedAt, tokenHash)
      .run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async deleteChallenge(tokenHash: string): Promise<void> {
    await this.database
      .prepare('DELETE FROM password_reset_challenges WHERE token_hash = ?')
      .bind(tokenHash)
      .run();
  }
}
