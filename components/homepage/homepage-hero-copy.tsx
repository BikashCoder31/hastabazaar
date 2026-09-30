import type { ElementType, ReactNode } from 'react';
import { HandHeart, Heart, Sprout, UserRound } from 'lucide-react';
import type { HomepageHeroSlide } from '@/lib/homepage/hero-slides';

const principles = [
  { icon: HandHeart, label: 'Authentic handmade' },
  { icon: UserRound, label: 'Support local makers' },
  { icon: Sprout, label: 'Thoughtful choices' },
  { icon: Heart, label: 'A stronger Nepal' },
] as const;

// Copy participates in the desktop grid's height, so previews must render the
// same type, spacing and wrapping as the public slide to reproduce its crop.
export function HomepageHeroCopy({
  slide,
  preview = false,
  LinkComponent = 'a',
}: {
  slide: HomepageHeroSlide;
  preview?: boolean;
  LinkComponent?: ElementType<{
    href: string;
    className: string;
    children: ReactNode;
  }>;
}) {
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
          {preview ? (
            <span className={primaryClass}>{primary}</span>
          ) : (
            <LinkComponent
              href={slide.primaryActionHref}
              className={primaryClass}
            >
              {primary}
            </LinkComponent>
          )}
          {slide.secondaryActionLabel && slide.secondaryActionHref ? (
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
        <div
          className="homepage-hero-benefits text-[#344255]"
          aria-label="Why shop with us"
        >
          {principles.map(({ icon: Icon, label }) => (
            <div key={label} className="flex min-w-0 items-center gap-2">
              <Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-[#b81925]"
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
