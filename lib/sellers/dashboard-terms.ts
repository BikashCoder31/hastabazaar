import { CommissionRateUnavailableError } from '../db/repositories/business-settings';
import { getManagedMakerApplicationTerms, managedAgreementVersionForSeller } from '../db/repositories/managed-maker-details';
import { getAcceptedManagedTerms, getManagedTermsOffers } from '../managed-commerce/accepted-terms';

/** Missing commercial setup must not prevent an applicant from completing private details. */
export async function loadSellerDashboardTerms(db: D1Database, sellerId: string, now: number, needsCorrectionTerms: boolean) {
  try {
    const [offers, accepted, managedTerms] = await Promise.all([
      getManagedTermsOffers(db, sellerId, now),
      getAcceptedManagedTerms(db, sellerId, now),
      needsCorrectionTerms
        ? managedAgreementVersionForSeller(db, sellerId).then(version => getManagedMakerApplicationTerms(db, now, version))
        : undefined,
    ]);
    return { offers, accepted, managedTerms, unavailable: false };
  } catch (error) {
    if (!(error instanceof CommissionRateUnavailableError)) throw error;
    return { offers: null, accepted: null, managedTerms: undefined, unavailable: true };
  }
}
