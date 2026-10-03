'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Cake,
  Flower2,
  Gift,
  HandHeart,
  Heart,
  House,
  MapPin,
  Paintbrush,
  Plane,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SliderDots } from '@/components/ui/slider-dots';
import { useSliderAutoplay } from '@/lib/homepage/slider-autoplay';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import {
  nextOccasionIndex,
  occasionSelectionAnnouncement,
} from '@/lib/homepage/occasion-autoplay';
import {
  presentHomepageOccasionSlide,
  type HomepageOccasionIcon,
  type HomepageOccasionSlides,
} from '@/lib/homepage/occasion-slides';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

const icons: Record<HomepageOccasionIcon, LucideIcon> = {
  gift: Gift,
  cake: Cake,
  heart: Heart,
  sparkles: Sparkles,
  'hand-heart': HandHeart,
  flower: Flower2,
  home: House,
  plane: Plane,
  paintbrush: Paintbrush,
  briefcase: BriefcaseBusiness,
};

function heading(slides: HomepageOccasionSlides, index: number): string {
  const slide = slides[index];
  return [slide?.headingLead, slide?.highlightedPhrase, slide?.headingTail]
    .filter(Boolean)
    .join(' ');
}

export function HomepageOccasionCarousel({
  slides,
  initialSlideId,
}: {
  slides: HomepageOccasionSlides;
  initialSlideId?: string;
}) {
  const enabledSlides = useMemo(
    () =>
      [...slides]
        .filter((slide) => slide.enabled)
        .map(presentHomepageOccasionSlide)
        .sort((a, b) => a.position - b.position),
    [slides],
  );
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const {
    reset: resetAutoplay,
    selectionKind,
    interactionProps,
    pausedByUser,
    toggleUserPause,
  } = useSliderAutoplay(api, enabledSlides.length);
  const initialIndex = Math.max(
    0,
    enabledSlides.findIndex((slide) => slide.id === initialSlideId),
  );

  useEffect(() => {
    if (!api) return;
    const selected = () => {
      const index = api.selectedScrollSnap();
      setCurrent(index);
      setAnnouncement(
        occasionSelectionAnnouncement(
          index,
          enabledSlides.length,
          heading(enabledSlides, index),
          selectionKind(),
        ),
      );
    };
    selected();
    api.on('select', selected);
    api.on('reInit', selected);
    return () => {
      api.off('select', selected);
      api.off('reInit', selected);
    };
  }, [api, enabledSlides, selectionKind]);

  useEffect(() => {
    if (!api || !initialSlideId) return;
    const index = enabledSlides.findIndex(
      (slide) => slide.id === initialSlideId,
    );
    if (index >= 0) api.scrollTo(index, true);
  }, [api, enabledSlides, initialSlideId]);

  const selectManually = useCallback(
    (index: number) => {
      if (!api || !enabledSlides.length) return;
      resetAutoplay();
      if (index === current) {
        setAnnouncement(
          occasionSelectionAnnouncement(
            index,
            enabledSlides.length,
            heading(enabledSlides, index),
            'manual',
          ),
        );
        return;
      }
      api.scrollTo(
        index,
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
    },
    [api, current, enabledSlides, resetAutoplay],
  );

  const move = useCallback(
    (direction: 'next' | 'previous') => {
      if (!api || enabledSlides.length < 2) return;
      selectManually(
        nextOccasionIndex(current, enabledSlides.length, direction),
      );
    },
    [api, current, enabledSlides.length, selectManually],
  );

  if (!enabledSlides.length) return null;

  return (
    <section
      id="occasions"
      className="homepage-occasion-section"
      aria-label="Gifts for meaningful moments"
      {...interactionProps}
    >
      <div
        data-media-frame="cover"
        className={mediaFrameClass('cover', 'homepage-occasion-pattern')}
        aria-hidden="true"
      >
        <Image
          data-media-mode="cover"
          src="/homepage/nepali-gift-pattern.webp"
          alt=""
          fill
          sizes={mediaSizes.occasion}
          className={mediaObjectClass('cover')}
        />
      </div>
      <Carousel
        opts={{ loop: true, startIndex: initialIndex }}
        setApi={setApi}
        aria-label="Hastabazaar gifting stories"
        aria-roledescription="carousel"
        onKeyDownCapture={(event) => {
          if ((event.target as HTMLElement).closest('[data-slider-dots]'))
            return;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move('previous');
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            move('next');
          }
        }}
      >
        <CarouselContent className="!ml-0">
          {enabledSlides.map((slide, index) => (
            <CarouselItem
              key={slide.id}
              className="!pl-0"
              aria-label={`Slide ${index + 1} of ${enabledSlides.length}`}
              aria-hidden={index === current ? undefined : true}
              inert={index === current ? undefined : true}
            >
              <div className="shell homepage-occasion-layout">
                <div className="homepage-occasion-copy">
                  <p className="homepage-occasion-kicker">{slide.eyebrow}</p>
                  <h2 className="homepage-occasion-title">
                    {slide.headingLead}{' '}
                    {slide.highlightedPhrase ? (
                      <span>{slide.highlightedPhrase}</span>
                    ) : null}{' '}
                    {slide.headingTail}
                  </h2>
                  <p className="homepage-occasion-intro">{slide.body}</p>
                  {slide.supportingNote ? (
                    <p className="homepage-occasion-delivery">
                      <span className="homepage-occasion-delivery-icon">
                        <MapPin aria-hidden="true" />
                      </span>
                      {slide.supportingNote}
                    </p>
                  ) : null}
                </div>
                <nav
                  aria-label={`Actions for ${heading(enabledSlides, index)}`}
                  className="homepage-occasion-grid"
                >
                  {slide.cards.map((card) => {
                    const Icon = icons[card.icon];
                    return (
                      <Link
                        key={`${slide.id}:${card.destination}`}
                        href={card.destination}
                        className="homepage-occasion-card"
                        data-theme={card.theme}
                      >
                        <Icon
                          className="homepage-occasion-card-watermark"
                          aria-hidden="true"
                        />
                        <span className="homepage-occasion-card-icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <span className="homepage-occasion-card-copy">
                          <span>{card.kicker}</span>
                          <strong>{card.title}</strong>
                        </span>
                        <span
                          className="homepage-occasion-card-action"
                          aria-hidden="true"
                        >
                          {card.theme === 'warm' ? (
                            <ArrowRight />
                          ) : (
                            <ArrowUpRight />
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>

        <SliderDots
          label="Choose gifting story"
          appearance="light"
          labels={enabledSlides.map(
            (_, index) =>
              `Show slide ${index + 1}: ${heading(enabledSlides, index)}`,
          )}
          current={current}
          onSelect={selectManually}
          className="mt-4"
        />
        {enabledSlides.length > 1 ? <div className="mt-3 flex justify-center">
          <button type="button" onClick={toggleUserPause} aria-pressed={pausedByUser}
            className="min-h-11 rounded-full border border-[#f2ebe1]/50 px-4 text-sm font-semibold text-[#f2ebe1] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2ebe1]">
            {pausedByUser ? 'Resume gifting stories' : 'Pause gifting stories'}
          </button>
        </div> : null}
      </Carousel>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
