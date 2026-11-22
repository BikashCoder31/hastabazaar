import { isRiderPortalEnabled } from '@/lib/riders/availability';
import type { ElementType, ReactNode } from 'react';
import {
  FileCheck2,
  HandHeart,
  Heart,
  ShieldCheck,
  Sprout,
  Store,
  UserRound,
} from 'lucide-react';
import {
  SELLER_REGISTRATION_HERO_SLIDE,
  presentHomepageHeroSlide,
  type HomepageHeroSlide,
} from '@/lib/homepage/hero-slides';

const principles = [
  { icon: HandHeart, label: 'Product details' },
  { icon: UserRound, label: 'Meet the seller' },
  { icon: Sprout, label: 'Thoughtful choices' },
  { icon: Heart, label: 'Help with your order' },
] as const;

const sellerPrinciples = [
  { icon: Store, label: 'Seller application' },
  { icon: FileCheck2, label: 'Verification' },
  { icon: ShieldCheck, label: 'Admin review' },
  { icon: UserRound, label: 'Your seller profile' },
] as const;

// Copy participates in the desktop grid's height, so previews must render the
// same type, spacing and wrapping as the public slide to reproduce its crop.
export function HomepageHeroCopy({
  slide: storedSlide,
  preview = false,
  LinkComponent = 'a',
  showBenefits = true,
}: {
  slide: HomepageHeroSlide;
  preview?: boolean;
  showBenefits?: boolean;
  LinkComponent?: ElementType<{
    href: string;
    className: string;
    children: ReactNode;
  }>;
}) {
  const slide = presentHomepageHeroSlide(storedSlide);
  const riderPortalEnabled = isRiderPortalEnabled();
  const actionVisible = (href: string) =>
    preview || riderPortalEnabled || !/^\/rider(?:[/?#]|$)/.test(href);
  const sellerSlide = slide.id === SELLER_REGISTRATION_HERO_SLIDE.id;
  const benefits = sellerSlide ? sellerPrinciples : principles;
  const Heading = preview ? 'h3' : 'h2';
  const primaryClass =
    'homepage-hero-action inline-flex min-h-12 max-w-full items-center justify-center rounded-full bg-[#b81925] px-4 py-3 text-sm leading-snug font-bold text-white transition hover:bg-[#971620] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b81925]';
  const secondaryClass =
    'homepage-hero-action inline-flex min-h-12 max-w-full items-center justify-center rounded-full border border-[#b81925] px-4 py-3 text-sm leading-snug font-bold text-[#9d1721] transition hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b81925]';
  const primary = (
    <>
      {slide.primaryActionLabel}{' '}
      <span aria-hidden="true" className="ml-2">
        →
      </span>
    </>
  );
  return (
    <div className="homepage-hero-copy-layout">
      <div className="homepage-hero-intro">
        <p className="homepage-hero-eyebrow font-bold uppercase text-[#996020]">
          {slide.eyebrow}
        </p>
        <Heading className="homepage-hero-heading font-heading text-[#0b3156]">
          {slide.headingLead}{' '}
          {slide.highlightedPhrase ? (
            <em className="text-[#b61d2a]">{slide.highlightedPhrase}</em>
          ) : null}{' '}
          {slide.headingTail}
        </Heading>
      </div>
      <div className="homepage-hero-details">
        <p data-hero-body className="homepage-hero-body text-[#536170]">
          {slide.body}
        </p>
        <div className="homepage-hero-actions">
          {actionVisible(slide.primaryActionHref) ? (
            preview ? (
              <span className={primaryClass}>{primary}</span>
            ) : (
              <LinkComponent
                href={slide.primaryActionHref}
                className={primaryClass}
              >
                {primary}
              </LinkComponent>
            )
          ) : null}
          {slide.secondaryActionLabel &&
          slide.secondaryActionHref &&
          actionVisible(slide.secondaryActionHref) ? (
            preview ? (
              <span className={secondaryClass}>
                {slide.secondaryActionLabel}
              </span>
            ) : (
              <LinkComponent
                href={slide.secondaryActionHref}
                className={secondaryClass}
              >
                {slide.secondaryActionLabel}
              </LinkComponent>
            )
          ) : null}
        </div>
        {showBenefits ? <div
          className="homepage-hero-benefits text-[#344255]"
          aria-label={
            sellerSlide ? 'Getting started as a seller' : 'Why shop with us'
          }
        >
          {benefits.map(({ icon: Icon, label }) => (
            <div key={label} className="flex min-w-0 items-center gap-2">
              <Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-[#b81925]"
              />
              <span>{label}</span>
            </div>
          ))}
        </div> : null}
      </div>
    </div>
  );
}
