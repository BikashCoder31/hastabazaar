'use client';

import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import { useState } from 'react';

export function ReturnCasePhoto({ label, src, alt }: { label: string; src?: string; alt: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  return (
    <figure className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-xl border bg-card">
      <figcaption className="absolute left-2.5 top-2.5 z-10 rounded-full bg-[#14213D] px-2.5 py-1 text-xs font-semibold text-white">{label}</figcaption>
      {src && failedSource !== src ? (
        <a href={src} target="_blank" rel="noreferrer" className="block size-full" aria-label={'Open ' + alt.toLowerCase() + ' in a new tab'}>
          <Image src={src} alt={alt} fill unoptimized sizes="(min-width: 1280px) 25vw, 100vw" className="object-contain" onError={() => setFailedSource(src)} />
        </a>
      ) : (
        <div className="grid size-full place-content-center justify-items-center gap-2 px-4 text-center text-sm text-muted-foreground">
          <ImageIcon aria-hidden="true" className="size-6" />
          {src ? 'Photo unavailable' : 'No photo available'}
        </div>
      )}
    </figure>
  );
}
