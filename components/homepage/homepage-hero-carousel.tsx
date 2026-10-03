'use client';

import Link from 'next/link';
import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { SliderDots } from '@/components/ui/slider-dots';
import { useSliderAutoplay } from '@/lib/homepage/slider-autoplay';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import {
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
        .map(presentHomepageHeroSlide)
        .sort((a, b) => a.position - b.position),
    [slides],
  );
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const videos = useRef(new Map<number, HTMLVideoElement>());
  const [playingVideo, setPlayingVideo] = useState<number | null>(null);
  const {
    reset: resetAutoplay,
    selectionKind,
    interactionProps,
    pausedByUser,
    toggleUserPause,
  } = useSliderAutoplay(api, enabledSlides.length, playingVideo !== null);

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

  if (!enabledSlides.length) return null;

  function manualDirection(direction: 'next' | 'previous') {
    selectManually(nextHeroIndex(current, enabledSlides.length, direction));
  }

  return (
    <section
      className="homepage-hero-carousel relative bg-[#f2ebe1]"
      {...interactionProps}
    >
      <Carousel
        className="pb-14"
        opts={{ loop: true }}
        setApi={setApi}
        aria-label="Featured Hastabazaar stories"
        aria-roledescription="carousel"
        onKeyDownCapture={(event) => {
          if (
            (event.target as HTMLElement).closest('video, [data-slider-dots], [data-hero-autoplay]')
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
                    <HomepageHeroCopy slide={slide} LinkComponent={Link} />
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
                          // eslint-disable-next-line @next/next/no-img-element -- effective media uses an authorization-aware dynamic route.
                          <img
                            data-media-mode="cover"
                            src={mediaUrl}
                            alt={slide.imageAlt ?? ''}
                            className={heroMediaClass}
                            loading={index === 0 ? 'eager' : 'lazy'}
                          />
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
                        {!isNativeSellerRegistrationSlide(slide) ? <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-tr from-[#071d35]/25 via-[#102b43]/5 to-[#5a3824]/10" /> : null}
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

        <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-3">
          <SliderDots
            label="Choose featured story"
            labels={enabledSlides.map(
              (_, index) =>
                `Show slide ${index + 1}: ${headingForAnnouncement(enabledSlides, index)}`,
            )}
            current={current}
            onSelect={selectManually}
            dotClassName="homepage-hero-dot"
            className="!w-auto"
          />
          {enabledSlides.length > 1 ? (
            <button
              data-hero-autoplay
              type="button"
              aria-label={pausedByUser ? 'Resume automatic slide changes' : 'Pause automatic slide changes'}
              onClick={toggleUserPause}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[#0d3154] hover:bg-[#0d3154]/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0d3154]"
            >
              {pausedByUser ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
              {pausedByUser ? 'Resume' : 'Pause'}
            </button>
          ) : null}
        </div>
      </Carousel>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
