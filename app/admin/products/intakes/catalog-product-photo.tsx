import Image from 'next/image';
import { Package } from 'lucide-react';
import {
  mediaFrameClass,
  mediaObjectClass,
} from '@/lib/media/responsive-media';

export function CatalogProductPhoto({
  caseId,
  photoId,
  large = false,
}: {
  caseId: string;
  photoId?: string;
  large?: boolean;
}) {
  const box =
    'shrink-0 border border-[#EDE4D3] ' +
    (large ? 'size-[72px] rounded-xl' : 'size-12 rounded-lg');
  return photoId ? (
    <span
      data-media-frame="contain"
      className={mediaFrameClass('contain', 'aspect-square bg-white ' + box)}
    >
      <Image
        data-media-mode="contain"
        src={`/api/seller/product-intakes/media/${encodeURIComponent(photoId)}?caseId=${encodeURIComponent(caseId)}`}
        alt=""
        width={large ? 72 : 48}
        height={large ? 72 : 48}
        unoptimized
        className={mediaObjectClass('contain')}
      />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={box + ' grid place-items-center bg-[#FFFCF7] text-[#46536F]'}
    >
      <Package className="size-5" />
    </span>
  );
}
