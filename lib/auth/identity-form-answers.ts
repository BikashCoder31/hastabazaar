import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { FormValidationError } from '@/lib/forms/validation';

const bearerCookies = new Set(['hastabazaar_session', 'hastabazaar_email_otp', 'hastabazaar_password_reset']);

/** First statement in the identity action batch: publication cannot race the answer. */
export function buildIdentityVersionGuard(db: D1Database, formId: string,
  versionId: string): D1PreparedStatement {
  if (!formId.startsWith('identity.') || !versionId) throw new Error('Invalid identity form version.');
  return db.prepare(`SELECT CASE WHEN ?=(SELECT id FROM form_config_versions
    WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1)
    THEN 1 ELSE json_extract('invalid', '$') END`).bind(versionId, formId);
}

/** Classify a failed batch after rollback without treating a domain conflict as form staleness. */
export async function identityVersionChanged(db: D1Database, formId: string,
  versionId: string): Promise<boolean> {
  const current = await db.prepare(`SELECT id FROM form_config_versions
    WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1`)
    .bind(formId).first<{ id: string }>();
  return current?.id !== versionId;
}

/** Reject submitted secrets copied into custom answers; numeric matching is opt-in. */
export function assertNoIdentitySecrets(snapshot: FormAnswerSnapshot, submittedSecrets: readonly string[],
  headers?: Headers, options?: { rejectNumericSecrets?: boolean }): void {
  const secrets = submittedSecrets.filter((value) => value.length > 0);
  for (const part of (headers?.get('cookie') ?? '').split(';')) {
    const split = part.indexOf('=');
    if (split < 0 || !bearerCookies.has(part.slice(0, split).trim())) continue;
    try {
      const token = decodeURIComponent(part.slice(split + 1).trim());
      if (token) secrets.push(token);
    } catch { /* A malformed cookie cannot become an answer exception. */ }
  }
  if (!secrets.length) return;
  for (const answer of snapshot.answers) {
    const strings = typeof answer.value === 'string' ? [answer.value]
      : Array.isArray(answer.value) ? answer.value.filter((value): value is string => typeof value === 'string')
      : [];
    const copiedNumericSecret = options?.rejectNumericSecrets === true && typeof answer.value === 'number' &&
      Number.isFinite(answer.value) && secrets.some((secret) =>
        /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(secret) &&
        Number.isFinite(Number(secret)) && Number(secret) === answer.value);
    if (copiedNumericSecret || strings.some((value) => secrets.some((secret) => value.includes(secret)))) {
      throw new FormValidationError('invalid_answer',
        'This answer includes a sign-in or recovery secret. Remove it and try again.', answer.fieldId);
    }
  }
}
