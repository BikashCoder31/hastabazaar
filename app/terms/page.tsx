import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/terms' },
  title: publicLegalPolicies.terms.title,
  description: publicLegalPolicies.terms.description,
};

export default function Page() {
  return <LegalPolicyPage policyKey="terms" />;
}
