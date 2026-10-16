import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/promo-code-terms' },
  title: publicLegalPolicies['promo-code-terms'].title,
  description: publicLegalPolicies['promo-code-terms'].description,
};

export default function Page() {
  return <LegalPolicyPage policyKey="promo-code-terms" />;
}
