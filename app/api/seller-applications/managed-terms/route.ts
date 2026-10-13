import { requireSellerTermsApi, SellerTermsAuthorizationError } from '@/lib/auth/seller-commercial-access';
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
  try { await requireSellerTermsApi(); }
  catch (error) {
    return Response.json({error:error instanceof SellerTermsAuthorizationError ? error.message : 'Seller terms access could not be verified.'},
      {status:error instanceof SellerTermsAuthorizationError ? error.status : 503,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
  }
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
    { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } },
  );
}
