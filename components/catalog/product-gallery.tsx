'use client';

import Image from 'next/image';
import { useState } from 'react';
import {useProductOfferSelection} from './product-offer-selection';
import { ImageIcon } from 'lucide-react';

import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

type GalleryItem = { id: string; altEn: string; mimeType?: string; src?: string };

export function ProductGallery({
  media: allMedia,
  productName,
}: {
  media: readonly GalleryItem[];
  productName: string;
}) {
  const media = allMedia.filter((item) => item.mimeType !== 'video/mp4');
  const videos = allMedia.filter((item) => item.mimeType === 'video/mp4');
  const selection=useProductOfferSelection(),selectedMedia=selection?.selected?.mediaId;
  return <div className="min-w-0"><ScopedProductPhotos key={JSON.stringify([selection?.set?.productId??productName,selectedMedia??null,media.map(row=>row.id)])} media={media} productName={productName} selectedMedia={selectedMedia}/>      {videos.map((video) => (
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
            src={video.src ?? '/api/product-media/' + video.id}
          >
            Your browser cannot play this product video.
          </video>
          <figcaption className="mt-2 text-sm text-muted-foreground">
            Product demonstration. If playback is unavailable, use the product
            photos and description.
          </figcaption>
        </figure>
      ))}
</div>;
}
function ScopedProductPhotos({media,productName,selectedMedia}:{media:readonly GalleryItem[];productName:string;selectedMedia?:string|null}){
  const [activeIndex,setActiveIndex]=useState(()=>Math.max(0,media.findIndex(row=>row.id===selectedMedia)));
  const active = media[activeIndex] ?? media[0];
  return (
    <div className="flex min-w-0 flex-col gap-3 md:flex-row-reverse md:items-start">
      {active ? (
        <div
          data-media-frame="contain"
          className={mediaFrameClass(
            'contain',
            'aspect-square w-full min-w-0 rounded-xl border border-[#e2d6c2] bg-[#fffdf9] md:flex-1',
          )}
        >
          <Image
            key={active.id}
            src={active.src ?? '/api/product-media/' + active.id}
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
        <div className="flex aspect-square w-full min-w-0 flex-col items-center justify-center gap-4 rounded-xl bg-muted text-muted-foreground md:flex-1">
          <ImageIcon className="size-10" />
          <p>Photos coming soon</p>
        </div>
      )}
      {media.length > 1 ? (
        <div
          className="grid grid-cols-5 gap-2 md:max-h-[38rem] md:w-16 md:shrink-0 md:grid-cols-1 md:overflow-y-auto xl:w-[5.25rem]"
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
                'aspect-square min-h-11 rounded-lg border-2 bg-card transition-colors focus-visible:outline-2 focus-visible:outline-primary ' +
                  (active.id === photo.id
                    ? 'border-primary'
                    : 'border-transparent hover:border-primary/40'),
              )}
            >
              <Image
                src={photo.src ?? '/api/product-media/' + photo.id}
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
    </div>
  );
}
