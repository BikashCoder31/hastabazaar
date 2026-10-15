import { DEFAULT_PLATFORM_SHARE_BPS } from '@/lib/configuration/commission-defaults';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import type { RuntimeEnvironment } from '@/lib/staging/environment';
import type { ProgramMaker, ProgramManagementWorkspace } from '@/lib/managed-commerce/program-management';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ManagedMakerCapability } from '@/lib/configuration/capabilities';
import type {
  ManagedMakerCommercialModel,
  ManagedMakerProgramMode,
} from '@/lib/configuration/types';

export function ProgramManagement({
  programMode,
  activeModel,
  capabilities,
  environment,
  environmentVerified = Boolean(environment),
  platformRetentionBps = DEFAULT_PLATFORM_SHARE_BPS,
  workspace,
}: {
  programMode: ManagedMakerProgramMode;
  activeModel: ManagedMakerCommercialModel | null;
  capabilities: readonly ManagedMakerCapability[];
  environment?: RuntimeEnvironment;
  environmentVerified?: boolean;
  platformRetentionBps?: number;
  workspace?: ProgramManagementWorkspace;
}) {
  const applicationsOnly = programMode === 'applications_only';
  const simulationAllowed = environmentVerified && (environment?.simulationAllowed ?? false);
  const totals = workspace?.totals;
  return (
    <div className="min-w-0 space-y-6">
      <nav aria-label="Program workspace" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-primary">
        <Link href="#maker-applications">Maker applications</Link><Link href="#program-products">Product readiness</Link>
        <Link href="#program-operations">Supply &amp; payments</Link><Link href="#maker-payments">Sale-linked payments</Link><Link href="#program-settings">Program settings</Link>
        <Link href="/admin/staff-form-history?kind=managed-maker-activation">Activation history</Link>
      </nav>
      <Card id="program-readiness" className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/10">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">
              {applicationsOnly ? 'Applications Only' : !environmentVerified ? 'Environment unverified' : simulationAllowed ? 'Simulation configured' : 'Production activation blocked'}
            </Badge>
            <Badge variant="secondary">{!environmentVerified ? 'Environment unverified' : simulationAllowed ? 'SIMULATED — NOT VALID FOR PRODUCTION' : 'Production activation blocked'}</Badge>
          </div>
          <CardTitle>Managed Maker program readiness</CardTitle>
          <CardDescription>
            Applicants may create profiles, respond to review, and prepare product drafts.
            {simulationAllowed ? ' Activation and transaction records in this workspace are for disposable local testing.' : !environmentVerified ? ' The runtime environment has not been verified. Simulation activation remains unavailable.' : ' Both commercial models remain blocked for live activation.'}
            {' '}Program configuration, maker approval, and product approval are checked separately.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <ReadinessItem title="Program readiness" detail={applicationsOnly ? 'Applications are open. Configure a commercial model and activation mode for local testing.' : activeModel ? 'A model is selected. Each maker still needs independent review and activation inputs.' : 'Select a commercial model before local activation.'} />
          <ReadinessItem title="Maker readiness" detail={totals ? `${totals.makers} Managed Maker applications · ${totals.awaitingReview} awaiting review. Check each maker’s requirements below.` : 'The shared onboarding and route-specific evidence must be approved.'} />
          <ReadinessItem title="Product readiness" detail={totals ? `${totals.approvedProducts} approved · ${totals.draftProducts} drafts or submissions · ${totals.publishedProducts} published. Publication remains a separate review action.` : 'Each Managed Maker product must pass its own publication review.'} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {capabilities.map((capability) => {
          const selected = activeModel === capability.code;
          return (
            <Card key={capability.code}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{capability.label}</CardTitle>
                  <Badge variant={capability.selectableForLiveActivation ? 'default' : 'outline'}>
                    {capability.readiness === 'implemented'
                      ? 'Implemented and tested'
                      : 'In development'}
                  </Badge>
                </div>
                <CardDescription>{capability.code === 'managed_sale_linked_percentage_v1'
                  ? `${platformRetentionBps / 100}% platform retention and the reconciled ${(10_000 - platformRetentionBps) / 100}% maker entitlement become earned only after delivered-and-paid conditions. New transactions use the effective setting; existing records retain their snapshots.`
                  : capability.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {capability.selectableForStagingSimulation ? 'Workflow verified for disposable local testing.' : 'Local workflow unavailable.'}
                </p>
                <p className="text-sm font-medium">
                  {selected
                    ? 'Selected in configuration; transaction use still follows readiness checks.'
                    : 'Not selected for transaction use.'}
                </p>
                {workspace ? <p className="text-sm text-muted-foreground">{workspace.modelTotals.find((row) => row.model === capability.code)?.makers ?? 0} makers assigned to this model.</p> : null}
                {!capability.selectableForLiveActivation ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">
                    Live activation unavailable. {simulationAllowed && capability.selectableForStagingSimulation ? 'Use the application and product review queues below to prepare a simulated route.' : 'Commercial, agreement, tax, invoice, return and payment requirements still need production review.'}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {workspace ? <>
        <Card id="maker-applications" className="min-w-0 scroll-mt-6"><CardHeader><CardTitle>Maker applications</CardTitle><CardDescription>Showing {workspace.makers.length} of {totals?.makers} applications, newest first. Review evidence before completing activation inputs.</CardDescription></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2">
          {workspace.makers.length ? workspace.makers.map((maker) => <MakerReadiness key={maker.id} maker={maker} simulationAllowed={simulationAllowed} />) : <p className="text-sm text-muted-foreground">No Managed Maker applications. <Link href="/admin/sellers" className="text-primary underline">Open the application review queue</Link> when an applicant submits their profile.</p>}
        </CardContent></Card>
        <Card id="program-products" className="min-w-0 scroll-mt-6"><CardHeader><CardTitle>Managed Maker products</CardTitle><CardDescription>Up to 50 recent drafts, submissions, approved and published products. Archived products are excluded.</CardDescription></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2">
          {workspace.products.length ? workspace.products.map((product) => <div key={product.id} className="min-w-0 rounded-lg border p-4"><p className="break-words font-medium">{product.name}</p><p className="mt-1 text-sm text-muted-foreground">{product.makerName} · {product.status.replaceAll('_', ' ')}</p><Link href={`/admin/products/${encodeURIComponent(product.id)}`} className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">Review product</Link></div>) : <p className="text-sm text-muted-foreground">No Managed Maker products. Product drafts appear here after applicants submit them.</p>}
          <Link href="/admin/products" className="text-sm font-medium text-primary underline">Open the full product review queue</Link>
        </CardContent></Card>
        <Card id="program-operations" className="min-w-0 scroll-mt-6"><CardHeader><CardTitle>Supply, payments &amp; route transitions</CardTitle><CardDescription>Counts use all recorded Managed Maker data. Decisions and payment recording remain separate actions.</CardDescription></CardHeader><CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3"><ReadinessItem title="Supply proposals" detail={`${totals?.proposedSupplies} waiting for a decision`} /><ReadinessItem title="Supplier obligations to review" detail={`${totals?.paymentActions} unpaid obligations or payment records; eligibility and holds require review`} /><ReadinessItem title="Route transitions" detail={`${totals?.pendingTransitions} awaiting review, changes or their effective date`} /></div>
          <div className="grid gap-3 lg:grid-cols-2">{workspace.makers.filter((maker) => maker.proposedSupplies || maker.paymentActions || maker.pendingTransitions).map((maker) => <div key={maker.id} className="min-w-0 rounded-lg border p-4"><p className="break-words font-medium">{maker.name}</p><p className="mt-1 text-sm text-muted-foreground">{maker.proposedSupplies} supply proposals · {maker.paymentActions} payment actions · {maker.pendingTransitions} transitions</p><Link href={`/admin/sellers/${encodeURIComponent(maker.id)}#managed-program-records`} className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">Review supply, payments &amp; transitions</Link></div>)}</div>
          {!totals?.proposedSupplies && !totals?.paymentActions && !totals?.pendingTransitions ? <p className="text-sm text-muted-foreground">No supply, supplier payment or transition actions are waiting.</p> : <Link href="/admin/sellers" className="text-sm text-primary underline">Open all makers for remaining records</Link>}
          {workspace.legacyMakers.length ? <div className="space-y-3"><h3 className="font-semibold">Records retained after route transition</h3><p className="text-sm text-muted-foreground">Up to 50 former Managed Makers with outstanding records. Their financial history continues under its recorded terms.</p>{workspace.legacyMakers.map((maker) => <div key={maker.id} className="min-w-0 rounded-lg border p-4"><p className="break-words font-medium">{maker.name}</p><p className="mt-1 text-sm text-muted-foreground">{maker.paymentActions} supplier payment actions · {maker.earnedEntitlements + maker.eligibleEntitlements} settlement records · {maker.pendingPayouts} simulated payouts</p><Link href={`/admin/sellers/${encodeURIComponent(maker.id)}#managed-program-records`} className="mt-2 inline-block text-sm text-primary underline">Review retained program records</Link></div>)}</div> : null}
          <div className="rounded-lg bg-muted p-4 text-sm leading-6"><p className="font-medium">Sale-linked settlement records</p><p>{totals?.earnedEntitlements} earned · {totals?.eligibleEntitlements} eligible or partly paid · {totals?.pendingPayouts} pending simulated payouts.</p><p className="mt-2 text-muted-foreground">These records are shown for review. Managed sale-linked payout controls are not available in this workspace.</p><Link href="/admin/orders" className="mt-2 inline-block text-primary underline">Review delivered-and-paid order conditions</Link></div>
          <Link href="/admin/staff-form-history?kind=managed-supply-decision" className="inline-block text-sm text-primary underline">View recorded supply decisions</Link>
        </CardContent></Card>
      </> : null}
    </div>
  );
}

function MakerReadiness({ maker, simulationAllowed }: { maker: ProgramMaker; simulationAllowed: boolean }) {
  const sellerHref = `/admin/sellers/${encodeURIComponent(maker.id)}`;
  return <div className="min-w-0 space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><p className="break-words font-semibold">{maker.name}</p><Badge variant="outline">{maker.stage.replaceAll('_', ' ')}</Badge></div>
    <p className="text-sm text-muted-foreground">{maker.approvedProducts} approved products · {maker.draftProducts} drafts or submissions · {maker.publishedProducts} published</p>
    {maker.stage === 'active' ? <p className="text-sm">Route recorded as active. Current program and product checks still apply to transactions.</p> : <details className="text-sm"><summary className="cursor-pointer font-medium">{maker.outstanding.length} outstanding requirements</summary><ul className="mt-2 grid gap-2 pl-4">{maker.outstanding.map((item) => <li key={item}>{item === 'Disposable simulation environment' ? 'Use a disposable local staging environment.' : <Link className="text-primary underline" href={item === 'Program activation mode' || item === 'Configured implemented commercial model' ? '#program-settings' : item === 'At least one approved product' ? '#program-products' : maker.stage === 'approved_for_activation' ? `${sellerHref}#managed-maker-activation` : sellerHref}>{item}</Link>}</li>)}</ul></details>}
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-primary"><Link className="underline-offset-4 hover:underline" href={sellerHref}>Review application</Link>
      {maker.stage === 'approved_for_activation' && simulationAllowed ? <Link className="underline-offset-4 hover:underline" href={`${sellerHref}#managed-maker-activation`}>{maker.canCompleteActivation ? 'Complete activation inputs' : 'Review activation requirements'}</Link> : null}
    </div>
  </div>;
}

function ReadinessItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}
