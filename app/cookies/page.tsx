import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';

export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/cookies' },
  title: publicLegalPolicies.cookies.title,
  description: publicLegalPolicies.cookies.description,
};

export default function Page() {
  return <LegalPolicyPage policyKey="cookies" />;
}
