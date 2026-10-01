import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/seller-agreement' },
  title: publicLegalPolicies['seller-agreement'].title,
  description: publicLegalPolicies['seller-agreement'].description,
};

export default function Page() {
  return <LegalPolicyPage policyKey="seller-agreement" />;
}
