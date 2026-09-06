import Image from 'next/image';
import Link from 'next/link';
import { ShieldX } from 'lucide-react';

import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from '@/app/chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function StaffAccessDeniedPage() {
  const user = await getChatGPTUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-5 py-12">
      <div className="w-full max-w-lg rounded-2xl bg-background p-7 text-center shadow-xl ring-1 ring-foreground/10 sm:p-10">
        <Link href="/" className="inline-flex items-center gap-3">
          <Image src="/brand/hastabazaar-logo.png" alt="" width={48} height={48} className="rounded-full" />
          <span className="font-heading text-2xl">Hastabazaar</span>
        </Link>
        <ShieldX className="mx-auto mt-8 size-12 text-primary" />
        <h1 className="mt-4 font-heading text-3xl tracking-tight">Staff invitation required</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {user
            ? `${user.email} is authenticated, but this account has not been granted Hastabazaar staff access.`
            : 'Sign in with the email address invited by a Hastabazaar Super Admin.'}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {user ? (
            <a href={chatGPTSignOutPath('/staff-access-denied')} target="_top" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/85">
              Sign in with another account
            </a>
          ) : (
            <a href={chatGPTSignInPath('/admin')} target="_top" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/85">
              Sign in with ChatGPT
            </a>
          )}
          <Link href="/" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">Return to storefront</Link>
        </div>
      </div>
    </main>
  );
}
