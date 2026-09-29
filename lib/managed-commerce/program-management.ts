import type { ManagedMakerCommercialModel, ManagedMakerProgramMode } from '@/lib/configuration/types';
import type { RuntimeEnvironment } from '@/lib/staging/environment';
import { managedActivationOutstanding } from './activation';

interface MakerRow {
  id: string; ownerId: string; name: string; stage: string;
  route: string;
  model: ManagedMakerCommercialModel | null;
  legalSellerReference: string | null; invoiceIssuerReference: string | null;
  payoutBeneficiaryReference: string | null; agreementVersion: string | null; agreementAcceptedAt: number | null;
  approvedProducts: number; draftProducts: number; publishedProducts: number;
  proposedSupplies: number; paymentActions: number; pendingTransitions: number;
  earnedEntitlements: number; eligibleEntitlements: number; pendingPayouts: number;
}
export interface ProgramMaker extends Omit<MakerRow, 'legalSellerReference' | 'invoiceIssuerReference' | 'payoutBeneficiaryReference' | 'agreementVersion' | 'agreementAcceptedAt' | 'ownerId'> {
  outstanding: readonly string[];
  canCompleteActivation: boolean;
}
export interface ProgramProduct { id: string; sellerId: string; name: string; makerName: string; status: string }
export interface ProgramManagementWorkspace {
  makers: readonly ProgramMaker[];
  legacyMakers: readonly ProgramMaker[];
  products: readonly ProgramProduct[];
  modelTotals: readonly ProgramModelSummary[];
  totals: {
    makers: number; awaitingReview: number; approvedProducts: number; draftProducts: number; publishedProducts: number;
    proposedSupplies: number; paymentActions: number; pendingTransitions: number;
    earnedEntitlements: number; eligibleEntitlements: number; pendingPayouts: number;
  };
}
export type ProgramModelSummary = ProgramManagementWorkspace['totals'] & { model: ManagedMakerCommercialModel | null };

export async function getProgramManagementWorkspace(database: D1Database, context: {
  actorId: string; programMode: ManagedMakerProgramMode; activeModel: ManagedMakerCommercialModel | null;
  environment: RuntimeEnvironment;
}): Promise<ProgramManagementWorkspace> {
  // Each ledger is grouped before joining to avoid multiplying products,
  // supplies, payments and entitlements when a maker has several records.
  const inventorySql = `WITH product_counts AS (
      SELECT seller_id, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approvedProducts,
        SUM(CASE WHEN status IN ('draft','submitted','under_review','needs_changes') THEN 1 ELSE 0 END) AS draftProducts,
        SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS publishedProducts
      FROM products WHERE NOT EXISTS(SELECT 1 FROM product_deletions deletion WHERE deletion.product_id=products.id)
      GROUP BY seller_id
    ), supply_counts AS (
      SELECT seller_id, SUM(CASE WHEN status='proposed' THEN 1 ELSE 0 END) AS proposedSupplies
      FROM managed_supply_records GROUP BY seller_id
    ), payment_counts AS (
      SELECT obligation.seller_id,
        SUM((SELECT COUNT(*) FROM managed_supplier_payments payment WHERE payment.obligation_id=obligation.id AND payment.status IN ('prepared','approved')))
        + SUM(CASE WHEN obligation.original_amount_paisa
          - COALESCE((SELECT SUM(amount_paisa) FROM managed_supplier_adjustments adjustment WHERE adjustment.obligation_id=obligation.id),0)
          - COALESCE((SELECT SUM(amount_paisa) FROM managed_supplier_payments payment WHERE payment.obligation_id=obligation.id AND payment.status='paid'),0) > 0
          AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments payment WHERE payment.obligation_id=obligation.id AND payment.status IN ('prepared','approved'))
          THEN 1 ELSE 0 END) AS paymentActions
      FROM managed_supplier_obligations obligation GROUP BY obligation.seller_id
    ), transition_counts AS (
      SELECT seller_id, COUNT(*) AS pendingTransitions FROM seller_route_transition_applications
      WHERE status IN ('submitted','under_review','changes_requested','scheduled') GROUP BY seller_id
    ), entitlement_counts AS (
      SELECT seller_id, SUM(CASE WHEN status='earned' THEN 1 ELSE 0 END) AS earnedEntitlements,
        SUM(CASE WHEN status IN ('eligible','part_paid') THEN 1 ELSE 0 END) AS eligibleEntitlements
      FROM managed_entitlements GROUP BY seller_id
    ), payout_counts AS (
      SELECT seller_id, COUNT(*) AS pendingPayouts FROM managed_payouts
      WHERE status IN ('prepared','approved','processing') GROUP BY seller_id
    ) SELECT seller.id,seller.user_id AS ownerId,seller.trading_name AS name,
      participation.participation_route AS route,
      participation.application_stage AS stage,participation.commercial_model AS model,
      participation.legal_seller_reference AS legalSellerReference,
      participation.invoice_issuer_reference AS invoiceIssuerReference,
      participation.payout_beneficiary_reference AS payoutBeneficiaryReference,
      participation.managed_agreement_version AS agreementVersion,
      participation.managed_agreement_accepted_at AS agreementAcceptedAt,
      COALESCE(product_counts.approvedProducts,0) AS approvedProducts,
      COALESCE(product_counts.draftProducts,0) AS draftProducts,
      COALESCE(product_counts.publishedProducts,0) AS publishedProducts,
      COALESCE(supply_counts.proposedSupplies,0) AS proposedSupplies,
      COALESCE(payment_counts.paymentActions,0) AS paymentActions,
      COALESCE(transition_counts.pendingTransitions,0) AS pendingTransitions,
      COALESCE(entitlement_counts.earnedEntitlements,0) AS earnedEntitlements,
      COALESCE(entitlement_counts.eligibleEntitlements,0) AS eligibleEntitlements,
      COALESCE(payout_counts.pendingPayouts,0) AS pendingPayouts
    FROM seller_profiles seller JOIN seller_participation_profiles participation ON participation.seller_id=seller.id
    LEFT JOIN product_counts ON product_counts.seller_id=seller.id
    LEFT JOIN supply_counts ON supply_counts.seller_id=seller.id
    LEFT JOIN payment_counts ON payment_counts.seller_id=seller.id
    LEFT JOIN transition_counts ON transition_counts.seller_id=seller.id
    LEFT JOIN entitlement_counts ON entitlement_counts.seller_id=seller.id
    LEFT JOIN payout_counts ON payout_counts.seller_id=seller.id`;
  const [makerRows, productRows, modelRows, legacyRows] = await Promise.all([
    database.prepare(`${inventorySql} WHERE participation.participation_route='managed_maker'
      ORDER BY participation.updated_at DESC,seller.id LIMIT 50`).all<MakerRow>(),
    database.prepare(`SELECT product.id,product.seller_id AS sellerId,product.name_en AS name,
      seller.trading_name AS makerName,product.status
      FROM products product JOIN seller_profiles seller ON seller.id=product.seller_id
      JOIN seller_participation_profiles participation ON participation.seller_id=seller.id
      WHERE participation.participation_route='managed_maker' AND product.status IN ('draft','submitted','under_review','needs_changes','approved','published')
        AND NOT EXISTS(SELECT 1 FROM product_deletions deletion WHERE deletion.product_id=product.id)
      ORDER BY product.updated_at DESC,product.id LIMIT 50`).all<ProgramProduct>(),
    database.prepare(`SELECT model,SUM(CASE WHEN route='managed_maker' THEN 1 ELSE 0 END) AS makers,
      SUM(CASE WHEN route='managed_maker' AND stage IN ('submitted','under_review','changes_requested') THEN 1 ELSE 0 END) AS awaitingReview,
      SUM(CASE WHEN route='managed_maker' THEN approvedProducts ELSE 0 END) AS approvedProducts,
      SUM(CASE WHEN route='managed_maker' THEN draftProducts ELSE 0 END) AS draftProducts,
      SUM(CASE WHEN route='managed_maker' THEN publishedProducts ELSE 0 END) AS publishedProducts,
      SUM(proposedSupplies) AS proposedSupplies,SUM(paymentActions) AS paymentActions,SUM(pendingTransitions) AS pendingTransitions,
      SUM(earnedEntitlements) AS earnedEntitlements,SUM(eligibleEntitlements) AS eligibleEntitlements,SUM(pendingPayouts) AS pendingPayouts
      FROM (${inventorySql}) inventory GROUP BY model`).all<ProgramModelSummary>(),
    database.prepare(`${inventorySql} WHERE participation.participation_route='registered_seller'
      AND (COALESCE(supply_counts.proposedSupplies,0)>0 OR COALESCE(payment_counts.paymentActions,0)>0
        OR COALESCE(transition_counts.pendingTransitions,0)>0 OR COALESCE(entitlement_counts.earnedEntitlements,0)>0
        OR COALESCE(entitlement_counts.eligibleEntitlements,0)>0 OR COALESCE(payout_counts.pendingPayouts,0)>0)
      ORDER BY participation.updated_at DESC,seller.id LIMIT 50`).all<MakerRow>(),
  ]);
  const makers = makerRows.results.map(({ ownerId, legalSellerReference, invoiceIssuerReference,
    payoutBeneficiaryReference, agreementVersion, agreementAcceptedAt, ...row }): ProgramMaker => {
    const outstanding = row.stage === 'active' ? [] : managedActivationOutstanding({
      environment: context.environment, actorId: context.actorId, ownerId, actorIsSuperAdmin: true,
      programMode: context.programMode, configuredModel: context.activeModel,
      makerStage: row.stage, makerModel: row.model ?? context.activeModel ?? 'managed_sale_linked_percentage_v1',
      legalSellerReference: legalSellerReference ?? '', invoiceIssuerReference: invoiceIssuerReference ?? '',
      payoutBeneficiaryReference: payoutBeneficiaryReference ?? '', agreementVersion: agreementVersion ?? '',
      agreementAcceptedAt, approvedProductCount: row.approvedProducts,
    });
    return { ...row, outstanding, canCompleteActivation: row.stage === 'approved_for_activation' &&
      context.environment.simulationAllowed && context.actorId !== ownerId && context.programMode === 'activation_enabled' &&
      context.activeModel !== null && (row.model === null || row.model === context.activeModel) && row.approvedProducts > 0 };
  });
  const totals = modelRows.results.reduce((sum, row) => ({
    makers: sum.makers + row.makers,
    awaitingReview: sum.awaitingReview + row.awaitingReview,
    approvedProducts: sum.approvedProducts + row.approvedProducts,
    draftProducts: sum.draftProducts + row.draftProducts,
    publishedProducts: sum.publishedProducts + row.publishedProducts,
    proposedSupplies: sum.proposedSupplies + row.proposedSupplies,
    paymentActions: sum.paymentActions + row.paymentActions,
    pendingTransitions: sum.pendingTransitions + row.pendingTransitions,
    earnedEntitlements: sum.earnedEntitlements + row.earnedEntitlements,
    eligibleEntitlements: sum.eligibleEntitlements + row.eligibleEntitlements,
    pendingPayouts: sum.pendingPayouts + row.pendingPayouts,
  }), { makers: 0, awaitingReview: 0, approvedProducts: 0, draftProducts: 0, publishedProducts: 0,
    proposedSupplies: 0, paymentActions: 0, pendingTransitions: 0, earnedEntitlements: 0, eligibleEntitlements: 0, pendingPayouts: 0 });
  const legacyMakers = legacyRows.results.map(({ ownerId: _ownerId, legalSellerReference: _legal,
    invoiceIssuerReference: _issuer, payoutBeneficiaryReference: _beneficiary, agreementVersion: _agreement,
    agreementAcceptedAt: _acceptedAt, ...row }) => ({ ...row, outstanding: [], canCompleteActivation: false }));
  return { makers, legacyMakers, products: productRows.results, modelTotals: modelRows.results, totals };
}
