import { env } from 'cloudflare:workers';
import { requireSellerTermsPage } from '@/lib/auth/seller-commercial-access';
import { requireDatabase } from '@/lib/db/d1';
import { getRegisteredSellerTerms } from '@/lib/db/repositories/marketplace-settings';
export const dynamic = 'force-dynamic';
import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/seller-agreement' },
  robots: { index: false, follow: false },
  title: publicLegalPolicies['seller-agreement'].title,
  description: publicLegalPolicies['seller-agreement'].description,
};

export default async function Page() {
  await requireSellerTermsPage('/seller-agreement');
  const terms=await getRegisteredSellerTerms(requireDatabase(env as unknown as {DB?: D1Database}));
  return <LegalPolicyPage policyKey="seller-agreement" document={terms.document} />;
}
