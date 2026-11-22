import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { RegistrationGuide } from '@/components/seller/registration-guide';
import { SellerRegistrationApplicationOverview } from '@/components/seller/registration-application-overview';
import { SellerRegistrationIntakeForm } from '@/components/seller/seller-registration-intake-form';
import { SellerDocumentHistory } from '@/components/seller/document-history';
import { SellerPayoutFixes } from '@/components/seller/seller-payout-fixes';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { readRegistrationPageEvidence } from '@/lib/sellers/registration-page';
import { protectedRegistrationFields } from '@/lib/sellers/registration-protection';
import { hasVerifiedRegistrationEmail } from '@/lib/sellers/registration-email';
import { readSellerPayoutFixes } from '@/lib/sellers/payout-fixes';

export const dynamic = 'force-dynamic';

export default async function SellerRegistrationPage() {
  const viewer = await requireSellerCenterPage('/seller/registration');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [page, accountEmailVerified, fixes] = await Promise.all([
    readRegistrationPageEvidence(db, viewer),
    hasVerifiedRegistrationEmail(db, viewer, viewer.email.toLowerCase()),
    viewer.approvedSeller && viewer.sellerId ? readSellerPayoutFixes(db, viewer.sellerId) : [],
  ]);
  const { record, terms, documents, lockedKinds, initial } = page;
  const applicant = !viewer.approvedSeller && Boolean(viewer.sellerId);

  return <div className="min-w-0 space-y-7 text-[#14213D]">
    {applicant ? <SellerRegistrationApplicationOverview db={db} viewer={viewer} record={record} documents={documents} /> : (
      <header>
        <h1 className="section-title">Documents &amp; agreement</h1>
        <p className="mt-3 text-[#465573]">Complete registration and send documents for review. Payouts require completed registration and verified receiving details.</p>
      </header>
    )}
    <SellerPayoutFixes fixes={fixes} place="documents" />
    {viewer.approvedSeller ? <Link className="section-link" href="/seller#managed-program">Program &amp; agreements</Link> : null}
    {!viewer.sellerId ? <RegistrationGuide /> : null}
    <section className="space-y-4" aria-labelledby="seller-registration-details">
      {applicant ? <header>
        <h2 id="seller-registration-details" className="font-heading text-3xl">Registration &amp; documents</h2>
        <p className="mt-2 text-[#465573]">Add missing details and send your documents to Hastabazaar.</p>
      </header> : <h2 id="seller-registration-details" className="sr-only">Registration details</h2>}
      {initial?.editable || !viewer.sellerId ? (
        <SellerRegistrationIntakeForm workspace accountId={viewer.userId} accountEmail={viewer.email} initial={initial}
          verifiedEmails={accountEmailVerified ? [viewer.email.toLowerCase()] : undefined}
          lockedFields={protectedRegistrationFields(lockedKinds)} lockedDocumentKinds={lockedKinds}
          managedTerms={terms.managed.status === 'ready' ? terms.managed.terms : undefined}
          registeredTerms={terms.registered.status === 'ready' ? terms.registered.terms : undefined} />
      ) : <p className="text-[#465573]">Use the document’s change request below to update protected evidence. For permitted shop and contact edits, use Shop &amp; profile.</p>}
    </section>
    {documents ? <SellerDocumentHistory workspace={documents} /> : null}
    {viewer.sellerId ? <Link className="section-link text-[#A8232E] underline" href="/sell/application" prefetch={false}>Application, agreements and answer history →</Link> : null}
    {viewer.sellerId ? <RegistrationGuide /> : null}
  </div>;
}
