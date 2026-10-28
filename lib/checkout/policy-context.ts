import {
  CUSTOMER_POLICY_VERSION,
  publicLegalPolicies,
} from '../content/legal-policies';
import { phaseOneMarketplacePolicy } from '../marketplace/policy';
import { PLATFORM_SERVICE_FEE_RULE } from './platform-service-fee';

/** Server-produced context for the current customer documents; never an acceptance by itself. */
export async function getCheckoutPolicyContext(): Promise<string> {
  const documents = Object.entries(publicLegalPolicies)
    .filter(([key]) => key !== 'seller-agreement')
    .map(([key, value]) => [key, 'sha256' in value ? value.sha256 : '']);
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify({
        version: CUSTOMER_POLICY_VERSION,
        documents,
        marketplace: phaseOneMarketplacePolicy.version,
        serviceFeeRule: PLATFORM_SERVICE_FEE_RULE,
      }),
    ),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
