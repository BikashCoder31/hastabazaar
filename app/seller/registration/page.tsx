import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { RegistrationGuide } from '@/components/seller/registration-guide';
import { SellerRegistrationApplicationOverview } from '@/components/seller/registration-application-overview';
import { SellerRegistrationIntakeForm } from '@/components/seller/seller-registration-intake-form';
import { SellerDocumentHistory } from '@/components/seller/document-history';
import { SellerShopChecklist } from '@/components/seller/shop-checklist';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { readRegistrationPageEvidence } from '@/lib/sellers/registration-page';
import { protectedRegistrationFields } from '@/lib/sellers/registration-protection';
import { hasVerifiedRegistrationEmail } from '@/lib/sellers/registration-email';
import { emptySellerChecklist, getSellerChecklist, sellerChecklistView } from '@/lib/sellers/shop-checklist';
import { sellerDate } from '@/lib/seller/presentation';

export const dynamic = 'force-dynamic';
const registrationObservedAt = () => Date.now();

export default async function SellerRegistrationPage() {
  const viewer = await requireSellerCenterPage('/seller/registration');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const now = registrationObservedAt();
  const [page, accountEmailVerified, checklist] = await Promise.all([
    readRegistrationPageEvidence(db, viewer, now),
    hasVerifiedRegistrationEmail(db, viewer, viewer.email.toLowerCase()),
    viewer.sellerId ? getSellerChecklist(db, viewer.sellerId, { ownerId: viewer.userId, audience: 'seller', now }) : emptySellerChecklist(),
  ]);
  const { record, terms, documents, lockedKinds, initial } = page;
  const applicant = !viewer.approvedSeller && Boolean(viewer.sellerId);

  return <div className="min-w-0 space-y-7 text-[#14213D]">
    <header><h1 className="section-title">Documents &amp; agreement</h1></header>
    <SellerShopChecklist checklist={sellerChecklistView(checklist)} />
    {viewer.approvedSeller ? <section className="space-y-1 rounded-[1.125rem] border border-[#E2D6C2] bg-white px-4 py-4 shadow-sm sm:px-5" aria-labelledby="seller-agreement-and-documents">
      <h2 id="seller-agreement-and-documents" className="font-bold">Agreement and documents</h2>
      {viewer.sellerAgreementAcceptedAt ?
        <p className="text-sm text-[#465573]">Seller Marketplace Agreement accepted {sellerDate(viewer.sellerAgreementAcceptedAt)}.</p> : null}
      <div className="flex flex-wrap gap-x-4">
        <Link className="section-link inline-flex min-h-11 items-center" href="/sell/application#selling-fee-terms">Agreement and fee terms</Link>
        <a className="section-link inline-flex min-h-11 items-center" href="#seller-registration-details">Registration details</a>
        <Link className="section-link inline-flex min-h-11 items-center" href="/seller#managed-program">Program &amp; agreements</Link>
      </div>
    </section> : null}
    {applicant ? <SellerRegistrationApplicationOverview db={db} viewer={viewer} record={record} documents={documents} /> : null}
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
