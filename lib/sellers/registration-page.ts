import { readRegistration, readRegistrationOwnerState, readRegistrationProgress } from '@/lib/sellers/registration-store';
import { loadSellerApplicationTerms } from '@/lib/sellers/application-terms';
import { sellerDocumentWorkspace } from '@/lib/sellers/document-workspace';
import { SIMULATED_RECORD_LABEL } from '@/lib/staging/environment';

async function isRetainedManagedIntake(db: D1Database, sellerId: string, userId: string, version: number, now: number) {
  return Boolean(await db.prepare(`SELECT 1 FROM seller_registration_intakes intake
    JOIN seller_route_transition_applications transition ON transition.seller_id=intake.seller_id
    JOIN seller_agreement_acceptance_history acceptance ON acceptance.seller_id=transition.seller_id
      AND substr(acceptance.acceptance_request_id,1,23)='route-transition-apply:'
      AND substr(acceptance.acceptance_request_id,24)=transition.id
      AND acceptance.accepted_by=transition.requested_by AND acceptance.accepted_at=transition.agreement_accepted_at
    WHERE intake.seller_id=? AND intake.user_id=? AND intake.version=?
      AND transition.from_route='managed_maker' AND transition.to_route='registered_seller'
      AND transition.status='applied' AND transition.requested_by=intake.user_id
      AND transition.reviewed_by<>transition.requested_by
      AND transition.effective_at<=transition.applied_at AND transition.applied_at BETWEEN intake.updated_at AND ?
      AND acceptance.simulation_label=? LIMIT 1`)
    .bind(sellerId, userId, version, now, SIMULATED_RECORD_LABEL).first());
}

/** Terms and registration readiness use one clock for this private account read. */
export async function readRegistrationPageEvidence(
  db: D1Database,
  viewer: { userId: string; email: string; sellerId?: string | null },
  now = Date.now(),
) {
  const [record, terms] = await Promise.all([
    readRegistration(db, viewer.userId), loadSellerApplicationTerms(db, now),
  ]);
  const documents = viewer.sellerId
    ? await sellerDocumentWorkspace(db, viewer.sellerId, viewer.userId, 'seller')
    : null;
  const profile = record && record.sellerId === viewer.sellerId
    ? await readRegistrationOwnerState(db, record.sellerId, viewer.userId)
    : null;
  const retained = !!record && !!profile?.approved && record.answers.hasBusinessTaxRegistration?.[0] !== 'yes'
    && await isRetainedManagedIntake(db, record.sellerId, viewer.userId, record.version, now);
  const progress = record && profile && !retained ? await readRegistrationProgress(db, record, viewer.email, now) : null;
  const lockedKinds = progress?.lockedKinds ?? [];
  const initial = record && profile ? {
    version: record.version,
    answers: record.answers,
    documents: Object.fromEntries(Object.entries(record.documents).map(([key, value]) => [key, { name: value.originalName }])),
    missing: progress?.missing ?? [],
    editable: profile.editable && !retained,
    approvedCompletion: profile.approved || profile.approvedManaged,
  } : undefined;
  return { record, terms, documents, lockedKinds, initial };
}
