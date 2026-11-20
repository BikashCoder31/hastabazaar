import { adminNavigation } from '@/lib/admin/navigation';
import { can, type Permission } from '@/lib/marketplace/permissions';

type RelatedLink = { href: string; label: string };
type TabDefinition = RelatedLink & {
  access?: string;
  routes?: readonly string[];
  related?: readonly RelatedLink[];
  fallback?: string;
  superAdmin?: boolean;
  anyPermission?: readonly Permission[];
};

const moneyNoticePermissions = [
  'payment.receipt.verify', 'payout.prepare', 'refund.approve.standard', 'commercial_policy.manage',
] as const satisfies readonly Permission[];

const definitions = [
  { id: 'today', label: 'Today', tabs: [
    { href: '/admin', label: 'Overview' },
    { href: '/admin?workspace=reviews', label: 'Review tasks', access: '/admin', routes: ['/admin/review-tasks'] },
    { href: '/admin/notifications?view=reminders', label: 'Reminders', access: '/admin/notifications', routes: ['/admin/reminders'] },
    { href: '/admin/exceptions', label: 'Problems' },
    { href: '/admin/notifications', label: 'Notifications', routes: ['/admin/operational-notices'] },
  ] },
  { id: 'orders', label: 'Orders', tabs: [
    { href: '/admin/orders', label: 'All orders' },
    { href: '/admin/orders/dispatch', label: 'Dispatch' },
    { href: '/admin/shipping', label: 'Parcel problems' },
    { href: '/admin/delivery-rates', label: 'Delivery rates' },
    { href: '/admin/order-emails', label: 'Order emails' },
    { href: '/admin/orders?workspace=answers', label: 'Seller answers', access: '/admin/orders',
      routes: ['/admin/order-responses'] },
  ] },
  { id: 'care', label: 'Care', tabs: [
    { href: '/admin/cases', label: 'Returns & complaints' },
    { href: '/admin/customers', label: 'Customers' },
    { href: '/admin/feedback', label: 'Contact & feedback' },
    { href: '/admin/reviews', label: 'Customer reviews' },
    { href: '/admin/privacy', label: 'Privacy requests' },
  ] },
  { id: 'sellers', label: 'Sellers', tabs: [
    { href: '/admin/sellers?reviewType=seller_application', label: 'Applications', access: '/admin/sellers', routes: ['/admin/sellers'] },
    { href: '/admin/sellers?workspace=directory', label: 'All sellers', access: '/admin/sellers' },
    { href: '/admin/sellers?reviewType=seller_document', label: 'Documents', access: '/admin/sellers',
      routes: ['/admin/seller-documents'], superAdmin: true },
    { href: '/admin/sellers?reviewType=document_change', label: 'Updated documents', access: '/admin/sellers',
      routes: ['/admin/seller-document-change-requests'], superAdmin: true },
    { href: '/admin/sellers?reviewType=protected_change', label: 'Bank & owner changes', access: '/admin/sellers',
      routes: ['/admin/seller-protected-changes'], superAdmin: true },
    { href: '/admin/sellers?reviewType=public_profile_correction', label: 'Shop detail fixes', access: '/admin/sellers',
      routes: ['/admin/seller-profile-corrections'] },
    { href: '/admin/form-submissions', label: 'ID requests' },
  ] },
  { id: 'catalog', label: 'Catalog', tabs: [
    { href: '/admin/products', label: 'Product review' },
    { href: '/admin/products/publications', label: 'Publishing' },
    { href: '/admin/catalog', label: 'Categories & occasions' },
    { href: '/admin/homepage', label: 'Homepage' },
  ] },
  { id: 'money', label: 'Money', tabs: [
    { href: '/admin/payments', label: 'Courier cash' },
    { href: '/admin/payouts', label: 'Payouts', routes: ['/admin/payments/payouts'] },
    { href: '/admin/payments/refunds', label: 'Refunds & recoveries', fallback: '/admin/payments/recoveries',
      routes: ['/admin/payments/recoveries'] },
    { href: '/admin/accounting', label: 'Books' },
    { href: '/admin/commission', label: 'Commission' },
    { href: '/admin/fees', label: 'Fees & waivers',
      related: [{ href: '/admin/fee-waivers', label: 'Manage marketplace fee waivers' }] },
    { href: '/admin/notifications?view=money-notices', label: 'Money notices', access: '/admin/notifications',
      routes: ['/admin/financial-notices'], anyPermission: moneyNoticePermissions },
  ] },
  { id: 'growth', label: 'Growth', tabs: [
    { href: '/admin/promo-codes', label: 'Promo codes' },
    { href: '/admin/referrals', label: 'Referrals & wallet' },
    { href: '/admin/loyalty', label: 'Loyalty points' },
    { href: '/admin/gift-cards', label: 'Gift cards' },
    { href: '/admin/programs', label: 'Programs' },
  ] },
  { id: 'reports', label: 'Reports', tabs: [
    { href: '/admin/analytics', label: 'Reports' },
    { href: '/admin/progress', label: 'Work log' },
    { href: '/admin/activity', label: 'Staff history' },
    { href: '/admin/staff-form-history', label: 'Form answers' },
  ] },
  { id: 'settings', label: 'Settings', tabs: [
    { href: '/admin/team', label: 'Team & access' },
    { href: '/admin/business-settings', label: 'Business' },
    { href: '/admin/legal-policies', label: 'Legal & procedures', fallback: '/admin/legal-policies/active',
      related: [{ href: '/admin/legal-policies/active', label: 'Active staff procedure' }] },
    { href: '/admin/governance', label: 'Approval rules' },
    { href: '/admin/forms', label: 'Forms' },
    { href: '/admin/business-emails', label: 'Email delivery' },
    { href: '/admin/system-health', label: 'System health' },
    { href: '/admin/backup-transfer', label: 'Backup & transfer' },
    { href: '/security', label: 'Security' },
    { href: '/admin/not-in-use', label: 'Not in use yet', routes: ['/admin/riders'] },
  ] },
] as const satisfies readonly { id: string; label: string; tabs: readonly TabDefinition[] }[];

export type AdminSectionId = (typeof definitions)[number]['id'];
export type AdminStaffAccess = { role: 'admin' | 'super_admin'; permissions?: readonly Permission[] };
type AdminTab = RelatedLink & { routes: readonly string[]; related: readonly RelatedLink[] };
type AdminSection = { id: AdminSectionId; label: string; tabs: readonly AdminTab[] };

export function adminSections(role: string, permissions?: readonly Permission[]): AdminSection[] {
  if (role !== 'admin' && role !== 'super_admin') return [];
  const allowed = new Set(adminNavigation(role, permissions).map(({ href }) => href));
  return definitions.map(({ id, label, tabs }) => ({
    id, label,
    tabs: (tabs as readonly TabDefinition[]).flatMap((tab): AdminTab[] => {
      if (tab.superAdmin && role !== 'super_admin') return [];
      if (tab.anyPermission && !tab.anyPermission.some(permission => can({ role, permissions }, permission))) return [];
      const href = allowed.has(tab.access ?? tab.href) ? tab.href : tab.fallback;
      if (!href || (href === tab.fallback && !allowed.has(href))) return [];
      return [{
        href,
        label: href === '/admin/team' && role === 'admin' ? 'My responsibilities' : tab.label,
        routes: tab.routes ?? [],
        related: (tab.related ?? []).filter(link => link.href !== href && allowed.has(link.href)),
      }];
    }),
  })).filter(({ tabs }) => tabs.length);
}

export function activeAdminSection(
  sections: readonly AdminSection[],
  pathname: string,
  searchParams: Pick<URLSearchParams, 'get'> = new URLSearchParams(),
) {
  const matchesPath = (path: string) => pathname === path || (path !== '/admin' && pathname.startsWith(path + '/'));
  const matches = sections.flatMap(section => section.tabs.flatMap(tab => {
    const [path, query] = tab.href.split('?');
    const routes = [...tab.routes, ...tab.related.map(link => link.href), ...(!query ? [path] : [])];
    const routeMatch = Math.max(0, ...routes.filter(matchesPath).map(route => route.length));
    const queryMatch = query && pathname === path &&
      [...new URLSearchParams(query)].every(([key, value]) => searchParams.get(key) === value);
    return routeMatch || queryMatch ? [{ section, tab, routeMatch, queryMatch: Boolean(queryMatch) }] : [];
  }));
  return matches.sort((a, b) => Number(b.queryMatch) - Number(a.queryMatch) || b.routeMatch - a.routeMatch)[0];
}
