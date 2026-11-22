import { withAdminReturnTo } from '@/lib/admin/return-context';
import { publicProductEligibility } from '@/lib/products/eligibility';
import { publicCatalogueInventory } from '@/lib/products/public-catalogue-query';
import type { SellerReadiness } from './readiness';

type Actor = 'seller' | 'admin' | 'reviewer' | 'publisher';
type Action = { actor: Actor; href?: string; label?: string };
type ProductMilestone = {
  state: 'draft' | 'assistance' | 'review' | 'changes' | 'closed' | 'approved' | 'published';
  complete: number;
  caseId: string | null;
  draftId: string | null;
  productId: string | null;
  staffWithdrawn: number;
};

export type OnboardingStep = {
  id: 'registration' | 'application' | 'send' | 'approve' | 'publish' | 'orders';
  title: string;
  status: 'Done' | 'Pending' | 'On hold' | 'Unavailable';
  detail: string;
  action?: Action;
};

export type SellerOnboardingChecklistModel = {
  audience: 'seller' | 'admin';
  steps: OnboardingStep[];
};

type Scope = {
  sellerId: string;
  ownerId: string;
  stage: string | null;
  readiness: SellerReadiness | null;
  viewer: { kind: 'seller' } | { kind: 'admin'; actorId: string };
};

async function readProductMilestone(db: D1Database, {sellerId, ownerId, viewer}: Scope) {
  const owner = viewer.kind === 'seller';
  // Staff only see what the current owner has shared, never their private drafts.
  return db.prepare(`
    WITH milestones AS (
      SELECT CASE
        WHEN h.current_version_id IS NOT NULL THEN 'published'
        WHEN c.state='ready_for_decision' THEN 'approved'
        WHEN c.state='resolved' THEN 'closed'
        WHEN c.state='waiting_seller' THEN 'changes'
        WHEN c.first_complete_at IS NOT NULL THEN 'review'
        WHEN c.id IS NOT NULL THEN 'assistance'
        ELSE 'draft' END AS state,
        CASE WHEN c.first_complete_at IS NOT NULL OR h.current_version_id IS NOT NULL THEN 1 ELSE 0 END AS complete,
        c.id AS caseId, ${owner ? 'd.id' : 'NULL'} AS draftId, l.product_id AS productId,
        COALESCE(a.staff_withdrawn,0) AS staffWithdrawn,
        COALESCE(c.first_requested_at,d.updated_at) AS activity, d.id AS tie
      FROM product_intake_drafts d
      LEFT JOIN product_intake_cases c ON c.id=(SELECT latest.id FROM product_intake_cases latest
        WHERE latest.draft_id=d.id ORDER BY latest.cycle_number DESC LIMIT 1)
      LEFT JOIN product_publication_links l ON l.draft_id=d.id
      LEFT JOIN product_publication_heads h ON h.product_id=l.product_id
      LEFT JOIN product_availability_states a ON a.product_id=l.product_id
      WHERE d.seller_id=? AND d.owner_id=? ${owner ? '' : 'AND (c.id IS NOT NULL OR h.current_version_id IS NOT NULL)'}
        AND NOT EXISTS(SELECT 1 FROM product_deletions WHERE product_id=l.product_id)
      UNION ALL
      SELECT CASE p.status WHEN 'published' THEN 'published' WHEN 'approved' THEN 'approved'
        WHEN 'needs_changes' THEN 'changes' WHEN 'rejected' THEN 'closed'
        WHEN 'draft' THEN 'draft' ELSE 'review' END,
        CASE WHEN p.status='draft' THEN 0 ELSE 1 END, NULL, NULL, p.id,
        COALESCE(a.staff_withdrawn,0), p.updated_at, p.id
      FROM products p LEFT JOIN product_availability_states a ON a.product_id=p.id
      WHERE p.seller_id=? AND p.status IN ('published','approved','submitted','under_review','needs_changes','rejected'${owner ? ",'draft'" : ''})
        AND NOT EXISTS(SELECT 1 FROM product_publication_links WHERE product_id=p.id)
        AND NOT EXISTS(SELECT 1 FROM product_deletions WHERE product_id=p.id)
    )
    SELECT state,complete,caseId,draftId,productId,staffWithdrawn FROM milestones
    ORDER BY CASE state WHEN 'published' THEN 0 WHEN 'approved' THEN 1 WHEN 'review' THEN 2
      WHEN 'changes' THEN 3 WHEN 'assistance' THEN 4 WHEN 'closed' THEN 5 ELSE 6 END, activity DESC, tie DESC LIMIT 1
  `).bind(sellerId, ownerId, sellerId).first<ProductMilestone>();
}

async function hasOrderableProduct(db: D1Database, readiness: SellerReadiness) {
  const { stock } = publicCatalogueInventory(db);
  return Boolean(await db.prepare(`SELECT 1 FROM products WHERE seller_id=?
    AND (${publicProductEligibility('products', readiness.observedAt)}) AND (${stock()})>0 LIMIT 1`)
    .bind(readiness.sellerId).first());
}

export async function getSellerOnboardingChecklist(db: D1Database, scope: Scope) {
  const { readiness } = scope;
  const [product, orderable] = await Promise.all([
    readiness?.publicProductCount ? null : readProductMilestone(db, scope).catch(() => undefined),
    readiness?.newOrders && readiness.publicProductCount > 0
      ? hasOrderableProduct(db, readiness).catch(() => undefined) : false,
  ]);
  return checklist(scope, product, orderable);
}

export function newSellerOnboardingChecklist() {
  return checklist(null, null, false);
}

function checklist(scope: Scope | null, product: ProductMilestone | null | undefined, orderable: boolean | undefined): SellerOnboardingChecklistModel {
  const audience = scope?.viewer.kind ?? 'seller';
  const owner = audience === 'seller';
  const staffCanAct = scope?.viewer.kind === 'admin' && scope.viewer.actorId !== scope.ownerId;
  const staffPage = '/admin/sellers/' + encodeURIComponent(scope?.sellerId ?? '');
  const sellerAction = (href: string, label: string): Action => owner ? { actor: 'seller', href, label } : { actor: 'seller' };
  const staffAction = (actor: Exclude<Actor,'seller'>, href: string, label: string, sellerLink?: [string,string]): Action =>
    staffCanAct ? { actor, href: href.startsWith('/admin/products') ? withAdminReturnTo(href, staffPage + '#seller-onboarding') : href, label }
      : owner && sellerLink ? { actor, href: sellerLink[0], label: sellerLink[1] } : { actor };
  const steps: OnboardingStep[] = [];
  const add = (id: OnboardingStep['id'], title: string, status: OnboardingStep['status'], detail: string, action?: Action) =>
    steps.push({ id, title, status, detail, action });
  const { readiness, stage } = scope ?? {};
  const submitted = Boolean(stage && stage !== 'draft');
  const approved = stage === 'approved_for_activation' || stage === 'active' || stage === 'approved';
  const registration = '/seller/registration';

  add('registration', 'Submit seller registration', submitted ? 'Done' : 'Pending',
    submitted ? 'The registration has been sent. Supporting documents may still be needed.' : 'Send the basic registration details to get started.',
    submitted ? undefined : sellerAction(registration, 'Continue registration'));
  if (approved) add('application', 'Approve the seller application', 'Done', 'The application is approved. Taking orders has separate checks.');
  else if (stage === 'changes_requested' || stage === 'needs_changes') {
    add('application', 'Approve the seller application', 'Pending', 'The reviewer asked for changes to the registration.', sellerAction(registration, 'Update registration'));
  } else if (stage === 'rejected' || stage === 'suspended') {
    add('application', 'Approve the seller application', 'On hold', stage === 'rejected' ? 'The application was declined. Read the recorded decision.' : 'The seller is suspended. Check the recorded restrictions.',
      staffAction('admin', '#seller-decision', 'View application decision', ['/sell/application', 'View application decision']));
  } else {
    add('application', 'Approve the seller application', 'Pending',
      submitted ? 'Hastabazaar needs to review the submitted application.' : 'Review starts after the seller submits registration.',
      submitted ? staffAction('admin', '#seller-decision', 'Open application review', [registration, 'View registration']) : undefined);
  }

  const publicListing = Boolean(readiness?.publicProductCount);
  const sent = publicListing || Boolean(product?.complete);
  const productApproved = publicListing || product?.state === 'approved' || product?.state === 'published';
  const ownerCase = product?.caseId ? '/seller/products/intakes/' + encodeURIComponent(product.caseId) : '/seller/products';
  const staffCase = product?.caseId ? '/admin/products/intakes/' + encodeURIComponent(product.caseId) : '/admin/products/' + encodeURIComponent(product?.productId ?? '');
  const draftHref = product?.draftId ? '/seller/products/new?draftId=' + encodeURIComponent(product.draftId)
    : product?.productId && product.state === 'draft' ? '/seller/products/' + encodeURIComponent(product.productId) + '/edit' : '/seller/products/new';
  const sendTitle = owner ? 'Send your first product for review' : 'Seller sends the first product for review';
  if (sent) add('send', sendTitle, 'Done', 'A product was sent for review.');
  else if (product === undefined) add('send', sendTitle, 'Unavailable', 'Product progress could not be checked. Refresh to try again.');
  else if (product?.state === 'assistance') {
    add('send', sendTitle, 'Pending', 'A help request was sent. Hastabazaar will help complete the product details.',
      staffAction('reviewer', staffCase, 'Open product help request', [ownerCase, 'View product help request']));
  } else if (product?.state === 'changes') {
    add('send', sendTitle, 'Pending', 'Hastabazaar asked for more information before reviewing the product.',
      sellerAction(ownerCase, 'Open requested changes'));
  } else if (readiness?.submitProducts) {
    add('send', sendTitle, 'Pending',
      owner ? (product?.state === 'draft' ? 'Your saved draft hasn’t been sent. ' : '') +
        'Add photos and details in five short steps, then press “Send for review”. If you’re missing details, choose “Ask Hastabazaar to help finish it”.'
        : 'The seller can submit products now. Wait for the seller to send their first product.',
      sellerAction(draftHref, product?.state === 'draft' ? 'Continue saved draft' : 'Add your first product'));
  } else {
    add('send', sendTitle, readiness || !submitted ? 'Pending' : 'Unavailable',
      !submitted ? 'Start with seller registration.' : readiness ? 'Product submission is not available yet. Check the application or access status.' : 'Product submission access could not be checked.');
  }

  const approveTitle = 'Approve the first product';
  if (productApproved) add('approve', approveTitle, 'Done', 'The product has been approved.');
  else if (product === undefined) add('approve', approveTitle, 'Unavailable', 'Product review could not be checked.');
  else if (sent && (product?.state === 'changes' || product?.state === 'closed')) {
    add('approve', approveTitle, 'Pending', product.state === 'closed' ? 'The last review closed without approval. Check the decision before sending an updated or different product.'
      : 'The reviewer asked the seller to make changes and send the product again.', sellerAction(
      product.caseId ? ownerCase : '/seller/products/' + encodeURIComponent(product.productId ?? '') + '/edit', 'View product feedback'));
  } else if (sent) {
    add('approve', approveTitle, 'Pending', 'The product reviewer needs to review the submitted product.',
      staffAction('reviewer', staffCase, 'Open product review', [ownerCase, 'Follow product review']));
  } else add('approve', approveTitle, 'Pending', 'Review can finish once the seller sends the product details.');

  const publishTitle = 'Publish the first product';
  if (publicListing) add('publish', publishTitle, 'Done', 'At least one product is visible to customers.');
  else if (scope && (!readiness || product === undefined)) add('publish', publishTitle, 'Unavailable', 'Current listing visibility could not be checked.');
  else if (product?.state === 'published') {
    const sellerAvailability = '/seller/products/' + encodeURIComponent(product.productId ?? '') + '/availability';
    add('publish', publishTitle, 'On hold', 'A product was published, but it is currently hidden.',
      product.staffWithdrawn ? staffAction('reviewer', staffCase, 'Review listing availability', ['/seller/products', 'View your products'])
        : sellerAction(sellerAvailability, 'Check listing availability'));
  } else if (productApproved && approved) {
    const publication = product?.caseId ? '/admin/products/publications/' + encodeURIComponent(product.caseId) : staffCase;
    add('publish', publishTitle, 'Pending', 'The product is approved and still needs to be published.',
      staffAction('publisher', publication, 'Open publication review', [ownerCase, 'View approved product']));
  } else add('publish', publishTitle, 'Pending', productApproved ? 'The seller application still needs approval.' : 'A product must be approved before it can be published.');

  const orderTitle = 'Start taking orders';
  const pendingOrderCheck = (id: string) => readiness?.checks.find(check => check.id === id && check.status !== 'ready');
  const registrationEvidence = readiness?.route === 'managed_maker' ? pendingOrderCheck('identity') : undefined;
  const terms = pendingOrderCheck('terms');
  const liveStaffCheck = (href = '#seller-readiness') => staffAction('admin', href, 'Open live order checks', ['#seller-readiness', 'View live order checks']);
  if (!scope || !submitted || !approved) add('orders', orderTitle, 'Pending', 'Taking orders requires an approved application and a product that customers can order.');
  else if (!readiness || orderable === undefined) add('orders', orderTitle, 'Unavailable', 'Order readiness could not be checked. Refresh to try again.');
  else if (orderable) add('orders', orderTitle, 'Done', 'At least one published product has stock available and can take orders.');
  else if (readiness.newOrders) {
    add('orders', orderTitle, 'Pending', publicListing ? 'No public listing can take orders yet. Check available stock and whether ordering is paused or the listing is for browsing only.'
      : 'The seller can accept orders once there is a published product with stock available to order.',
      publicListing ? sellerAction('/seller/products', 'Open your products') : undefined);
  } else if (pendingOrderCheck('account') || pendingOrderCheck('restriction')) {
    add('orders', orderTitle, 'On hold', 'Hastabazaar needs to resolve the seller account or access restriction.', liveStaffCheck());
  } else if (registrationEvidence) {
    const needsSeller = registrationEvidence.status === 'action_needed';
    add('orders', orderTitle, 'Pending', needsSeller ? 'The seller needs to provide the required identity and registration documents.' : 'Super Admin needs to verify the submitted identity and registration documents.',
      needsSeller ? sellerAction(registration, 'Add registration documents')
        : staffAction('admin', '#seller-evidence', 'Review registration documents', [registration, 'View registration documents']));
  } else if (terms?.status === 'action_needed') {
    add('orders', orderTitle, 'Pending', 'The seller needs to accept the current selling terms.',
      sellerAction(readiness.route === 'managed_maker' ? '/sell/application#selling-fee-terms' : '#selling-fee-terms', 'Open selling terms'));
  } else if (pendingOrderCheck('live:beneficiary') && readiness.bankStatus === 'missing') {
    add('orders', orderTitle, 'Pending', 'The seller needs to provide receiving details for the required beneficiary check.', sellerAction('/seller/finance', 'Add receiving details'));
  } else if (pendingOrderCheck('live:beneficiary')) {
    add('orders', orderTitle, 'Pending', 'Super Admin needs to verify the current receiving details.',
      staffAction('admin', '#seller-bank', 'Review receiving details', ['/seller/finance', 'View receiving details']));
  } else {
    add('orders', orderTitle, 'Pending', readiness.simulationRecorded
      ? 'A local simulation is recorded. Hastabazaar still needs to complete the live trading checks.'
      : 'Hastabazaar needs to clear the remaining checks before this seller can accept orders.',
      liveStaffCheck(readiness.route === 'managed_maker' ? '#seller-live-trading' : '#seller-readiness'));
  }

  return { audience, steps };
}
