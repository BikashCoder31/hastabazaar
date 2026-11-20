import { env } from 'cloudflare:workers';
import Link from 'next/link';
import {
  ArrowRight,
  AlertTriangle,
  Boxes,
  Clock3,
  FileText,
  Package,
  PackageCheck,
} from 'lucide-react';
import {
  SellerEmpty,
  SellerHeading,
  SellerMetric,
} from '@/components/seller/workspace-ui';
import { SellerOrderList } from '@/components/seller/seller-order-list';
import { SellerAgreementAcceptance } from '@/components/seller/seller-agreement-acceptance';
import { SellerManagedProgramWorkspace } from '@/components/seller/managed-program-workspace';
import { SellerEarningsSummary } from '@/components/seller/seller-earnings-summary';
import { SellerProgramDetails } from '@/components/seller/seller-program-details';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { ApplicantSection } from '@/components/seller/applicant-section';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerProductStats } from '@/lib/db/repositories/products';
import {
  getRegisteredSellerTerms,
  sellerAcceptedCommissionVersion,
} from '@/lib/db/repositories/marketplace-settings';
import { listOrdersForSeller } from '@/lib/db/repositories/orders';
import { getSellerEarnings } from '@/lib/seller/earnings';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';
import { getManagedProgramWorkspace } from '@/lib/managed-commerce/program-workspace';
import { withFirstCodPresentation } from '@/lib/orders/first-cod-review';
import { CommissionRateUnavailableError } from '@/lib/db/repositories/business-settings';
import {getSellerReadiness} from '@/lib/sellers/readiness';
import {SellerReadinessSummary} from '@/components/seller/readiness-summary';
import {SellerOnboardingChecklist} from '@/components/seller/onboarding-checklist';
import {getSellerOnboardingChecklist} from '@/lib/sellers/onboarding-checklist';
import {readSellerWorkspaceTasks,assertSellerWorkspaceViewer} from '@/lib/seller/workspace-tasks';
import {SellerWorkspaceTaskList} from '@/components/seller/workspace-task-list';

export const dynamic = 'force-dynamic';
// This dynamic server page uses one request-time snapshot for terms and consent.
const sellerDashboardObservedAt = () => Date.now();

export default async function SellerDashboardPage() {
  const now = sellerDashboardObservedAt();
  const seller = await requireSellerCenterPage('/seller');
  if (!seller.approvedSeller || !seller.sellerId) return <ApplicantSection viewer={seller} section="home" />;
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [currentWork, readiness] = await Promise.all([
    readSellerWorkspaceTasks(db,seller.userId,{now,limit:8}).catch(()=>null),
    getSellerReadiness(db,seller.sellerId,now).catch(()=>null),
  ]);
  const [products, earnings, orders, commission, managedProgram] =
    await Promise.all([
      getSellerProductStats(db, seller.sellerId),
      getSellerEarnings(db, seller.sellerId),
      listOrdersForSeller(db, seller.sellerId, 4),
      getRegisteredSellerTerms(db, now).catch(error => { if (error instanceof CommissionRateUnavailableError) return null; throw error; }),
      getManagedProgramWorkspace(db, seller.sellerId),
    ]);
  const [currentCommissionAccepted, displayedOrders, onboarding] = await Promise.all([
    commission ? sellerAcceptedCommissionVersion(db, seller.sellerId, commission, now) : Promise.resolve(false),
    withFirstCodPresentation(db, orders),
    getSellerOnboardingChecklist(db, {
      sellerId: seller.sellerId, ownerId: seller.userId, stage: readiness?.stage ?? seller.status,
      readiness, viewer: { kind: 'seller' },
    }),
  ]);
  const hasProgramHistory =
    managedProgram.participationRoute === 'managed_maker' ||
    managedProgram.supplies.length > 0 ||
    managedProgram.transitions.length > 0;
  await assertSellerWorkspaceViewer(db,seller.userId,seller.sellerId,seller.authSubject);
  return (
    <div className="flex flex-col gap-7">
      <SellerHeading
        eyebrow="Shop overview"
        title={seller.tradingName}
        description="Your next tasks, order progress and recorded earnings in one place."
      />
      <SellerOnboardingChecklist model={onboarding} />
      <SellerWorkspaceTaskList model={currentWork} compact unavailable={!currentWork}/>
      <div id="seller-readiness" className="scroll-mt-28"><SellerReadinessSummary readiness={readiness}/></div>
      <section id="selling-fee-terms" className="scroll-mt-28">
      {managedProgram.participationRoute!=='managed_maker'&&commission && (seller.sellerAgreementVersion !== SELLER_AGREEMENT_VERSION ||
      !currentCommissionAccepted) ? (
        <SellerAgreementAcceptance termsContext={commission.context} />
      ) : <Link href={managedProgram.participationRoute==='managed_maker'?'/sell/application#selling-fee-terms':'/seller/registration'} className="section-link">Review recorded agreements and current selling terms →</Link>}
      </section>
      <SellerEarningsSummary earnings={earnings} compact />
      <section aria-labelledby="recent-orders-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-orders-title" className="font-heading text-2xl">
            Recent orders
          </h2>
          <Link href="/seller/orders" className="section-link min-h-11">
            All orders
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {orders.length ? (
          <SellerOrderList orders={displayedOrders} />
        ) : (
          <SellerEmpty
            icon={Package}
            title="Your first order will appear here"
            description="Orders for your published products will appear here. You can check your listings while you wait."
            href="/seller/products"
            action="View your products"
          />
        )}
      </section>
      <section
        aria-labelledby="product-overview-title"
        className="flex flex-col gap-4"
      >
        <div>
          <h2 id="product-overview-title" className="font-heading text-2xl">
            Product overview
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Current listing totals. Review decisions and reasons are available
            with each product.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SellerMetric
            label="Total products"
            value={products.total}
            detail="All current listings"
            icon={Package}
            href="/seller/products"
          />
          <SellerMetric
            label="Published / active"
            value={products.published}
            detail="Visible to customers"
            icon={PackageCheck}
            href="/seller/products?status=published"
          />
          <SellerMetric
            label="Pending approval"
            value={products.pendingApproval}
            detail="Submitted or awaiting publication"
            icon={Clock3}
            href="/seller/products?status=pending"
          />
          <SellerMetric
            label="Rejected"
            value={products.rejected}
            detail="Read the reviewer reason and available next steps"
            icon={AlertTriangle}
            href="/seller/products?status=rejected"
          />
          <SellerMetric
            label="Drafts"
            value={products.drafts}
            detail="Not yet submitted"
            icon={FileText}
            href="/seller/products?status=draft"
          />
          <SellerMetric
            label="Out of stock"
            value={products.outOfStock}
            detail="Published listings with zero stock"
            icon={Boxes}
            href="/seller/products?status=out_of_stock"
          />
        </div>
      </section>
      <section
        id="managed-program"
        aria-labelledby="program-details-title"
        className="scroll-mt-28"
      >
        <SellerProgramDetails>
          {hasProgramHistory ? (
            <>
              <SellerManagedProgramWorkspace
                workspace={managedProgram}
                sellerId={seller.sellerId}
              />
              <div className="flex flex-wrap gap-4 text-sm">
                <Link
                  className="section-link min-h-11"
                  href="/seller/form-history?kind=managed-supply"
                >
                  Managed supply answer history
                </Link>
                <Link
                  className="section-link min-h-11"
                  href="/seller/form-history?kind=managed-transition"
                >
                  Managed route answer history
                </Link>
              </div>
            </>
          ) : null}
          <Link className="section-link min-h-11" href="/seller-agreement">
            Seller Marketplace Agreement
          </Link>
          <Link
            className="section-link min-h-11"
            href="/seller/form-history?kind=payout-request"
          >
            Payout request answer history
          </Link>
        </SellerProgramDetails>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/seller/cases"
          className="rounded-2xl border bg-card p-6 hover:border-primary/50"
        >
          <h2 className="font-heading text-2xl">Returns & complaints</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Review cases for your items. Hastabazaar reviews the final outcome.
          </p>
          <span className="section-link mt-3">
            Open cases
            <ArrowRight aria-hidden="true" className="size-4" />
          </span>
        </Link>
        <Link
          href="/seller/profile"
          className="rounded-2xl border bg-card p-6 hover:border-primary/50"
        >
          <h2 className="font-heading text-2xl">Your maker profile</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Keep your story, craft specialties and support details up to date.
          </p>
          <span className="section-link mt-3">
            Edit shop profile
            <ArrowRight aria-hidden="true" className="size-4" />
          </span>
        </Link>
      </div>
    </div>
  );
}
