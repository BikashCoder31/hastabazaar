import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/gift-card-terms' },
  title: publicLegalPolicies['gift-card-terms'].title,
  description: publicLegalPolicies['gift-card-terms'].description,
};

export default function Page() {
  return <LegalPolicyPage policyKey="gift-card-terms" />;
}
