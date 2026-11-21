import Link from 'next/link';
import { CustomerSettings, accountAction, accountSurface } from '@/components/account/account-sections';
import { requireCustomerPage } from '@/lib/auth/customer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign-in & security' };

export default async function AccountSecurityPage() {
  const customer = await requireCustomerPage('/account/security');
  const settingsPath = encodeURIComponent('/account/security');
  const rows = [
    { title: 'Password', detail: 'Use your sign-in email to set or reset your password.', label: 'Reset password', href: `/forgot-password?return_to=${settingsPath}` },
    { title: 'Google', detail: 'You can choose Google on the sign-in page with a verified Google email.', label: 'How to sign in', href: '/help#account' },
    { title: 'Email sign-in codes', detail: `You can request a code at ${customer.email} when you sign in.`, label: 'Verify email', href: '/account/profile#verify-contact' },
    { title: 'Sign-in history', detail: 'Review the saved details from your account and sign-in forms.', label: 'View history', href: '/form-submissions' },
    { title: 'Account protection', detail: 'Open the existing security workspace for your account.', label: 'Open security', href: '/security' },
  ];
  return (
    <CustomerSettings active="security">
      <section className={accountSurface + ' divide-y divide-[#e3d8c7] px-5'} aria-label="Sign-in options">
        {rows.map(({ title, detail, label, href }) => (
          <div key={title} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0 break-words">
              <h2 className="font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{detail}</p>
            </div>
            <Link href={href} className={accountAction}>{label}</Link>
          </div>
        ))}
      </section>
    </CustomerSettings>
  );
}
