export interface ProgramReadinessItem { id: string; title: string; ready: boolean; detail: string; href: string; owner: string }
export function programReadinessItems(input: { companyReady: boolean; simulation: boolean; activation: boolean;
  makers: number; approvedProducts: number; publishedProducts: number; payablePaisa: number }): readonly ProgramReadinessItem[] {
  return [
    { id: 'company', title: 'Company identity and selling terms', ready: input.companyReady,
      detail: input.companyReady ? 'Company details are available. Each maker must accept the exact selling terms.' : 'Review the company account details first.', href: '#program-settings', owner: 'Super Admin and maker' },
    { id: 'program', title: 'Program activation', ready: input.simulation && input.activation,
      detail: input.activation && input.simulation ? 'The configured company-store model is enabled for local simulation.' : 'Choose the commercial model and activation mode in Program settings.', href: '#program-settings', owner: 'Super Admin' },
    { id: 'maker', title: 'Maker application and private evidence', ready: input.makers > 0,
      detail: input.makers ? `${input.makers} maker application(s). Review each maker’s evidence, accepted terms and activation separately.` : 'No maker applications yet. Applicants use their own account and private government ID.', href: '#maker-applications', owner: 'Maker, then Super Admin' },
    { id: 'products', title: 'Product approval and publication', ready: input.publishedProducts > 0,
      detail: `${input.approvedProducts} approved · ${input.publishedProducts} published. Each product needs review before publication.`, href: '#program-products', owner: 'Maker, then Super Admin' },
    { id: 'payments', title: 'Completed sales and maker payments', ready: input.payablePaisa > 0,
      detail: input.payablePaisa > 0 ? 'Mature earnings are available. Review cases, the balance preview and receiving reference before preparing payment.' : 'Payable earnings appear after a completed, paid sale and its delivery hold. Review any case blockers below.', href: '#maker-payments', owner: 'Super Admin' },
  ];
}
export function ProgramReadinessChecklist(props: Parameters<typeof programReadinessItems>[0]) {
  return <section className="space-y-4 rounded-2xl border bg-card p-6" aria-labelledby="company-store-checklist">
    <h2 id="company-store-checklist" className="font-heading text-2xl">Company-store setup checklist</h2>
    <p className="text-sm text-muted-foreground">Local simulation only. Program setup, maker activation, product publication and payment readiness are separate checks.</p>
    <ul className="divide-y">{programReadinessItems(props).map(item => <li key={item.id} className="grid gap-2 py-4 md:grid-cols-[1fr_auto]">
      <div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm">{item.detail}</p><p className="mt-1 text-xs text-muted-foreground">Responsible: {item.owner}</p></div>
      <a className="section-link self-start" href={item.href}>{item.ready ? 'Review' : 'Open next step'}</a>
    </li>)}</ul>
  </section>;
}
