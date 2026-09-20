import { Badge } from '@/components/ui/badge';
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
}: {
  programMode: ManagedMakerProgramMode;
  activeModel: ManagedMakerCommercialModel | null;
  capabilities: readonly ManagedMakerCapability[];
}) {
  const applicationsOnly = programMode === 'applications_only';
  return (
    <div className="space-y-6">
      <Card className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/10">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">
              {applicationsOnly ? 'Applications Only' : 'Activation configured'}
            </Badge>
            <Badge variant="secondary">SIMULATED — NOT VALID FOR PRODUCTION</Badge>
          </div>
          <CardTitle>Managed Maker program readiness</CardTitle>
          <CardDescription>
            Applicants may create profiles, respond to review, and prepare product
            drafts. Customer publication, ordering, live invoices, and real payouts
            remain unavailable until the applicable program, maker, and product
            conditions are complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <ReadinessItem title="Program readiness" detail="Commercial, agreement, issuer, tax, return, and payment rules require live review." />
          <ReadinessItem title="Maker readiness" detail="The shared onboarding and route-specific evidence must be approved." />
          <ReadinessItem title="Product readiness" detail="Each Managed Maker product must pass its own publication review." />
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
                <CardDescription>{capability.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Planned verification: {capability.milestone}
                </p>
                <p className="text-sm font-medium">
                  {selected
                    ? 'Selected in configuration; transaction use still follows readiness checks.'
                    : 'Not selected for transaction use.'}
                </p>
                {!capability.selectableForLiveActivation ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">
                    Live activation unavailable. The option is shown as a delivery
                    status, not as a decorative usable workflow.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ReadinessItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}
