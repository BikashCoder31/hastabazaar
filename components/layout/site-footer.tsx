import { env } from 'cloudflare:workers';
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  ExternalLink,
  Mail,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Store,
} from 'lucide-react';
import Link from 'next/link';

import { getBusinessSettingDefinition } from '@/lib/configuration/definitions';
import type { OfficialSocialLinks } from '@/lib/configuration/types';
import { requireDatabase } from '@/lib/db/d1';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';

const platformLabels: Record<keyof OfficialSocialLinks, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  x: 'X',
  youtube: 'YouTube',
};

async function officialLinks(): Promise<OfficialSocialLinks> {
  const fallback = getBusinessSettingDefinition(
    'official_social_links',
  ).defaultValue;
  try {
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const clock = await database
      .prepare("SELECT unixepoch('now') * 1000 AS now")
      .first<{ now: number }>();
    return (
      await getEffectiveBusinessSetting(
        database,
        'official_social_links',
        Number(clock?.now ?? 0),
      )
    ).value;
  } catch {
    return fallback;
  }
}

export async function SiteFooter() {
  const socialLinks = await officialLinks();

  return (
    <footer className="site-footer">
      <div className="shell site-footer-cta-shell">
        <div className="site-footer-cta">
          <div>
            <p className="site-footer-kicker">Handmade with purpose</p>
            <h2>Crafted in Nepal. Connected to the world.</h2>
            <p>
              Discover meaningful pieces and the independent makers behind them.
            </p>
          </div>
          <div className="site-footer-cta-actions">
            <Link href="/shop" className="site-footer-cta-primary">
              <ShoppingBag className="size-4" aria-hidden="true" />
              Shop the collection
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/sell" className="site-footer-cta-secondary">
              <Store className="size-4" aria-hidden="true" />
              Share your craft
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <div className="shell site-footer-main">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <Link href="/" className="site-footer-wordmark">
              HastaBazaar<span>.</span>
            </Link>
            <p className="site-footer-tagline">
              Handmade finds. Human stories. A little piece of Nepal, chosen
              with heart.
            </p>
            <a
              href="mailto:support@hastabazaar.com"
              className="site-footer-email"
            >
              <Mail className="size-4" aria-hidden="true" />
              support@hastabazaar.com
            </a>
            <nav
              aria-label="Official Hastabazaar social media"
              className="site-footer-social"
            >
              {Object.entries(socialLinks).map(([platform, href]) => (
                <a
                  key={platform}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {platformLabels[platform as keyof OfficialSocialLinks]}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ))}
            </nav>
          </div>

          <FooterGroup title="Shop & discover">
            <FooterLink href="/shop">Shop all</FooterLink>
            <FooterLink href="/#categories">Categories</FooterLink>
            <FooterLink href="/#occasions">Gifts by occasion</FooterLink>
            <FooterLink href="/#makers">Our makers</FooterLink>
            <FooterLink href="/#our-standard">Our standard</FooterLink>
          </FooterGroup>
          <FooterGroup title="Customer care">
            <FooterLink href="/account/orders">Orders & tracking</FooterLink>
            <FooterLink href="/account/wishlist">Wishlist</FooterLink>
            <FooterLink href="/help">Help centre</FooterLink>
            <FooterLink href="/returns">Returns & refunds</FooterLink>
            <FooterLink href="/contact-us">Contact us</FooterLink>
          </FooterGroup>
          <FooterGroup title="Sell with us">
            <FooterLink href="/sell">Become a seller</FooterLink>
            <FooterLink href="/seller">Seller dashboard</FooterLink>
            <FooterLink href="/help">Seller help</FooterLink>
            <FooterLink href="/prohibited-products">
              Prohibited products
            </FooterLink>
            <FooterLink href="/seller-agreement">Seller agreement</FooterLink>
          </FooterGroup>
          <FooterGroup title="About Hastabazaar">
            <FooterLink href="/about">About us</FooterLink>
            <FooterLink href="/about">Our story</FooterLink>
            <FooterLink href="/careers">Careers</FooterLink>
            <FooterLink href="/feedback">Share feedback</FooterLink>
            <FooterLink href="/legal">Legal information</FooterLink>
          </FooterGroup>
        </div>

        <div className="site-footer-legal">
          <div>
            <ShieldCheck className="size-5" aria-hidden="true" />
            <div>
              <h2>Policies and buyer information</h2>
              <p>Clear guidance before and after every purchase.</p>
            </div>
          </div>
          <nav aria-label="Legal and policies">
            <FooterLink href="/terms">Terms</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
            <FooterLink href="/returns">Returns</FooterLink>
            <FooterLink href="/shipping">Shipping</FooterLink>
            <FooterLink href="/cookies">Cookies</FooterLink>
          </nav>
        </div>

        <div className="site-footer-bottom">
          <p>© {new Date().getFullYear()} HastaBazaar. All rights reserved.</p>
          <div>
            <span>
              <MapPin className="size-4" aria-hidden="true" />
              Nepal · NPR
            </span>
            <span>
              <Banknote className="size-4" aria-hidden="true" />
              Cash on delivery
            </span>
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
    <div className="site-footer-group">
      <h2>{title}</h2>
      <nav aria-label={title}>{children}</nav>
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
    <Link href={href} className="site-footer-link">
      {children}
    </Link>
  );
}
