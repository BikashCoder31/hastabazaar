import { env } from 'cloudflare:workers';

import type { StaffRole } from '@/lib/auth/staff';

type EmailService = {
  configured?: boolean;
  send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void>;
};

type EmailEnvironment = {
  APP_ORIGIN?: string;
  EMAIL?: EmailService;
  EMAIL_DELIVERY_CONFIGURED?: string;
};

function bindings(): EmailEnvironment {
  return env as unknown as EmailEnvironment;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

export function isEmailDeliveryConfigured(): boolean {
  const current = bindings();
  return current.EMAIL_DELIVERY_CONFIGURED === 'true' || current.EMAIL?.configured === true;
}

export async function sendStaffInvitationEmail(options: {
  email: string;
  role: StaffRole;
  expiresAt: number;
}): Promise<void> {
  const current = bindings();
  if (!current.EMAIL || !isEmailDeliveryConfigured()) {
    throw new Error('Email delivery is not configured.');
  }
  const origin = current.APP_ORIGIN?.trim().replace(/\/$/, '');
  if (!origin || !origin.startsWith('https://')) {
    throw new Error('APP_ORIGIN must be an HTTPS address for invitation email delivery.');
  }
  const adminUrl = `${origin}/admin`;
  const roleLabel = options.role === 'super_admin' ? 'Super Admin' : 'Admin';
  const expiry = new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'long',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(options.expiresAt));

  await current.EMAIL.send({
    to: options.email,
    subject: `Your HastaBazaar ${roleLabel} invitation`,
    text: [
      `You have been invited to join HastaBazaar as ${roleLabel}.`,
      '',
      `Sign in with ${options.email} at ${adminUrl}`,
      `This invitation expires on ${expiry}.`,
      '',
      'If you were not expecting this invitation, you can ignore this email.',
    ].join('\n'),
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;color:#14284a;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border:1px solid #dfe5ef;border-radius:18px;padding:32px"><p style="margin:0 0 8px;color:#245fc2;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">HastaBazaar</p><h1 style="margin:0 0 16px;font-size:26px">You’re invited to the operations team</h1><p style="font-size:16px;line-height:1.6">You have been invited as <strong>${escapeHtml(roleLabel)}</strong>.</p><p style="font-size:16px;line-height:1.6">Sign in using <strong>${escapeHtml(options.email)}</strong>. The invitation expires on ${escapeHtml(expiry)}.</p><p style="margin:28px 0"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#245fc2;color:#fff;text-decoration:none;border-radius:10px;padding:13px 20px;font-weight:700">Open staff workspace</a></p><p style="margin:0;color:#68758a;font-size:13px;line-height:1.5">If you were not expecting this invitation, you can ignore this email.</p></div></div></body></html>`,
  });
}
