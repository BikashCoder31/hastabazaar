'use client';

import { ParallaxImage } from './parallax-image';

import Link from 'next/link';
import { Banknote, CircleHelp, Pause, Play, RotateCcw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSliderAutoplay } from '@/lib/homepage/slider-autoplay';
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
} from '@/lib/homepage/hero-autoplay';
import { presentHomepageHeroSlide, isNativeSellerRegistrationSlide, type HomepageHeroSlides } from '@/lib/homepage/hero-slides';
import { SellerRegistrationPanel } from '@/components/homepage/seller-registration-panel';
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
import styles from './homepage-hero.module.css';

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

const shortLabels: Record<string, string> = {
  'hero-nepal-craft': 'Thoughtful finds',
  'hero-maker-stories': 'Closer look',
  'hero-meaningful-gifts': 'Gifting',
};

export function HomepageHeroCarousel({
  slides,
  returnDays,
}: {
  slides: HomepageHeroSlides;
  returnDays?: number;
}) {
  const enabledSlides = useMemo(
    () =>
      [...slides]
        .filter((slide) => slide.enabled)
        .map(presentHomepageHeroSlide)
        .sort((a, b) => a.position - b.position),
    [slides],
  );
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const hero = useRef<HTMLElement>(null);
  const videos = useRef(new Map<number, HTMLVideoElement>());
  const [playingVideo, setPlayingVideo] = useState<number | null>(null);
  const {
    reset: resetAutoplay,
    selectionKind,
    paused,
    pausedByUser,
    progress,
    toggleUserPause,
    interactionProps,
  } = useSliderAutoplay(api, enabledSlides.length, playingVideo !== null, {
    delayMs: heroAdvanceDelayMs('image'),
    manualHoldMs: 12_000,
    pauseOnPointerFocus: false,
    trackProgress: true,
  });

  useEffect(() => {
    if (!api) return;
    const selected = () => {
      const index = api.selectedScrollSnap();
      setCurrent(index);
      setAnnouncement(
        heroSelectionAnnouncement(
          index,
          enabledSlides.length,
          headingForAnnouncement(enabledSlides, index),
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

  const selectManually = useCallback(
    (index: number) => {
      if (!api || !enabledSlides.length) return;
      resetAutoplay();
      if (index === current) {
        setAnnouncement(
          heroSelectionAnnouncement(
            index,
            enabledSlides.length,
            headingForAnnouncement(enabledSlides, index),
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

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (index !== current) {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [current]);

  useEffect(() => {
    const region = hero.current;
    const activeSlide = region?.querySelector('[data-slot="carousel-item"]:not([inert])');
    const intro = activeSlide?.querySelector('.homepage-hero-intro');
    const details = activeSlide?.querySelector('.homepage-hero-details');
    const actions = details?.querySelector('.homepage-hero-actions');
    if (!region || !intro || !details || !actions) return;

    const align = () => {
      const endOfCopy = actions.getBoundingClientRect().bottom - region.getBoundingClientRect().top;
      region.style.setProperty('--hero-controls-top', `${endOfCopy + 32}px`);
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(intro);
    observer.observe(details);
    return () => observer.disconnect();
  }, [current, enabledSlides]);

  if (!enabledSlides.length) return null;

  function manualDirection(direction: 'next' | 'previous') {
    selectManually(nextHeroIndex(current, enabledSlides.length, direction));
  }

  const benefits = [
    { Icon: Banknote, label: 'Pay on delivery' },
    { Icon: ShieldCheck, label: 'Reviewed sellers' },
    { Icon: RotateCcw, label: returnDays === undefined ? 'Returns' : `${returnDays}-day returns`, href: '/returns' },
    { Icon: CircleHelp, label: 'Help after delivery', href: '/help' },
  ];

  return (
    <section
      ref={hero}
      className={`homepage-hero-carousel ${styles.hero}`}
      {...interactionProps}
    >
      <Carousel
        opts={{ loop: true }}
        setApi={setApi}
        aria-label="Featured Hastabazaar stories"
        aria-roledescription="carousel"
        onKeyDownCapture={(event) => {
          if (
            (event.target as HTMLElement).closest('video, [data-hero-controls]')
          )
            return;
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
                aria-hidden={index === current ? undefined : true}
                inert={index === current ? undefined : true}
              >
                <div className="@container/hero w-full">
                  <div className={heroLayoutClass}>
                    <HomepageHeroCopy slide={slide} LinkComponent={Link} showBenefits={isNativeSellerRegistrationSlide(slide)} />
                    <div className="homepage-hero-visual">
                      <div
                        data-media-frame="cover"
                        className={mediaFrameClass(
                          'cover',
                          'homepage-hero-frame',
                        )}
                      >
                        {isNativeSellerRegistrationSlide(slide) ? (
                          <SellerRegistrationPanel />
                        ) : slide.mediaType === 'image' ? (
                          <ParallaxImage kind="hero" enabled={index === current}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- effective media uses an authorization-aware dynamic route. */}
                            <img
                              data-media-mode="cover"
                              src={mediaUrl}
                              alt={slide.imageAlt ?? ''}
                              className={heroMediaClass}
                              loading={index === 0 ? 'eager' : 'lazy'}
                            />
                          </ParallaxImage>
                        ) : (
                          <video
                            data-media-mode="cover"
                            ref={(element) => {
                              if (element) videos.current.set(index, element);
                              else videos.current.delete(index);
                            }}
                            src={mediaUrl}
                            poster={posterUrl}
                            controls
                            onPlay={() => setPlayingVideo(index)}
                            onPause={() =>
                              setPlayingVideo((playing) =>
                                playing === index ? null : playing,
                              )
                            }
                            onEnded={() =>
                              setPlayingVideo((playing) =>
                                playing === index ? null : playing,
                              )
                            }
                            muted
                            playsInline
                            preload={index === current ? 'metadata' : 'none'}
                            aria-label={slide.videoDescription ?? undefined}
                            className={heroMediaClass}
                          />
                        )}
                      </div>
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

        <div className={styles.controls}>
          {enabledSlides.length > 1 ? (
            <div className={styles.picker} data-hero-controls>
              <fieldset className={styles.stories} data-slider-dots>
                <legend className="sr-only">Choose featured story</legend>
                {enabledSlides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    aria-label={`Show slide ${index + 1}: ${headingForAnnouncement(enabledSlides, index)}`}
                    aria-current={index === current ? 'true' : undefined}
                    onClick={() => selectManually(index)}
                    onKeyDown={event => {
                      const direction = event.key === 'ArrowRight' ? 'next' : event.key === 'ArrowLeft' ? 'previous' : null;
                      if (!direction) return;
                      event.preventDefault();
                      const next = nextHeroIndex(index, enabledSlides.length, direction);
                      selectManually(next);
                      event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
                    }}
                    className={styles.story}
                  >
                    <span className={styles.track} aria-hidden="true">
                      {index === current ? (
                        <span
                          key={progress.cycle}
                          className={styles.fill}
                          style={{ animationDuration: `${progress.duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                        />
                      ) : null}
                    </span>
                    <span className={styles.label}>{shortLabels[slide.id] ?? slide.eyebrow}</span>
                  </button>
                ))}
              </fieldset>
              <button
                type="button"
                data-autoplay-toggle
                aria-label={pausedByUser ? 'Play featured stories' : 'Pause featured stories'}
                onClick={toggleUserPause}
                className={styles.pause}
              >
                {pausedByUser ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              </button>
            </div>
          ) : null}
          <ul aria-label="Why shop with us" className={styles.benefits}>
            {benefits.map(({ Icon, label, href }) => (
              <li key={label}>
                <Icon size={16} aria-hidden="true" />
                {href ? <Link href={href}>{label}</Link> : label}
              </li>
            ))}
          </ul>
        </div>
      </Carousel>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
