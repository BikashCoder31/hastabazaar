'use client';

import { useEffect, useRef, useState } from 'react';
import type { HomepageHeroSlide } from '@/lib/homepage/hero-slides';
import {
  heroLayoutClass,
  heroMediaVisualClass,
  heroNoteClass,
  heroPreviewWidths,
} from '@/lib/homepage/hero-presentation';
import { HomepageHeroCopy } from '@/components/homepage/homepage-hero-copy';
import {
  mediaFrameClass,
  mediaObjectClass,
} from '@/lib/media/responsive-media';

export function HomepageHeroPreview({
  slide,
  mode,
}: {
  slide: HomepageHeroSlide;
  mode: 'desktop' | 'mobile';
}) {
  const viewport = heroPreviewWidths[mode];
  const container = useRef<HTMLDivElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = container.current;
    const content = layout.current;
    if (!element || !content) return;
    const measure = () =>
      setGeometry({ width: element.clientWidth, height: content.offsetHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [viewport]);
  const scale = Math.min(1, geometry.width / viewport);
  const mediaUrl = slide.mediaId
    ? `/api/admin/homepage/hero-media/${encodeURIComponent(slide.mediaId)}`
    : '';
  const posterUrl = slide.posterMediaId
    ? `/api/admin/homepage/hero-media/${encodeURIComponent(slide.posterMediaId)}`
    : undefined;
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        {mode === 'desktop' ? 'Desktop' : 'Mobile'} layout at {viewport}px,
        scaled to fit.
      </p>
      <div
        ref={container}
        className="min-w-0 overflow-hidden rounded-2xl border bg-[#f7f0e7] shadow-sm"
        style={{ height: geometry.height * scale + 2 }}
      >
        <div
          ref={layout}
          data-hero-preview-viewport={viewport}
          className="@container/hero mx-auto"
          style={{
            width: viewport,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <div className={heroLayoutClass}>
            <HomepageHeroCopy slide={slide} preview />
            <div className="homepage-hero-visual">
              <div
                data-media-frame="cover"
                className={mediaFrameClass('cover', 'homepage-hero-frame')}
              >
                {mediaUrl && slide.mediaType === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated preview URL is dynamic.
                  <img
                    data-media-mode="cover"
                    src={mediaUrl}
                    alt={slide.imageAlt || ''}
                    className={mediaObjectClass('cover', heroMediaVisualClass)}
                  />
                ) : null}
                {mediaUrl && slide.mediaType === 'video' ? (
                  <video
                    data-media-mode="cover"
                    src={mediaUrl}
                    poster={posterUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    aria-label={
                      slide.videoDescription || 'Homepage hero video preview'
                    }
                    className={mediaObjectClass('cover', heroMediaVisualClass)}
                  />
                ) : null}
                {!mediaUrl ? (
                  <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[#687483]">
                    Select an image or video to preview this slide.
                  </div>
                ) : null}
                <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-tr from-[#071d35]/25 via-[#102b43]/5 to-[#5a3824]/10" />
              </div>
              {slide.imageNote ? (
                <p className={heroNoteClass}>{slide.imageNote}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
