import { can, type Permission } from '@/lib/marketplace/permissions';

export const adminNavigationGroups = [
  'Operations',
  'Marketplace',
  'Controls',
] as const;

const destinations: readonly {
  href: string;
  label: string;
  group: string;
  icon: string;
  permission: Permission;
  role?: 'super_admin';
}[] = [
  {
    href: '/admin/forms',
    label: 'Form catalog',
    group: 'Controls',
    icon: 'forms',
    permission: 'business_settings.manage',
    role: 'super_admin',
  },
  {
    href: '/admin/riders',
    label: 'Rider operations',
    group: 'Operations',
    icon: 'shipping',
    permission: 'order.manage',
    role: 'super_admin',
  },
  {
    href: '/admin/notifications',
    label: 'Notifications',
    group: 'Operations',
    icon: 'reviews',
    permission: 'account.self.manage',
  },
  {
    href: '/admin/business-emails',
    label: 'Business emails',
    group: 'Controls',
    icon: 'reviews',
    permission: 'admin.invite',
  },
  {
    href: '/admin/exceptions',
    label: 'Exception follow-up',
    group: 'Operations',
    icon: 'cases',
    permission: 'order.manage',
  },
  {
    href: '/admin/progress',
    label: 'Recorded work',
    group: 'Operations',
    icon: 'analytics',
    permission: 'audit_log.view',
  },
  {
    href: '/admin/activity',
    label: 'Action audit',
    group: 'Controls',
    icon: 'analytics',
    permission: 'admin.invite',
  },
  {
    href: '/admin/delivery-rates',
    label: 'Delivery rates',
    group: 'Controls',
    icon: 'shipping',
    permission: 'admin.invite',
  },
  {
    href: '/admin/order-emails',
    label: 'Order emails',
    group: 'Operations',
    icon: 'orders',
    permission: 'order.manage',
  },
  {
    href: '/admin/referrals',
    label: 'Referrals & wallet',
    group: 'Marketplace',
    icon: 'payouts',
    permission: 'admin.invite',
  },
  {
    href: '/admin/promo-codes',
    label: 'Promo codes',
    group: 'Controls',
    icon: 'commission',
    permission: 'admin.invite',
    role: 'super_admin',
  },
  {
    href: '/admin/loyalty',
    label: 'Daily loyalty points',
    group: 'Controls',
    icon: 'commission',
    permission: 'admin.invite',
    role: 'super_admin',
  },
  {
    href: '/admin/commission',
    label: 'Commission',
    group: 'Controls',
    icon: 'commission',
    permission: 'commercial_policy.manage',
  },
  {
    href: '/admin/business-settings',
    label: 'Business Settings',
    group: 'Controls',
    icon: 'settings',
    permission: 'business_settings.view',
  },
  {
    href: '/admin/programs',
    label: 'Program Management',
    group: 'Marketplace',
    icon: 'programs',
    permission: 'business_settings.view',
  },
  {
    href: '/admin',
    label: 'Overview',
    group: 'Operations',
    icon: 'overview',
    permission: 'audit_log.view',
  },
  {
    href: '/admin/orders',
    label: 'Orders',
    group: 'Operations',
    icon: 'orders',
    permission: 'order.manage',
  },
  {
    href: '/admin/shipping',
    label: 'Shipping & claims',
    group: 'Operations',
    icon: 'shipping',
    permission: 'order.manage',
  },
  {
    href: '/admin/cases',
    label: 'Returns & complaints',
    group: 'Operations',
    icon: 'cases',
    permission: 'support.manage',
  },
  {
    href: '/admin/sellers',
    label: 'Sellers',
    group: 'Marketplace',
    icon: 'sellers',
    permission: 'seller.application.review',
  },
  {
    href: '/admin/products',
    label: 'Product moderation',
    group: 'Marketplace',
    icon: 'products',
    permission: 'product.review',
  },
  {
    href: '/admin/homepage',
    label: 'Homepage products',
    group: 'Marketplace',
    icon: 'homepage',
    permission: 'admin.invite',
  },
  {
    href: '/admin/catalog',
    label: 'Categories & occasions',
    group: 'Marketplace',
    icon: 'catalog',
    permission: 'catalog.manage',
  },
  {
    href: '/admin/reviews',
    label: 'Customer reviews',
    group: 'Marketplace',
    icon: 'reviews',
    permission: 'product.review',
  },
  {
    href: '/admin/payouts',
    label: 'Payouts',
    group: 'Operations',
    icon: 'payouts',
    permission: 'payout.prepare',
  },
  {
    href: '/admin/analytics',
    label: 'Reports',
    group: 'Controls',
    icon: 'analytics',
    permission: 'audit_log.view',
  },
  {
    href: '/admin/privacy',
    label: 'Privacy requests',
    group: 'Controls',
    icon: 'privacy',
    permission: 'support.manage',
  },
  {
    href: '/admin/legal-policies',
    label: 'Legal procedures',
    group: 'Controls',
    icon: 'governance',
    permission: 'admin.invite',
  },
  {
    href: '/admin/governance',
    label: 'Governance',
    group: 'Controls',
    icon: 'governance',
    permission: 'catalog.manage',
  },
  {
    href: '/admin/gift-cards',
    label: 'Gift cards',
    group: 'Controls',
    icon: 'payouts',
    permission: 'admin.invite',
  },
  {
    href: '/admin/team',
    label: 'Staff access',
    group: 'Controls',
    icon: 'team',
    permission: 'admin.invite',
  },
  {
    href: '/admin/staff-form-history',
    label: 'Recorded form answers',
    group: 'Controls',
    icon: 'forms',
    permission: 'audit_log.view',
    role: 'super_admin',
  },
  {
    href: '/admin/form-submissions',
    label: 'Private identity request history',
    group: 'Controls',
    icon: 'privacy',
    permission: 'audit_log.view',
    role: 'super_admin',
  },
  {
    href: '/admin/feedback',
    label: 'Contact & feedback',
    group: 'Operations',
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
    'Review delivery of order messages and retry eligible failed sends.',
    [
      'Find the order message and check its delivery status.',
      'Review the failure reason before retrying.',
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
    'Invite staff and review each Admin’s feature access.',
    [
      'Select the person or invitation task.',
      'Review the role and added or removed feature access.',
      'Confirm an explained change and check the retained record.',
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
    'Review and process business messages using the recorded delivery queue.',
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
  '/admin/orders',
  '/admin/shipping',
  '/admin/cases',
  '/admin/payouts',
  '/admin/notifications',
  '/admin/exceptions',
  '/admin/order-emails',
  '/admin/progress',
  '/admin/feedback',
  '/admin/riders',
  '/admin/sellers',
  '/admin/products',
  '/admin/reviews',
  '/admin/catalog',
  '/admin/homepage',
  '/admin/programs',
  '/admin/referrals',
  '/admin/business-settings',
  '/admin/commission',
  '/admin/delivery-rates',
  '/admin/promo-codes',
  '/admin/loyalty',
  '/admin/gift-cards',
  '/admin/team',
  '/admin/forms',
  '/admin/business-emails',
  '/admin/analytics',
  '/admin/privacy',
  '/admin/legal-policies',
  '/admin/governance',
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
        can({ role, permissions }, item.permission),
    )
    .map((item) => ({ ...item, description: taskGuides[item.href]?.[0] ?? '' }))
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
  const destination = adminNavigation(role, permissions).find(
    (item) =>
      pathname === item.href ||
      (item.href !== '/admin' && pathname.startsWith(item.href + '/')),
  );
  if (!destination) return null;
  const guide = taskGuides[destination.href];
  return guide ? { ...destination, steps: guide[1] } : null;
}
