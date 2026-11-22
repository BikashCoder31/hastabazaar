import { companyDetails, companyPublicContacts } from '../content/company-details';
import { formatPaisaExact } from '../marketplace/money-display';

export type EmailActor = 'Your turn' | 'Seller' | 'Courier' | 'Hastabazaar' | 'Done';
export type EmailFact = readonly [label: string, value: string];

export interface EmailLayout {
  actor: EmailActor;
  headline: string;
  paragraph: string;
  preheader?: string;
  facts?: readonly EmailFact[];
  action: { label: string; url: URL; tone?: 'navy' };
  help?: string;
  why: string;
  nepali?: { headline: string; paragraph: string; action: string };
}

const ink = '#14213D';
const red = '#A8232E';
const border = '#E4DACA';
const copy = '#465573';
const paper = '#FFFFFF';
const cream = '#F7F3EC';
const support = `Need help? Write to ${companyDetails.supportEmail} or WhatsApp ${companyPublicContacts.supportPhone}.`;
const identity = `${companyDetails.legalName} · Nepal`;

export const emailMoney = formatPaisaExact;
const nepalDate = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeZone: 'Asia/Kathmandu' });
const nepalDateTime = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' });

export function emailDate(value: number, withTime = false) {
  return (withTime ? nepalDateTime : nepalDate).format(value);
}

const actorColors: Record<EmailActor, readonly [background: string, color: string]> = {
  'Your turn': [ink, paper],
  Seller: ['#F1E6C6', '#5C4213'],
  Courier: ['#E0EAF5', '#15385E'],
  Hastabazaar: ['#ECE2CE', ink],
  Done: ['#DFEDE3', '#254B3A'],
};

function escape(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

export function marketplaceSubject(headline: string, reference?: string | null, brandLast = false) {
  if (/[\r\n]/.test(headline + (reference ?? ''))) throw new Error('Invalid email subject.');
  return (brandLast ? [headline, reference, companyDetails.brandName] : [companyDetails.brandName, headline, reference])
    .filter(Boolean).join(' · ');
}

export function renderMarketplaceEmail(layout: EmailLayout) {
  const { actor, headline, paragraph, facts, action, help, why, nepali } = layout;
  const preheader = layout.preheader ?? paragraph;
  const [pillColor, pillInk] = actorColors[actor];
  const logo = new URL('/brand/hastabazaar-mark-96.png', action.url);
  const text = [
    actor, headline, paragraph,
    ...(facts ?? []).map(([label, value]) => `${label}: ${value}`),
    ...(nepali ? [nepali.headline, nepali.paragraph] : []),
    `${action.label}${nepali ? ' / ' + nepali.action : ''}: ${action.url}`,
    help, why, support, identity,
  ].filter(Boolean).join('\n\n');
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;background:${cream};color:${ink};font-family:Arial,Helvetica,sans-serif;overflow-wrap:break-word">
  <tr><td align="center" style="padding:20px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;table-layout:fixed;border:1px solid ${border};border-radius:14px;background:${paper};overflow:hidden">
    <tr><td style="border-bottom:1px solid ${border};padding:15px 20px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:8px"><img src="${escape(logo.href)}" width="28" height="28" alt="" style="display:block;width:28px;height:28px;border:0"></td>
        <td style="font:21px Georgia,serif;color:${ink}">Hasta<span style="color:${red}">bazaar</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:22px 20px 20px">
      <span style="display:inline-block;border-radius:16px;padding:5px 9px;background:${pillColor};color:${pillInk};font-size:12px;line-height:16px;font-weight:bold">${escape(actor)}</span>
      <h1 style="margin:12px 0 10px;font:normal 26px/1.2 Georgia,'Times New Roman',serif;color:${ink}">${escape(headline)}</h1>
      <p style="margin:0 0 15px;color:${copy};font-size:15px;line-height:1.55">${escape(paragraph)}</p>
      ${facts?.length ? `<table aria-label="Details" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border:1px solid ${border};border-radius:10px;margin:0 0 14px;color:#584D40;font-size:14px;line-height:1.4">${facts.map(([label, value], index) => {
        const dividingRule = index > 0 ? `border-top:1px solid ${border};` : '';
        return `<tr><th scope="row" width="42%" style="${dividingRule}padding:10px 9px;text-align:left;font-weight:normal">${escape(label)}</th><td style="${dividingRule}padding:10px 9px;text-align:right;font-weight:bold">${escape(value)}</td></tr>`;
      }).join('')}</table>` : ''}
      ${nepali ? `<div lang="ne" style="margin-bottom:15px;color:${copy};font-size:15px;line-height:1.55"><strong style="color:${ink}">${escape(nepali.headline)}</strong><p style="margin:5px 0 0">${escape(nepali.paragraph)}</p></div>` : ''}
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:9px;background:${action.tone === 'navy' ? ink : red}">
        <a href="${escape(action.url.href)}" style="display:inline-block;border-radius:9px;color:${paper};font-size:14px;font-weight:bold;line-height:20px;padding:12px 17px;text-decoration:none">${escape(action.label)}${nepali ? ` <span lang="ne">/ ${escape(nepali.action)}</span>` : ''}</a>
      </td></tr></table>
      ${help ? `<p style="color:${copy};font-size:14px;line-height:1.55;margin:13px 0 0">${escape(help)}</p>` : ''}
    </td></tr>
    <tr><td style="padding:16px 20px;background:#FBF8F2;border-top:1px solid ${border};color:#584D40;font-size:12px;line-height:1.55">
      ${escape(why)}<br>${escape(support)}<br>${escape(identity)}
    </td></tr>
  </table>
  </td></tr>
</table>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(headline)}</title></head><body style="margin:0;background:${cream}"><span style="display:none!important;max-height:0;overflow:hidden;color:transparent;mso-hide:all">${escape(preheader)}</span>${table}</body></html>`;
  return { text, html, preheader, markup: table };
}
