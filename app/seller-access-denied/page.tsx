import Image from 'next/image';
import Link from 'next/link';
import { Store } from 'lucide-react';

import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from '@/app/chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function SellerAccessDeniedPage() {
  const user = await getChatGPTUser();
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-5 py-12">
      <div className="w-full max-w-lg rounded-2xl bg-background p-7 text-center shadow-xl ring-1 ring-foreground/10 sm:p-10">
        <Link href="/" className="inline-flex items-center gap-3"><Image src="/brand/hathkriti-logo.png" alt="" width={48} height={48} className="rounded-full" /><span className="font-heading text-2xl">Hathkriti</span></Link>
        <Store className="mx-auto mt-8 size-12 text-primary" />
        <h1 className="mt-4 font-heading text-3xl tracking-tight">Approved seller access required</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{user ? `${user.email} is signed in, but it is not linked to an approved Hathkriti seller.` : 'Sign in with the same email used on your approved seller application.'}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {user ? <a href={chatGPTSignOutPath('/seller-access-denied')} target="_top" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Use another account</a> : <a href={chatGPTSignInPath('/seller')} target="_top" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign in</a>}
          <Link href="/sell" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">Apply to sell</Link>
        </div>
      </div>
    </main>
  );
}
