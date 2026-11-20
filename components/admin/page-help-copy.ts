import { adminNavigation, adminTaskGuide } from '@/lib/admin/navigation';
import { activeAdminSection, adminSections, type AdminStaffAccess } from './admin-sections';

type HelpCopy = { title: string; sentences: readonly string[] };
export type AdminPageHelp = HelpCopy & { pathname: string; procedureHref?: string };

const today: HelpCopy = {
  title: 'How Today works',
  sentences: [
    'Today shows the reviews, follow-ups and approvals you can act on, with overdue work near the top.',
    'Use Take ownership when it’s available to assign a task to yourself.',
    'Opening a notification leaves the task open, and recording the final outcome closes it.',
  ],
};

const moneyNoticeHelp: HelpCopy = {
  title: 'How to use money notices',
  sentences: [
    'Review what the notice records, including the current state of the original item.',
    'Open the linked workspace to see the latest details and available actions.',
  ],
};

const tabHelp: Readonly<Record<string, HelpCopy>> = {
  '/admin?workspace=reviews': {
    title: 'How to use review tasks',
    sentences: [
      'Filter the list to find work you can review, then open the original record.',
      'Use Take ownership when available and record your decision in the original workspace.',
    ],
  },
  '/admin/orders?workspace=answers': {
    title: 'How to review seller and rider answers',
    sentences: [
      'Open a response to see what the seller reported and what is due next.',
      'Use Rider form history when available to find submitted rider answers.',
    ],
  },
  '/admin/notifications?view=reminders': {
    title: 'How to use reminders',
    sentences: [
      'Open a reminder to find the work that needs a follow-up.',
      'Check the current status and record any action in the original workspace.',
    ],
  },
  '/admin/notifications?view=money-notices': moneyNoticeHelp,
  '/admin/sellers?workspace=directory': {
    title: 'How to use the seller directory',
    sentences: [
      'Search for a seller by name, application reference, email or phone.',
      'Open the seller record to review the profile and any outstanding work you can access.',
    ],
  },
};

const workflowHelp: Readonly<Record<string, HelpCopy>> = {
  '/admin/cases/returns': {
    title: 'How to review a return',
    sentences: [
      'Read the return request, the order details and the evidence from both parties.',
      'Check eligibility under the recorded policy, then record your decision and the next step.',
    ],
  },
  '/admin/cases/complaints': {
    title: 'How to review a complaint',
    sentences: [
      'Read the customer’s account and any evidence from the order or seller.',
      'Record what you found and the next action or outcome for the case.',
    ],
  },
  '/admin/commission/terms': {
    title: 'How to review fee agreements',
    sentences: [
      'Open the seller’s record to see which terms they received and when.',
      'Check the saved acceptance and review any follow-up still due.',
    ],
  },
  '/admin/payments/refunds': {
    title: 'How to review refund funding',
    sentences: [
      'Check what the original order owes the customer and verify the refund destination.',
      'Review the available funding and record the actual outcome when the refund is processed.',
    ],
  },
  '/admin/payments/payouts': {
    title: 'How to review payout transfers',
    sentences: [
      'Check the payout’s eligible earnings and verified destination before acting.',
      'Record the transfer and its outcome from the bank evidence.',
    ],
  },
  '/admin/payments/orders': {
    title: 'How to review a paid-order release',
    sentences: [
      'Check the recorded payment and any open holds on the order.',
      'If payment is verified and release is available, enter your reason and choose Check readiness and release.',
    ],
  },
  '/admin/payments/recoveries': {
    title: 'How to review a seller recovery',
    sentences: [
      'Check the original balance, the seller’s response and any receipt evidence.',
      'Record the recovery decision against the original case.',
    ],
  },
  '/admin/financial-notices': moneyNoticeHelp,
  '/admin/order-responses': {
    title: 'How to review order preparation',
    sentences: [
      'Check what the seller has reported and when the next update is due.',
      'Record your follow-up in this order’s preparation history.',
    ],
  },
  '/admin/products/publications': {
    title: 'How to publish an approved product',
    sentences: [
      'Open the approved version to check the listing and its publication readiness.',
      'Review any remaining requirements before publishing.',
    ],
  },
  '/admin/products/intakes': {
    title: 'How to review product intake',
    sentences: [
      'Check the seller’s request and the version they shared.',
      'Record the next step in the original intake or product review.',
    ],
  },
  '/admin/seller-documents': {
    title: 'How to review seller documents',
    sentences: [
      'Open the document in the private viewer and compare it with the seller’s registration.',
      'Record what matches or explain what the seller needs to correct.',
    ],
  },
  '/admin/seller-document-change-requests': {
    title: 'How to review updated documents',
    sentences: [
      'Compare the replacement with the original document and check the request history.',
      'Record your decision and review any linked protected change.',
    ],
  },
  '/admin/seller-protected-changes': {
    title: 'How to review a protected change',
    sentences: [
      'Check the seller’s requested change and verify the supporting evidence.',
      'Review any active holds and record the decision in the change history.',
    ],
  },
  '/admin/legal-policies/active': {
    title: 'How to use the staff procedure',
    sentences: [
      'Check the active version and the date it took effect.',
      'Use that version alongside the order’s recorded terms and the relevant public policies.',
    ],
  },
};

export function getAdminPageHelp(
  pathname: string,
  { role, permissions }: AdminStaffAccess,
  searchParams?: Pick<URLSearchParams, 'get'>,
): AdminPageHelp {
  const permitted = adminNavigation(role, permissions);
  const procedureHref = permitted.find(({ href }) => href === '/admin/legal-policies/active')?.href;

  const workflow = Object.keys(workflowHelp).find(route => pathname === route || pathname.startsWith(route + '/'));
  if (workflow) return { ...workflowHelp[workflow], pathname, procedureHref };

  const current = activeAdminSection(adminSections(role, permissions), pathname, searchParams);
  const tabCopy = current?.queryMatch ? tabHelp[current.tab.href] : undefined;
  if (tabCopy) return { ...tabCopy, pathname, procedureHref };
  if (pathname === '/admin') return { ...today, pathname, procedureHref };

  const tabPath = current?.tab.href.split('?')[0];
  const guide = adminTaskGuide(pathname, role, permissions)
    ?? (tabPath ? adminTaskGuide(tabPath, role, permissions) : null);
  return {
    pathname,
    procedureHref,
    title: guide ? 'Help with ' + guide.label : 'How to use this page',
    sentences: guide?.steps ?? [
      'Review the current record and any linked evidence.',
      'Use the available actions to record a decision or continue the work.',
    ],
  };
}
