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
  Paintbrush,
  Plane,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

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
import { categoryImage } from '@/lib/catalog/category-presentation';
import { mediaFrameClass, mediaObjectClass } from '@/lib/media/responsive-media';
import styles from './homepage-occasion.module.css';

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

function occasionCardPhoto(href: string) {
  const destination = new URL(href, 'https://hastabazaar.invalid');
  const category = destination.searchParams.get('category');
  if (category && category !== 'gifts') {
    const image = categoryImage({ slug: category, nameEn: '' });
    if (image) return image.src;
  }
  if (destination.hash === '#craft-guide') return '/homepage/maker-hands-hero.webp';
  if (destination.searchParams.get('occasion')) return '/homepage/category-gifts.webp';
  return '/homepage/meaningful-gifts-hero.webp';
}

export function HomepageOccasionCarousel({
  slides,
  initialSlideId,
  children,
}: {
  slides: HomepageOccasionSlides;
  initialSlideId?: string;
  children?: ReactNode;
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
  } = useSliderAutoplay(api, enabledSlides.length, false, {
    manualHoldMs: 12_000, pauseOnPointerFocus: false,
  });
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
      className={styles.band}
      aria-label="Gifts for meaningful moments"
      {...interactionProps}
    >
      <div className={styles.container}>
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
              <div className={styles.layout}>
                <div className={styles.copy}>
                  <p className={styles.eyebrow}>{slide.eyebrow}</p>
                  <h2>
                    {slide.headingLead}{' '}
                    {slide.highlightedPhrase ? (
                      <em>{slide.highlightedPhrase}</em>
                    ) : null}{' '}
                    {slide.headingTail}
                  </h2>
                  <p>{slide.body}</p>
                  {slide.supportingNote ? <small>{slide.supportingNote}</small> : null}
                </div>
                <nav
                  aria-label={`Actions for ${heading(enabledSlides, index)}`}
                  className={styles.cards}
                >
                  {slide.cards.map((card, cardIndex) => {
                    const Icon = icons[card.icon];
                    return (
                      <Link
                        key={cardIndex}
                        href={card.destination}
                        className={styles.card}
                        data-theme={card.theme}
                      >
                        <span data-media-frame="cover" className={mediaFrameClass('cover', `aspect-square ${styles.photo}`)}>
                          <Image
                            src={occasionCardPhoto(card.destination)}
                            alt=""
                            data-media-mode="cover"
                            fill
                            sizes="(min-width: 640px) 174px, 168px"
                            className={mediaObjectClass('cover')}
                          />
                        </span>
                        <span className={styles.icon}>
                          <Icon aria-hidden="true" />
                        </span>
                        <span className={styles.cardCopy}>
                          <span>{card.kicker}</span>
                          <strong>{card.title}</strong>
                        </span>
                        <span
                          className={styles.action}
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
          className={styles.controls}
        />
        </Carousel>
        {children}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
