import {
  buildEmailLoginCodeMessage,
  type EmailLoginEnvironment,
} from './login-code';

export async function sendPasswordResetCode(
  env: EmailLoginEnvironment,
  email: string,
  code: string,
) {
  if (
    !env.EMAIL ||
    (env.EMAIL_DELIVERY_CONFIGURED !== 'true' && env.EMAIL.configured !== true)
  )
    throw new Error('Email delivery unavailable');
  if (!/^\d{6}$/.test(code)) throw new Error('Invalid reset code');
  const message = buildEmailLoginCodeMessage({ email, code });
  await env.EMAIL.send({
    to: email,
    subject: 'Reset your HastaBazaar password',
    text: message.text.replaceAll('sign-in code', 'password reset code'),
    html: message.html
      .replaceAll('sign-in code', 'password reset code')
      .replace(
        'Enter this code to sign in:',
        'Enter this code on the password reset page to choose a new password:',
      ),
  });
}
