import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/layout/site-header';
import { RegistrationGuide } from '@/components/seller/registration-guide';
import { SellerRegistrationIntakeForm } from '@/components/seller/seller-registration-intake-form';
import { requireAuthenticatedUser } from '@/app/auth';
import { companyDetails, companyPublicContacts } from '@/lib/content/company-details';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerCenterAccess } from '@/lib/db/repositories/seller-center-access';
import { loadSellerApplicationTerms } from '@/lib/sellers/application-terms';
import { readSellerDraft } from '@/lib/sellers/draft-store';
import { hasVerifiedRegistrationEmail, normalizeSellerRegistrationEmail } from '@/lib/sellers/registration-email';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Seller application', robots: { index: false, follow: false } };

const shell = 'mx-auto w-[calc(100%-2rem)] max-w-[1264px] md:w-[calc(100%-6rem)]';
const footerLinks = [
  ['Help centre', '/help'], ['Returns & refunds', '/returns'], ['Delivery', '/shipping'],
  ['Terms', '/terms'], ['Privacy', '/privacy'],
] as const;

export default async function SellerRegistrationPage() {
  const identity = await requireAuthenticatedUser('/sell/apply');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const owner = await getSellerCenterAccess(database, identity.userId);
  if (!owner) redirect('/sell');
  if (owner.sellerId) redirect('/seller/registration');
  const clock = await database.prepare("SELECT unixepoch('now') * 1000 AS now").first<{ now: number }>();
  const now = Number(clock?.now ?? 0);
  const [{ managed, registered }, draft] = await Promise.all([
    loadSellerApplicationTerms(database, now),
    readSellerDraft(database, owner.userId, now),
  ]);
  const emails = [...new Set([normalizeSellerRegistrationEmail(identity.email),
    normalizeSellerRegistrationEmail(draft?.answers.registrationEmailChoice?.[0])])]
    .filter((email): email is string => email !== null);
  const verification = await Promise.all(emails.map(email => hasVerifiedRegistrationEmail(database, owner, email)));
  const verifiedEmails = emails.filter((_, index) => verification[index]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F3EEE3] text-[#14213D]">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className={shell + ' flex-1 pt-6 pb-14 sm:pt-8 md:pb-[5.5rem]'}>
        <Link href="/sell" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#A8232E] underline underline-offset-4">← Sell with us</Link>
        <SellerRegistrationIntakeForm wizard accountId={owner.userId} accountEmail={owner.email} verifiedEmails={verifiedEmails}
          managedTerms={managed.status === 'ready' ? managed.terms : undefined}
          registeredTerms={registered.status === 'ready' ? { percent: registered.terms.percent, context: registered.terms.context } : undefined} />
        <div className="mt-8"><RegistrationGuide /></div>
      </main>
      <footer className="border-t border-[#E4DACA] bg-[#FCF9F4] text-sm text-[#665B4D]">
        <div className={shell + ' flex flex-wrap items-center justify-between gap-x-5 py-3'}>
          <p>© {companyDetails.legalName} · Questions?{' '}
            <a className="inline-flex min-h-11 items-center font-semibold text-[#A8232E] underline" href={companyPublicContacts.whatsappUrl}>WhatsApp {companyPublicContacts.supportPhone}</a>
          </p>
          <nav aria-label="Application help and policies" className="flex flex-wrap gap-x-4">
            {footerLinks.map(([label, href]) => <Link key={href} href={href} className="inline-flex min-h-11 items-center hover:underline">{label}</Link>)}
          </nav>
        </div>
      </footer>
    </div>
  );
}
