import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { signOutPath } from '@/app/auth';
import { AdminNavigation } from '@/components/admin/admin-navigation';
import { BrandWordmark } from '@/components/layout/brand-wordmark';
import { requireStaffPage } from '@/lib/auth/staff';
import { mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';

export const dynamic = 'force-dynamic';
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const staff = await requireStaffPage('/admin');
  return (
    <div className="min-h-screen bg-secondary/35">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-background focus:p-4"
      >
        Skip to operations
      </a>
      <header className="border-b bg-card xl:sticky xl:top-0 xl:z-30">
        <div className="shell flex min-h-20 flex-wrap items-center justify-between gap-4 py-3">
          <Link href="/admin" className="flex items-center gap-3 rounded-xl">
            <Image
              data-media-mode="contain"
              src="/brand/hastabazaar-mark-96.png"
              alt=""
              width={44}
              height={44}
              sizes={mediaSizes.brandMark}
              className={mediaObjectClass('contain', 'media-shrink size-11')}
            />
            <span>
              <BrandWordmark className="block text-xl" />
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Operations workspace
              </span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={
                'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ' +
                (staff.role === 'super_admin'
                  ? 'bg-[#17345f] text-white'
                  : 'bg-secondary text-primary')
              }
            >
              <ShieldCheck className="size-4" />
              {staff.role === 'super_admin' ? 'Super Admin' : 'Admin'}
            </span>
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground 2xl:block">
              {staff.displayName}
            </span>
            <Link href="/shop" className="header-action">
              <ArrowUpRight className="size-4" />
              <span className="sr-only sm:not-sr-only">Marketplace</span>
            </Link>
            <form data-form-id="identity.logout" method="POST" action={signOutPath('/')} target="_top">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold hover:bg-muted"
            >
              Sign out
            </button>
            </form>
          </div>
        </div>
      </header>
      <div className="shell grid items-start gap-6 py-6 xl:grid-cols-[15.5rem_minmax(0,1fr)] xl:gap-8 xl:py-8">
        <aside className="min-w-0 xl:sticky xl:top-28">
          <AdminNavigation role={staff.role} permissions={staff.permissions} />
        </aside>
        <main
          tabIndex={-1}
          id="main-content"
          className="admin-workspace min-w-0 pb-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
