import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, LockKeyhole } from 'lucide-react';
import { BrandWordmark } from '@/components/layout/brand-wordmark';

export function CheckoutHeader() {
  return (
    <header className="border-b border-[#e3d6c3] bg-white shadow-sm">
      <div className="mx-auto flex min-h-20 w-full max-w-[1264px] items-center justify-between gap-3 px-4 md:px-12 min-[1360px]:px-0">
        <Link href="/" aria-label="Hastabazaar home" className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-[#14213d] md:gap-3.5">
          <Image src="/brand/hastabazaar-mark-96.png" alt="" priority width={56} height={56} sizes="(min-width: 768px) 56px, 36px"
            className="size-9 shrink-0 rounded-xl border border-[#e3d6c3] bg-[#fdfaf5] p-0.5 object-contain md:size-14 md:p-1" />
          <span className="min-w-0">
            <BrandWordmark className="text-[clamp(1rem,5.8vw,1.45rem)] md:text-[2rem]" />
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.19em] text-[#465573] lg:block">Thoughtful finds</span>
          </span>
        </Link>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 text-sm text-[#465573]">
          <Link href="/cart" className="hidden min-h-11 items-center gap-1.5 rounded-lg px-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#14213d] sm:inline-flex"><ChevronLeft className="size-4" aria-hidden="true" /> Back to bag</Link>
          <span className="inline-flex items-center gap-1.5"><LockKeyhole className="size-4" aria-hidden="true" /> Secure checkout</span>
        </div>
      </div>
    </header>
  );
}
