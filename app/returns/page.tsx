import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/returns' },
  title: publicLegalPolicies.returns.title,
  description: publicLegalPolicies.returns.description,
};

export default function Page() {
  return <LegalPolicyPage policyKey="returns" />;
}
