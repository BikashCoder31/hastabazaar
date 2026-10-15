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
  const evidence = `FROM managed_maker_application_details d JOIN seller_documents document ON document.id=d.identity_document_id
    WHERE d.seller_id=products.seller_id AND d.agreement_accepted_by=seller_profiles.user_id
      AND document.seller_id=d.seller_id AND document.status<>'rejected' AND d.agreement_accepted_at<=${now}
      AND COALESCE(json_extract(d.agreement_snapshot_json,'$.settingVersionIds.account'),'')=COALESCE((SELECT id FROM business_setting_versions
        WHERE setting_key='managed_maker_company_account' AND status='published' AND effective_from<=${now}
          AND (effective_until IS NULL OR effective_until>${now}) ORDER BY effective_from DESC,version DESC LIMIT 1),'')
      AND COALESCE(json_extract(d.agreement_snapshot_json,'$.settingVersionIds.retention'),'')=COALESCE((SELECT id FROM business_setting_versions
        WHERE setting_key='managed_sale_linked_platform_retention_bps' AND status='published' AND effective_from<=${now}
          AND (effective_until IS NULL OR effective_until>${now}) ORDER BY effective_from DESC,version DESC LIMIT 1),'')
    ORDER BY d.agreement_accepted_at DESC,d.id DESC LIMIT 1`;
  return `seller_profiles.trading_name AS makerName,${route} AS participationRoute,
    CASE WHEN ${route}='managed_maker' THEN (SELECT json_extract(d.agreement_snapshot_json,'$.companyAccount.storeName') ${evidence})
      ELSE seller_profiles.trading_name END AS storeName,
    CASE WHEN ${route}='managed_maker' THEN (SELECT json_extract(d.agreement_snapshot_json,'$.company.legalName') ${evidence})
      ELSE seller_profiles.legal_name END AS legalSellerName`;
}
