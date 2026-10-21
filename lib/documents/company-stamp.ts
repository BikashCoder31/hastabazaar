import type { ReceiptGroup } from './billing';

export const COMPANY_STAMP_VERSION='hb-est-2083-v1';
// Immutable identity approved for this asset. Future company details require a
// new version; historical receipt authorization must not depend on live settings.
const stampIssuer={reference:'hastabazaar-company-406171-83-84',legalName:'Hasta Bazaar Private Limited',pan:'624749646',
  address:'Birgunj Metropolitan City, Ward 11, Parsa, Madhesh Province, Nepal'};

/** A stock platform logo is not authority to apply the company seal. */
export function mayApplyCompanyStamp(group:ReceiptGroup):boolean {
  return group.stampVersion===COMPANY_STAMP_VERSION && group.issuer.kind==='company' &&
    group.issuer.reference===stampIssuer.reference && group.issuer.legalName===stampIssuer.legalName &&
    group.issuer.pan===stampIssuer.pan && group.issuer.address===stampIssuer.address && group.issuer.taxMode==='PAN';
}
