import type { HomepageHeroSlide } from '@/lib/homepage/hero-slides';
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
  const mediaUrl = slide.mediaId
    ? `/api/admin/homepage/hero-media/${encodeURIComponent(slide.mediaId)}`
    : '';
  const posterUrl = slide.posterMediaId
    ? `/api/admin/homepage/hero-media/${encodeURIComponent(slide.posterMediaId)}`
    : undefined;
  return (
    <div
      className={
        mode === 'mobile'
          ? 'mx-auto grid w-full min-w-0 max-w-sm overflow-hidden rounded-2xl border bg-[#f7f0e7] shadow-sm'
          : 'grid min-w-0 overflow-hidden rounded-2xl border bg-[#f7f0e7] shadow-sm lg:grid-cols-[minmax(0,48%)_minmax(0,52%)]'
      }
    >
      <div className="flex flex-col justify-center p-6 lg:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#9b5b1b]">
          {slide.eyebrow || 'Eyebrow preview'}
        </p>
        <h3 className="mt-3 font-heading text-3xl leading-[1.02] text-[#0d3154] lg:text-5xl">
          {slide.headingLead || 'Headline'}{' '}
          {slide.highlightedPhrase ? (
            <em className="text-[#b51f2c]">{slide.highlightedPhrase}</em>
          ) : null}{' '}
          {slide.headingTail}
        </h3>
        <p className="mt-4 text-sm leading-6 text-[#536170]">
          {slide.body || 'Slide description will appear here.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-[#b71924] px-4 py-2 text-sm font-semibold text-white">
            {slide.primaryActionLabel || 'Primary action'}
          </span>
          {slide.secondaryActionLabel ? (
            <span className="rounded-full border border-[#b71924] px-4 py-2 text-sm font-semibold text-[#9f151f]">
              {slide.secondaryActionLabel}
            </span>
          ) : null}
        </div>
      </div>
      <div
        data-media-frame="cover"
        className={mediaFrameClass(
          'cover',
          mode === 'mobile'
            ? 'aspect-[4/3] min-h-0 bg-[#e7dccd]'
            : 'aspect-[4/3] min-h-0 bg-[#e7dccd] sm:aspect-[8/5] lg:aspect-auto lg:min-h-[clamp(32rem,42vw,40rem)]',
        )}
      >
        {mediaUrl && slide.mediaType === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated preview URL is dynamic.
          <img
            data-media-mode="cover"
            src={mediaUrl}
            alt={slide.imageAlt || ''}
            className={mediaObjectClass('cover', 'absolute inset-0')}
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
            aria-label={slide.videoDescription || 'Homepage hero video preview'}
            className={mediaObjectClass('cover', 'absolute inset-0')}
          />
        ) : null}
        {!mediaUrl ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[#687483]">
            Select an image or video to preview this slide.
          </div>
        ) : null}
        {slide.imageNote ? (
          <p className="absolute bottom-4 right-4 max-w-44 whitespace-pre-line rounded-xl bg-white/85 px-3 py-2 text-right font-heading text-sm text-[#17395e] shadow-sm backdrop-blur">
            {slide.imageNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}
