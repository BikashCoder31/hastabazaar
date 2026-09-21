import { cn } from '@/lib/utils';

export type MediaMode = 'cover' | 'contain' | 'natural';

export const mediaSizes = {
  editorial: '(min-width: 1440px) 744px, (min-width: 1024px) 52vw, 100vw',
  occasion: '100vw',
  productSlider:
    '(min-width: 1536px) 302px, (min-width: 1024px) 23vw, (min-width: 640px) 42vw, 78vw',
  productGrid: '(min-width: 1280px) 22vw, (min-width: 640px) 46vw, 100vw',
  shopGrid: '(min-width: 1280px) 29vw, (min-width: 640px) 46vw, 46vw',
  productGallery: '(min-width: 1440px) 676px, (min-width: 1024px) 52vw, 100vw',
  galleryThumbnail: '(min-width: 1024px) 10vw, 18vw',
  savedProduct: '(min-width: 1280px) 25vw, (min-width: 640px) 46vw, 100vw',
  cartThumbnail: '(min-width: 640px) 128px, 80px',
  reviewAttachment: '96px',
  adminThumbnail: '96px',
  brandMark: '48px',
  footerLogo: '208px',
  qr: '192px',
  makerGrid: '(min-width: 1280px) 22vw, (min-width: 640px) 46vw, 100vw',
  notFound: '(min-width: 1440px) 720px, (min-width: 1024px) 52vw, 100vw',
} as const;

export type MediaSizePurpose = keyof typeof mediaSizes;

export function mediaFrameClass(mode: MediaMode, className?: string): string {
  return cn('media-frame', `media-frame-${mode}`, className);
}

export function mediaObjectClass(mode: MediaMode, className?: string): string {
  return cn('media-object', `media-object-${mode}`, className);
}
