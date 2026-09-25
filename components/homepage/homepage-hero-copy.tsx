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
    'inline-flex min-h-12 items-center rounded-full bg-[#b81925] px-6 text-sm font-bold text-white transition hover:bg-[#971620] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b81925]';
  const secondaryClass =
    'inline-flex min-h-12 items-center rounded-full border border-[#b81925] px-6 text-sm font-bold text-[#9d1721] transition hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b81925]';
  const primary = (
    <>
      {slide.primaryActionLabel}{' '}
      <span aria-hidden="true" className="ml-2">
        →
      </span>
    </>
  );
  return (
    <div className="flex flex-col justify-center px-6 pb-28 pt-14 @[640px]/hero:px-10 @[1024px]/hero:px-16 @[1024px]/hero:pb-24 @[1024px]/hero:pt-16 @[1280px]/hero:px-24">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#996020] @[640px]/hero:text-sm">
        {slide.eyebrow}
      </p>
      <Heading className="mt-5 max-w-3xl font-heading text-[clamp(3rem,6cqw,6.8rem)] leading-[0.9] tracking-[-0.04em] text-[#0b3156]">
        {slide.headingLead}{' '}
        {slide.highlightedPhrase ? (
          <em className="text-[#b61d2a]">{slide.highlightedPhrase}</em>
        ) : null}{' '}
        {slide.headingTail}
      </Heading>
      <p className="mt-7 max-w-2xl text-base leading-7 text-[#536170] @[640px]/hero:text-lg @[640px]/hero:leading-8">
        {slide.body}
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
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
            <span className={secondaryClass}>{slide.secondaryActionLabel}</span>
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
        className="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#d9cbbb] pt-5 text-xs text-[#344255] @[640px]/hero:grid-cols-4"
        aria-label="Why shop with us"
      >
        {principles.map(({ icon: Icon, label }) => (
          <div key={label} className="flex min-w-0 items-center gap-2">
            <Icon
              aria-hidden="true"
              className="size-5 shrink-0 text-[#b81925]"
            />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
