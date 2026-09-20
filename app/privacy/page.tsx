import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/privacy' },
  title: publicLegalPolicies.privacy.title,
  description: publicLegalPolicies.privacy.description,
};

export default function Page() {
  return <LegalPolicyPage policyKey="privacy" />;
}
