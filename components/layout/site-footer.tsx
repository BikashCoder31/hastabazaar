import Link from 'next/link';
import {
  ArrowUpRight,
  Banknote,
  HandHeart,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="bg-[#101f39] text-white">
      <div className="shell py-12 sm:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-8 lg:grid-cols-[1.45fr_1fr_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-block rounded-md font-heading text-4xl tracking-tight"
            >
              HastaBazaar<span className="text-[#f4c46b]">.</span>
            </Link>
            <p className="mt-4 max-w-xs text-base leading-7 text-white/70">
              Handmade finds. Human stories. A little piece of Nepal, chosen
              with heart.
            </p>
            <p className="mt-6 flex items-center gap-2 text-sm text-white/75">
              <HandHeart className="size-4 text-[#f4c46b]" />
              Made for a community of makers.
            </p>
            <a
              href="mailto:support@hastabazaar.com"
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-sm text-sm font-semibold text-white transition-colors hover:text-[#f4c46b]"
            >
              <Mail className="size-4 text-[#f4c46b]" />
              support@hastabazaar.com
            </a>
            <Link
              href="/sell"
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-5 text-sm font-semibold transition-colors hover:bg-white/10"
            >
              Sell on HastaBazaar <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <FooterGroup title="About">
            <FooterLink href="/about">About Us</FooterLink>
            <FooterLink href="/about">Our Story</FooterLink>
            <FooterLink href="/careers">Careers</FooterLink>
          </FooterGroup>
          <FooterGroup title="Customer Service">
            <FooterLink href="/contact-us">Contact Us</FooterLink>
            <FooterLink href="/feedback">Feedback</FooterLink>
            <FooterLink href="/help">Help Centre</FooterLink>
            <FooterLink href="/returns">Returns & Refunds</FooterLink>
            <FooterLink href="/help">FAQs</FooterLink>
          </FooterGroup>
          <FooterGroup title="For Sellers">
            <FooterLink href="/sell">Become a Seller</FooterLink>
            <FooterLink href="/seller">Seller Login</FooterLink>
            <FooterLink href="/help">Seller Help</FooterLink>
            <FooterLink href="/prohibited-products">Prohibited & Restricted Products</FooterLink>
            <FooterLink href="/seller-agreement">Seller Marketplace Agreement</FooterLink>
          </FooterGroup>
          <FooterGroup title="Policies">
            <FooterLink href="/terms">Terms & Conditions</FooterLink>
            <FooterLink href="/privacy">Privacy Policy</FooterLink>
            <FooterLink href="/returns">Return Policy</FooterLink>
            <FooterLink href="/shipping">Shipping & Delivery Policy</FooterLink>
            <FooterLink href="/cookies">Cookie Policy</FooterLink>
          </FooterGroup>
        </div>
        <div className="mt-10 border-t border-white/15 pt-7">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[#f4c46b]" />
            <h2 className="text-sm font-semibold text-white/85">
              Legal & business information
            </h2>
          </div>
          <nav
            aria-label="Legal and policies"
            className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/70"
          >
            <FooterLink href="/legal">Legal & Policies</FooterLink>
            <FooterLink href="/terms">Terms & conditions</FooterLink>
            <FooterLink href="/privacy">Privacy policy</FooterLink>
            <FooterLink href="/returns">Return & refund policy</FooterLink>
            <FooterLink href="/shipping">Shipping policy</FooterLink>
            <FooterLink href="/cookies">Cookie policy</FooterLink>
            <FooterLink href="/prohibited-products">
              Prohibited products
            </FooterLink>
            <FooterLink href="/seller-agreement">Seller agreement</FooterLink>
            <FooterLink href="/contact-us">Contact</FooterLink>
            <FooterLink href="/feedback">Feedback</FooterLink>
          </nav>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-white/15 pt-6 text-sm text-white/70">
          <p>© {new Date().getFullYear()} HastaBazaar. All Rights Reserved.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" />
              Nepal · NPR
            </span>
            <span className="flex items-center gap-1.5">
              <Banknote className="size-4" />
              Cash on delivery
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            <FooterLink href="/admin">Staff sign in</FooterLink>
            {process.env.NODE_ENV !== 'production' ? (
              <FooterLink href="/local-testing">Local role testing</FooterLink>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white">
        {title}
      </h2>
      <nav
        aria-label={title}
        className="mt-4 flex flex-col items-start gap-1 text-sm text-white/70"
      >
        {children}
      </nav>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center rounded-sm py-1 leading-6 transition-colors hover:text-[#f4c46b] focus-visible:outline-[#f4c46b]"
    >
      {children}
    </Link>
  );
}
