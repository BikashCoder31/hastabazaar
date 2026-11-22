export interface SellerWorkspaceSection {
  id: string;
  label: string;
  href: string;
  icon: 'home' | 'orders' | 'returns' | 'products' | 'earnings' | 'shop' | 'reviews' | 'documents' | 'shipping' | 'requests';
  shop?: boolean;
  aliases: readonly string[];
}

export const sellerSupportHref = '/contact-us?topic=seller-support#contact-form-heading';

export const sellerWorkspaceSections: readonly SellerWorkspaceSection[] = [
  { id: 'home', label: 'Today', href: '/seller', icon: 'home', aliases: [] },
  { id: 'orders', label: 'Orders', href: '/seller/orders', icon: 'orders', aliases: ['/seller/order-responses'] },
  { id: 'returns', label: 'Returns', href: '/seller/cases', icon: 'returns', aliases: [] },
  { id: 'products', label: 'Products', href: '/seller/products', icon: 'products', aliases: ['/seller/analytics', '/sell/application/products'] },
  { id: 'earnings', label: 'Earnings', href: '/seller/finance', icon: 'earnings', aliases: ['/seller/financial-notices'] },
  { id: 'shop', label: 'Shop profile', href: '/seller/profile', icon: 'shop', shop: true, aliases: [] },
  { id: 'reviews', label: 'Reviews', href: '/seller/reviews', icon: 'reviews', shop: true, aliases: [] },
  { id: 'documents', label: 'Documents & agreement', href: '/seller/registration', icon: 'documents', shop: true,
    aliases: ['/sell/application', '/seller/form-history'] },
  { id: 'shipping', label: 'Shipping', href: '/seller/shipping', icon: 'shipping', shop: true, aliases: [] },
  { id: 'requests', label: 'Requests & help', href: '/seller/requests', icon: 'requests', shop: true,
    aliases: ['/seller/notifications', '/seller/reminders'] },
];

export function sellerWorkspaceSection(pathname: string): SellerWorkspaceSection | undefined {
  const path = pathname.split(/[?#]/, 1)[0];
  if (path === '/seller' && pathname.endsWith('#managed-program')) {
    return sellerWorkspaceSections.find(section => section.id === 'documents');
  }
  return sellerWorkspaceSections.flatMap(section => [section.href, ...section.aliases]
    .filter(prefix => path === prefix || (prefix !== '/seller' && path.startsWith(prefix + '/')))
    .map(prefix => ({ section, length: prefix.length })))
    .sort((left, right) => right.length - left.length)[0]?.section;
}
