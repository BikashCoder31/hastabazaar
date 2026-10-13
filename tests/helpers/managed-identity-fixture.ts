import { createHash } from 'node:crypto';
import { getBusinessSettingDefinition } from '../../lib/configuration/definitions';
import {
  MANAGED_MAKER_AGREEMENT_VERSION,
  managedMakerAgreementSnapshot,
} from '../../lib/sellers/managed-identity';
export function managedIdentityFields() {
  return {
    governmentIdType: 'citizenship',
    managedAgreementAccepted: 'yes',
    managedAgreementVersion: MANAGED_MAKER_AGREEMENT_VERSION,
    managedAgreementContext: createHash('sha256')
      .update(
        JSON.stringify(
          managedMakerAgreementSnapshot(
            getBusinessSettingDefinition('managed_maker_company_account')
              .defaultValue,
            900,
          ),
        ),
      )
      .digest('hex'),
  };
}
export function managedIdentityDocument(sellerId: string) {
  return {
    id: `identity-${sellerId}`,
    kind: 'representative_identity' as const,
    objectKey: `private/seller-documents/${sellerId}/simulated-identity`,
    originalName: 'SIMULATED-identity.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 24,
  };
}
export function addManagedIdentityUpload(form: FormData) {
  for (const [key, value] of Object.entries(managedIdentityFields()))
    form.set(key, value);
  form.set(
    'representativeIdentity',
    new File(['%PDF-1.4\nSIMULATED-ID'], 'SIMULATED-identity.pdf', {
      type: 'application/pdf',
    }),
  );
}
