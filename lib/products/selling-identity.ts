import {currentManagedSaleEvidence} from './managed-sale-evidence';
export interface PublicSellingIdentity {
  makerName: string;
  storeName: string | null;
  legalSellerName: string | null;
  participationRoute: 'managed_maker' | 'registered_seller';
}

/** Code-owned SQL only. Select public company fields from current immutable acceptance. */
export function publicSellingIdentityColumns(now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid selling identity time.');
  const route = "COALESCE((SELECT participation_route FROM seller_participation_profiles WHERE seller_id=products.seller_id),'registered_seller')";
  const evidence = `${currentManagedSaleEvidence('products.seller_id','seller_profiles.user_id',now)} ORDER BY d.agreement_accepted_at DESC,d.id DESC LIMIT 1`;
  return `COALESCE((SELECT public_name FROM seller_participation_profiles WHERE seller_id=products.seller_id),seller_profiles.trading_name) AS makerName,${route} AS participationRoute,
    CASE WHEN ${route}='managed_maker' THEN (SELECT json_extract(d.agreement_snapshot_json,'$.companyAccount.storeName') ${evidence})
      ELSE seller_profiles.trading_name END AS storeName,
    CASE WHEN ${route}='managed_maker' THEN (SELECT json_extract(d.agreement_snapshot_json,'$.company.legalName') ${evidence})
      ELSE seller_profiles.legal_name END AS legalSellerName`;
}
