import type { EmailService } from '@/lib/email/login-code';
import {
  resolveRuntimeEnvironment,
  SIMULATED_RECORD_LABEL,
} from '@/lib/staging/environment';
import {
  ContactVerificationError,
  getContactVerificationStatus,
  type ContactActor,
  type ContactDelivery,
} from './contact-verification';
import { consumeRequestRateLimit } from '@/lib/http/rate-limit';

export type ContactDeliveryEnvironment = {
  HASTABAZAAR_RUNTIME_ENV?: string;
  APP_ORIGIN?: string;
  EMAIL?: EmailService;
  EMAIL_DELIVERY_CONFIGURED?: string;
  SMS?: {
    configured?: boolean;
    send(message: { to: string; text: string }): Promise<void>;
  };
  CONTACT_DAILY_SEND_LIMIT?: string;
};
function localCapture(environment: ContactDeliveryEnvironment): boolean {
  if (environment.HASTABAZAAR_RUNTIME_ENV !== 'local_staging') return false;
  try {
    return (
      resolveRuntimeEnvironment({
        runtimeEnvironment: environment.HASTABAZAAR_RUNTIME_ENV,
        nodeEnvironment: process.env.NODE_ENV,
        appOrigin: environment.APP_ORIGIN,
      }).kind === 'local_staging' && process.env.NODE_ENV !== 'production'
    );
  } catch {
    throw new ContactVerificationError(
      'Local capture requires a guarded loopback runtime.',
      503,
    );
  }
}
function fictionalEmail(email: string) {
  return /^[^\s@]+@(?:[a-z0-9-]+\.)*local\.hastabazaar\.test$/i.test(email);
}
export function localCaptureAvailable(
  environment: ContactDeliveryEnvironment,
  request: Request,
  email?: string,
): boolean {
  try {
    return (
      localCapture(environment) &&
      new URL(request.url).origin === new URL(environment.APP_ORIGIN!).origin &&
      (!email || fictionalEmail(email))
    );
  } catch {
    return false;
  }
}

export async function deliverContactCode(
  db: D1Database,
  environment: ContactDeliveryEnvironment,
  message: ContactDelivery,
): Promise<void> {
  const simulated = localCapture(environment);
  if (
    !simulated &&
    (message.channel === 'phone'
      ? !environment.SMS?.configured
      : !environment.EMAIL ||
        (environment.EMAIL.configured !== true &&
          environment.EMAIL_DELIVERY_CONFIGURED !== 'true'))
  )
    throw new ContactVerificationError(
      `${message.channel === 'phone' ? 'SMS' : 'Email'} verification is not configured. Please try again later.`,
      503,
    );
  if (simulated && !fictionalEmail(message.email))
    throw new ContactVerificationError(
      'Local capture requires a fictional recipient account.',
      503,
    );
  const configuredLimit = environment.CONTACT_DAILY_SEND_LIMIT ?? '100';
  const sendLimit = Number(configuredLimit);
  if (
    !/^[1-9]\d*$/.test(configuredLimit) ||
    !Number.isSafeInteger(sendLimit) ||
    sendLimit > 10_000
  )
    throw new ContactVerificationError(
      'Contact delivery budget configuration is unavailable.',
      503,
    );
  // A colon-scoped key ignores account/network identity. Every transport shares
  // this finite rolling 24-hour cap, including disposable captures.
  const budget = await consumeRequestRateLimit(
    db,
    new Request('http://localhost/contact-delivery-budget'),
    {
      scope: 'contact-delivery-global:day',
      limit: sendLimit,
      windowMs: 24 * 60 * 60_000,
    },
  );
  if (!budget.allowed)
    throw new ContactVerificationError(
      'Contact code delivery limit reached. Please try again later.',
      503,
    );
  if (simulated) {
    if (!fictionalEmail(message.email))
      throw new ContactVerificationError(
        'Local capture requires a fictional recipient account.',
        503,
      );
    const captured = await db
      .prepare(`INSERT INTO local_contact_captures(token_hash,user_id,channel,contact_value,code,expires_at,simulation_label)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM account_contact_challenges c JOIN users u ON u.id=c.user_id
      WHERE c.token_hash=? AND c.user_id=? AND c.channel=? AND c.contact_value=? AND lower(u.email)=?)`)
      .bind(
        message.tokenHash,
        message.userId,
        message.channel,
        message.contact,
        message.code,
        message.expiresAt,
        SIMULATED_RECORD_LABEL,
        message.tokenHash,
        message.userId,
        message.channel,
        message.contact,
        message.email,
      )
      .run();
    if (Number(captured.meta.changes) !== 1)
      throw new ContactVerificationError(
        'Your contact changed. Request a new code.',
      );
    return;
  }
  const text = `Your HastaBazaar ${message.channel === 'email' ? 'email' : 'phone'} verification code is ${message.code}. It expires in 10 minutes and can be used only once.`;
  if (message.channel === 'phone') {
    if (!environment.SMS?.configured)
      throw new ContactVerificationError(
        'SMS verification is not configured. Please try again later.',
        503,
      );
    await environment.SMS.send({ to: message.contact, text });
  } else {
    if (
      !environment.EMAIL ||
      (environment.EMAIL.configured !== true &&
        environment.EMAIL_DELIVERY_CONFIGURED !== 'true')
    )
      throw new ContactVerificationError(
        'Email verification is not configured. Please try again later.',
        503,
      );
    await environment.EMAIL.send({
      to: message.contact,
      subject: 'Verify your HastaBazaar email',
      text,
      html: `<p>${text}</p>`,
    });
  }
}

export async function readLocalContactCaptures(
  db: D1Database,
  environment: ContactDeliveryEnvironment,
  actor: ContactActor,
  now = Date.now(),
) {
  if (!localCapture(environment))
    throw new ContactVerificationError('Local capture is unavailable.', 403);
  const current = await getContactVerificationStatus(db, actor);
  if (!fictionalEmail(current.email))
    throw new ContactVerificationError(
      'Local capture requires a fictional recipient account.',
      403,
    );
  return (
    await db
      .prepare(`SELECT p.channel,p.contact_value AS contact,p.code,p.expires_at AS expiresAt,p.simulation_label AS label
    FROM local_contact_captures p JOIN account_contact_challenges c ON c.token_hash=p.token_hash JOIN users u ON u.id=p.user_id
    WHERE p.user_id=? AND u.auth_subject=? AND c.auth_subject=u.auth_subject AND u.status='active'
    AND c.consumed_at IS NULL AND c.delivered_at IS NOT NULL AND c.attempts<5 AND c.expires_at>? AND p.expires_at>?
    AND ((c.channel='email' AND c.contact_snapshot=lower(u.email)) OR (c.channel='phone' AND c.contact_snapshot=u.phone))
    ORDER BY c.created_at DESC LIMIT 2`)
      .bind(actor.userId, actor.authSubject, now, now)
      .all<{
        channel: 'email' | 'phone';
        contact: string;
        code: string;
        expiresAt: number;
        label: string;
      }>()
  ).results;
}
