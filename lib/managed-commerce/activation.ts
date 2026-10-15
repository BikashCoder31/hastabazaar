import type { ManagedMakerCommercialModel, ManagedMakerProgramMode } from '@/lib/configuration/types';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import type { RuntimeEnvironment } from '@/lib/staging/environment';
import { assertSimulationAllowed, SIMULATED_RECORD_LABEL } from '@/lib/staging/environment';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { digestFormRequest } from '@/lib/forms/submission';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { acceptedManagedTermsGuards, getAcceptedManagedTerms } from './accepted-terms';

export interface ManagedActivationAssessment {
  environment: RuntimeEnvironment;
  actorId: string;
  ownerId: string;
  actorIsSuperAdmin: boolean;
  programMode: ManagedMakerProgramMode;
  configuredModel: ManagedMakerCommercialModel | null;
  makerStage: string;
  makerModel: ManagedMakerCommercialModel;
  legalSellerReference: string;
  invoiceIssuerReference: string;
  payoutBeneficiaryReference: string;
  agreementVersion: string;
  agreementAcceptedAt: number | null;
  approvedProductCount: number;
}

export function managedActivationOutstanding(input: ManagedActivationAssessment): readonly string[] {
  const outstanding: string[] = [];
  if (!input.environment.simulationAllowed) outstanding.push('Disposable simulation environment');
  if (!input.actorIsSuperAdmin) outstanding.push('Active Super Admin reviewer');
  if (input.actorId === input.ownerId) outstanding.push('Independent reviewer');
  if (input.programMode !== 'activation_enabled') outstanding.push('Program activation mode');
  if (!input.configuredModel || input.configuredModel !== input.makerModel) outstanding.push('Configured implemented commercial model');
  if (input.makerStage !== 'approved_for_activation') outstanding.push('Maker approval for activation');
  if (!input.legalSellerReference.trim()) outstanding.push('Legal seller reference');
  if (!input.invoiceIssuerReference.trim()) outstanding.push('Invoice issuer reference');
  if (!input.payoutBeneficiaryReference.trim()) outstanding.push('Payout beneficiary reference');
  if (!input.agreementVersion.trim() || !input.agreementAcceptedAt) outstanding.push('Simulated managed agreement acceptance');
  if (input.approvedProductCount < 1) outstanding.push('At least one approved product');
  return Object.freeze(outstanding);
}

export class ManagedActivationError extends Error {}

export async function activateManagedMakerForSimulation(
  database: D1Database,
  options: {
    sellerId: string;
    actorId: string;
    model: ManagedMakerCommercialModel;
    legalSellerReference: string;
    invoiceIssuerReference: string;
    payoutBeneficiaryReference: string;
    agreementVersion: string;
    agreementLanguage: 'en' | 'ne';
    agreementAcceptedAt: number;
    acceptedManagedDetailId?: string;
    requestId: string;
    now: number;
    environment: RuntimeEnvironment;
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot };
  },
): Promise<void> {
  assertSimulationAllowed(options.environment);
  if (options.payoutBeneficiaryReference.trim().length < 3 || options.payoutBeneficiaryReference.trim().length > 191)
    throw new ManagedActivationError('Add the reviewed receiving reference using 3–191 characters.');
  if (options.form && options.form.requestId !== options.requestId)
    throw new ManagedActivationError('Form request does not match activation.');
  const permission = await staffMutationGuard(database, options.actorId, 'business_settings.approve', ManagedActivationError, 'super_admin');
  const digestAt = (agreementAcceptedAt: number) => digestFormRequest({ sellerId: options.sellerId, actorId: options.actorId,
    model: options.model, legalSellerReference: options.legalSellerReference, invoiceIssuerReference: options.invoiceIssuerReference,
    payoutBeneficiaryReference: options.payoutBeneficiaryReference, agreementVersion: options.agreementVersion,
    agreementLanguage: options.agreementLanguage, agreementAcceptedAt, acceptedManagedDetailId: options.acceptedManagedDetailId ?? null,
    versionId: options.form?.versionId, answers: options.form?.answers });
  const duplicate = await database.prepare("SELECT actor_id AS actorId,subject_id AS sellerId,next_json AS nextJson FROM audit_logs WHERE request_id=? AND action='managed_maker.simulation_activated' AND subject_type='seller'")
    .bind(options.requestId).first<{actorId:string;sellerId:string;nextJson:string}>();
  if (duplicate) {
    let recorded: { formDigest?: unknown; agreementAcceptedAt?: unknown } = {};
    try { recorded = JSON.parse(duplicate.nextJson) as typeof recorded; } catch { /* Corrupt audit cannot authorize replay. */ }
    if (options.form) {
      const acceptedAt = recorded.agreementAcceptedAt;
      const participation = await database.prepare(`SELECT application_stage AS stage,
        managed_agreement_accepted_at AS acceptedAt FROM seller_participation_profiles
        WHERE seller_id=? AND participation_route='managed_maker' LIMIT 1`)
        .bind(options.sellerId).first<{ stage: string; acceptedAt: number | null }>();
      const answer = await database.prepare(`SELECT 1 AS valid FROM form_answer_sets
        WHERE form_id='staff.managed-maker-activation' AND request_id=? AND config_version_id=?
          AND subject_type='seller' AND subject_id=? AND actor_id=? LIMIT 1`)
        .bind(options.requestId, options.form.versionId, options.sellerId, options.actorId).first();
      if (duplicate.actorId !== options.actorId || duplicate.sellerId !== options.sellerId ||
        !Number.isSafeInteger(acceptedAt) || Number(acceptedAt) <= 0 ||
        participation?.stage !== 'active' || participation.acceptedAt !== acceptedAt || !answer ||
        recorded.formDigest !== await digestAt(Number(acceptedAt)))
        throw new ManagedActivationError('Request reference was already used for another activation.');
    }
    if (!options.form && recorded.formDigest !== undefined && recorded.formDigest !== null)
      throw new ManagedActivationError('Request reference was already used for another activation.');
    return;
  }
  const formDigest = options.form ? await digestAt(options.agreementAcceptedAt) : null;
  const accepted = options.model === 'managed_sale_linked_percentage_v1'
    ? await getAcceptedManagedTerms(database, options.sellerId, options.now) : null;
  if (options.model === 'managed_sale_linked_percentage_v1' && (!accepted ||
    options.legalSellerReference !== accepted.snapshot.companyAccount.entityReference ||
    options.invoiceIssuerReference !== accepted.snapshot.companyAccount.entityReference ||
    options.agreementVersion !== accepted.agreementVersion || options.agreementLanguage !== accepted.language ||
    options.agreementAcceptedAt !== accepted.acceptedAt ||
    (options.acceptedManagedDetailId !== undefined && options.acceptedManagedDetailId !== accepted.detailId)))
    throw new ManagedActivationError('Activation must use the maker’s current accepted company identity and agreement.');
  const [program, configuredModel, row] = await Promise.all([
    getEffectiveBusinessSetting(database, 'managed_maker_program_mode', options.now),
    getEffectiveBusinessSetting(database, 'managed_maker_active_model', options.now),
    database.prepare(`SELECT seller_profiles.user_id AS ownerId,
      participation.application_stage AS makerStage,
      EXISTS(SELECT 1 FROM users JOIN user_roles ON user_roles.user_id=users.id
        WHERE users.id=? AND users.status='active' AND user_roles.role='super_admin') AS actorIsSuperAdmin,
      (SELECT COUNT(*) FROM products WHERE seller_id=seller_profiles.id AND status='approved') AS approvedProductCount
      FROM seller_profiles JOIN seller_participation_profiles participation ON participation.seller_id=seller_profiles.id
      WHERE seller_profiles.id=? AND participation.participation_route='managed_maker'`).bind(options.actorId, options.sellerId).first<{ownerId:string;makerStage:string;actorIsSuperAdmin:number;approvedProductCount:number}>(),
  ]);
  if (!row) throw new ManagedActivationError('Managed Maker application not found.');
  const outstanding = managedActivationOutstanding({
    environment: options.environment, actorId: options.actorId, ownerId: row.ownerId,
    actorIsSuperAdmin: Boolean(row.actorIsSuperAdmin), programMode: program.value,
    configuredModel: configuredModel.value, makerStage: row.makerStage, makerModel: options.model,
    legalSellerReference: options.legalSellerReference, invoiceIssuerReference: options.invoiceIssuerReference,
    payoutBeneficiaryReference: options.payoutBeneficiaryReference, agreementVersion: options.agreementVersion,
    agreementAcceptedAt: options.agreementAcceptedAt, approvedProductCount: Number(row.approvedProductCount),
  });
  if (outstanding.length) throw new ManagedActivationError(`Activation is not ready: ${outstanding.join(', ')}.`);
  const stageGuardId = crypto.randomUUID();
  const activationGuards = [
    ...permission.statements,
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM seller_participation_profiles p JOIN seller_profiles s ON s.id=p.seller_id
      JOIN users u ON u.id=s.user_id WHERE p.seller_id=? AND p.participation_route='managed_maker'
        AND p.application_stage='approved_for_activation' AND u.status='active' AND s.user_id<>?
        AND EXISTS(SELECT 1 FROM products WHERE seller_id=s.id AND status='approved')) THEN 1 ELSE 0 END`)
      .bind(stageGuardId, options.sellerId, options.actorId),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(stageGuardId),
    ...(accepted ? acceptedManagedTermsGuards(database, accepted, options.now) : []),
  ];
  for (const setting of [program, configuredModel]) {
    const guardId = crypto.randomUUID();
    activationGuards.push(database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN
      COALESCE((SELECT id FROM business_setting_versions WHERE setting_key=? AND status='published'
        AND effective_from<=? AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=?
      THEN 1 ELSE 0 END`).bind(guardId, setting.key, options.now, options.now, setting.versionId ?? ''),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId));
  }
  const results = await database.batch([
    ...activationGuards,
    database.prepare(`UPDATE seller_participation_profiles SET application_stage='active', commercial_model=?,
      legal_seller_reference=?,invoice_issuer_reference=?,payout_beneficiary_reference=?,
      managed_agreement_version=?,managed_agreement_language=?,managed_agreement_accepted_at=?,
      accepted_managed_detail_id=?,version=version+1,updated_at=? WHERE seller_id=? AND application_stage='approved_for_activation'`).bind(
      options.model, options.legalSellerReference.trim(), options.invoiceIssuerReference.trim(),
      options.payoutBeneficiaryReference.trim(), options.agreementVersion.trim(), options.agreementLanguage,
      options.agreementAcceptedAt, accepted?.detailId ?? null, options.now, options.sellerId,
    ),
    database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
      VALUES (?,?,'managed_maker.simulation_activated','seller',?,'Activated only in disposable local staging',?,?,?,NULL,?)`).bind(
      crypto.randomUUID(), options.actorId, options.sellerId,
      JSON.stringify({applicationStage:'approved_for_activation'}),
      JSON.stringify({applicationStage:'active',commercialModel:options.model,simulationLabel:SIMULATED_RECORD_LABEL,
        acceptedManagedDetailId: accepted?.detailId ?? null,
        ...(formDigest?{formDigest,agreementAcceptedAt:options.agreementAcceptedAt}:{})}),
      options.requestId, options.now,
    ),
    ...(options.form ? [buildFormAnswerInsert(database,{formId:'staff.managed-maker-activation',
      requestId:options.requestId,versionId:options.form.versionId,subjectType:'seller',subjectId:options.sellerId,
      actorId:options.actorId,answers:options.form.answers,now:options.now})] : []),
  ]);
  if ((results[activationGuards.length].meta.changes ?? 0) !== 1)
    throw new ManagedActivationError('Application changed before activation.');
}
