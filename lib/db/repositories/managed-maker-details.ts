import { getEffectiveBusinessSetting } from './business-settings';
import { staffMutationGuard } from './staff-mutation-guard';
import {
  managedMakerAgreementContext,
  MANAGED_MAKER_AGREEMENT_VERSION,
  MANAGED_SUPPLIER_AGREEMENT_VERSION,
  managedMakerAgreementSnapshot,
  validateManagedMakerIdentity,
  type ManagedMakerIdentity,
} from '../../sellers/managed-identity';

export class ManagedMakerTermsChangedError extends Error {}
export class ManagedMakerAuthorityError extends Error {}
export async function requireManagedMakerSuperAdmin(
  database: D1Database,
  actorId: string,
) {
  const authority = await staffMutationGuard(
    database,
    actorId,
    'seller.application.review',
    ManagedMakerAuthorityError,
  );
  if (authority.role !== 'super_admin')
    throw new ManagedMakerAuthorityError(
      'Current Super Admin authority is required for Managed Maker identity and review.',
    );
  return authority;
}
export async function buildManagedMakerDetailStatements(
  database: D1Database,
  options: {
    sellerId: string;
    actorId: string;
    identityDocumentId: string;
    identity: ManagedMakerIdentity;
    now: number;
  },
) {
  const identity = validateManagedMakerIdentity(options.identity);
  if (!Number.isSafeInteger(options.now) || options.now <= 0)
    throw new Error('A valid agreement acceptance time is required.');
  const [account, retention] = await Promise.all([
    getEffectiveBusinessSetting(
      database,
      'managed_maker_company_account',
      options.now,
    ),
    getEffectiveBusinessSetting(
      database,
      'managed_sale_linked_platform_retention_bps',
      options.now,
    ),
  ]);
  const snapshot = managedMakerAgreementSnapshot(
    account.value,
    retention.value,
    identity.managedAgreementVersion,
  );
  if (
    identity.managedAgreementContext !==
    (await managedMakerAgreementContext(snapshot))
  )
    throw new ManagedMakerTermsChangedError(
      'Managed Maker terms have changed. Reload and explicitly accept the current company identity and retention rate.',
    );
  const guards: D1PreparedStatement[] = [];
  for (const setting of [account, retention]) {
    const guardId = crypto.randomUUID();
    guards.push(
      database
        .prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN COALESCE((SELECT id FROM business_setting_versions WHERE setting_key=? AND status='published'
        AND effective_from<=? AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=? THEN 1 ELSE 0 END`)
        .bind(
          guardId,
          setting.key,
          options.now,
          options.now,
          setting.versionId ?? '',
        ),
      database
        .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
        .bind(guardId),
    );
  }
  return [
    ...guards,
    database
      .prepare(`INSERT INTO managed_maker_application_details
    (id,seller_id,government_id_type,government_id_description,personal_pan,identity_document_id,
      agreement_version,agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(),
        options.sellerId,
        identity.governmentIdType,
        identity.governmentIdDescription,
        identity.personalPan || null,
        options.identityDocumentId,
        identity.managedAgreementVersion,
        options.now,
        options.actorId,
        JSON.stringify({ ...snapshot, settingVersionIds: { account: account.versionId, retention: retention.versionId } }),
        options.now,
      ),
  ];
}
export type ManagedMakerPrivateDetails = {
  governmentIdType: string;
  governmentIdDescription: string;
  personalPan: string | null;
  agreementVersion: string;
  agreementAcceptedAt: number;
  agreementAcceptedBy: string;
  agreementSnapshotJson: string;
};
export async function getManagedMakerDetailsForReview(
  database: D1Database,
  sellerId: string,
  actorId: string,
) {
  await requireManagedMakerSuperAdmin(database, actorId);
  return database
    .prepare(`SELECT government_id_type AS governmentIdType,government_id_description AS governmentIdDescription,
    personal_pan AS personalPan,agreement_version AS agreementVersion,agreement_accepted_at AS agreementAcceptedAt,
    agreement_accepted_by AS agreementAcceptedBy,agreement_snapshot_json AS agreementSnapshotJson
    FROM managed_maker_application_details WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 1`)
    .bind(sellerId)
    .first<ManagedMakerPrivateDetails>();
}

export async function getManagedMakerApplicationTerms(
  database: D1Database,
  now = Date.now(),
  version: ManagedMakerIdentity['managedAgreementVersion'] = MANAGED_MAKER_AGREEMENT_VERSION,
) {
  const [account, retention] = await Promise.all([
    getEffectiveBusinessSetting(database, 'managed_maker_company_account', now),
    getEffectiveBusinessSetting(
      database,
      'managed_sale_linked_platform_retention_bps',
      now,
    ),
  ]);
  const snapshot = managedMakerAgreementSnapshot(
    account.value,
    retention.value,
    version,
  );
  return {
    version,
    account: account.value,
    platformRetentionBps: retention.value,
    context: await managedMakerAgreementContext(snapshot),
  };
}
export type ManagedMakerApplicationTerms = Awaited<
  ReturnType<typeof getManagedMakerApplicationTerms>
>;

export async function managedAgreementVersionForSeller(database: D1Database, sellerId: string) {
  const prospective = await database.prepare(`SELECT 1 FROM managed_maker_application_details WHERE seller_id=? AND agreement_version=? LIMIT 1`)
    .bind(sellerId,MANAGED_SUPPLIER_AGREEMENT_VERSION).first();
  const intake = !prospective && await database.prepare(`SELECT 1 FROM audit_logs WHERE subject_id=? AND subject_type='seller' AND action='seller.application.submitted'
    AND json_extract(next_json,'$.registrationIntake')=true LIMIT 1`).bind(sellerId).first();
  return prospective || intake ? MANAGED_SUPPLIER_AGREEMENT_VERSION : MANAGED_MAKER_AGREEMENT_VERSION;
}
