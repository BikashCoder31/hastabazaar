import { AssistedRecoveryForm } from '@/components/auth/assisted-recovery-form';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Private account recovery | Hastabazaar',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default function RecoverAccountPage() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-lg px-5 py-12 sm:py-20"
    >
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="eyebrow">Hastabazaar account security</p>
        <h1 className="mb-6 mt-2 font-heading text-3xl">
          Recover your account
        </h1>
        <AssistedRecoveryForm />
      </div>
    </main>
  );
}
