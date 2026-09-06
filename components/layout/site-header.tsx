import Image from 'next/image';
import Link from 'next/link';
import { Heart, ShoppingBag, UserRound } from 'lucide-react';

import { chatGPTSignInPath, getChatGPTUser } from '@/app/chatgpt-auth';

export async function SiteHeader() {
  const identity = await getChatGPTUser();
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/92 backdrop-blur-xl">
      <div className="shell flex h-20 items-center justify-between gap-6">
        <Link
          href="/"
          aria-label="Hathkriti home"
          className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/brand/hathkriti-logo.png"
            alt=""
            width={48}
            height={48}
            priority
            className="h-12 w-12 rounded-full object-cover"
          />
          <span className="font-heading text-2xl tracking-tight">
            Hathkriti
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-7 md:flex"
        >
          <Link className="nav-link" href="/shop">
            Collection
          </Link>
          <Link className="nav-link" href="/#our-standard">
            Our standard
          </Link>
          <Link className="nav-link" href="/sell">
            Sell with us
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href={identity ? '/account/wishlist' : chatGPTSignInPath('/account/wishlist')} target={identity ? undefined : '_top'} aria-label="Wishlist" className="hidden size-10 items-center justify-center rounded-full border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"><Heart className="size-4" /></Link>
          <Link href="/cart" aria-label="Shopping cart" className="inline-flex size-10 items-center justify-center rounded-full border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ShoppingBag className="size-4" /></Link>
          {identity ? <Link href="/account" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"><UserRound className="size-4" /> Account</Link> : <a href={chatGPTSignInPath('/account')} target="_top" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"><UserRound className="size-4" /> Sign in</a>}
        </div>
      </div>
    </header>
  );
}
