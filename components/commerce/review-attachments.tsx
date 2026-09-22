import Image from 'next/image';
import type {
  ReviewPhoto,
  SellerReply,
} from '@/lib/db/repositories/review-extras';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

export function ReviewPhotos({ photos }: { photos: readonly ReviewPhoto[] }) {
  return photos.length ? (
    <div className="mt-4 flex flex-wrap gap-3" aria-label="Customer photos">
      {photos.map((photo, index) => (
        <a
          key={photo.id}
          href={`/api/review-photos/${encodeURIComponent(photo.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open customer photo ${index + 1} in a new tab`}
          className={mediaFrameClass(
            'contain',
            'block size-24 rounded-xl border focus-visible:outline-2 focus-visible:outline-primary',
          )}
        >
          <Image
            unoptimized
            src={`/api/review-photos/${encodeURIComponent(photo.id)}`}
            alt={`Customer submission ${index + 1} for this purchase`}
            width={96}
            height={96}
            loading="lazy"
            data-media-mode="contain"
            sizes={mediaSizes.reviewAttachment}
            className={mediaObjectClass('contain')}
          />
        </a>
      ))}
    </div>
  ) : null;
}
export function PublicSellerReply({
  reply,
}: {
  reply: SellerReply | undefined;
}) {
  return reply ? (
    <div className="mt-5 rounded-xl border-l-4 border-primary bg-secondary/40 p-4">
      <p className="text-sm font-semibold">Seller reply · {reply.sellerName}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
        {reply.body}
      </p>
    </div>
  ) : null;
}
