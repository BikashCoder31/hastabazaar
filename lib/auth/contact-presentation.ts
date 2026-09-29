import type {
  ContactChannel,
  ContactVerificationStatus,
} from './contact-verification';
export type ContactStatus = ContactVerificationStatus & {
  captureAvailable?: boolean;
};
export type LocalContactCapture = {
  channel: ContactChannel;
  contact: string;
  code: string;
  expiresAt: number;
  label: string;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(
      'Contact verification returned an invalid response. Refresh and try again.',
    );
  return value as Record<string, unknown>;
}
export function parseContactStatus(
  value: unknown,
  expected?: ContactVerificationStatus | null,
): ContactStatus {
  const row = object(value);
  if (
    typeof row.email !== 'string' ||
    row.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) ||
    !(
      row.phone === null ||
      (typeof row.phone === 'string' && /^\+9779[678]\d{8}$/.test(row.phone))
    ) ||
    typeof row.emailVerified !== 'boolean' ||
    typeof row.phoneVerified !== 'boolean' ||
    (row.phoneVerified && row.phone === null) ||
    (row.captureAvailable !== undefined &&
      typeof row.captureAvailable !== 'boolean') ||
    (expected && (row.email !== expected.email || row.phone !== expected.phone))
  )
    throw Error(
      'Your contact status changed or could not be checked. Refresh before checkout.',
    );
  return {
    email: row.email,
    phone: row.phone as string | null,
    emailVerified: row.emailVerified,
    phoneVerified: row.phoneVerified,
    ...(row.captureAvailable === undefined
      ? {}
      : { captureAvailable: row.captureAvailable as boolean }),
  };
}
export function parseContactRequest(
  value: unknown,
  now = Date.now(),
): { verified: boolean; token?: string; expiresAt?: number } {
  const row = object(value);
  if (
    row.verified === true &&
    row.token === undefined &&
    row.expiresAt === undefined
  )
    return { verified: true };
  if (
    row.verified !== false ||
    typeof row.token !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(row.token) ||
    typeof row.expiresAt !== 'number' ||
    !Number.isSafeInteger(row.expiresAt) ||
    row.expiresAt <= now ||
    row.expiresAt > now + 610_000
  )
    throw Error(
      'A valid verification code was not issued. Please request a new code.',
    );
  return { verified: false, token: row.token, expiresAt: row.expiresAt };
}
export function parseContactCaptures(
  value: unknown,
  now = Date.now(),
): LocalContactCapture[] {
  const row = object(value);
  if (!Array.isArray(row.captures) || row.captures.length > 2)
    throw Error('Local capture returned an invalid response.');
  return row.captures.map((value) => {
    const capture = object(value);
    if (
      (capture.channel !== 'phone' && capture.channel !== 'email') ||
      typeof capture.contact !== 'string' ||
      capture.contact.length > 254 ||
      typeof capture.code !== 'string' ||
      !/^\d{6}$/.test(capture.code) ||
      typeof capture.expiresAt !== 'number' ||
      !Number.isSafeInteger(capture.expiresAt) ||
      capture.expiresAt <= now ||
      capture.expiresAt > now + 610_000 ||
      capture.label !== 'SIMULATED — NOT VALID FOR PRODUCTION'
    )
      throw Error('Local capture returned an invalid or expired message.');
    return {
      channel: capture.channel,
      contact: capture.contact,
      code: capture.code,
      expiresAt: capture.expiresAt,
      label: capture.label,
    };
  });
}
