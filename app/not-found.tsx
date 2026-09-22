import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Home, MapPin, Search } from 'lucide-react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <NotFoundContent />
      <SiteFooter />
    </div>
  );
}

export function NotFoundContent() {
  return (
    <main
      tabIndex={-1}
      id="main-content"
      className="relative overflow-hidden bg-[#f8f1e8]"
    >
      <div
        aria-hidden="true"
        className="absolute -left-24 top-20 size-72 rounded-full border border-[#956020]/10"
      />
      <div
        aria-hidden="true"
        className="absolute -right-16 bottom-12 size-56 rounded-full border border-[#102f54]/10"
      />

      <section
        aria-labelledby="not-found-heading"
        className="shell relative grid min-h-[38rem] items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,0.88fr)_minmax(28rem,1.12fr)] lg:gap-16 lg:py-20"
      >
        <div className="relative z-10 max-w-2xl">
          <p
            aria-label="Error 404"
            className="font-heading text-[clamp(6.5rem,15vw,10.5rem)] leading-[0.72] tracking-[-0.075em] text-[#b5121b]"
          >
            404
          </p>
          <h1
            id="not-found-heading"
            className="mt-10 max-w-xl font-heading text-[clamp(2.75rem,5vw,4.8rem)] leading-[0.98] tracking-[-0.05em] text-[#102f54]"
          >
            This page has wandered away.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-[#586171] sm:text-lg">
            The page you’re looking for may have moved, or the link may no
            longer be available. Let’s help you find your way back.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/" className="homepage-primary-action">
              Back to home
              <Home className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/shop" className="homepage-secondary-action">
              Explore the collection
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div
          aria-hidden="true"
          className={mediaFrameClass(
            'cover',
            'min-h-[clamp(18rem,72vw,29rem)] rounded-[2rem] border border-[#f4c46b]/35 bg-[#102f54] shadow-[0_32px_80px_-48px_rgb(16_47_84/85%)] lg:min-h-[clamp(29rem,36vw,34rem)]',
          )}
        >
          <Image
            src="/homepage/nepali-gift-pattern.webp"
            alt=""
            data-media-mode="cover"
            fill
            priority
            sizes={mediaSizes.notFound}
            className={mediaObjectClass('cover', 'opacity-35')}
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(16,47,84,0.18),rgba(7,28,54,0.82))]" />

          <div className="absolute left-[12%] top-[17%] grid size-14 place-items-center rounded-full border border-[#f4c46b]/35 bg-[#0d294b]/75 text-[#f4c46b] shadow-lg backdrop-blur-sm sm:size-16">
            <MapPin className="size-6" />
          </div>
          <div className="absolute left-[24%] top-[33%] h-0 w-[39%] rotate-[20deg] border-t-2 border-dashed border-[#f4c46b]/45" />
          <div className="absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#f4c46b]/45 bg-[#f7ead8]/95 text-[#102f54] shadow-[0_22px_60px_-26px_rgb(0_0_0/80%)] sm:size-36">
            <Search className="size-12 stroke-[1.35] sm:size-14" />
          </div>
          <div className="absolute bottom-[16%] right-[12%] grid size-14 place-items-center rounded-full border border-[#f4c46b]/35 bg-[#b5121b]/90 text-white shadow-lg backdrop-blur-sm sm:size-16">
            <Home className="size-6" />
          </div>
          <div className="absolute bottom-[31%] right-[23%] h-0 w-[36%] -rotate-[22deg] border-t-2 border-dashed border-[#f4c46b]/45" />
        </div>
      </section>
    </main>
  );
}
