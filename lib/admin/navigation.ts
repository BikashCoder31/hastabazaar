import { can, type Permission } from '@/lib/marketplace/permissions';

export const adminNavigationGroups = [
  'Overview & work queue',
  'Sellers',
  'Products & storefront',
  'Orders & customer care',
  'Finance & payments',
  'Fees, programs & promotions',
  'Team & business policies',
  'System health & records',
] as const;

type AdminArea = typeof adminNavigationGroups[number];
const areaRoutes: readonly [AdminArea, readonly string[]][] = [
  ['Overview & work queue', ['/admin', '/admin/notifications', '/admin/progress', '/admin/analytics', '/admin/exceptions']],
  ['Sellers', ['/admin/sellers']],
  ['Products & storefront', ['/admin/products/publications', '/admin/products/intakes', '/admin/products', '/admin/catalog', '/admin/homepage', '/admin/reviews']],
  ['Orders & customer care', ['/admin/orders', '/admin/orders/dispatch', '/admin/shipping', '/admin/cases', '/admin/customers', '/admin/privacy', '/admin/riders', '/admin/feedback', '/admin/delivery-rates']],
  ['Finance & payments', ['/admin/payments', '/admin/payouts', '/admin/payouts/run', '/admin/payments/refunds', '/admin/payments/recoveries', '/admin/accounting']],
  ['Fees, programs & promotions', ['/admin/fees', '/admin/referrals', '/admin/promo-codes', '/admin/fee-waivers', '/admin/loyalty', '/admin/commission', '/admin/programs', '/admin/gift-cards']],
  ['Team & business policies', ['/security', '/admin/team', '/admin/business-settings', '/admin/legal-policies', '/admin/legal-policies/active', '/admin/not-in-use']],
  ['System health & records', ['/admin/system-health', '/admin/backup-transfer', '/admin/forms', '/admin/business-emails', '/admin/order-emails', '/admin/activity', '/admin/governance', '/admin/staff-form-history', '/admin/form-submissions']],
];
const areaForRoute = new Map(areaRoutes.flatMap(([area, routes]) => routes.map(route => [route, area] as const)));
function destinationArea(href: string): AdminArea {
  const area = areaForRoute.get(href);
  if (!area) throw new Error('Admin destination requires an explicit workspace area.');
  return area;
}

const destinations: readonly {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
  alternativePermission?: Permission;
  role?: 'super_admin';
}[] = [
  {
    href: '/admin/system-health',
    label: 'System health & records',
    icon: 'governance',
    permission: 'system.health.view',
  },
  {
    href: '/security',
    label: 'Account security',
    icon: 'governance',
    permission: 'account.self.manage',
  },
  {
    href: '/admin/backup-transfer',
    label: 'Backup & Transfer',
    icon: 'governance',
    permission: 'audit_log.view',
    role: 'super_admin',
  },
  {
    href: '/admin/accounting',
    label: 'Accounting',
    icon: 'analytics',
    permission: 'audit_log.view',
    role: 'super_admin',
  },
  {
    href: '/admin/forms',
    label: 'Form Management',
    icon: 'forms',
    permission: 'business_settings.manage',
    role: 'super_admin',
  },
  {
    href: '/admin/riders',
    label: 'Rider operations',
    icon: 'shipping',
    permission: 'order.manage',
    role: 'super_admin',
  },
  {
    href: '/admin/not-in-use',
    label: 'Not in use yet',
    icon: 'settings',
    permission: 'order.manage',
    role: 'super_admin',
  },
  {
    href: '/admin/notifications',
    label: 'Notifications',
    icon: 'reviews',
    permission: 'account.self.manage',
  },
  {
    href: '/admin/business-emails',
    label: 'Email delivery',
    icon: 'reviews',
    permission: 'email.delivery.manage',
  },
  {
    href: '/admin/legal-policies/active',
    label: 'Active staff procedure',
    icon: 'governance',
    permission: 'support.manage',
  },
  {
    href: '/admin/exceptions',
    label: 'Exception follow-up',
    icon: 'cases',
    permission: 'order.manage',
  },
  {
    href: '/admin/progress',
    label: 'Recorded work',
    icon: 'analytics',
    permission: 'audit_log.view',
  },
  {
    href: '/admin/activity',
    label: 'Action audit',
    icon: 'analytics',
    permission: 'admin.invite',
  },
  {
    href: '/admin/delivery-rates',
    label: 'Delivery rates',
    icon: 'shipping',
    permission: 'admin.invite',
  },
  {
    href: '/admin/order-emails',
    label: 'Order emails',
    icon: 'orders',
    permission: 'email.delivery.manage',
  },
  {
    href: '/admin/fees',
    label: 'Fees & programs overview',
    icon: 'commission',
    permission: 'commercial_policy.manage',
  },
  {
    href: '/admin/referrals',
    label: 'Referrals & wallet',
    icon: 'payouts',
    permission: 'commercial_policy.manage',
  },
  {
    href: '/admin/promo-codes',
    label: 'Promo codes',
    icon: 'commission',
    permission: 'commercial_policy.manage',
    role: 'super_admin',
  },
  {
    href: '/admin/fee-waivers',
    label: 'Marketplace fee waivers',
    icon: 'commission',
    permission: 'commercial_policy.manage',
    role: 'super_admin',
  },
  {
    href: '/admin/loyalty',
    label: 'Daily loyalty points',
    icon: 'commission',
    permission: 'commercial_policy.manage',
    role: 'super_admin',
  },
  {
    href: '/admin/commission',
    label: 'Commission',
    icon: 'commission',
    permission: 'commercial_policy.manage',
  },
  {
    href: '/admin/business-settings',
    label: 'Business Settings',
    icon: 'settings',
    permission: 'business_settings.view',
  },
  {
    href: '/admin/programs',
    label: 'Program Management',
    icon: 'programs',
    permission: 'business_settings.view',
  },
  {
    href: '/admin',
    label: 'Overview',
    icon: 'overview',
    permission: 'account.self.manage',
  },
  {
    href: '/admin/orders',
    label: 'Orders',
    icon: 'orders',
    permission: 'order.manage',
  },
  { href: '/admin/orders/dispatch', label: 'Dispatch', icon: 'shipping', permission: 'order.manage' },
  {
    href: '/admin/shipping',
    label: 'Parcel problems',
    icon: 'shipping',
    permission: 'order.manage',
  },
  {
    href: '/admin/cases',
    label: 'Returns & complaints',
    icon: 'cases',
    permission: 'support.manage',
  },
  { href: '/admin/customers', label: 'Customers', icon: 'cases', permission: 'audit_log.view' },
  {
    href: '/admin/sellers',
    label: 'Sellers',
    icon: 'sellers',
    permission: 'seller.application.review',
  },
  {
    href: '/admin/products',
    label: 'Product moderation',
    icon: 'products',
    permission: 'product.review',
  },
  { href: '/admin/products/intakes', label: 'Help requests', icon: 'products', permission: 'product.review', alternativePermission: 'support.manage' },
  { href: '/admin/products/publications', label: 'Product publishing', icon: 'products', permission: 'product.publish' },
  {
    href: '/admin/homepage',
    label: 'Homepage products',
    icon: 'homepage',
    permission: 'admin.invite',
  },
  {
    href: '/admin/catalog',
    label: 'Categories & occasions',
    icon: 'catalog',
    permission: 'catalog.manage',
  },
  {
    href: '/admin/reviews',
    label: 'Customer reviews',
    icon: 'reviews',
    permission: 'product.review',
  },
  {href:'/admin/payments',label:'Courier cash',icon:'payouts',permission:'payment.receipt.verify'},
  { href: '/admin/payments/refunds', label: 'Refunds & recoveries', icon: 'payouts', permission: 'refund.approve.standard' },
  { href: '/admin/payments/recoveries', label: 'Recoveries', icon: 'payouts', permission: 'payout.prepare' },
  { href: '/admin/payouts/run', label: 'Payout run', icon: 'payouts', permission: 'payout.approve', role: 'super_admin' },
  {
    href: '/admin/payouts',
    label: 'Payouts',
    icon: 'payouts',
    permission: 'payout.prepare',
  },
  {
    href: '/admin/analytics',
    label: 'Business report',
    icon: 'analytics',
    permission: 'audit_log.view',
  },
  {
    href: '/admin/privacy',
    label: 'Privacy requests',
    icon: 'privacy',
    permission: 'support.manage',
  },
  {
    href: '/admin/legal-policies',
    label: 'Legal procedures',
    icon: 'governance',
    permission: 'admin.invite',
  },
  {
    href: '/admin/governance',
    label: 'Governance',
    icon: 'governance',
    permission: 'catalog.manage',
  },
  {
    href: '/admin/gift-cards',
    label: 'Gift cards',
    icon: 'payouts',
    permission: 'admin.invite',
  },
  {
    href: '/admin/team',
    label: 'Team & access',
    icon: 'team',
    permission: 'account.self.manage',
  },
  {
    href: '/admin/staff-form-history',
    label: 'Recorded form answers',
    icon: 'forms',
    permission: 'audit_log.view',
    role: 'super_admin',
  },
  {
    href: '/admin/form-submissions',
    label: 'Private identity request history',
    icon: 'privacy',
    permission: 'audit_log.view',
    role: 'super_admin',
  },
  {
    href: '/admin/feedback',
    label: 'Contact & feedback',
    icon: 'reviews',
    permission: 'support.manage',
  },
];

export type AdminTaskGuide = Readonly<{
  description: string;
  steps: readonly string[];
}>;
const taskGuides: Readonly<
  Record<string, readonly [string, readonly string[]]>
> = {
  '/security': [
    'Set up your authenticator, save recovery codes and verify protected Admin access.',
    [
      'Confirm your own password and connect an authenticator you control.',
      'Save recovery codes privately before activating MFA.',
      'Use a single-use recovery code if your authenticator is unavailable.',
    ],
  ],
  '/admin/backup-transfer': [
    'Prepare and inspect encrypted records, uploads and separate security-key recovery for a future hosting move.',
    [
      'Verify recent Admin security and check export readiness.',
      'Download the encrypted backup and protect the key recovery bundle separately.',
      'Inspect the saved package; restore only to a separately reviewed empty compatible destination.',
    ],
  ],
  '/admin/accounting': [
    'Read existing seller, maker, cash and incentive records without changing money or settings.',
    [
      'Choose a Nepal reporting period and a section.',
      'Check the source, date basis and any unavailable or review messages.',
      'Open the existing finance work area when a recorded amount needs investigation.',
    ],
  ],
  '/admin/staff-form-history': [
    'Inspect retained form answers and the version used for a recorded task.',
    [
      'Choose the task type and recorded subject.',
      'Compare the answers with their historical form version.',
      'Return to the relevant operational task for any new decision.',
    ],
  ],
  '/admin/form-submissions': [
    'Review restricted identity request history available only to Super Admin.',
    [
      'Choose the retained request you need to inspect.',
      'Review its permitted private answers and processing context.',
      'Keep retention and access requirements intact when planning follow-up.',
    ],
  ],
  '/admin': [
    'Start with the work that needs attention. Open a queue, review its evidence and record the outcome.',
    [
      'Review pending queues.',
      'Open the relevant record and check the evidence.',
      'Record a reason and confirm the outcome.',
    ],
  ],
  '/admin/orders': [
    'Find an order by reference, buyer contact or status and review its next fulfillment step.',
    [
      'Check payment and any required COD confirmation.',
      'Review seller allocations before booking delivery.',
      'Record fulfillment changes and follow up on exceptions.',
    ],
  ],
  '/admin/customers': ['Find a customer and review recorded order outcomes.', ['Search by name, phone, email or order number.', 'Open the customer record to review recent orders.', 'Use only recorded courier outcomes to assess cash-order risk.']],
  '/admin/orders/dispatch': ['Book courier pickup for parcels that are ready.', ['Check the seller pickup address.', 'Record the courier, pickup window and reference.', 'Record handoff when the courier collects the parcel.']],
  '/admin/shipping': [
    'Review courier bookings, delivery progress and shipping claims.',
    [
      'Open the related order and check the parcel status.',
      'Review the booking or claim evidence.',
      'Record the outcome and keep the tracking reference.',
    ],
  ],
  '/admin/cases': [
    'Handle returns and complaints with the order evidence and recorded policy.',
    [
      'Open the case and review the customer evidence.',
      'Investigate eligibility and request missing information.',
      'Record the decision; refund processing is a separate step.',
    ],
  ],
  '/admin/notifications': [
    'Read updates about work requiring your attention.',
    [
      'Open the notification and its related record.',
      'Check whether another operator already acted.',
      'Complete the task and retain its history.',
    ],
  ],
  '/admin/exceptions': [
    'Follow up on order problems without losing the original fulfillment history.',
    [
      'Review the current exception and order context.',
      'Choose an owner and record the next action.',
      'Follow up until the outcome is recorded.',
    ],
  ],
  '/admin/order-emails': [
    'Review order updates, check skipped reasons and send eligible messages.',
    [
      'Find the order message and check its delivery status.',
      'Check the reason, age and current order status before sending.',
      'Check the recorded result to avoid duplicate sends.',
    ],
  ],
  '/admin/progress': [
    'Find recorded work by date, action or operator.',
    [
      'Choose a date range and relevant filters.',
      'Open the recorded task for its full context.',
      'Use the retained record to plan any follow-up.',
    ],
  ],
  '/admin/not-in-use': [
    'See features that are switched off and where their records are kept.',
    ['Open the saved records when you need to check past work.', 'Use Money › Courier cash to track payments from couriers.'],
  ],
  '/admin/riders': [
    'Private rider records are available only to Super Admin. Applications and the rider portal are on hold.',
    [
      'Review retained identity and assignment evidence.',
      'Check delivery, collection and remittance as separate records.',
      'Record a reason for any permitted staff decision.',
    ],
  ],
  '/admin/sellers': [
    'Find seller applications, verify their documents and review account readiness.',
    [
      'Open a seller and review identity, registration and accepted terms.',
      'Request missing evidence or record the application decision.',
      'Check activation readiness separately from application approval.',
    ],
  ],
  '/admin/products/intakes': ['Review seller product help requests.', ['Read what the seller asked for.', 'Use the available fields to propose edits.', 'Send the edits or ask the seller a question.']],
  '/admin/products': [
    'Review submitted listings and decide whether their content and evidence are ready.',
    [
      'Check product information, photos and seller readiness.',
      'Record specific changes needed or the review outcome.',
      'Publish only when the permitted readiness checks pass.',
    ],
  ],
  '/admin/reviews': [
    'Moderate customer reviews using their product and order context.',
    [
      'Read the review and its related product.',
      'Check the moderation policy and relevant evidence.',
      'Record a useful reason for the outcome.',
    ],
  ],
  '/admin/catalog': [
    'Manage product categories and shopping occasions.',
    [
      'Find the category or occasion to update.',
      'Review its name, image and product classification.',
      'Save the change and check the marketplace result.',
    ],
  ],
  '/admin/homepage': [
    'Manage homepage hero slides, occasions and featured products.',
    [
      'Choose the section or product to edit.',
      'Use desktop and mobile previews to check the content.',
      'Save the change and review the resulting homepage.',
    ],
  ],
  '/admin/fees': ['Review original commercial sources, upcoming changes and retained history.', ['Choose a focused view and source status.', 'Review the actual version, dates, beneficiary and funding basis.', 'Open its native editor or history; no policy changes in this overview.']],
  '/admin/programs': [
    'Review Managed Maker program readiness and commercial configuration.',
    [
      'Check the recorded program mode and readiness requirements.',
      'Review the company account, agreements and responsibilities.',
      'Apply only the commercial model supported by the recorded checks.',
    ],
  ],
  '/admin/referrals': [
    'Manage referral rewards and wallet policies.',
    [
      'Review the current reward and wallet rules.',
      'Check the proposed impact on future transactions.',
      'Save an explained change and review its effective status.',
    ],
  ],
  '/admin/payouts/run': ['Review the prepared payouts that pass the current checks.', ['Review the saved hold and delivery facts.', 'Leave out rows with returns or bank issues.', 'Approve the selected payouts and review the result of each.']],
  '/admin/payments/refunds': ['Review customer refunds and their recorded funding.', ['Check the original refund and destination.', 'Review the available funds.', 'Record the confirmed outcome.']],
  '/admin/payments/recoveries': ['Review money owed back from sellers and couriers.', ['Check the existing obligation and its evidence.', 'Review the amount still open.', 'Record the verified outcome.']],
  '/admin/payments': ['Match actual company receipts to orders and review exceptions.', ['Review the original order and company instructions.','Record independently verified credit and its exact allocations.','Resolve outstanding ownership, balances and fulfillment holds.']],
  '/admin/payouts': [
    'Review seller payout requests and eligible balances; approval and payment are separate.',
    [
      'Check paid, delivered earnings and payout eligibility.',
      'Prepare the eligible balance and review its approval state.',
      'Process payment separately, then record the actual result.',
    ],
  ],
  '/admin/business-settings': [
    'Find and update the company account, commission, payout schedule and business policies.',
    [
      'Select a setting and review its current value.',
      'Preview the change, affected users and effective date.',
      'Save a draft, publish or schedule, then check the history.',
    ],
  ],
  '/admin/commission': [
    'Review independent seller commission and its prospective effective date.',
    [
      'Compare the current and proposed rates.',
      'Review required notice and seller acceptance.',
      'Schedule the change without rewriting historical orders.',
    ],
  ],
  '/admin/fee-waivers': [
    'Schedule full marketplace fee waivers for Registered Seller orders and review overlapping campaigns.',
    ['Create a named campaign with Nepal start and end times.', 'Publish or schedule, pause, resume or end a campaign.', 'Check active overlaps; only one full waiver applies to each new eligible order.'],
  ],
  '/admin/delivery-rates': [
    'Review delivery prices and service-area settings.',
    [
      'Check the current service-area and delivery rate.',
      'Preview the impact on new delivery quotes.',
      'Save with a reason and review the recorded policy.',
    ],
  ],
  '/admin/promo-codes': [
    'Manage discount codes and their eligibility rules.',
    [
      'Review dates, eligible products and funding.',
      'Check limits and the proposed customer discount.',
      'Save the code and review its active status.',
    ],
  ],
  '/admin/loyalty': [
    'Manage daily loyalty rewards and eligibility.',
    [
      'Review the current reward and eligibility rules.',
      'Check dates, limits and wallet impact.',
      'Save and confirm the effective reward configuration.',
    ],
  ],
  '/admin/gift-cards': [
    'Review gift cards, issuance and retained activity.',
    [
      'Find the gift card or issuance task.',
      'Check balance, recipient and recorded limits.',
      'Confirm the permitted action and review its recorded result.',
    ],
  ],
  '/admin/analytics': [
    'Review marketplace reports and recorded performance.',
    [
      'Choose the relevant reporting period.',
      'Compare orders, sales and other reported measures.',
      'Open operational records when a number needs investigation.',
    ],
  ],
  '/admin/privacy': [
    'Review privacy requests and preserve applicable retention requirements.',
    [
      'Verify the requester and the scope of the request.',
      'Review export or erasure eligibility and required retention.',
      'Confirm the permitted action and check its history.',
    ],
  ],
  '/admin/legal-policies': [
    'Review legal procedures and their recorded requirements.',
    [
      'Choose the relevant procedure.',
      'Check the recorded policy and required evidence.',
      'Follow the documented review and retention steps.',
    ],
  ],
  '/admin/governance': [
    'Review governance decisions, proposals and required confirmations.',
    [
      'Review the proposal, evidence and affected records.',
      'Check the authority and effective-date requirements.',
      'Record an explained decision and confirm its status.',
    ],
  ],
  '/admin/team': [
    'Review staff access, coverage, service clocks and policy responsibilities.',
    [
      'Select the person or invitation task.',
      'Review the role and added or removed feature access.',
      'Confirm an explained change and check the retained record.',
    ],
  ],
  '/admin/system-health': [
    'Review service health, incident ownership, recovery evidence and authorized records.',
    [
      'Check the environment, release and freshness of the relevant evidence.',
      'Open the current incident and its owner, next action and promised update.',
      'Follow the protected source record and verify recovery before resolving work.',
    ],
  ],
  '/admin/forms': [
    'Manage published form fields and retained form versions.',
    [
      'Choose the form and review its current published version.',
      'Edit a draft and inspect the rendered preview.',
      'Publish or restore with a reason; historical answers remain retained.',
    ],
  ],
  '/admin/business-emails': [
    'Track automatic email delivery, intervention and recovery using recorded evidence.',
    [
      'Check the message type, recipient and status.',
      'Review failed or pending records before processing.',
      'Confirm the recorded delivery result before retrying.',
    ],
  ],
  '/admin/activity': [
    'Inspect the action audit by actor, date and record type.',
    [
      'Choose filters for the action you need to investigate.',
      'Review the actor, reason and affected record.',
      'Follow the linked record for complete context.',
    ],
  ],
  '/admin/feedback': [
    'Review customer contact messages and marketplace feedback.',
    [
      'Read the message and any related record.',
      'Decide who should handle the follow-up.',
      'Keep the relevant operational decision in its normal history.',
    ],
  ],
};
const taskOrder: readonly string[] = [
  '/admin',
  '/admin/accounting',
  '/admin/orders',
  '/admin/orders/dispatch',
  '/admin/shipping',
  '/admin/cases',
  '/admin/customers',
  '/admin/payments',
  '/admin/payouts',
  '/admin/payouts/run',
  '/admin/payments/refunds',
  '/admin/payments/recoveries',
  '/admin/notifications',
  '/admin/exceptions',
  '/admin/order-emails',
  '/admin/progress',
  '/admin/feedback',
  '/admin/riders',
  '/admin/not-in-use',
  '/admin/sellers',
  '/admin/products',
  '/admin/products/intakes',
  '/admin/products/publications',
  '/admin/reviews',
  '/admin/catalog',
  '/admin/homepage',
  '/admin/fees',
  '/admin/programs',
  '/admin/referrals',
  '/admin/business-settings',
  '/admin/commission',
  '/admin/fee-waivers',
  '/admin/delivery-rates',
  '/admin/promo-codes',
  '/admin/loyalty',
  '/admin/gift-cards',
  '/admin/team',
  '/admin/system-health',
  '/admin/forms',
  '/admin/business-emails',
  '/admin/analytics',
  '/admin/privacy',
  '/admin/legal-policies',
  '/admin/legal-policies/active',
  '/admin/governance',
  '/admin/backup-transfer',
  '/security',
  '/admin/activity',
  '/admin/staff-form-history',
  '/admin/form-submissions',
];

/** Navigation and task discovery never replace server-side authorization. */
export function adminNavigation(
  role: string,
  permissions?: readonly Permission[],
  query = '',
) {
  if (role !== 'admin' && role !== 'super_admin') return [];
  const terms = query
    .trim()
    .toLowerCase()
    .slice(0, 120)
    .split(/\s+/)
    .filter(Boolean);
  return destinations
    .filter(
      (item) =>
        (!item.role || item.role === role) &&
        (can({ role, permissions }, item.permission) ||
          (item.alternativePermission && can({ role, permissions }, item.alternativePermission))),
    )
    .map((item) => ({ ...item,
      label: item.href === '/admin/team' && role === 'admin' ? 'My responsibilities' : item.label,
      group: destinationArea(item.href),
      description: item.href === '/admin/team' && role === 'admin' ? 'Review your access, assigned work and coverage contacts.' : taskGuides[item.href]?.[0] ?? '',
    }))
    .filter((item) =>
      terms.every((term) =>
        (item.label + ' ' + item.description).toLowerCase().includes(term),
      ),
    )
    .sort((a, b) => taskOrder.indexOf(a.href) - taskOrder.indexOf(b.href));
}

export function adminTaskGuide(
  pathname: string,
  role: string,
  permissions?: readonly Permission[],
) {
  const destination = adminNavigation(role, permissions)
    .filter((item) => pathname === item.href ||
      (item.href !== '/admin' && pathname.startsWith(item.href + '/')))
    .sort((left, right) => right.href.length - left.href.length)[0];
  if (!destination) return null;
  if(destination.href==='/admin/team'&&role==='admin')return {...destination,steps:['Review your current access and assigned responsibilities.','Check the current owner and coverage contacts.','Open the original task or acknowledge the applicable procedure.']};
  const guide = taskGuides[destination.href];
  return guide ? { ...destination, steps: guide[1] } : null;
}
