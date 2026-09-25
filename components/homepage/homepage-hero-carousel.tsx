'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import {
  heroAdvanceDelayMs,
  heroSelectionAnnouncement,
  nextHeroIndex,
  nextHeroTimerRevision,
  shouldAutoplayHero,
  type HeroPauseReason,
  type HeroSelectionKind,
} from '@/lib/homepage/hero-autoplay';
import type { HomepageHeroSlides } from '@/lib/homepage/hero-slides';
import { HomepageHeroCopy } from '@/components/homepage/homepage-hero-copy';
import {
  heroLayoutClass,
  heroMediaVisualClass,
  heroNoteClass,
} from '@/lib/homepage/hero-presentation';
import {
  mediaFrameClass,
  mediaObjectClass,
} from '@/lib/media/responsive-media';

function headingForAnnouncement(
  slides: HomepageHeroSlides,
  index: number,
): string {
  const slide = slides[index];
  return [slide?.headingLead, slide?.highlightedPhrase, slide?.headingTail]
    .filter(Boolean)
    .join(' ');
}

const heroMediaClass = mediaObjectClass('cover', heroMediaVisualClass);

export function HomepageHeroCarousel({
  slides,
}: {
  slides: HomepageHeroSlides;
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
  const selectionKind = useRef<HeroSelectionKind | null>(null);
  const pointerSelection = useRef(false);
  const pointerClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceGuard = useRef(false);
  const videos = useRef(new Map<number, HTMLVideoElement>());

  const pauseReasons = useMemo(() => {
    const reasons = new Set<HeroPauseReason>();
    if (manualPause) reasons.add('manual');
    if (hovered) reasons.add('hover');
    if (focusWithin) reasons.add('focus');
    if (documentHidden) reasons.add('document-hidden');
    if (reducedMotion) reasons.add('reduced-motion');
    return reasons;
  }, [documentHidden, focusWithin, hovered, manualPause, reducedMotion]);
  const autoplay = shouldAutoplayHero(pauseReasons);

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
        heroSelectionAnnouncement(
          index,
          enabledSlides.length,
          headingForAnnouncement(enabledSlides, index),
          kind,
        ),
      );
      setTimerRevision((value) => nextHeroTimerRevision(value, kind));
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

  const selectManually = useCallback(
    (index: number) => {
      if (!api || !enabledSlides.length) return;
      selectionKind.current = 'manual';
      if (index === current) {
        setAnnouncement(
          heroSelectionAnnouncement(
            index,
            enabledSlides.length,
            headingForAnnouncement(enabledSlides, index),
            'manual',
          ),
        );
        setTimerRevision((value) => nextHeroTimerRevision(value, 'manual'));
        selectionKind.current = null;
        return;
      }
      api.scrollTo(index);
    },
    [api, current, enabledSlides],
  );

  const advanceAutomatically = useCallback(() => {
    if (!api || enabledSlides.length < 2 || advanceGuard.current) return;
    advanceGuard.current = true;
    selectionKind.current = 'automatic';
    api.scrollTo(nextHeroIndex(current, enabledSlides.length, 'next'));
  }, [api, current, enabledSlides.length]);

  useEffect(() => {
    advanceGuard.current = false;
    if (!api || enabledSlides.length < 2 || !autoplay) return;
    const timeout = window.setTimeout(
      advanceAutomatically,
      heroAdvanceDelayMs(enabledSlides[current]?.mediaType ?? 'image'),
    );
    return () => window.clearTimeout(timeout);
  }, [
    advanceAutomatically,
    api,
    autoplay,
    current,
    enabledSlides,
    timerRevision,
  ]);

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (index !== current) {
        video.pause();
        video.currentTime = 0;
      } else if (autoplay) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [autoplay, current]);

  useEffect(
    () => () => {
      if (pointerClearTimer.current) clearTimeout(pointerClearTimer.current);
    },
    [],
  );

  if (!enabledSlides.length) return null;

  function manualDirection(direction: 'next' | 'previous') {
    selectManually(nextHeroIndex(current, enabledSlides.length, direction));
  }

  return (
    <section
      className="homepage-hero-carousel relative bg-[#f2ebe1]"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocusWithin(false);
      }}
    >
      <Carousel
        opts={{ loop: true }}
        setApi={setApi}
        aria-label="Featured Hastabazaar stories"
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
            manualDirection('previous');
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            manualDirection('next');
          }
        }}
      >
        <CarouselContent className="!ml-0">
          {enabledSlides.map((slide, index) => {
            const mediaUrl = `/api/homepage/hero-media/${encodeURIComponent(slide.mediaId)}`;
            const posterUrl = slide.posterMediaId
              ? `/api/homepage/hero-media/${encodeURIComponent(slide.posterMediaId)}`
              : undefined;
            return (
              <CarouselItem
                key={slide.id}
                className="!pl-0"
                aria-label={`Slide ${index + 1} of ${enabledSlides.length}`}
              >
                <div className="@container/hero w-full">
                  <div className={heroLayoutClass}>
                    <HomepageHeroCopy slide={slide} LinkComponent={Link} />
                    <div
                      data-media-frame="cover"
                      className={mediaFrameClass(
                        'cover',
                        'aspect-[4/3] min-h-0 bg-[#75695f] @[640px]/hero:aspect-[8/5] @[1024px]/hero:aspect-auto @[1024px]/hero:min-h-[clamp(32rem,42cqw,40rem)]',
                      )}
                    >
                      {slide.mediaType === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element -- effective media uses an authorization-aware dynamic route.
                        <img
                          data-media-mode="cover"
                          src={mediaUrl}
                          alt={slide.imageAlt ?? ''}
                          className={heroMediaClass}
                          loading={index === 0 ? 'eager' : 'lazy'}
                        />
                      ) : reducedMotion ? (
                        posterUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- dynamic poster route.
                          <img
                            data-media-mode="cover"
                            src={posterUrl}
                            alt=""
                            className={heroMediaClass}
                            loading={index === 0 ? 'eager' : 'lazy'}
                          />
                        ) : null
                      ) : (
                        <video
                          data-media-mode="cover"
                          ref={(element) => {
                            if (element) videos.current.set(index, element);
                            else videos.current.delete(index);
                          }}
                          src={mediaUrl}
                          poster={posterUrl}
                          muted
                          playsInline
                          preload={index === current ? 'metadata' : 'none'}
                          aria-label={slide.videoDescription ?? undefined}
                          className={heroMediaClass}
                          onEnded={advanceAutomatically}
                        />
                      )}
                      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-tr from-[#071d35]/25 via-[#102b43]/5 to-[#5a3824]/10" />
                      {slide.imageNote ? (
                        <p className={heroNoteClass}>{slide.imageNote}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        <div className="absolute bottom-6 right-5 z-10 flex items-center gap-1 rounded-full border border-[#cbbda9]/80 bg-[#e9e0d4]/95 p-1.5 shadow-[0_12px_30px_rgba(32,41,48,0.16)] backdrop-blur-md sm:right-10 lg:bottom-7 lg:right-14">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 rounded-full text-[#173c5b] hover:bg-[#d8cbb9]/70"
            onClick={() => manualDirection('previous')}
            aria-label="Previous featured story"
          >
            <ChevronLeft />
          </Button>
          <div
            className="flex items-center gap-1 px-1"
            aria-label="Choose featured story"
          >
            {enabledSlides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className="homepage-hero-dot grid size-8 place-items-center rounded-full transition hover:bg-[#d8cbb9]/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0d3154]"
                aria-label={`Show slide ${index + 1}: ${headingForAnnouncement(enabledSlides, index)}`}
                aria-current={index === current ? 'true' : undefined}
                onClick={() => selectManually(index)}
              >
                <span
                  aria-hidden="true"
                  className={
                    index === current
                      ? 'size-3 rounded-full bg-[#0d3154] shadow-[0_0_0_3px_rgba(13,49,84,0.12)]'
                      : 'size-2 rounded-full bg-[#7f8a90]'
                  }
                />
                <span className="sr-only">{index + 1}</span>
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 rounded-full text-[#173c5b] hover:bg-[#d8cbb9]/70"
            onClick={() => manualDirection('next')}
            aria-label="Next featured story"
          >
            <ChevronRight />
          </Button>
          <div className="ml-1 border-l border-[#c5b7a4] pl-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 rounded-full text-[#173c5b] hover:bg-[#d8cbb9]/70"
              aria-pressed={manualPause}
              aria-label={
                manualPause ? 'Play featured stories' : 'Pause featured stories'
              }
              onClick={() => {
                setManualPause((value) => !value);
                setTimerRevision((value) =>
                  nextHeroTimerRevision(value, 'manual'),
                );
              }}
            >
              {manualPause ? <Play /> : <Pause />}
            </Button>
          </div>
        </div>
      </Carousel>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
