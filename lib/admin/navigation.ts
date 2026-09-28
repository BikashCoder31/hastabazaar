import { can, type Permission } from '@/lib/marketplace/permissions';

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
    group: 'Controls',
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
];

/** Navigation is an affordance, never the authorization boundary. */
export function adminNavigation(
  role: string,
  permissions?: readonly Permission[],
) {
  if (role !== 'admin' && role !== 'super_admin') return [];
  return destinations.filter((item) =>
    (!item.role || item.role === role) && can({ role, permissions }, item.permission),
  );
}
