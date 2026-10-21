import { LEGAL_SECTIONS } from './model';
import type { LegalControlEvent } from './lifecycle-model';

export const procedureTime = (value: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu',
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
export function operatingDocumentText(event: LegalControlEvent) {
  const company = event.document.company;
  return ['Internal operating procedure', 'Restricted to authorized staff', `Version: ${event.document.revision}`,
    `Effective: ${procedureTime(event.effectiveAt!)} Nepal time`, `Activated by: ${event.actorName}`,
    `Approval action: ${event.approvalSequence}`, `Document fingerprint: ${event.document.sha256}`,
    `${company.legalName} (${company.nepaliName})`, `Registration: ${company.registrationNumber}`,
    `PAN: ${company.pan || 'Not yet confirmed'}`, `Registered office: ${company.registeredOffice}`,
    `Support: ${company.supportEmail}`, '', ...event.document.sections.map((section, index) =>
      `${index + 1}. ${LEGAL_SECTIONS[index][1]}\n\n${section.body}`)].join('\n\n');
}
