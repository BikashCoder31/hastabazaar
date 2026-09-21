'use client';

import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  HandHeart,
  Heart,
  Pause,
  Play,
  Sprout,
  UserRound,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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

function headingForAnnouncement(slides: HomepageHeroSlides, index: number): string {
  const slide = slides[index];
  return [slide?.headingLead, slide?.highlightedPhrase, slide?.headingTail]
    .filter(Boolean)
    .join(' ');
}

const heroPrinciples = [
  { icon: HandHeart, label: 'Authentic handmade' },
  { icon: UserRound, label: 'Support local makers' },
  { icon: Sprout, label: 'Thoughtful choices' },
  { icon: Heart, label: 'A stronger Nepal' },
] as const;

export function HomepageHeroCarousel({ slides }: { slides: HomepageHeroSlides }) {
  const enabledSlides = useMemo(
    () => [...slides].filter((slide) => slide.enabled).sort((a, b) => a.position - b.position),
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
    const update = () => setDocumentHidden(document.visibilityState === 'hidden');
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
        : selectionKind.current ?? 'automatic';
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
  }, [advanceAutomatically, api, autoplay, current, enabledSlides, timerRevision]);

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
      className="homepage-hero-carousel relative bg-[#f7f0e7]"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
    >
      <Carousel
        opts={{ loop: true }}
        setApi={setApi}
        aria-label="Featured Hastabazaar stories"
        aria-roledescription="carousel"
        onPointerDown={() => {
          pointerSelection.current = true;
          if (pointerClearTimer.current) clearTimeout(pointerClearTimer.current);
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
                <div className="mx-auto grid min-h-[36rem] max-w-[1600px] lg:grid-cols-[48%_52%]">
                  <div className="flex flex-col justify-center px-6 pb-28 pt-14 sm:px-10 lg:px-16 lg:pb-24 lg:pt-16 xl:px-24">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#996020] sm:text-sm">
                      {slide.eyebrow}
                    </p>
                    <h2 className="mt-5 max-w-3xl font-heading text-[clamp(3rem,6vw,6.8rem)] leading-[0.9] tracking-[-0.04em] text-[#0b3156]">
                      {slide.headingLead}{' '}
                      {slide.highlightedPhrase ? (
                        <em className="text-[#b61d2a]">{slide.highlightedPhrase}</em>
                      ) : null}{' '}
                      {slide.headingTail}
                    </h2>
                    <p className="mt-7 max-w-2xl text-base leading-7 text-[#536170] sm:text-lg sm:leading-8">
                      {slide.body}
                    </p>
                    <div className="mt-7 flex flex-wrap gap-3">
                      <Link
                        href={slide.primaryActionHref}
                        className="inline-flex min-h-12 items-center rounded-full bg-[#b81925] px-6 text-sm font-bold text-white transition hover:bg-[#971620] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b81925]"
                      >
                        {slide.primaryActionLabel} <span aria-hidden="true" className="ml-2">→</span>
                      </Link>
                      {slide.secondaryActionLabel && slide.secondaryActionHref ? (
                        <Link
                          href={slide.secondaryActionHref}
                          className="inline-flex min-h-12 items-center rounded-full border border-[#b81925] px-6 text-sm font-bold text-[#9d1721] transition hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b81925]"
                        >
                          {slide.secondaryActionLabel}
                        </Link>
                      ) : null}
                    </div>
                    <div
                      className="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#d9cbbb] pt-5 text-xs text-[#344255] sm:grid-cols-4"
                      aria-label="Why shop with us"
                    >
                      {heroPrinciples.map(({ icon: Icon, label }) => (
                        <div key={label} className="flex min-w-0 items-center gap-2">
                          <Icon aria-hidden="true" className="size-5 shrink-0 text-[#b81925]" />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="relative min-h-[26rem] overflow-hidden bg-[#ded4c7] lg:min-h-[36rem]">
                    {slide.mediaType === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element -- effective media uses an authorization-aware dynamic route.
                      <img
                        src={mediaUrl}
                        alt={slide.imageAlt ?? ''}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading={index === 0 ? 'eager' : 'lazy'}
                      />
                    ) : reducedMotion ? (
                      posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- dynamic poster route.
                        <img
                          src={posterUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : null
                    ) : (
                      <video
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
                        className="absolute inset-0 h-full w-full object-cover"
                        onEnded={advanceAutomatically}
                      />
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#071d35]/20 via-transparent to-transparent" />
                    {slide.imageNote ? (
                      <p className="absolute right-6 top-1/3 max-w-56 -rotate-3 whitespace-pre-line text-right font-heading text-xl font-semibold italic leading-tight text-[#0d3154] drop-shadow-[0_1px_0_rgba(255,255,255,0.8)] sm:text-2xl">
                        {slide.imageNote}
                      </p>
                    ) : null}
                  </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        <div className="absolute bottom-8 right-5 z-10 flex items-center gap-2 rounded-full bg-white/90 p-2 shadow-lg backdrop-blur sm:right-10 lg:right-16">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full"
            onClick={() => manualDirection('previous')}
            aria-label="Previous featured story"
          >
            <ChevronLeft />
          </Button>
          <div className="flex gap-1" aria-label="Choose featured story">
            {enabledSlides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={
                  index === current
                    ? 'grid size-8 place-items-center rounded-full bg-[#0d3154] text-xs font-bold text-white'
                    : 'grid size-8 place-items-center rounded-full text-xs font-bold text-[#526170] hover:bg-[#e9e1d7]'
                }
                aria-label={`Show slide ${index + 1}: ${headingForAnnouncement(enabledSlides, index)}`}
                aria-current={index === current ? 'true' : undefined}
                onClick={() => selectManually(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full"
            onClick={() => manualDirection('next')}
            aria-label="Next featured story"
          >
            <ChevronRight />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full"
            aria-pressed={manualPause}
            aria-label={manualPause ? 'Play featured stories' : 'Pause featured stories'}
            onClick={() => {
              setManualPause((value) => !value);
              setTimerRevision((value) => nextHeroTimerRevision(value, 'manual'));
            }}
          >
            {manualPause ? <Play /> : <Pause />}
          </Button>
        </div>
      </Carousel>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
