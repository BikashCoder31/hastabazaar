import { companyDetails, companyPanDisplay } from '@/lib/content/company-details';

export function CompanyDisclosure() {
  const details = [
    ['Registered company', `${companyDetails.legalName} (${companyDetails.nepaliName})`],
    ['Company registration number', companyDetails.registrationNumber],
    ['Registering authority', companyDetails.registeringAuthority],
    ['Incorporated', companyDetails.incorporationDate],
    ['Registered office', companyDetails.registeredOffice],
    ['Business model', 'Intermediary marketplace connecting customers with independent sellers'],
    ['PAN', companyPanDisplay],
  ];

  return (
    <section id="company-details" className="scroll-mt-36 rounded-2xl border p-5 sm:p-6">
      <h2 className="font-heading text-2xl">Company details</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="font-semibold">{label}</dt>
            <dd className="mt-1 break-words leading-6 text-muted-foreground">{value}</dd>
          </div>
        ))}
        <div>
          <dt className="font-semibold">Customer support</dt>
          <dd className="mt-1 break-words leading-6">
            <a className="text-primary underline underline-offset-4" href={`mailto:${companyDetails.supportEmail}`}>
              {companyDetails.supportEmail}
            </a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
