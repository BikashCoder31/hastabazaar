import { RegistrationGuide } from '@/components/seller/registration-guide';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { readRegistrationPageEvidence } from '@/lib/sellers/registration-page';
import { SellerRegistrationIntakeForm } from '@/components/seller/seller-registration-intake-form';
import { protectedRegistrationFields } from '@/lib/sellers/registration-protection';
import { SellerDocumentHistory } from '@/components/seller/document-history';

export const dynamic = 'force-dynamic';
export default async function SellerRegistrationPage() {
  const viewer = await requireSellerCenterPage('/seller/registration');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const { terms, documents, lockedKinds, initial } = await readRegistrationPageEvidence(db, viewer);
  return <div className="space-y-6">
    <header><p className="eyebrow">Private account information</p><h1 className="section-title">Registration &amp; documents</h1>
      <p className="mt-3 text-muted-foreground">Complete registration and send documents for review. Payouts require completed registration and verified receiving details.</p></header>
    <RegistrationGuide />
    {initial?.editable || !viewer.sellerId ? <SellerRegistrationIntakeForm workspace accountId={viewer.userId} accountEmail={viewer.email} initial={initial}
      lockedFields={protectedRegistrationFields(lockedKinds)} lockedDocumentKinds={lockedKinds}
      managedTerms={terms.managed.status === 'ready' ? terms.managed.terms : undefined}
      registeredTerms={terms.registered.status === 'ready' ? terms.registered.terms : undefined} />
      : <p>Your recorded registration is retained. Use the exact document change below for protected evidence; permitted shop and contact edits are available under Shop &amp; profile.</p>}
    {documents?<SellerDocumentHistory workspace={documents}/>:null}
    {viewer.sellerId ? <Link className="section-link text-[#A8232E] underline" href="/sell/application" prefetch={false}>Application, agreements and answer history →</Link> : null}
  </div>;
}
