export interface SellerWorkspaceSection {
  id: string; label: string; href: string;
  icon: 'home'|'shop'|'documents'|'products'|'orders'|'earnings'|'requests';
  aliases: readonly string[];
  links: readonly { href: string; label: string }[];
}
export const sellerWorkspaceSections: readonly SellerWorkspaceSection[] = [
  { id: 'home', label: 'Home', href: '/seller', icon: 'home', aliases: [], links: [] },
  { id: 'shop', label: 'Shop & profile', href: '/seller/profile', icon: 'shop', aliases: [], links: [
    { href: '/seller/reviews', label: 'Customer reviews' },
  ] },
  { id: 'documents', label: 'Registration & documents', href: '/seller/registration', icon: 'documents', aliases: ['/sell/application'], links: [
    { href: '/seller#managed-program', label: 'Program & agreements' },
  ] },
  { id: 'products', label: 'Products & stock', href: '/seller/products', icon: 'products', aliases: ['/sell/application/products'], links: [
    { href: '/seller/analytics', label: 'Sales & inventory' },
  ] },
  { id: 'orders', label: 'Orders & delivery', href: '/seller/orders', icon: 'orders', aliases: [], links: [
    { href: '/seller/shipping', label: 'Shipping' }, { href: '/seller/cases', label: 'Returns & complaints' },
  ] },
  { id: 'earnings', label: 'Earnings & bank', href: '/seller/finance', icon: 'earnings', aliases: [], links: [{href:'/seller/finance/recoveries',label:'Recovery statements'}] },
  { id: 'requests', label: 'Requests & help', href: '/seller/requests', icon: 'requests', aliases: [], links: [
    { href: '/seller/notifications', label: 'Notifications' }, { href: '/help', label: 'Seller help' },
  ] },
];
export function sellerWorkspaceSection(pathname: string): SellerWorkspaceSection | undefined {
  const path = pathname.split(/[?#]/, 1)[0];
  return sellerWorkspaceSections.flatMap(section => [section.href, ...section.aliases, ...section.links.map(link => link.href)]
    .filter(prefix => path === prefix || (prefix !== '/seller' && path.startsWith(prefix + '/')))
    .map(prefix => ({ section, length: prefix.length })))
    .sort((left, right) => right.length - left.length)[0]?.section;
}
