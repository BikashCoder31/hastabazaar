import Link from 'next/link';
import { SecurityWorkspace } from '@/components/security/security-workspace';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Account security · Hastabazaar',
  robots: { index: false, follow: false },
};

export default async function SecurityPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const params = await searchParams;
  return (
    <main
      id="main-content"
      className="shell min-h-screen max-w-5xl py-6 sm:py-10"
    >
      <Link
        href="/"
        className="mb-6 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
      >
        Hastabazaar home
      </Link>
      <SecurityWorkspace
        returnTo={
          typeof params.return_to === 'string' ? params.return_to : undefined
        }
      />
    </main>
  );
}
