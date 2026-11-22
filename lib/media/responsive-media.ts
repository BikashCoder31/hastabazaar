import { cn } from '@/lib/utils';

export type MediaMode = 'cover' | 'contain' | 'natural';

export const mediaSizes = {
  // .shell: 1440px cap; clamp(12px, 5vw, 32px) gutters, 48px at lg.
  // Below 300px the shell fixes each gutter at 12px.
  editorial:
    '(min-width: 1600px) 691.2px, (min-width: 1440px) calc((1344px - clamp(32px, 4vw, 64px)) * 0.54), (min-width: 1024px) calc((100vw - 96px - clamp(32px, 4vw, 64px)) * 0.54), (min-width: 300px) calc(100vw - 2 * clamp(12px, 5vw, 32px)), calc(100vw - 24px)',
  occasion: '100vw',
  productSlider:
    '(min-width: 1440px) 318px, (min-width: 1024px) calc(25vw - 42px), (min-width: 640px) calc(42vw - 26.88px), (min-width: 300px) calc((100vw - 2 * clamp(12px, 5vw, 32px)) * 0.78), calc(78vw - 18.72px)',
  // New arrivals: min(100%, 1680px) shell, five columns at 1536px.
  productSliderWide:
    '(min-width: 1680px) 297.6px, (min-width: 1536px) calc(20vw - 38.4px), (min-width: 1024px) calc(25vw - 42px), (min-width: 640px) calc(42vw - 26.88px), (min-width: 300px) calc((100vw - 2 * clamp(12px, 5vw, 32px)) * 0.78), calc(78vw - 18.72px)',
  // Recently viewed: 1 / 2 / 4 columns, 24px gaps, four columns at lg.
  productGrid:
    '(min-width: 1440px) 318px, (min-width: 1024px) calc(25vw - 42px), (min-width: 640px) calc(50vw - 44px), (min-width: 300px) calc(100vw - 2 * clamp(12px, 5vw, 32px)), calc(100vw - 24px)',
  // Shop and related products share two columns until lg and a 1264px cap.
  shopGrid:
    '(min-width: 1360px) 301px, (min-width: 1024px) calc((100vw - 156px) / 4), (min-width: 768px) calc((100vw - 116px) / 2), calc((100vw - 48px) / 2)',
  // Use the full gallery width for a product with a single photo.
  productGallery:
    '(min-width: 1360px) calc(1200px * 23 / 43), (min-width: 1280px) calc((100vw - 160px) * 23 / 43), (min-width: 768px) calc((100vw - 128px) * 23 / 43), calc(100vw - 32px)',
  galleryThumbnail:
    '(min-width: 1280px) 84px, (min-width: 768px) 64px, calc((100vw - 64px) / 5)',
  // Account reserves 280px for navigation and its gap at lg. Saved cards use four columns at xl.
  savedProduct:
    '(min-width: 1360px) 234px, (min-width: 1280px) 210px, (min-width: 1264px) 436px, (min-width: 1024px) calc((100vw - 392px) / 2), (min-width: 768px) calc((100vw - 112px) / 2), (min-width: 640px) calc((100vw - 48px) / 2), calc((100vw - 44px) / 2)',
  cartThumbnail: '(min-width: 640px) 88px, 72px',
  reviewAttachment: '96px',
  adminThumbnail: '96px',
  brandMark: '48px',
  footerLogo: '208px',
  qr: '192px',
  makerGrid:
    '(min-width: 1440px) 318px, (min-width: 1280px) calc(25vw - 42px), (min-width: 1024px) calc((100vw - 144px) / 3), (min-width: 640px) calc(50vw - 44px), (min-width: 300px) calc(100vw - 2 * clamp(12px, 5vw, 32px)), calc(100vw - 24px)',
  notFound:
    '(min-width: 1440px) 716.8px, (min-width: 1024px) calc(56vw - 89.6px), (min-width: 640px) calc(100vw - 64px), (min-width: 300px) calc(100vw - 2 * clamp(12px, 5vw, 32px)), calc(100vw - 24px)',
} as const;

export type MediaSizePurpose = keyof typeof mediaSizes;

export function mediaFrameClass(mode: MediaMode, className?: string): string {
  return cn('media-frame', `media-frame-${mode}`, className);
}

export function mediaObjectClass(mode: MediaMode, className?: string): string {
  return cn('media-object', `media-object-${mode}`, className);
}
