export interface AccountSecurityEmailBindings {
  APP_ORIGIN?: string;
  HASTABAZAAR_RUNTIME_ENV?: string;
  EMAIL_DELIVERY_CONFIGURED?: string;
  EMAIL?: {
    configured?: boolean;
    send(message: {
      to: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<unknown>;
  };
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
}
function emailHtml(paragraphs: string[], link?: string) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#14284a"><main style="max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:24px">Hastabazaar account security</h1>${paragraphs.map((paragraph) => `<p style="line-height:1.6">${escapeHtml(paragraph)}</p>`).join('')}${link ? `<p><a href="${escapeHtml(link)}">Open your private recovery invitation</a></p>` : ''}</main></body></html>`;
}
function delivery(bindings: AccountSecurityEmailBindings, email: string) {
  if (
    !bindings.EMAIL ||
    (bindings.EMAIL.configured !== true &&
      bindings.EMAIL_DELIVERY_CONFIGURED !== 'true')
  )
    throw new Error('Email delivery is not configured.');
  if (
    bindings.HASTABAZAAR_RUNTIME_ENV === 'local_staging' &&
    !/^[^\s@]+@local\.hastabazaar\.test$/i.test(email)
  )
    throw new Error('Local security mail requires a fictional recipient.');
  return bindings.EMAIL;
}
export async function sendAccountSecurityInvitation(
  bindings: AccountSecurityEmailBindings,
  message: {
    email: string;
    token: string;
    kind: 'password' | 'mfa';
    expiresAt: number;
  },
): Promise<void> {
  const email = delivery(bindings, message.email),
    origin = new URL(bindings.APP_ORIGIN ?? '');
  const local =
    bindings.HASTABAZAAR_RUNTIME_ENV === 'local_staging' &&
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))
    throw new Error('Security recovery requires an HTTPS app origin.');
  const url = new URL('/recover-account', origin);
  url.hash = message.token;
  const explanation =
    message.kind === 'mfa'
      ? 'Super Admin approved recovery of your unavailable authenticator. You must enter your current password and then enroll a replacement authenticator before account access is restored.'
      : 'Super Admin approved your password recovery request. Choose your new password privately. Your existing two-step verification remains required.';
  const expiry = `It expires at ${new Date(message.expiresAt).toISOString()} and can be used once.`;
  const privacy =
    'Do not share or forward this link. Super Admin will never ask you to disclose your password or authenticator code.';
  const unexpected =
    'If you did not request this recovery, ignore the invitation and contact Hastabazaar support.';
  await email.send({
    to: message.email,
    subject:
      message.kind === 'mfa'
        ? 'Hastabazaar authenticator recovery approved'
        : 'Your private Hastabazaar password reset',
    text: [
      explanation,
      '',
      `Open this private invitation: ${url.href}`,
      expiry,
      privacy,
      unexpected,
    ].join('\n'),
    html: emailHtml([explanation, expiry, privacy, unexpected], url.href),
  });
}
export async function sendAccountSecurityNotice(
  bindings: AccountSecurityEmailBindings,
  message: {
    email: string;
    event: 'password_reset' | 'mfa_recovery' | 'mfa_disabled';
  },
): Promise<void> {
  const descriptions = {
    password_reset:
      'Your password was reset. Previous sessions were signed out. Existing two-step verification remains required.',
    mfa_recovery:
      'Your previous authenticator and recovery codes were invalidated. Previous sessions were signed out. Sign in with your password and enroll a replacement authenticator before continuing.',
    mfa_disabled:
      'Two-step verification was disabled after your password and existing second factor were verified. Previous sessions were signed out.',
  };
  await delivery(bindings, message.email).send({
    to: message.email,
    subject: 'Your Hastabazaar account security changed',
    text: `${descriptions[message.event]}\n\nIf you did not make this change, contact Hastabazaar support immediately.`,
    html: emailHtml([
      descriptions[message.event],
      'If you did not make this change, contact Hastabazaar support immediately.',
    ]),
  });
}
