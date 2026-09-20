import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/prohibited-products' },
  title: publicLegalPolicies['prohibited-products'].title,
  description: publicLegalPolicies['prohibited-products'].description,
};

export default function Page() {
  return <LegalPolicyPage policyKey="prohibited-products" />;
}
