'use client';

import Image from 'next/image';
import { Play } from 'lucide-react';
import { useState } from 'react';

const stage = 'relative isolate flex h-56 w-full min-w-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-[#14213D] p-4 text-center text-white focus-visible:outline-[#14213D] md:h-[300px]';

export function MakerWorkshopVideo({ src, poster, caption, inline }: {
  src: string;
  poster?: string;
  caption: string;
  inline: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const cover = (
    <>
      {poster ? (
        <>
          <Image src={poster} alt="" fill unoptimized data-media-mode="cover"
            sizes="(min-width: 1360px) 310px, (min-width: 768px) 46vw, 100vw" className="-z-20 object-cover" />
          <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[#14213D]/60" />
        </>
      ) : null}
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-white text-[#14213D]">
        <Play className="size-5 fill-current" />
      </span>
      <span className="text-sm font-semibold">Watch the maker at work</span>
    </>
  );
  return (
    <figure className="min-w-0">
      {playing ? (
        <video
          ref={player => { player?.focus({ preventScroll: true }); }}
          src={src}
          poster={poster}
          controls
          autoPlay
          muted
          playsInline
          tabIndex={0}
          aria-label={caption || 'Maker workshop video'}
          className="h-56 w-full rounded-[20px] bg-[#14213D] object-contain focus-visible:outline-[#14213D] md:h-[300px]"
        />
      ) : inline ? (
        <button type="button" className={stage} onClick={() => setPlaying(true)}>{cover}</button>
      ) : (
        <a href={src} target="_blank" rel="noopener noreferrer" title="View original maker video"
          aria-label="Watch the maker at work (opens in a new tab)" className={stage}>
          {cover}
        </a>
      )}
      {caption || playing ? (
        <figcaption className="mt-2 text-sm text-[#465573]">
          {caption ? <p>{caption}</p> : null}
          {playing ? (
            <a href={src} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-[#A8232E] underline underline-offset-4 focus-visible:outline-[#14213D]">
              View original maker video <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
