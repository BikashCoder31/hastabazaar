import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="bg-foreground text-background">
      <div className="shell grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.35fr_0.8fr_0.9fr_1.1fr]">
        <div>
          <p className="font-heading text-3xl">Hastabazaar</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-background/65">
            A considered marketplace for handmade work and the people who make
            it.
          </p>
          <p className="mt-6 text-xs text-background/45">© {new Date().getFullYear()} Hastabazaar</p>
        </div>
        <FooterGroup title="Hastabazaar">
          <FooterLink href="/#our-standard">About us</FooterLink>
          <FooterLink href="/shop">Our makers</FooterLink>
          <FooterLink href="/sell">Sell on Hastabazaar</FooterLink>
        </FooterGroup>
        <FooterGroup title="Customer care">
          <FooterLink href="/help">Help center</FooterLink>
          <FooterLink href="/help#shipping">Shipping</FooterLink>
          <FooterLink href="/help#returns">Returns &amp; refunds</FooterLink>
          <FooterLink href="/help#tracking">Track order</FooterLink>
          <FooterLink href="/help#complaints">Complaints</FooterLink>
        </FooterGroup>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Legal</h2>
          <ul className="mt-4 space-y-2 text-sm text-background/55" aria-label="Planned legal information">
            <li>Terms &amp; conditions</li>
            <li>Privacy policy</li>
            <li>Seller agreement</li>
            <li>Return &amp; refund policy</li>
            <li>Shipping policy</li>
            <li>Business information</li>
            <li>E-commerce registration</li>
          </ul>
          <p className="mt-4 max-w-xs text-xs leading-5 text-background/45">Published links will be enabled after legal and registration details are approved.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h2 className="text-sm font-semibold uppercase tracking-[0.14em]">{title}</h2><nav className="mt-4 flex flex-col items-start gap-2 text-sm text-background/75">{children}</nav></div>;
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="rounded-sm hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background">{children}</Link>;
}
