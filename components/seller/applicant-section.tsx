import Link from 'next/link';
import type { SellerCenterAccess } from '@/lib/db/repositories/seller-center-access';
import { SellerApplicationWorkspace } from './application-workspace';
import { SellerOnboardingChecklist } from './onboarding-checklist';
import { newSellerOnboardingChecklist } from '@/lib/sellers/onboarding-checklist';

export async function ApplicantSection({ viewer, section }: {
  viewer: SellerCenterAccess; section: 'home'|'profile'|'products'|'finance';
}) {
  if (viewer.sellerId) return <SellerApplicationWorkspace embedded section={section} />;
  return <div className="space-y-6">
    <section className="space-y-5 rounded-2xl border bg-card p-6">
      <p className="eyebrow">Seller Center</p><h1 className="section-title">Start with what you know</h1>
      <p>Save your registration with the details you have. You can return to complete it and prepare private product drafts. Bank details can be added later.</p>
      {section !== 'home' ? <Link href="/seller/registration" className="section-link">Continue registration →</Link> : null}
    </section>
    {section === 'home' ? <SellerOnboardingChecklist model={newSellerOnboardingChecklist()} /> : null}
  </div>;
}
