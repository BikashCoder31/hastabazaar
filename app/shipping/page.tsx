import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/shipping' },
  title: publicLegalPolicies.shipping.title,
  description: publicLegalPolicies.shipping.description,
};

export default function Page() {
  return <LegalPolicyPage policyKey="shipping" />;
}
