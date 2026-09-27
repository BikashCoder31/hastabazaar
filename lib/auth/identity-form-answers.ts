import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { FormValidationError } from '@/lib/forms/validation';

const bearerCookies = new Set(['hastabazaar_session', 'hastabazaar_email_otp', 'hastabazaar_password_reset']);

/** Reject submitted secrets copied into custom strings; selected flows also guard exact six-digit numbers. */
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
    const exactSixDigitNumber = options?.rejectNumericSecrets === true && typeof answer.value === 'number' &&
      Number.isSafeInteger(answer.value) && answer.value >= 100000 && answer.value <= 999999 &&
      secrets.some((secret) => /^[1-9]\d{5}$/.test(secret) && Number(secret) === answer.value);
    if (exactSixDigitNumber || strings.some((value) => secrets.some((secret) => value.includes(secret)))) {
      throw new FormValidationError('invalid_answer',
        'This answer includes a sign-in or recovery secret. Remove it and try again.', answer.fieldId);
    }
  }
}
