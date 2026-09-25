import { cn } from '@/lib/utils';

export type MediaMode = 'cover' | 'contain' | 'natural';

export const mediaSizes = {
  // .shell: 1440px cap; 40/64/96px horizontal padding at base/sm/lg.
  editorial:
    '(min-width: 1440px) 724.68px, (min-width: 1024px) calc(54vw - 52.92px), (min-width: 640px) calc(100vw - 66px), calc(100vw - 42px)',
  occasion: '100vw',
  productSlider:
    '(min-width: 1440px) 318px, (min-width: 1024px) calc(25vw - 42px), (min-width: 640px) calc(42vw - 26.88px), calc(78vw - 31.2px)',
  // New arrivals: min(94vw, 1680px) shell, five columns at 1536px.
  productSliderWide:
    '(min-width: 1788px) 297.6px, (min-width: 1536px) calc(18.8vw - 38.4px), (min-width: 1024px) calc(23.5vw - 42px), (min-width: 640px) calc(39.48vw - 26.88px), calc(73.32vw - 31.2px)',
  // Recently viewed: 1 / 2 / 4 columns, 24px gaps, four columns at lg.
  productGrid:
    '(min-width: 1440px) 318px, (min-width: 1024px) calc(25vw - 42px), (min-width: 640px) calc(50vw - 44px), calc(100vw - 40px)',
  // Shop reserves a 288px filter rail and a 32px gap from lg onward.
  shopGrid:
    '(min-width: 1440px) 328px, (min-width: 1280px) calc((100vw - 456px) / 3), (min-width: 1024px) calc(50vw - 218px), (min-width: 640px) calc(50vw - 42px), calc(50vw - 28px)',
  productGallery:
    '(min-width: 1440px) 672px, (min-width: 1280px) calc(52.5vw - 84px), (min-width: 1024px) calc(52.5vw - 71.4px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)',
  galleryThumbnail:
    '(min-width: 1440px) 124.8px, (min-width: 1280px) calc(10.5vw - 26.4px), (min-width: 1024px) calc(10.5vw - 23.88px), (min-width: 640px) calc(20vw - 22.4px), calc(20vw - 14.4px)',
  // Account reserves a 248px navigation rail and a 32px gap at lg.
  savedProduct:
    '(min-width: 1440px) calc(1024px / 3), (min-width: 1280px) calc((100vw - 416px) / 3), (min-width: 1024px) calc(50vw - 198px), (min-width: 640px) calc(50vw - 42px), calc(100vw - 40px)',
  cartThumbnail: '(min-width: 640px) 128px, 80px',
  reviewAttachment: '96px',
  adminThumbnail: '96px',
  brandMark: '48px',
  footerLogo: '208px',
  qr: '192px',
  makerGrid:
    '(min-width: 1440px) 318px, (min-width: 1280px) calc(25vw - 42px), (min-width: 1024px) calc((100vw - 144px) / 3), (min-width: 640px) calc(50vw - 44px), calc(100vw - 40px)',
  notFound:
    '(min-width: 1440px) 716.8px, (min-width: 1024px) calc(56vw - 89.6px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)',
} as const;

export type MediaSizePurpose = keyof typeof mediaSizes;

export function mediaFrameClass(mode: MediaMode, className?: string): string {
  return cn('media-frame', `media-frame-${mode}`, className);
}

export function mediaObjectClass(mode: MediaMode, className?: string): string {
  return cn('media-object', `media-object-${mode}`, className);
}
