'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { activeAdminSection, adminSections, type AdminStaffAccess } from './admin-sections';
import { AdminPageHelpProvider, AdminPageTitle } from './page-help';
import { getAdminPageHelp } from './page-help-copy';

export function AdminSectionTabs({ role, permissions, bankTransfers }: AdminStaffAccess & { bankTransfers?: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = activeAdminSection(adminSections(role, permissions), pathname, params);
  if (!current) return null;
  const { section, tab: active } = current;
  const pageTitlesSection = (pathname === '/admin/orders' && active.href === '/admin/orders')
    || pathname === '/admin/orders/dispatch'
    || pathname === '/admin/shipping'
    || pathname === '/admin/customers'
    || pathname === '/admin/products/intakes'
    || pathname === '/admin/products/publications'
    || pathname === '/admin/analytics'
    || pathname === '/admin/system-health'
    || (pathname === '/admin/payouts' && !params.has('request'));

  const isOffers = pathname === '/admin/offers';
  const isBank = active.href === '/admin/payments?view=incoming';

  return (
    <header className="admin-section-header">
      {isOffers || isBank ? (
        <AdminPageHelpProvider help={getAdminPageHelp(pathname, { role, permissions }, params)}>
          <div className="px-3 pt-3 md:px-6 lg:px-8">
            <AdminPageTitle><h1 className="font-heading text-[28px] font-semibold leading-tight">{section.label}</h1></AdminPageTitle>
          </div>
        </AdminPageHelpProvider>
      ) : pageTitlesSection ? null : <p className="admin-section-title">{section.label}</p>}
      <nav aria-label={section.label + ' pages'} className="admin-section-links">
        {section.tabs.map(tab => (
          <Link key={tab.href} href={tab.href} aria-current={active.href === tab.href ? 'page' : undefined}>
            {tab.label}
            {tab.href === '/admin/payments?view=incoming' && bankTransfers ? <span className="ml-2 rounded-full bg-[#14213D] px-2 py-0.5 text-xs font-semibold text-white"
              aria-label={bankTransfers + ' transfers needing attention'}>{bankTransfers}</span> : null}
          </Link>
        ))}
      </nav>
      {active.related.length ? (
        <nav aria-label={active.label + ' links'} className="admin-related-links">
          {active.related.map(link => <Link key={link.href} href={link.href}
            aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</Link>)}
        </nav>
      ) : null}
    </header>
  );
}
