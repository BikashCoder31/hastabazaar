'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Cake,
  ChevronLeft,
  ChevronRight,
  Flower2,
  Gift,
  HandHeart,
  Heart,
  House,
  MapPin,
  Paintbrush,
  Pause,
  Plane,
  Play,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import {
  nextOccasionIndex,
  occasionAdvanceDelayMs,
  occasionSelectionAnnouncement,
  shouldAutoplayOccasions,
  type OccasionPauseReason,
  type OccasionSelectionKind,
} from '@/lib/homepage/occasion-autoplay';
import type {
  HomepageOccasionIcon,
  HomepageOccasionSlides,
} from '@/lib/homepage/occasion-slides';

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
        .sort((a, b) => a.position - b.position),
    [slides],
  );
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [manualPause, setManualPause] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [timerRevision, setTimerRevision] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const selectionKind = useRef<OccasionSelectionKind | null>(null);
  const pointerSelection = useRef(false);
  const pointerClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialIndex = Math.max(
    0,
    enabledSlides.findIndex((slide) => slide.id === initialSlideId),
  );

  const pauseReasons = useMemo(() => {
    const reasons = new Set<OccasionPauseReason>();
    if (manualPause) reasons.add('manual');
    if (hovered) reasons.add('hover');
    if (focusWithin) reasons.add('focus');
    if (documentHidden) reasons.add('document-hidden');
    if (reducedMotion) reasons.add('reduced-motion');
    return reasons;
  }, [documentHidden, focusWithin, hovered, manualPause, reducedMotion]);
  const autoplay = shouldAutoplayOccasions(pauseReasons);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const update = () =>
      setDocumentHidden(document.visibilityState === 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!api) return;
    const selected = () => {
      const index = api.selectedScrollSnap();
      const kind = pointerSelection.current
        ? 'manual'
        : (selectionKind.current ?? 'automatic');
      setCurrent(index);
      setAnnouncement(
        occasionSelectionAnnouncement(
          index,
          enabledSlides.length,
          heading(enabledSlides, index),
          kind,
        ),
      );
      if (kind === 'manual') setTimerRevision((revision) => revision + 1);
      selectionKind.current = null;
      pointerSelection.current = false;
    };
    selected();
    api.on('select', selected);
    api.on('reInit', selected);
    return () => {
      api.off('select', selected);
      api.off('reInit', selected);
    };
  }, [api, enabledSlides]);

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
      selectionKind.current = 'manual';
      if (index === current) {
        setAnnouncement(
          occasionSelectionAnnouncement(
            index,
            enabledSlides.length,
            heading(enabledSlides, index),
            'manual',
          ),
        );
        setTimerRevision((revision) => revision + 1);
        selectionKind.current = null;
        return;
      }
      api.scrollTo(index);
    },
    [api, current, enabledSlides],
  );

  const move = useCallback(
    (direction: 'next' | 'previous', kind: OccasionSelectionKind) => {
      if (!api || enabledSlides.length < 2) return;
      selectionKind.current = kind;
      api.scrollTo(nextOccasionIndex(current, enabledSlides.length, direction));
    },
    [api, current, enabledSlides.length],
  );

  useEffect(() => {
    if (!api || enabledSlides.length < 2 || !autoplay) return;
    const timeout = window.setTimeout(
      () => move('next', 'automatic'),
      occasionAdvanceDelayMs(),
    );
    return () => window.clearTimeout(timeout);
  }, [api, autoplay, current, enabledSlides.length, move, timerRevision]);

  useEffect(
    () => () => {
      if (pointerClearTimer.current) clearTimeout(pointerClearTimer.current);
    },
    [],
  );

  if (!enabledSlides.length) return null;

  return (
    <section
      id="occasions"
      className="homepage-occasion-section"
      aria-label="Gifts for meaningful moments"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocusWithin(false);
      }}
    >
      <div className="homepage-occasion-pattern" aria-hidden="true">
        <Image
          src="/homepage/nepali-gift-pattern.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
      </div>
      <Carousel
        opts={{ loop: true, startIndex: initialIndex }}
        setApi={setApi}
        aria-label="Hastabazaar gifting stories"
        aria-roledescription="carousel"
        onPointerDown={() => {
          pointerSelection.current = true;
          if (pointerClearTimer.current)
            clearTimeout(pointerClearTimer.current);
        }}
        onPointerUp={() => {
          pointerClearTimer.current = setTimeout(() => {
            pointerSelection.current = false;
          }, 300);
        }}
        onPointerCancel={() => {
          pointerSelection.current = false;
        }}
        onKeyDownCapture={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move('previous', 'manual');
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            move('next', 'manual');
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

        {enabledSlides.length > 1 ? (
          <div
            className="homepage-occasion-controls"
            aria-label="Gifting carousel controls"
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => move('previous', 'manual')}
              aria-label="Previous gifting story"
            >
              <ChevronLeft />
            </Button>
            <div
              className="homepage-occasion-dots"
              aria-label="Choose gifting story"
            >
              {enabledSlides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Show slide ${index + 1}: ${heading(enabledSlides, index)}`}
                  aria-current={index === current ? 'true' : undefined}
                  onClick={() => selectManually(index)}
                >
                  <span aria-hidden="true" />
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => move('next', 'manual')}
              aria-label="Next gifting story"
            >
              <ChevronRight />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-pressed={manualPause}
              aria-label={
                manualPause ? 'Play gifting stories' : 'Pause gifting stories'
              }
              onClick={() => {
                setManualPause((value) => !value);
                setTimerRevision((revision) => revision + 1);
              }}
            >
              {manualPause ? <Play /> : <Pause />}
            </Button>
          </div>
        ) : null}
      </Carousel>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
