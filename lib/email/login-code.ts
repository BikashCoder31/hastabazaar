export type EmailService = {
  configured?: boolean;
  send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void>;
};

export type EmailLoginEnvironment = {
  EMAIL?: EmailService;
  EMAIL_DELIVERY_CONFIGURED?: string;
};

export function buildEmailLoginCodeMessage(options: { email: string; code: string }) {
  return {
    to: options.email,
    subject: 'Your HastaBazaar sign-in code',
    text: [
      'Your HastaBazaar sign-in code is:',
      '',
      options.code,
      '',
      'This code expires in 10 minutes and can be used only once.',
      'If you did not request this code, you can ignore this email.',
    ].join('\n'),
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;color:#14284a;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border:1px solid #dfe5ef;border-radius:18px;padding:32px"><p style="margin:0 0 8px;color:#245fc2;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">HastaBazaar</p><h1 style="margin:0 0 16px;font-size:26px">Your sign-in code</h1><p style="font-size:16px;line-height:1.6">Enter this code to sign in:</p><p style="margin:24px 0;font-size:34px;font-weight:800;letter-spacing:.18em;color:#14284a">${options.code}</p><p style="margin:0;color:#68758a;font-size:13px;line-height:1.5">This code expires in 10 minutes and can be used only once. If you did not request it, you can ignore this email.</p></div></div></body></html>`,
  };
}

export async function sendEmailLoginCode(
  environment: EmailLoginEnvironment,
  options: { email: string; code: string },
): Promise<void> {
  if (
    !environment.EMAIL
    || (environment.EMAIL_DELIVERY_CONFIGURED !== 'true' && environment.EMAIL.configured !== true)
  ) {
    throw new Error('Email delivery is not configured.');
  }
  await environment.EMAIL.send(buildEmailLoginCodeMessage(options));
}
