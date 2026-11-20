'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Package } from 'lucide-react';

export function OrderItemPhoto({ mediaId }: { mediaId?: string | null }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#F3EDE2] text-[#675B4E] sm:size-[72px]">
      {mediaId && !failed ? (
        <Image
          src={'/api/product-media/' + encodeURIComponent(mediaId)}
          alt=""
          unoptimized
          width={72}
          height={72}
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package aria-hidden="true" className="size-5" />
      )}
    </span>
  );
}
