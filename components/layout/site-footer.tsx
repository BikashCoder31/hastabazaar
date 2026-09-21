import { env } from 'cloudflare:workers';
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Mail,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Store,
} from 'lucide-react';
import Image from 'next/image';
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
            <Link
              href="/"
              aria-label="Hastabazaar home"
              className="site-footer-wordmark"
            >
              <Image
                src="/brand/hastabazaar-logo-lockup-640.webp"
                alt="Hastabazaar — Handmade Nepal. For a Sustainable World."
                width={640}
                height={640}
                className="site-footer-logo"
              />
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
              {Object.entries(socialLinks).map(([platform, href]) => {
                const platformKey = platform as keyof OfficialSocialLinks;
                const label = platformLabels[platformKey];
                return (
                  <a
                    key={platform}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="site-footer-social-icon"
                    data-platform={platformKey}
                    aria-label={label}
                    title={label}
                  >
                    <SocialBrandIcon platform={platformKey} />
                  </a>
                );
              })}
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

function SocialBrandIcon({
  platform,
}: {
  platform: keyof OfficialSocialLinks;
}) {
  if (platform === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.4" cy="6.65" r="1" className="fill-current" />
      </svg>
    );
  }

  if (platform === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.6 7.1a2.8 2.8 0 0 0-2-2C17.8 4.6 12 4.6 12 4.6s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.9 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.9ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z" />
      </svg>
    );
  }

  if (platform === 'linkedin') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 8.4H3.3V19h3.2V8.4ZM4.9 3.1A1.9 1.9 0 1 0 4.9 7a1.9 1.9 0 0 0 0-3.9ZM19.8 12.9c0-3.2-1.7-4.7-4-4.7-1.8 0-2.7 1-3.1 1.7V8.4H9.5V19h3.2v-5.2c0-1.4.3-2.8 2-2.8 1.7 0 1.8 1.6 1.8 2.9V19h3.3v-6.1Z" />
      </svg>
    );
  }

  if (platform === 'tiktok') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.7 3c.3 1.8 1.3 3.2 3 3.8V10a8.2 8.2 0 0 1-3-1v5.7a5.7 5.7 0 1 1-5-5.7v3.2a2.5 2.5 0 1 0 1.8 2.4V3h3.2Z" />
      </svg>
    );
  }

  if (platform === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13.6 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.2H7.5V13h2.8v8h3.3Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.9 3h3.7l-8.1 9.2L24 21h-7.4l-5.8-7.6L4.2 21H.5l8.6-9.8L0 3h7.6l5.2 6.9L18.9 3Zm-1.3 16.4h2L6.5 4.5H4.4l13.2 14.9Z" />
    </svg>
  );
}
