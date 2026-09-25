'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

export function ProductGallery({
  media: allMedia,
  productName,
}: {
  media: readonly { id: string; altEn: string; mimeType?: string }[];
  productName: string;
}) {
  const media = allMedia.filter((item) => item.mimeType !== 'video/mp4');
  const videos = allMedia.filter((item) => item.mimeType === 'video/mp4');
  const [activeIndex, setActiveIndex] = useState(0);
  const active = media[activeIndex] ?? media[0];
  return (
    <div className="min-w-0">
      {active ? (
        <div
          data-media-frame="contain"
          className={mediaFrameClass(
            'contain',
            'aspect-square rounded-3xl border bg-card',
          )}
        >
          <Image
            key={active.id}
            src={'/api/product-media/' + active.id}
            alt={active.altEn || productName}
            data-media-mode="contain"
            fill
            priority
            unoptimized
            sizes={mediaSizes.productGallery}
            style={{ objectFit: 'contain' }}
            className={mediaObjectClass('contain')}
          />
          <span
            className="absolute bottom-4 right-4 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-semibold"
            aria-live="polite"
          >
            Photo {Math.min(activeIndex + 1, media.length)} of {media.length}
          </span>
        </div>
      ) : (
        <div className="flex aspect-square flex-col items-center justify-center gap-4 rounded-3xl bg-muted text-muted-foreground">
          <ImageIcon className="size-10" />
          <p>Photos coming soon</p>
        </div>
      )}
      {media.length > 1 ? (
        <div
          className="mt-4 grid grid-cols-5 gap-2 sm:gap-3"
          aria-label="Product photos"
        >
          {media.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              data-media-frame="cover"
              onClick={() => setActiveIndex(index)}
              aria-label={'Show photo ' + (index + 1) + ' of ' + productName}
              aria-pressed={active.id === photo.id}
              className={mediaFrameClass(
                'cover',
                'aspect-square rounded-xl border-2 bg-card transition-colors ' +
                  (active.id === photo.id
                    ? 'border-primary'
                    : 'border-transparent hover:border-primary/40'),
              )}
            >
              <Image
                src={'/api/product-media/' + photo.id}
                alt=""
                data-media-mode="cover"
                fill
                unoptimized
                sizes={mediaSizes.galleryThumbnail}
                className={mediaObjectClass('cover')}
              />
            </button>
          ))}
        </div>
      ) : null}
      {videos.map((video) => (
        <figure key={video.id} className="mt-5">
          <video
            data-media-frame="contain"
            data-media-mode="contain"
            controls
            muted
            playsInline
            preload="metadata"
            className={mediaObjectClass(
              'contain',
              'aspect-video max-h-96 rounded-2xl border bg-black',
            )}
            aria-label={'Product demonstration of ' + productName}
            src={'/api/product-media/' + video.id}
          >
            Your browser cannot play this product video.
          </video>
          <figcaption className="mt-2 text-sm text-muted-foreground">
            Product demonstration. If playback is unavailable, use the product
            photos and description.
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
