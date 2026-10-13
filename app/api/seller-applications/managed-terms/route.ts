import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { getManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import {
  MANAGED_MAKER_AGREEMENT_VERSION,
  managedMakerAgreementTerms,
} from '@/lib/sellers/managed-identity';
import { companyDetails } from '@/lib/content/company-details';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  const terms = await getManagedMakerApplicationTerms(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return Response.json(
    {
      ...terms,
      version: MANAGED_MAKER_AGREEMENT_VERSION,
      company: companyDetails,
      terms: managedMakerAgreementTerms(terms.platformRetentionBps),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
