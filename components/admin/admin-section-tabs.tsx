'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { activeAdminSection, adminSections, type AdminStaffAccess } from './admin-sections';

export function AdminSectionTabs({ role, permissions }: AdminStaffAccess) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = activeAdminSection(adminSections(role, permissions), pathname, params);
  if (!current) return null;
  const { section, tab: active } = current;
  const pageTitlesSection = (pathname === '/admin/orders' && active.href === '/admin/orders')
    || pathname === '/admin/orders/dispatch'
    || (pathname === '/admin/payouts' && !params.has('request'));

  return (
    <header className="admin-section-header">
      {pageTitlesSection ? null : <p className="admin-section-title">{section.label}</p>}
      <nav aria-label={section.label + ' pages'} className="admin-section-links">
        {section.tabs.map(tab => (
          <Link key={tab.href} href={tab.href} aria-current={active.href === tab.href ? 'page' : undefined}>
            {tab.label}
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
