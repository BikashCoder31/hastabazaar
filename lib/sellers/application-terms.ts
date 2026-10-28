import { CommissionRateUnavailableError } from '../db/repositories/business-settings';
import { getManagedMakerApplicationTerms, type ManagedMakerApplicationTerms } from '../db/repositories/managed-maker-details';
import { getRegisteredSellerTerms, type RegisteredSellerTerms } from '../db/repositories/marketplace-settings';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from './managed-identity';

export type SellerApplicationOffer<T> =
  | Readonly<{ status: 'ready'; terms: T }>
  | Readonly<{ status: 'unavailable' }>;

async function offer<T>(load: () => Promise<T>): Promise<SellerApplicationOffer<T>> {
  try { return { status: 'ready', terms: await load() }; }
  catch (error) {
    if (!(error instanceof CommissionRateUnavailableError)) throw error;
    return { status: 'unavailable' };
  }
}

/** Missing published rates block their own application route. Operational failures still fail the request. */
export async function loadSellerApplicationTerms(database: D1Database, now: number): Promise<{
  registered: SellerApplicationOffer<RegisteredSellerTerms>;
  managed: SellerApplicationOffer<ManagedMakerApplicationTerms>;
}> {
  if (!Number.isSafeInteger(now) || now <= 0) throw new RangeError('A valid application terms lookup time is required.');
  const [registered, managed] = await Promise.all([
    offer(() => getRegisteredSellerTerms(database, now)),
    offer(() => getManagedMakerApplicationTerms(database, now, MANAGED_SUPPLIER_AGREEMENT_VERSION)),
  ]);
  return { registered, managed };
}
